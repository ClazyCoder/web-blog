"""
이미지 업로드 라우터 (개선 버전)
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pathlib import Path
import uuid
from datetime import datetime
import re
from PIL import Image as PILImage
import os
from auth import get_current_user
from db.session import get_db
from models.image import Image
from services.image_cleanup import run_cleanup, ORPHAN_TTL_HOURS, SOFT_DELETE_TTL_DAYS

router = APIRouter(
    prefix="/api/upload",
    tags=["image"]
)

# 업로드 디렉토리 설정
UPLOAD_DIR = Path("uploads/images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 허용된 이미지 확장자
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

# 최대 파일 크기 (5MB)
MAX_FILE_SIZE = 5 * 1024 * 1024


def validate_image(file: UploadFile) -> bool:
    """이미지 파일 유효성 검사"""
    if not file.filename:
        return False

    # XSS 방지: 파일명에 위험한 문자 체크
    if '..' in file.filename or '/' in file.filename or '\\' in file.filename:
        return False

    # 파일 확장자 체크
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        return False

    # Content-Type 체크
    if not file.content_type or not file.content_type.startswith("image/"):
        return False

    return True


def sanitize_filename(filename: str) -> str:
    """
    XSS 방지: 파일명 sanitize
    - 위험한 문자 제거
    - 경로 탐색 공격 방지 (../, ..\\ 등)
    """
    # 파일명과 확장자 분리
    name = Path(filename).stem
    ext = Path(filename).suffix.lower()

    # 위험한 문자 제거 (영문자, 숫자, 언더스코어, 하이픈만 허용)
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)

    # 빈 문자열 방지
    if not safe_name:
        safe_name = "file"

    # 최대 길이 제한 (50자)
    safe_name = safe_name[:50]

    return f"{safe_name}{ext}"


def generate_unique_filename(original_filename: str) -> str:
    """고유한 파일명 생성"""
    # 원본 파일명 sanitize
    safe_filename = sanitize_filename(original_filename)
    file_ext = Path(safe_filename).suffix.lower()

    # 타임스탬프와 UUID로 고유한 파일명 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    return f"{timestamp}_{unique_id}{file_ext}"


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    이미지 업로드 엔드포인트 (인증 필요, 개선 버전)

    Args:
        file: 업로드할 이미지 파일
        current_user: 현재 로그인한 사용자 (JWT 검증)
        db: 비동기 데이터베이스 세션

    Returns:
        {
            "success": true,
            "id": 1,
            "url": "http://localhost:8000/uploads/images/20240208_123456_abc123.jpg",
            "storage_key": "images/20240208_123456_abc123.jpg",
            "filename": "20240208_123456_abc123.jpg",
            "original_filename": "my-image.jpg",
            "size": 123456,
            "width": 1920,
            "height": 1080
        }
    """

    # 파일 유효성 검사
    if not validate_image(file):
        raise HTTPException(
            status_code=400,
            detail="Invalid image file. Allowed formats: jpg, jpeg, png, gif, webp"
        )

    try:
        # 파일 크기 체크
        content = await file.read()
        file_size = len(content)

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024*1024)}MB"
            )

        # 고유한 파일명 생성 (storage_key)
        unique_filename = generate_unique_filename(
            file.filename or "image.jpg")
        storage_key = f"images/{unique_filename}"  # 스토리지 키
        file_path = UPLOAD_DIR / unique_filename

        # 파일 저장
        with open(file_path, "wb") as buffer:
            buffer.write(content)

        # 이미지 크기 정보 추출
        width, height = None, None
        try:
            with PILImage.open(file_path) as img:
                width, height = img.size
        except Exception:
            pass  # 이미지 크기 추출 실패해도 업로드는 계속

        # DB에 이미지 정보 저장 (개선 버전)
        new_image = Image(
            storage_key=storage_key,  # 실제 저장 경로
            original_filename=file.filename or "image.jpg",
            file_size=file_size,
            mime_type=file.content_type,
            width=width,
            height=height,
            is_temporary=True,  # 게시글에 연결되지 않은 임시 이미지
        )

        db.add(new_image)
        await db.commit()
        await db.refresh(new_image)

        # URL 동적 생성
        base_url = os.getenv("BASE_URL", "http://localhost:8000")

        return {
            "success": True,
            "id": new_image.id,
            "url": new_image.get_url(base_url),  # 동적 생성
            "storage_key": new_image.storage_key,
            "filename": new_image.filename,  # property로 추출
            "original_filename": file.filename,
            "size": file_size,
            "width": width,
            "height": height
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        # 에러 발생 시 파일 삭제
        if file_path and file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image: {str(e)}"
        )
    finally:
        await file.close()


