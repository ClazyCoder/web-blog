"""Shared request limits. Only the configured nginx peer may supply X-Real-IP."""

import os
import socket
from ipaddress import ip_address
from starlette.requests import Request
from slowapi import Limiter

REDIS_URL = os.getenv("REDIS_URL")


def is_trusted_proxy(request: Request) -> bool:
    peer = request.client.host if request.client else None
    proxy_host = os.getenv("TRUSTED_PROXY_HOST", "")
    if not peer or not proxy_host:
        return False
    try:
        # Resolve the Docker service on each request: its IP can change on recreation.
        addresses = {item[4][0] for item in socket.getaddrinfo(proxy_host, None)}
        return peer in addresses
    except OSError:
        return False


def get_client_ip(request: Request) -> str:
    if is_trusted_proxy(request):
        try:
            return str(ip_address(request.headers.get("X-Real-IP", "")))
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["60/minute"],
    storage_uri=REDIS_URL,
)

# FastAPI's included routers are not discovered by SlowAPI 0.1.x middleware.
# Keep explicit limit decorators on API handlers. Logout is exempt so it can
# clear cookies and report a revocation-store failure even during a Redis outage.
