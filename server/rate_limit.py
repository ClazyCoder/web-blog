"""
Rate Limiter 공유 인스턴스 & 클라이언트 IP 유틸리티

모든 라우터에서 동일한 limiter를 사용하여
Redis 백엔드 (또는 인메모리 폴백) 공유

CF Tunnel → Nginx → Uvicorn 구조에서 실제 클라이언트 IP를 추출하는
get_client_ip 함수 제공
"""

import os
from starlette.requests import Request
from slowapi import Limiter

# REDIS_URL이 설정되어 있으면 Redis 백엔드 사용, 없으면 인메모리
REDIS_URL = os.getenv("REDIS_URL")


def get_client_ip(request: Request) -> str:
    """
    실제 클라이언트 IP 추출 (CF Tunnel / 일반 Docker Compose 환경 모두 호환)

    Nginx가 proxy_set_header X-Real-IP $remote_addr 로 설정하므로:
      - CF Tunnel 환경: set_real_ip_from + real_ip_header 에 의해
        $remote_addr 이 이미 실제 클라이언트 IP 로 복원됨
      - 일반 Docker Compose 환경: $remote_addr 이 원래 클라이언트 IP

    X-Real-IP 는 Nginx 가 $remote_addr 로 항상 덮어쓰므로
    클라이언트가 위조할 수 없어 안전함
    """
    # Nginx가 설정한 X-Real-IP (클라이언트 위조 불가)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # 폴백: Uvicorn이 해석한 클라이언트 IP
    if request.client:
        return request.client.host

    return "unknown"


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["60/minute"],
    storage_uri=REDIS_URL,  # None이면 인메모리 폴백
)
