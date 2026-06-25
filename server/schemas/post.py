"""
게시글 Pydantic 스키마
"""

from typing import Optional, List

import nh3
from pydantic import BaseModel, Field, field_validator


# Allowlist: only formatting tags meaningful in blog markdown.
# Script, iframe, object, embed, base, link, meta are blocked by default in nh3.
_ALLOWED_TAGS = {
    "p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li",
    "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "img", "table", "thead", "tbody", "tr", "th", "td",
    "sub", "sup", "mark", "abbr", "details", "summary",
}
_ALLOWED_ATTRS = {
    "a": {"href", "title", "rel"},
    "img": {"src", "alt", "title", "width", "height"},
    "*": {"class", "id"},
}


def sanitize_html_input(value: str) -> str:
    """XSS 방지: nh3 라이브러리를 이용한 HTML 정제"""
    if not value:
        return value
    if "<" not in value:
        return value
    return nh3.clean(value, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS, link_rel=None)


class PostCreate(BaseModel):
    """게시글 생성 스키마 (개선 버전)"""
    title: str = Field(..., min_length=1, max_length=200, description="게시글 제목")
    content: str = Field(..., min_length=1, description="게시글 본문")
    excerpt: Optional[str] = Field(None, max_length=500, description="요약")
    category_slug: Optional[str] = Field(None, max_length=50, description="카테고리 슬러그")
    tags: List[str] = Field(default_factory=list, description="태그 배열")
    status: str = Field("draft", description="게시 상태: draft, published")
    is_secret: bool = Field(False, description="비밀글 여부")
    
    @field_validator('title', 'content', 'excerpt')
    @classmethod
    def sanitize_html(cls, v):
        return sanitize_html_input(v)
    
    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v):
        """태그 유효성 검사 (JSON 배열)"""
        if v:
            # 빈 태그 제거
            tags = [tag.strip() for tag in v if tag.strip()]
            # 최대 10개 제한
            if len(tags) > 10:
                raise ValueError('태그는 최대 10개까지 가능합니다')
            # 각 태그 길이 제한
            for tag in tags:
                if len(tag) > 30:
                    raise ValueError('각 태그는 최대 30자까지 가능합니다')
            return tags
        return []
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        """상태 검증"""
        allowed = ['draft', 'published']
        if v not in allowed:
            raise ValueError(f'status는 {allowed} 중 하나여야 합니다')
        return v


class PostUpdate(BaseModel):
    """게시글 수정 스키마 (부분 업데이트 가능)"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=1)
    excerpt: Optional[str] = Field(None, max_length=500)
    category_slug: Optional[str] = Field(None, max_length=50)
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    is_secret: Optional[bool] = None
    
    @field_validator('title', 'content', 'excerpt')
    @classmethod
    def sanitize_html(cls, v):
        return sanitize_html_input(v)
    
    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v):
        if v is not None:
            tags = [tag.strip() for tag in v if tag.strip()]
            if len(tags) > 10:
                raise ValueError('태그는 최대 10개까지 가능합니다')
            for tag in tags:
                if len(tag) > 30:
                    raise ValueError('각 태그는 최대 30자까지 가능합니다')
            return tags
        return v
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        if v is not None:
            allowed = ['draft', 'published']
            if v not in allowed:
                raise ValueError(f'status는 {allowed} 중 하나여야 합니다')
        return v


class ImageResponse(BaseModel):
    """이미지 응답 스키마"""
    id: int
    storage_key: str
    filename: str
    original_filename: str
    file_url: str
    file_size: int
    mime_type: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    alt_text: Optional[str] = None
    caption: Optional[str] = None
    post_id: Optional[int] = None
    is_temporary: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    deleted_at: Optional[str] = None

    class Config:
        from_attributes = True


class PostResponse(BaseModel):
    """게시글 응답 스키마 (개선 버전)"""
    id: int
    title: str
    content: str = ""  # 목록 조회 시 content 미포함 허용
    slug: str
    excerpt: Optional[str]
    tags: List[str]
    category_slug: Optional[str]
    status: str
    is_secret: bool = False
    is_published: bool  # 편의성 property
    view_count: int
    thumbnail: Optional[str] = None  # 첫 번째 이미지 URL (썸네일)
    images: List[ImageResponse] = []  # 연결된 이미지 목록 (상세 조회 시)
    created_at: str
    updated_at: str
    published_at: Optional[str]
    deleted_at: Optional[str]
    
    class Config:
        from_attributes = True


class PaginatedPostResponse(BaseModel):
    """페이지네이션 포함 게시글 목록 응답 스키마"""
    items: List[PostResponse]
    total: int
    skip: int
    limit: int
