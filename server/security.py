"""Origin checks for cookie-authenticated mutations; private response caching."""

import os
from urllib.parse import urlsplit

from fastapi.responses import JSONResponse
from rate_limit import is_trusted_proxy


def origin_of(value: str | None) -> str | None:
    try:
        url = urlsplit(value or "")
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
            return None
        port = url.port
        host = url.hostname.lower()
        if ":" in host:
            host = f"[{host}]"
        suffix = f":{port}" if port and port != (443 if url.scheme == "https" else 80) else ""
        return f"{url.scheme}://{host}{suffix}"
    except ValueError:
        return None


def allowed_origins() -> set[str]:
    site_url = os.getenv("SITE_URL", "")
    if os.getenv("ENV", "development").lower() == "production":
        origin = origin_of(site_url)
        if not origin:
            raise RuntimeError("Production requires an explicit http(s) SITE_URL")
        return {origin}
    values = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    return {origin for value in [site_url, *values] if (origin := origin_of(value))}


async def security_headers_and_origin(request, call_next):
    if is_trusted_proxy(request):
        scheme = request.headers.get("x-forwarded-proto")
        if scheme in ("http", "https"):
            request.scope["scheme"] = scheme
    # Routing uses the ASGI path; Host must not change which security checks apply.
    path = request.scope["path"]
    response = None
    auth_action = path.rstrip("/") in {
        "/api/auth/login", "/api/auth/refresh", "/api/auth/logout",
    }
    has_auth_cookie = any(key in request.cookies for key in ("access_token", "refresh_token"))
    if request.method not in ("GET", "HEAD", "OPTIONS") and (auth_action or has_auth_cookie):
        # A present but invalid Origin must not fall back to Referer.
        source = request.headers.get("origin") if "origin" in request.headers else request.headers.get("referer")
        if origin_of(source) not in request.app.state.allowed_origins:
            response = JSONResponse({"detail": "Untrusted request origin"}, status_code=403)
    if response is None:
        response = await call_next(request)
    if path.startswith(("/api/", "/uploads/", "/og/")):
        response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response
