"""
게시글 라우터 - CRUD API
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import cast, desc, func, or_, select, String
from sqlalchemy.orm import selectinload
from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import Optional, List
import re
from datetime import datetime

from db.session import get_db
from models.post import Post
from models.image import Image
from auth import get_current_user
from schemas.post import PostCreate, PostUpdate, PostResponse, PaginatedPostResponse

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(
    prefix="/api/posts",
    tags=["posts"]
)


# ==================== 헬퍼 함수 ====================

def extract_image_urls(content: str) -> List[str]:
    """마크다운 본문에서 모든 이미지 URL 추출"""
    if not content:
        return []
    return re.findall(r'!\[.*?\]\((.*?)\)', content)


def extract_storage_keys_from_urls(urls: List[str]) -> List[str]:
    """이미지 URL에서 storage_key 추출 (예: .../uploads/images/xxx.jpg → images/xxx.jpg)"""
    keys = []
    for url in urls:
        # /uploads/images/xxx.jpg 또는 http://host/uploads/images/xxx.jpg
        match = re.search(r'uploads/(images/[^)\s]+)', url)
        if match:
            keys.append(match.group(1))
    return keys


async def link_images_to_post(post_id: int, content: str, db: AsyncSession):
    """
    게시글 본문의 이미지를 Image 테이블과 연결
    - 본문에 존재하는 이미지: post_id 설정, is_temporary=False
    - 기존에 연결되어 있었으나 본문에서 제거된 이미지: post_id=None, is_temporary=True
    """
    # 본문에서 이미지 storage_key 추출
    urls = extract_image_urls(content)
    current_keys = set(extract_storage_keys_from_urls(urls))
    
    # 현재 이 게시글에 연결된 이미지 조회
    stmt = select(Image).where(
        Image.post_id == post_id,
        Image.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    linked_images = result.scalars().all()
    linked_keys = {img.storage_key for img in linked_images}
    
    # 1) 본문에서 제거된 이미지 → 연결 해제
    removed_keys = linked_keys - current_keys
    if removed_keys:
        for img in linked_images:
            if img.storage_key in removed_keys:
                img.post_id = None
                img.is_temporary = True
    
    # 2) 새로 추가된 이미지 → 연결
    new_keys = current_keys - linked_keys
    if new_keys:
        stmt = select(Image).where(
            Image.storage_key.in_(list(new_keys)),
            Image.deleted_at.is_(None),
        )
        result = await db.execute(stmt)
        new_images = result.scalars().all()
        for img in new_images:
            img.post_id = post_id
            img.is_temporary = False


def generate_slug(title: str, post_id: Optional[int] = None) -> str:
    """
    제목으로부터 URL 슬러그 생성
    
    Args:
        title: 게시글 제목
        post_id: 게시글 ID (중복 방지용)
    
    Returns:
        URL 슬러그
    """
    # 소문자 변환 및 공백을 하이픈으로
    slug = title.lower().strip()
    # 특수문자 제거 (영문, 숫자, 하이픈만 허용)
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    
    # ID 추가하여 고유성 보장
    if post_id:
        slug = f"{slug}-{post_id}"
    
    return slug[:250]  # 최대 길이 제한


# ==================== CRUD API 엔드포인트 ====================

@router.post("/{post_id}/view", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def increment_view_count(
    request: Request,
    post_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    조회수 증가 (별도 엔드포인트)
    GET 조회와 분리하여 React StrictMode 등에 의한 중복 호출 방지
    
    Args:
        post_id: 게시글 ID
        db: 비동기 데이터베이스 세션
    """
    stmt = select(Post).filter(Post.id == post_id, Post.deleted_at.is_(None))
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다"
        )
    
    post.view_count += 1
    await db.commit()


