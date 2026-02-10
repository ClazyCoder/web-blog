"""
인증 관련 라우터
"""

from fastapi import APIRouter, HTTPException, status, Depends, Response, Request
from datetime import timedelta
from slowapi import Limiter
from slowapi.util import get_remote_address
from auth import (
    create_access_token, 
    verify_admin_credentials,
    get_admin_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_user
)
from schemas.auth import UserLogin, UserInfo

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, user_data: UserLogin, response: Response):
    """
    사용자 로그인 (환경변수 기반 단일 사용자)
    
    Args:
        user_data: 사용자명, 비밀번호
        response: FastAPI Response 객체 (쿠키 설정용)
        
    Returns:
        성공 메시지
    """
    # 환경변수의 관리자 자격증명 검증
    if not verify_admin_credentials(user_data.username, user_data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    # 관리자 정보 가져오기
    admin = get_admin_user()
    
    # JWT 토큰 생성
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": admin["user_id"], 
            "email": admin["email"],
            "username": admin["username"]
        },
        expires_delta=access_token_expires
    )
    
    # HttpOnly 쿠키에 토큰 설정
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,  # JavaScript에서 접근 불가 (XSS 방지)
        secure=True,    # HTTPS에서만 전송 (CF Tunnel 사용)
        samesite="lax", # CSRF 방지
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # 초 단위
    )
    
    return {
        "message": "Login successful",
        "username": admin["username"]
    }


@router.get("/me", response_model=UserInfo)
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    현재 로그인한 사용자 정보 조회 (HttpOnly 쿠키 기반)
    
    Returns:
        사용자 정보
    """
    return {
        "id": current_user.get("user_id"),
        "username": current_user.get("username"),
        "email": current_user.get("email")
    }


@router.post("/logout")
async def logout(response: Response):
    """
    로그아웃 - HttpOnly 쿠키 제거
    
    Args:
        response: FastAPI Response 객체
        
    Returns:
        성공 메시지
    """
    # 쿠키 삭제 (max_age=0으로 설정)
    response.set_cookie(
        key="access_token",
        value="",
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=0,  # 즉시 만료
    )
    
    return {"message": "Logout successful"}
