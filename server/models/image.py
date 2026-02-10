"""
Image 모델 - 게시글 이미지
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import os
from .base import Base


class Image(Base):
    """
    블로그 게시글 이미지 모델 (개인 블로그 최적화 버전)
    """
    __tablename__ = "images"

    # 기본 필드
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 파일 스토리지 정보 (개선: storage_key 중심)
    storage_key = Column(String(500), nullable=False, unique=True)  # 실제 저장 경로/키
    original_filename = Column(String(255), nullable=False)  # 사용자가 업로드한 원본 파일명
    
    # 파일 메타데이터
    file_size = Column(Integer, nullable=False)  # 바이트 단위
    mime_type = Column(String(50))  # image/jpeg, image/png 등
    
    # 이미지 메타데이터
    width = Column(Integer)  # 이미지 너비 (픽셀)
    height = Column(Integer)  # 이미지 높이 (픽셀)
    alt_text = Column(String(200))  # 대체 텍스트 (접근성)
    caption = Column(String(500))  # 이미지 캡션
    
    # 게시글 연결 (선택적 - 임시 업로드 이미지는 null)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=True, index=True)
    post = relationship("Post", back_populates="images")
    
    # 상태 관리
    is_temporary = Column(Boolean, default=True, index=True)  # 임시 업로드 여부 (에디터 UX용)
    
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
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)  # soft delete
    
    def __repr__(self):
        return f"<Image(id={self.id}, storage_key='{self.storage_key}', post_id={self.post_id})>"
    
    @property
    def is_deleted(self) -> bool:
        """소프트 삭제 여부 (호환성 유지)"""
        return self.deleted_at is not None
    
    @property
    def filename(self) -> str:
        """파일명 추출 (storage_key에서, 호환성 유지)"""
        return self.storage_key.split('/')[-1] if '/' in self.storage_key else self.storage_key
    
    def get_url(self, base_url: str = None) -> str:
        """
        동적으로 URL 생성 (싱크 문제 해결)
        
        Args:
            base_url: 기본 서버 URL (미설정 시 환경 변수 BASE_URL 사용)
        
        Returns:
            접근 가능한 이미지 URL
        """
        if base_url is None:
            base_url = os.getenv("BASE_URL", "http://localhost:8000")
        return f"{base_url}/uploads/{self.storage_key}"
    
    def to_dict(self, base_url: str = None):
        """
        딕셔너리로 변환 (API 응답용)
        
        Args:
            base_url: URL 생성을 위한 기본 URL (미설정 시 환경 변수 BASE_URL 사용)
        """
        return {
            "id": self.id,
            "storage_key": self.storage_key,
            "filename": self.filename,  # property로 추출
            "original_filename": self.original_filename,
            "file_url": self.get_url(base_url),  # 동적 생성
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "width": self.width,
            "height": self.height,
            "alt_text": self.alt_text,
            "caption": self.caption,
            "post_id": self.post_id,
            "is_temporary": self.is_temporary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }
