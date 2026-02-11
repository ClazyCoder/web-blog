"""
Rate Limiter 공유 인스턴스

모든 라우터에서 동일한 limiter를 사용하여
Redis 백엔드 (또는 인메모리 폴백) 공유
"""

import os
from slowapi import Limiter
from slowapi.util import get_remote_address

# REDIS_URL이 설정되어 있으면 Redis 백엔드 사용, 없으면 인메모리
REDIS_URL = os.getenv("REDIS_URL")

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],
    storage_uri=REDIS_URL,  # None이면 인메모리 폴백
)
