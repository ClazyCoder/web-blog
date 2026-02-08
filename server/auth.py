"""
JWT 인증 관련 유틸리티
"""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt
import os

# 환경 변수에서 읽어오는 것이 좋습니다
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Bearer 토큰 스키마
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    비밀번호 검증
    
    Args:
        plain_password: 평문 비밀번호
        hashed_password: 해싱된 비밀번호
        
    Returns:
        비밀번호 일치 여부
    """
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password
    )


def get_password_hash(password: str) -> str:
    """
    비밀번호 해싱
    
    Args:
        password: 평문 비밀번호
        
    Returns:
        해싱된 비밀번호 (문자열)
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    JWT 액세스 토큰 생성
    
    Args:
        data: 토큰에 포함할 데이터 (예: {"sub": user_id})
        expires_delta: 만료 시간 (기본값: 30분)
        
    Returns:
        JWT 토큰 문자열
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """
    JWT 토큰 디코딩
    
    Args:
        token: JWT 토큰 문자열
        
    Returns:
        토큰 페이로드 딕셔너리
        
    Raises:
        HTTPException: 토큰이 유효하지 않은 경우
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    현재 인증된 사용자 정보 가져오기 (Dependency)
    
    FastAPI Depends로 사용:
    @router.get("/protected")
    async def protected_route(current_user: dict = Depends(get_current_user)):
        return {"user": current_user}
    
    Args:
        credentials: Bearer 토큰
        
    Returns:
        사용자 정보 딕셔너리
        
    Raises:
        HTTPException: 인증 실패 시
    """
    token = credentials.credentials
    payload = decode_access_token(token)
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 페이로드에서 추가 정보 추출
    return {
        "user_id": user_id,
        "email": payload.get("email"),
        "username": payload.get("username")
    }


# 선택적 인증 (인증되지 않아도 접근 가능, 인증된 경우 사용자 정보 제공)
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[dict]:
    """
    선택적 인증 - 토큰이 있으면 검증, 없으면 None 반환
    
    사용 예시:
    @router.get("/posts")
    async def get_posts(current_user: Optional[dict] = Depends(get_current_user_optional)):
        if current_user:
            # 인증된 사용자를 위한 로직
            pass
        else:
            # 비인증 사용자를 위한 로직
            pass
    """
    if credentials is None:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
