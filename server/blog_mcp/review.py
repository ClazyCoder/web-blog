"""Human approval UI: existing HttpOnly admin cookie + CSRF + password recheck.

OAuth bearer tokens cannot read this page or submit decisions. Nothing in the
proposal (including text claiming approval) is considered authorization.
"""
import difflib
import hashlib
import hmac
import time
from pathlib import Path
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates

import auth
from db.session import get_db
from rate_limit import limiter
from . import service

templates = Jinja2Templates(directory=str(Path(__file__).with_name("templates")))


async def browser_session(request):
    if request.headers.get("authorization"):
        raise HTTPException(403, "OAuth/Bearer credentials cannot approve changes")
    cookie = request.cookies.get("access_token")
    await auth.get_current_user_from_cookie(cookie)
    return auth.decode_access_token(cookie)


def csrf(req, session, expiry):
    message = f"mcp-review-v1\0{req.id}\0{req.payload_hash}\0{req.snapshot_hash}\0{session['jti']}\0{expiry}"
    signature = hmac.new(auth.SECRET_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()
    return f"{expiry}.{signature}"


def check_csrf(value, req, session):
    try:
        expiry = int(value.split(".", 1)[0])
        return time.time() < expiry <= time.time() + 601 and hmac.compare_digest(value, csrf(req, session, expiry))
    except (ValueError, TypeError):
        return False


def secure(response):
    response.headers.update({"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY", "Content-Security-Policy":
        "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; "
        "form-action 'self'; base-uri 'none'; frame-ancestors 'none'"})
    return response


def build_router(settings):
    router = APIRouter(prefix="/api/mcp", tags=["MCP human review"])

    @router.get("/review/{request_id}", response_class=HTMLResponse)
    @limiter.limit("30/minute")
    async def review(request: Request, request_id: str, db=Depends(get_db)):
        try:
            session = await browser_session(request)
        except HTTPException as exc:
            if exc.status_code != 401:
                raise
            return secure(HTMLResponse('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인 필요</title><p>블로그에 관리자 계정으로 로그인한 뒤 이 승인 링크를 다시 열어 주세요.</p><a href="/login">블로그 로그인</a></html>', status_code=401))
        req = await service.get_request(db, request_id)
        before = service.canonical(req.snapshot)
        after = service.canonical(req.payload)
        post_before = req.snapshot.get("post")
        old_content = post_before.get("content", "") if post_before else ""
        if req.action == "post.delete":
            new_content = "[이 글을 소프트 삭제 — 이미지 연결과 파일은 보존]"
        elif req.action == "image.replace" and post_before:
            old_image = next(i for i in req.snapshot["images"] if i["id"] == req.target_id)
            new_content = service.replace_image_references(old_content, old_image["storage_key"], "images/mcp-" + req.id + ".png")
        else:
            new_content = req.payload.get("content", old_content)
        diff = "\n".join(difflib.unified_diff(old_content.splitlines(), new_content.splitlines(),
                                             fromfile="변경 전", tofile="변경 후", lineterm=""))
        state = service.request_status(req, settings.origin)["state"]
        return secure(templates.TemplateResponse(request=request, name="review.html", context={
            "req": req, "state": state, "before": before, "after": after, "diff": diff,
            "csrf": csrf(req, session, min(int(time.time()) + 600, req.expires_at)),
        }))

    @router.get("/review/{request_id}/preview")
    @limiter.limit("30/minute")
    async def preview(request: Request, request_id: str, db=Depends(get_db)):
        await browser_session(request)
        req = await service.get_request(db, request_id)
        if req.blob is None or req.expires_at <= time.time():
            raise HTTPException(404, "Preview unavailable")
        return secure(Response(req.blob, media_type="image/png"))

    @router.post("/review/{request_id}")
    @limiter.limit("5/minute")
    async def decision(request: Request, request_id: str, db=Depends(get_db)):
        session = await browser_session(request)
        if (request.headers.get("origin") != settings.origin
                or request.headers.get("sec-fetch-site", "same-origin") != "same-origin"):
            raise HTTPException(403, "Same-origin browser approval required")
        if request.headers.get("content-type", "").split(";")[0] != "application/x-www-form-urlencoded":
            raise HTTPException(415, "A browser form is required")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 4096:
                raise HTTPException(413, "Review form too large")
        try:
            fields = parse_qs(body.decode("utf-8"), max_num_fields=4)
        except (UnicodeError, ValueError):
            raise HTTPException(400, "Invalid review form") from None
        if any(len(v) != 1 for v in fields.values()) or set(fields) - {"csrf", "decision", "password"}:
            raise HTTPException(400, "Invalid review form")
        form = {k: v[0] for k, v in fields.items()}
        req = await service.get_request(db, request_id)
        if not check_csrf(form.get("csrf", ""), req, session):
            raise HTTPException(403, "Review session expired or invalid; reload the review page")
        action = form.get("decision")
        if action not in ("approve", "reject"):
            raise HTTPException(400, "Explicit approve or reject is required")
        if action == "approve" and not auth.verify_admin_credentials(auth.ADMIN_USERNAME, form.get("password", "")):
            service.audit(db, "admin", "approval_password_failed", req.id)
            await db.commit()
            raise HTTPException(403, "Administrator password verification failed")
        result = await service.decide(db, req, action, settings)
        return secure(templates.TemplateResponse(request=request, name="result.html", context={"result": result}))

    return router
