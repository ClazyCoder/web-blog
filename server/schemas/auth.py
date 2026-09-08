"""
인증 Pydantic 스키마
"""

from pydantic import BaseModel, Field, field_validator
import re


class UserLogin(BaseModel):
    """사용자 로그인 스키마"""
    username: str
    password: str = Field(min_length=1, max_length=72)
    remember_me: bool = False

    @field_validator('password')
    @classmethod
    def validate_password(cls, value):
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password must be at most 72 UTF-8 bytes')
        return value
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        """XSS 방지: username 검증"""
        if not v or not v.strip():
            raise ValueError('Username cannot be empty')
        
        # 영문자, 숫자, 언더스코어, 하이픈만 허용 (3-20자)
        if not re.match(r'^[a-zA-Z0-9_-]{3,20}$', v):
            raise ValueError('Username must be 3-20 characters and contain only letters, numbers, underscore, or hyphen')
        
        return v.strip()


class UserInfo(BaseModel):
    """사용자 정보 응답 스키마"""
    id: str
    username: str
    email: str
