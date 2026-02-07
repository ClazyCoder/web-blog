"""
Web Blog Server - Main Application
FastAPI 기반 블로그 서버
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import uvicorn

# 라우터 임포트
from routers import image, auth

# FastAPI 앱 초기화
app = FastAPI(
    title="Web Blog API",
    description="블로그 시스템 API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite 개발 서버
        "http://localhost:3000",  # React 개발 서버 (예비)
        # 프로덕션 도메인 추가
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 서빙 (업로드된 이미지)
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# 라우터 등록
app.include_router(auth.router)
app.include_router(image.router)


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
