"""
인증 관련 라우터
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends, Response, Request, Cookie
from datetime import timedelta
from auth import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    decode_token_unsafe,
    verify_admin_credentials,
    get_admin_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    get_current_user
)
from db.redis import blacklist_token
from schemas.auth import UserLogin, UserInfo
from rate_limit import limiter

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)


def _set_auth_cookies(
    response: Response,
    admin: dict,
    remember_me: bool = False,
):
    """
    액세스 토큰 + (remember_me 시) 리프레시 토큰 쿠키를 설정하는 내부 헬퍼

    Args:
        response: FastAPI Response 객체
        admin: 관리자 사용자 정보 딕셔너리
        remember_me: 로그인 유지 여부
    """
    token_data = {
        "sub": admin["user_id"],
        "email": admin["email"],
        "username": admin["username"],
    }

    # 액세스 토큰 생성 및 쿠키 설정
    access_token = create_access_token(
        data=token_data,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    if remember_me:
        # 리프레시 토큰 생성 및 쿠키 설정 (장기 유효)
        refresh_token = create_refresh_token(
            data=token_data,
            expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            path="/api/auth",  # 인증 경로에서만 전송 (공격 표면 최소화)
        )


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, user_data: UserLogin, response: Response):
    """
    사용자 로그인 (환경변수 기반 단일 사용자)

    Args:
        user_data: 사용자명, 비밀번호, remember_me
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

    # 쿠키 설정 (액세스 토큰 + 로그인 유지 시 리프레시 토큰)
    _set_auth_cookies(response, admin, remember_me=user_data.remember_me)

    return {
        "message": "Login successful",
        "username": admin["username"],
    }


@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None, alias="refresh_token"),
):
    """
    리프레시 토큰으로 액세스 토큰 갱신

    리프레시 토큰이 유효하면 새 액세스 토큰 + 새 리프레시 토큰을 발급합니다.
    (Refresh Token Rotation: 보안 강화)

    Returns:
        성공 메시지
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    # 리프레시 토큰 검증
    payload = decode_refresh_token(refresh_token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # 블랙리스트 확인 (이미 사용된 리프레시 토큰 차단)
    from db.redis import is_token_blacklisted
    old_jti = payload.get("jti")
    if old_jti and await is_token_blacklisted(old_jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    # 이전 리프레시 토큰을 블랙리스트에 등록 (Rotation 보안)
    if old_jti:
        await blacklist_token(old_jti, REFRESH_TOKEN_EXPIRE_DAYS * 86400)

    # 관리자 정보를 다시 가져와서 새 토큰 쌍 발급
    admin = get_admin_user()

    # 새 액세스 토큰 + 리프레시 토큰 (Rotation)
    _set_auth_cookies(response, admin, remember_me=True)

    return {"message": "Token refreshed"}


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
        "email": current_user.get("email"),
    }


@router.post("/logout")
async def logout(
    response: Response,
    access_token: Optional[str] = Cookie(None, alias="access_token"),
    refresh_token: Optional[str] = Cookie(None, alias="refresh_token"),
):
    """
    로그아웃 - 토큰 블랙리스트 등록 + 쿠키 제거

    Args:
        response: FastAPI Response 객체
        access_token: 현재 액세스 토큰 (블랙리스트 등록용)
        refresh_token: 현재 리프레시 토큰 (블랙리스트 등록용)

    Returns:
        성공 메시지
    """
    # 액세스 토큰 블랙리스트 등록 (만료 여부 무관하게 jti 추출)
    if access_token:
        payload = decode_token_unsafe(access_token)
        if payload and payload.get("jti"):
            await blacklist_token(
                payload["jti"], ACCESS_TOKEN_EXPIRE_MINUTES * 60
            )

    # 리프레시 토큰 블랙리스트 등록
    if refresh_token:
        payload = decode_token_unsafe(refresh_token)
        if payload and payload.get("jti"):
            await blacklist_token(
                payload["jti"], REFRESH_TOKEN_EXPIRE_DAYS * 86400
            )

    # 액세스 토큰 쿠키 삭제
    response.set_cookie(
        key="access_token",
        value="",
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=0,
    )
    # 리프레시 토큰 쿠키 삭제
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=0,
        path="/api/auth",
    )

    return {"message": "Logout successful"}
