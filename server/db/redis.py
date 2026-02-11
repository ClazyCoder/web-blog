"""
Redis 연결 관리 및 유틸리티

기능:
- 캐시 (게시글 목록, 태그, 단일 게시글)
- 토큰 블랙리스트 (로그아웃, 리프레시 토큰 회전)
- 조회수 중복 방지 (IP 기반)
- 분산 락 (이미지 클린업 스케줄러)

Redis 미연결 시 graceful degradation: 모든 기능이 무시되고 앱은 기존처럼 동작
"""

import logging
from typing import Optional
from redis.asyncio import Redis

logger = logging.getLogger("redis")

# 글로벌 Redis 클라이언트
_redis: Optional[Redis] = None


async def init_redis(url: str = "redis://localhost:6379/0") -> None:
    """Redis 연결 초기화 (앱 시작 시 호출)"""
    global _redis
    try:
        _redis = Redis.from_url(url, decode_responses=True)
        await _redis.ping()
        logger.info(f"Redis connected: {url}")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Running without Redis.")
        _redis = None


async def close_redis() -> None:
    """Redis 연결 종료 (앱 종료 시 호출)"""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


def get_redis() -> Optional[Redis]:
    """현재 Redis 클라이언트 반환 (미연결 시 None)"""
    return _redis


# ==================== 캐시 ====================

async def cache_get(key: str) -> Optional[str]:
    """캐시 조회 (Redis 없으면 None)"""
    if not _redis:
        return None
    try:
        return await _redis.get(key)
    except Exception:
        return None


async def cache_set(key: str, value: str, ttl: int = 300) -> None:
    """캐시 저장 (기본 TTL: 5분)"""
    if not _redis:
        return
    try:
        await _redis.setex(key, ttl, value)
    except Exception:
        pass


async def cache_delete(key: str) -> None:
    """캐시 삭제"""
    if not _redis:
        return
    try:
        await _redis.delete(key)
    except Exception:
        pass


async def cache_delete_pattern(pattern: str) -> None:
    """패턴 매칭 캐시 일괄 삭제 (예: cache:posts:*)"""
    if not _redis:
        return
    try:
        cursor = 0
        while True:
            cursor, keys = await _redis.scan(cursor, match=pattern, count=100)
            if keys:
                await _redis.delete(*keys)
            if cursor == 0:
                break
    except Exception:
        pass


# ==================== 토큰 블랙리스트 ====================

async def blacklist_token(jti: str, ttl: int) -> None:
    """
    토큰 JTI를 블랙리스트에 추가

    Args:
        jti: JWT Token ID (uuid)
        ttl: 만료까지 남은 시간 (초)
    """
    if not _redis or not jti:
        return
    try:
        await _redis.setex(f"blacklist:{jti}", ttl, "1")
    except Exception:
        pass


async def is_token_blacklisted(jti: str) -> bool:
    """토큰이 블랙리스트에 있는지 확인"""
    if not _redis or not jti:
        return False
    try:
        return await _redis.exists(f"blacklist:{jti}") > 0
    except Exception:
        return False


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
