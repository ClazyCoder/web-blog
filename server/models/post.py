"""
Post 모델 - 블로그 게시글
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import List, Optional
from .base import Base


class Post(Base):
    """
    블로그 게시글 모델 (개인 블로그 최적화 버전)
    """
    __tablename__ = "posts"

    # 기본 필드
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(200), nullable=False, index=True)
    content = Column(Text, nullable=False)
    
    # 게시글 메타데이터
    slug = Column(String(250), unique=True, nullable=False, index=True)
    excerpt = Column(String(500))  # 요약/발췌
    
    # 태그/카테고리 (개선 버전)
    tags = Column(JSON, default=list)  # JSON 배열: ["python", "fastapi", "web"]
    category_slug = Column(String(50), index=True)  # 단일 카테고리 슬러그: "tech", "diary"
    
    # 상태 관리
    status = Column(String(20), default="draft", index=True)  # draft, published
    
    # 통계
    view_count = Column(Integer, default=0)
    
    # 타임스탬프
    created_at = Column(
        DateTime(timezone=True), 
        server_default=func.now(),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    published_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)  # soft delete
    
    # 관계 (이미지와의 관계)
    images = relationship("Image", back_populates="post", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Post(id={self.id}, title='{self.title}', status='{self.status}')>"
    
    @property
    def is_deleted(self) -> bool:
        """소프트 삭제 여부 (호환성 유지)"""
        return self.deleted_at is not None
    
    @property
    def is_published(self) -> bool:
        """게시 여부 (호환성 유지)"""
        return self.status == "published"
    
    @property
    def thumbnail(self) -> Optional[str]:
        """연결된 이미지 중 첫 번째 이미지의 URL 반환"""
        if not self.images:
            return None
        # deleted_at이 없고, 가장 먼저 생성된 이미지
        active_images = sorted(
            [img for img in self.images if img.deleted_at is None],
            key=lambda img: img.created_at
        )
        if active_images:
            return active_images[0].get_url()
        return None

    def to_dict(self, include_content: bool = True):
        """
        딕셔너리로 변환 (API 응답용)
        
        Args:
            include_content: 전체 본문 포함 여부 (목록 조회 시 False)
        """
        data = {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "excerpt": self.excerpt,
            "tags": self.tags or [],  # JSON 배열 그대로 반환
            "category_slug": self.category_slug,
            "status": self.status,
            "is_published": self.is_published,  # 편의성 property
            "view_count": self.view_count,
            "thumbnail": self.thumbnail,  # 첫 번째 이미지 URL
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }
        
        if include_content:
            data["content"] = self.content
            
        return data