@router.post("", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_post(
    request: Request,
    post_data: PostCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    게시글 생성 (인증 필요)
    
    Args:
        post_data: 게시글 생성 데이터
        current_user: 현재 로그인한 사용자
        db: 비동기 데이터베이스 세션
    
    Returns:
        생성된 게시글
    """
    try:
        now = datetime.now()
        
        # Post 객체 생성 (타임스탬프를 Python에서 직접 설정)
        new_post = Post(
            title=post_data.title,
            content=post_data.content,
            excerpt=post_data.excerpt,
            category_slug=post_data.category_slug,
            tags=post_data.tags,
            status=post_data.status,
            slug="temporary",
            created_at=now,
            updated_at=now,
        )
        
        if post_data.status == "published":
            new_post.published_at = now
        
        db.add(new_post)
        await db.flush()  # ID 생성
        
        new_post.slug = generate_slug(post_data.title, new_post.id)
        
        # 본문 이미지와 Image 레코드 연결
        await link_images_to_post(new_post.id, new_post.content, db)
        
        await db.commit()
        
        # 연결된 첫 번째 이미지의 URL을 썸네일로 사용
        thumbnail_url = None
        urls = extract_image_urls(new_post.content)
        if urls:
            thumbnail_url = urls[0]
        
        return PostResponse(
            id=new_post.id,
            title=new_post.title,
            content=new_post.content,
            slug=new_post.slug,
            excerpt=new_post.excerpt,
            tags=new_post.tags or [],
            category_slug=new_post.category_slug,
            status=new_post.status,
            is_published=new_post.status == "published",
            view_count=0,
            thumbnail=thumbnail_url,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
            published_at=now.isoformat() if new_post.published_at else None,
            deleted_at=None,
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"게시글 생성 실패: {str(e)}"
        )


@router.get("", response_model=PaginatedPostResponse)
async def get_posts(
    skip: int = Query(0, ge=0, description="건너뛸 개수"),
    limit: int = Query(20, ge=1, le=100, description="가져올 개수"),
    category_slug: Optional[str] = Query(None, description="카테고리 필터"),
    tags: Optional[str] = Query(None, description="태그 필터 (쉼표 구분, 예: python,fastapi)"),
    search: Optional[str] = Query(None, description="검색어 (제목, 내용)"),
    post_status: Optional[str] = Query(None, alias="status", description="상태 필터: draft, published"),
    db: AsyncSession = Depends(get_db)
):
    """
    게시글 목록 조회 (페이지네이션 + 총 개수)
    
    Args:
        skip: 건너뛸 개수 (오프셋)
        limit: 가져올 개수 (최대 100)
        category_slug: 카테고리 필터
        tags: 태그 필터 (쉼표 구분, 복수 태그 AND 조건)
        search: 검색어
        post_status: 상태 필터
        db: 비동기 데이터베이스 세션
    
    Returns:
        페이지네이션 정보 포함 게시글 목록
    """
    try:
        # WHERE 조건 리스트
        conditions = [Post.deleted_at.is_(None)]
        
        if post_status:
            conditions.append(Post.status == post_status)
        
        if category_slug:
            conditions.append(Post.category_slug == category_slug)
        
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            for t in tag_list:
                # JSON 배열을 텍스트로 캐스팅 후, 따옴표로 감싼 태그를 검색
                # 예: ["python", "fastapi"] 에서 '"python"' 매칭
                # 따옴표 덕분에 "java"가 "javascript"에 매칭되는 부분일치 방지
                conditions.append(cast(Post.tags, String).like(f'%"{t}"%'))
        
        if search:
            search_pattern = f"%{search}%"
            conditions.append(
                or_(
                    Post.title.ilike(search_pattern),
                    Post.content.ilike(search_pattern)
                )
            )
        
        # 총 개수 조회
        count_stmt = select(func.count(Post.id)).where(*conditions)
        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0
        
        # 데이터 조회 (images eager loading으로 N+1 방지)
        data_stmt = (
            select(Post)
            .options(selectinload(Post.images))
            .where(*conditions)
            .order_by(desc(Post.created_at))
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(data_stmt)
        posts = result.scalars().all()
        
        items = [PostResponse(**post.to_dict(include_content=False)) for post in posts]
        
        return PaginatedPostResponse(
            items=items,
            total=total,
            skip=skip,
            limit=limit
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"게시글 목록 조회 실패: {str(e)}"
        )


@router.get("/tags")
async def get_all_tags(
    db: AsyncSession = Depends(get_db)
):
    """
    모든 published 게시글의 고유 태그 목록 반환 (정렬됨)
    
    Returns:
        { "tags": ["fastapi", "python", "react", ...] }
    """
    try:
        stmt = select(Post.tags).where(
            Post.deleted_at.is_(None),
            Post.status == "published",
            Post.tags.isnot(None),
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        
        tag_set: set[str] = set()
        for tags in rows:
            if isinstance(tags, list):
                tag_set.update(tags)
        
        return {"tags": sorted(tag_set)}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"태그 목록 조회 실패: {str(e)}"
        )


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    게시글 상세 조회
    
    Args:
        post_id: 게시글 ID
        db: 비동기 데이터베이스 세션
    
    Returns:
        게시글 상세 정보
    """
    stmt = (
        select(Post)
        .options(selectinload(Post.images))
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다"
        )
    
    return PostResponse(**post.to_dict())


@router.put("/{post_id}", response_model=PostResponse)
@limiter.limit("20/minute")
async def update_post(
    request: Request,
    post_id: int,
    post_data: PostUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    게시글 수정 (인증 필요)
    
    Args:
        post_id: 게시글 ID
        post_data: 수정할 데이터
        current_user: 현재 로그인한 사용자
        db: 비동기 데이터베이스 세션
    
    Returns:
        수정된 게시글
    """
    stmt = (
        select(Post)
        .options(selectinload(Post.images))
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다"
        )
    
    try:
        # 수정 가능한 필드만 업데이트
        update_data = post_data.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(post, field, value)
        
        # 제목이 변경되면 슬러그도 업데이트
        if 'title' in update_data:
            post.slug = generate_slug(post.title, post.id)
        
        # 상태가 published로 변경되고 발행 시간이 없으면 설정
        if 'status' in update_data and post_data.status == "published" and not post.published_at:
            post.published_at = datetime.now()
        
        # 본문이 변경되면 이미지 연결 업데이트
        if 'content' in update_data:
            await link_images_to_post(post.id, post.content, db)
        
        await db.commit()
        await db.refresh(post)  # 모든 scalar 속성 refresh
        await db.refresh(post, attribute_names=["images"])  # images 관계 refresh
        
        return PostResponse(**post.to_dict())
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"게시글 수정 실패: {str(e)}"
        )


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def delete_post(
    request: Request,
    post_id: int,
    permanent: bool = Query(False, description="영구 삭제 여부"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    게시글 삭제 (인증 필요)
    
    Args:
        post_id: 게시글 ID
        permanent: True면 영구 삭제, False면 소프트 삭제
        current_user: 현재 로그인한 사용자
        db: 비동기 데이터베이스 세션
    """
    stmt = select(Post).filter(Post.id == post_id)
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다"
        )
    
    try:
        if permanent:
            # 영구 삭제
            await db.delete(post)
        else:
            # 소프트 삭제 (기본)
            post.deleted_at = datetime.now()
        
        await db.commit()
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"게시글 삭제 실패: {str(e)}"
        )


@router.get("/slug/{slug}", response_model=PostResponse)
async def get_post_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db)
):
    """
    슬러그로 게시글 조회
    
    Args:
        slug: URL 슬러그
        db: 비동기 데이터베이스 세션
    
    Returns:
        게시글 상세 정보
    """
    stmt = (
        select(Post)
        .options(selectinload(Post.images))
        .filter(Post.slug == slug, Post.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다"
        )
    
    return PostResponse(**post.to_dict())