@router.get("/temp/{filename}")
async def get_temp_image_info(
    filename: str,
    db: AsyncSession = Depends(get_db)
):
    """
    임시 이미지 정보 조회 (파일명으로)
    """
    # DB에서 이미지 정보 조회 (storage_key에서 파일명 매칭)
    stmt = select(Image).filter(
        Image.storage_key.like(f"%{filename}"),
        Image.deleted_at.is_(None)
    )
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    return image.to_dict(base_url)


@router.delete("/image/{filename}")
async def delete_image(
    filename: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    이미지 삭제 엔드포인트 (인증 필요)

    Args:
        filename: 삭제할 이미지 파일명
        current_user: 현재 로그인한 사용자 (JWT 검증)
        db: 비동기 데이터베이스 세션
    """
    # DB에서 이미지 정보 조회
    stmt = select(Image).filter(Image.storage_key.like(f"%{filename}"))
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        # 실제 파일 삭제
        # storage_key에서 실제 파일 경로 추출
        file_path = UPLOAD_DIR / image.filename
        if file_path.exists():
            file_path.unlink()

        # DB에서 소프트 삭제 (개선: deleted_at 사용)
        image.deleted_at = datetime.now()
        await db.commit()

        return {
            "success": True,
            "message": f"Image {filename} deleted successfully"
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete image: {str(e)}"
        )


# ==================== 관리 엔드포인트 ====================

@router.get("/admin/orphans")
async def get_orphan_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    고아 이미지 현황 조회 (인증 필요)
    
    Returns:
        고아 이미지 통계 및 정리 정책 정보
    """
    from datetime import timedelta

    now = datetime.now()
    cutoff = now - timedelta(hours=ORPHAN_TTL_HOURS)

    # 전체 이미지 수
    total_stmt = select(func.count(Image.id)).where(Image.deleted_at.is_(None))
    total = (await db.execute(total_stmt)).scalar() or 0

    # 임시(orphan) 이미지 수 (연결 안 됨 + 아직 삭제 안 됨)
    orphan_stmt = select(func.count(Image.id)).where(
        and_(
            Image.is_temporary.is_(True),
            Image.post_id.is_(None),
            Image.deleted_at.is_(None),
        )
    )
    orphan_count = (await db.execute(orphan_stmt)).scalar() or 0

    # 정리 대상 (TTL 초과)
    expired_stmt = select(func.count(Image.id)).where(
        and_(
            Image.is_temporary.is_(True),
            Image.post_id.is_(None),
            Image.deleted_at.is_(None),
            Image.created_at < cutoff,
        )
    )
    expired_count = (await db.execute(expired_stmt)).scalar() or 0

    # soft-deleted 이미지 수
    soft_deleted_stmt = select(func.count(Image.id)).where(
        Image.deleted_at.isnot(None)
    )
    soft_deleted_count = (await db.execute(soft_deleted_stmt)).scalar() or 0

    # 영구 삭제 대상
    purge_cutoff = now - timedelta(days=SOFT_DELETE_TTL_DAYS)
    purgeable_stmt = select(func.count(Image.id)).where(
        and_(
            Image.deleted_at.isnot(None),
            Image.deleted_at < purge_cutoff,
        )
    )
    purgeable_count = (await db.execute(purgeable_stmt)).scalar() or 0

    return {
        "total_active_images": total,
        "orphan_images": orphan_count,
        "orphan_expired": expired_count,
        "soft_deleted_images": soft_deleted_count,
        "purgeable_images": purgeable_count,
        "policy": {
            "orphan_ttl_hours": ORPHAN_TTL_HOURS,
            "soft_delete_ttl_days": SOFT_DELETE_TTL_DAYS,
        }
    }


@router.get("/admin/orphans/list")
async def get_orphan_list(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    고아 이미지 목록 조회 (인증 필요)
    
    Returns:
        고아 이미지 리스트 (is_temporary=True, post_id=None, deleted_at=None)
    """
    import os

    stmt = select(Image).where(
        and_(
            Image.is_temporary.is_(True),
            Image.post_id.is_(None),
            Image.deleted_at.is_(None),
        )
    ).order_by(Image.created_at.desc())

    result = await db.execute(stmt)
    orphans = result.scalars().all()

    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    return {
        "total": len(orphans),
        "images": [img.to_dict(base_url) for img in orphans],
    }


@router.post("/admin/cleanup")
async def trigger_cleanup(
    current_user: dict = Depends(get_current_user),
):
    """
    고아 이미지 정리 수동 실행 (인증 필요)
    
    Returns:
        정리 결과 요약
    """
    result = await run_cleanup()
    return result
