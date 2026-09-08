"""
Redis 연결 관리 및 유틸리티

기능:
- 토큰 블랙리스트 (로그아웃, 리프레시 토큰 회전)
- 조회수 중복 방지 (IP 기반)
- 분산 락 (이미지 클린업 스케줄러)

토큰 폐기 저장소 장애는 503으로 처리한다. 조회수/정리 기능만 제한적으로 폴백한다.
"""

import logging
from typing import Optional
from redis.asyncio import Redis
from fastapi import HTTPException

logger = logging.getLogger("redis")

# 글로벌 Redis 클라이언트
_redis: Optional[Redis] = None


async def init_redis(url: str = "redis://localhost:6379/0") -> None:
    """Redis 연결 초기화 (앱 시작 시 호출)"""
    global _redis
    try:
        _redis = Redis.from_url(url, decode_responses=True, socket_connect_timeout=2, socket_timeout=2)
        await _redis.ping()
        logger.info("Redis connected")
    except Exception:
        # Keep the client so a restored server can be used without an app restart.
        logger.warning("Redis unavailable; authentication will fail closed")


async def close_redis() -> None:
    """Redis 연결 종료 (앱 종료 시 호출)"""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


def get_redis() -> Optional[Redis]:
    """현재 Redis 클라이언트 반환 (미연결 시 None)"""
    return _redis


# ==================== 토큰 블랙리스트 ====================

def _auth_store() -> Redis:
    if _redis is None:
        raise HTTPException(503, "Authentication store unavailable")
    return _redis


async def require_auth_store() -> None:
    try:
        await _auth_store().ping()
    except Exception:
        raise HTTPException(503, "Authentication store unavailable") from None


async def blacklist_token(jti: str, ttl: int) -> None:
    if ttl <= 0:
        return
    try:
        await _auth_store().setex(f"blacklist:{jti}", ttl, "1")
    except Exception:
        raise HTTPException(503, "Authentication store unavailable") from None


async def consume_refresh_token(jti: str, ttl: int) -> bool:
    """Atomically revoke once; concurrent refreshes must have one winner."""
    if ttl <= 0:
        return False
    try:
        return bool(await _auth_store().set(f"blacklist:{jti}", "1", ex=ttl, nx=True))
    except Exception:
        raise HTTPException(503, "Authentication store unavailable") from None


async def is_token_blacklisted(jti: str) -> bool:
    try:
        return bool(await _auth_store().exists(f"blacklist:{jti}"))
    except Exception:
        raise HTTPException(503, "Authentication store unavailable") from None


# ==================== 조회수 중복 방지 ====================

async def check_and_set_view(post_id: int, client_ip: str, ttl: int = 3600) -> bool:
    """
    조회수 중복 방지: 같은 IP에서 같은 게시글을 TTL 내에 재조회하면 False 반환

    Args:
        post_id: 게시글 ID
        client_ip: 클라이언트 IP 주소
        ttl: 중복 조회 차단 시간 (초, 기본 1시간)

    Returns:
        True = 새 조회 (카운트 증가), False = 중복 조회 (무시)
    """
    if not _redis:
        return True  # Redis 없으면 기존 동작 유지
    try:
        key = f"view:{post_id}:{client_ip}"
        result = await _redis.set(key, "1", ex=ttl, nx=True)
        return result is not None
    except Exception:
        return True


# ==================== 분산 락 ====================

async def acquire_lock(name: str, ttl: int = 300) -> bool:
    """
    분산 락 획득 (SETNX 기반)

    Args:
        name: 락 이름
        ttl: 락 만료 시간 (초, 기본 5분)

    Returns:
        True = 락 획득 성공
    """
    if not _redis:
        return True  # Redis 없으면 항상 성공 (단일 프로세스 가정)
    try:
        result = await _redis.set(f"lock:{name}", "1", ex=ttl, nx=True)
        return result is not None
    except Exception:
        return True


async def release_lock(name: str) -> None:
    """분산 락 해제"""
    if not _redis:
        return
    try:
        await _redis.delete(f"lock:{name}")
    except Exception:
        pass
