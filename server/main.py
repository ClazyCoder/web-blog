"""
Web Blog Server - Main Application
FastAPI 기반 블로그 서버
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os
import uvicorn

# 라우터 임포트
from routers import image, auth as auth_router, post
import auth

# FastAPI 앱 초기화
app = FastAPI(
    title="Web Blog API",
    description="블로그 시스템 API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS 설정 (환경 변수로 오리진 관리)
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 서빙 (업로드된 이미지)
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# 라우터 등록
app.include_router(auth_router.router)
app.include_router(image.router)
app.include_router(post.router)


@app.get("/")
async def root():
    """
    API 루트 엔드포인트
    """
    return {
        "message": "Web Blog API Server",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "auth": {
                "register": "POST /api/auth/register",
                "login": "POST /api/auth/login"
            },
            "image": {
                "upload": "POST /api/upload/image",
                "get_info": "GET /api/upload/temp/{filename}",
                "delete": "DELETE /api/upload/image/{filename}"
            },
            "posts": {
                "create": "POST /api/posts",
                "list": "GET /api/posts",
                "detail": "GET /api/posts/{post_id}",
                "by_slug": "GET /api/posts/slug/{slug}",
                "update": "PUT /api/posts/{post_id}",
                "delete": "DELETE /api/posts/{post_id}"
            }
        }
    }


@app.get("/health")
async def health_check():
    """
    헬스 체크 엔드포인트
    """
    return {
        "status": "healthy",
        "service": "web-blog-api"
    }


def main():
    """
    서버 실행 함수
    """
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # 개발 모드에서 자동 리로드
        log_level="info"
    )


if __name__ == "__main__":
    main()
