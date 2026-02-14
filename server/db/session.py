"""
데이터베이스 세션 관리 (비동기)
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from typing import AsyncGenerator
from urllib.parse import quote_plus
import os
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()


def _build_database_url() -> str:
    """개별 DB 환경변수 또는 DATABASE_URL에서 접속 URL을 생성한다.

    개별 파라미터(DB_HOST 등)가 모두 있으면 quote_plus로 안전하게 조립하고,
    없으면 DATABASE_URL 환경변수를 그대로 사용한다 (개발 환경 호환).
    """
    db_host = os.getenv("DB_HOST")
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_name = os.getenv("DB_NAME")
    db_port = os.getenv("DB_PORT", "5432")

    if db_host and db_user and db_password is not None and db_name:
        return (
            f"postgresql+asyncpg://"
            f"{quote_plus(db_user)}:{quote_plus(db_password)}"
            f"@{db_host}:{db_port}/{db_name}"
        )

    url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./blog.db")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


DATABASE_URL = _build_database_url()

# 비동기 엔진 생성
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # SQL 쿼리 로깅 (개발 시 True로 설정 가능)
    pool_pre_ping=True,  # 연결 유효성 검사
    pool_size=20,  # 커넥션 풀 크기
    max_overflow=10,  # 추가 커넥션
)

# 비동기 세션 팩토리 생성
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    비동기 데이터베이스 세션 의존성
    FastAPI의 Depends에서 사용

    Yields:
        AsyncSession: 비동기 데이터베이스 세션
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
