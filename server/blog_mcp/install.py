import hashlib
from urllib.parse import parse_qs

from fastapi import Request
from fastapi.responses import JSONResponse
from db.redis import require_auth_store, get_redis
from rate_limit import get_client_ip
from .config import Settings, SCOPES
from .server import build_server
from .review import build_router
from .management import build_management


def install_mcp(app, settings=None):
    settings = settings or Settings.from_env()
    mcp, transport, provider = build_server(settings)
    app.state.mcp_server = mcp
    app.state.mcp_provider = provider
    app.include_router(build_router(settings))
    app.include_router(build_management(settings, provider))
    from .discovery import install_discovery
    install_discovery(app, settings, provider)

    @app.get("/.well-known/oauth-protected-resource/mcp")
    @app.get("/.well-known/oauth-protected-resource")
    async def metadata():
        return JSONResponse({"resource": settings.resource, "authorization_servers": [settings.issuer],
                             "scopes_supported": list(SCOPES), "bearer_methods_supported": ["header"]},
                            headers={"Cache-Control": "no-store"})

    # This middleware also covers OAuth endpoint abuse before token validation.
    @app.middleware("http")
    async def boundary(request: Request, call_next):
        path = request.scope["path"]
        protected = path == "/mcp" or path.startswith(("/api/mcp/", "/.well-known/")) or path in ("/authorize", "/token", "/register", "/revoke")
        if not protected:
            return await call_next(request)
        if request.headers.get("origin") not in (None, settings.origin):
            return JSONResponse({"error": "untrusted_origin"}, status_code=403)
        if request.headers.get("host") != settings.origin.split("//", 1)[1]:
            return JSONResponse({"error": "invalid_host"}, status_code=421)
        if path in ("/authorize", "/token", "/register", "/revoke", "/mcp"):
            try:
                await require_auth_store()
                key = hashlib.sha256(get_client_ip(request).encode()).hexdigest()
                count = await get_redis().eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", 1, "mcp:ip:" + key)
                if count > 120:
                    return JSONResponse({"error": "rate_limited"}, status_code=429, headers={"Retry-After": "60"})
            except Exception:
                return JSONResponse({"error": "temporarily_unavailable"}, status_code=503)
        if path in ("/authorize", "/token", "/register", "/revoke"):
            if len(request.scope.get("query_string", b"")) > 8192:
                return JSONResponse({"error": "invalid_request"}, status_code=413)
            if request.method == "POST":
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > 16384:
                        return JSONResponse({"error": "invalid_request"}, status_code=413)
                request._body = bytes(body)
                if path == "/revoke" and "client_secret" not in parse_qs(body.decode("utf-8", errors="replace"), keep_blank_values=True):
                    # SDK 1.30 models nullable client_secret as required. Public PKCE
                    # clients legitimately omit it; normalize only this optional field.
                    request._body += b"&client_secret="
                if path == "/token":
                    form = parse_qs(body.decode("utf-8", errors="replace"))
                    if "resource" in form and form["resource"] != [settings.resource]:
                        return JSONResponse({"error": "invalid_target"}, status_code=400)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        # Native same-origin form submissions need a non-null Origin. Never
        # send the consent/review URL to an external callback or other site.
        is_html = response.headers.get("content-type", "").startswith("text/html")
        response.headers["Referrer-Policy"] = "same-origin" if is_html else "no-referrer"
        return response

    app.mount("/", transport)
