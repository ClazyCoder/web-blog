"""
Web Blog Server - Main Application
FastAPI 기반 블로그 서버
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from dotenv import load_dotenv
import os
import uvicorn

load_dotenv()

# 라우터 임포트
from routers import image, auth as auth_router, post, og
import auth

# 서비스 임포트
from services.image_cleanup import start_cleanup_scheduler

# Redis 임포트
from db.redis import init_redis, close_redis

# 공유 Rate Limiter
from rate_limit import limiter
from security import allowed_origins, security_headers_and_origin

# 로깅 설정
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 생명주기 관리 (startup / shutdown)"""
    # Startup: Redis 연결
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        await init_redis(redis_url)
    auth.init_admin_user()

    # Startup: 백그라운드 태스크 시작
    cleanup_task = asyncio.create_task(start_cleanup_scheduler())
    yield
    # Shutdown: 백그라운드 태스크 정리
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    # Shutdown: Redis 연결 종료
    await close_redis()


# 환경 판별 (production에서는 API 문서 비활성화)
IS_PRODUCTION = os.getenv("ENV", "development").lower() == "production"

# FastAPI 앱 초기화
app = FastAPI(
    title="Web Blog API",
    description="블로그 시스템 API",
    version="1.0.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
    lifespan=lifespan,
)

# Rate Limiter 등록
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def redis_unavailable_handler(request, exc):
    # SlowAPI and authentication both fail closed, without leaking connection details.
    return JSONResponse({"detail": "Service temporarily unavailable"}, status_code=503)


app.add_exception_handler(RedisError, redis_unavailable_handler)
app.add_middleware(SlowAPIMiddleware)
app.state.allowed_origins = allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(app.state.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

app.middleware("http")(security_headers_and_origin)

# 라우터 등록
app.include_router(auth_router.router)
app.include_router(image.router)
app.include_router(image.files_router)
app.include_router(post.router)
app.include_router(og.router)


@app.get("/")
async def root():
    """
    API 루트 엔드포인트
    """
    if IS_PRODUCTION:
        return {
            "message": "Web Blog API Server",
            "version": "1.0.0",
        }

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
                "delete": "DELETE /api/upload/image/{filename}",
                "orphan_stats": "GET /api/upload/admin/orphans",
                "manual_cleanup": "POST /api/upload/admin/cleanup"
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
