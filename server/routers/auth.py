"""
인증 관련 라우터
"""

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from datetime import timedelta
from auth import (
    create_access_token, 
    verify_password, 
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_user
)

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)


class UserLogin(BaseModel):
    username: str
    password: str


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    username: str


class UserInfo(BaseModel):
    id: str
    username: str
    email: str


class Token(BaseModel):
    access_token: str
    token_type: str


# TODO: 실제로는 데이터베이스 사용
# 임시 사용자 데이터 (개발용)
fake_users_db = {}


def _init_fake_db():
    """임시 DB 초기화 (지연 초기화)"""
    if not fake_users_db:
        # root 계정 추가
        fake_users_db["root"] = {
            "email": "root@admin.com",
            "username": "root",
            "hashed_password": get_password_hash("root"),
            "user_id": "admin"
        }
        # 테스트 계정
        fake_users_db["testuser"] = {
            "email": "user@example.com",
            "username": "testuser",
            "hashed_password": get_password_hash("password123"),
            "user_id": "1"
        }


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister):
    """
    사용자 회원가입
    
    Args:
        user_data: 이메일, 비밀번호, 사용자명
        
    Returns:
        JWT 액세스 토큰
    """
    _init_fake_db()  # DB 초기화
    
    # 이메일 중복 체크
    if user_data.email in fake_users_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # TODO: 실제로는 데이터베이스에 저장
    user_id = str(len(fake_users_db) + 1)
    fake_users_db[user_data.email] = {
        "email": user_data.email,
        "username": user_data.username,
        "hashed_password": get_password_hash(user_data.password),
        "user_id": user_id
    }
    
    # 토큰 생성
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_id, "email": user_data.email},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    """
    사용자 로그인
    
    Args:
        user_data: 사용자명, 비밀번호
        
    Returns:
        JWT 액세스 토큰
    """
    _init_fake_db()  # DB 초기화
    
    # username으로 사용자 조회
    user = fake_users_db.get(user_data.username)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 비밀번호 검증
    if not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 토큰 생성
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": user["user_id"], 
            "email": user["email"],
            "username": user["username"]
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserInfo)
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    현재 로그인한 사용자 정보 조회
    
    Returns:
        사용자 정보
    """
    _init_fake_db()
    
    user_id = current_user.get("user_id")
    
    # fake_users_db에서 사용자 찾기
    for username, user_data in fake_users_db.items():
        if user_data["user_id"] == user_id:
            return {
                "id": user_data["user_id"],
                "username": user_data["username"],
                "email": user_data["email"]
            }
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="User not found"
    )
