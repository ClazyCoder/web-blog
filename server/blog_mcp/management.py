import hashlib
import hmac
import json
import secrets
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select, update

import auth
from db.session import get_db
from models.mcp import MCPOAuth, MCPRequest, MCPAudit
from rate_limit import limiter
from .authorization import token_hash
from .review import browser_session, csrf, check_csrf, templates, secure
from .service import audit, digest, request_status


def context(row):
    return SimpleNamespace(id=row.id, payload_hash=digest(row.data), snapshot_hash="oauth-consent")


def redirect_result(uri, **values):
    parts = urlsplit(uri)
    query = parts.query + ("&" if parts.query else "") + urlencode({k: v for k, v in values.items() if v is not None})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


async def small_form(request, settings, max_fields=16):
    if request.headers.get("origin") != settings.origin or request.headers.get("sec-fetch-site", "same-origin") != "same-origin":
        raise HTTPException(403, "Same-origin browser request required")
    if request.headers.get("content-type", "").split(";")[0] != "application/x-www-form-urlencoded":
        raise HTTPException(415, "Browser form required")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 8192:
            raise HTTPException(413, "Form too large")
    try:
        return parse_qs(body.decode(), max_num_fields=max_fields)
    except (UnicodeError, ValueError):
        raise HTTPException(400, "Invalid form") from None


def one(fields, name, default=""):
    values = fields.get(name, [default])
    if len(values) != 1:
        raise HTTPException(400, "Duplicate form field")
    return values[0]


def build_management(settings, provider):
    router = APIRouter(prefix="/api/mcp", tags=["MCP administration"])

    @router.get("/admin")
    @limiter.limit("30/minute")
    async def overview(request: Request, offset: int = Query(0, ge=0), db=Depends(get_db)):
        session = await browser_session(request)
        rows = (await db.scalars(select(MCPRequest).order_by(MCPRequest.created_at.desc(), MCPRequest.id).offset(offset).limit(50))).all()
        events = (await db.scalars(select(MCPAudit).order_by(MCPAudit.occurred_at.desc(), MCPAudit.id).limit(50))).all()
        grants = (await db.scalars(select(MCPOAuth).where(MCPOAuth.kind == "grant", MCPOAuth.consumed.is_(False), MCPOAuth.expires_at > int(time.time())).limit(100))).all()
        return {"enabled": True, "resource": settings.resource, "oauth_mode": "local" if settings.local else "external",
                "requests": [{**request_status(row, settings.origin), "client_id": row.client_id,
                              "target_id": row.target_id, "created_at": row.created_at} for row in rows],
                "next_offset": offset + len(rows),
                "events": [{"id": e.id, "at": e.occurred_at, "event": e.event, "request_id": e.request_id,
                            "details": e.details} for e in events],
                "connections": [{"id": g.id, "client_id": g.client_id, "scopes": g.data["scopes"],
                                 "expires_at": g.expires_at, "csrf": csrf(context(g), session, int(time.time()) + 600)} for g in grants]}

    @router.post("/admin/connections/{grant_id}/revoke")
    @limiter.limit("10/minute")
    async def revoke(request: Request, grant_id: str, db=Depends(get_db)):
        session = await browser_session(request)
        fields = await small_form(request, settings)
        grant = await db.get(MCPOAuth, grant_id)
        if not grant or grant.kind != "grant":
            raise HTTPException(404, "Connection not found")
        if not check_csrf(one(fields, "csrf"), context(grant), session) or one(fields, "confirm") != "revoke":
            raise HTTPException(403, "Explicit connection revocation required")
        await db.execute(update(MCPOAuth).where(MCPOAuth.id == grant_id).values(consumed=True))
        audit(db, "admin", "grant_revoked", grant_id=grant_id, client_id=grant.client_id)
        await db.commit()
        return {"revoked": True}

    async def consent_row(db, ident):
        row = await db.get(MCPOAuth, ident)
        if not row or row.kind != "consent" or row.consumed or row.expires_at <= time.time():
            raise HTTPException(410, "Consent request expired or already used")
        if not await provider.get_client(row.client_id):
            raise HTTPException(410, "OAuth client is no longer allowed")
        return row

    @router.get("/oauth/consent/{consent_id}")
    @limiter.limit("30/minute")
    async def consent(request: Request, consent_id: str, db=Depends(get_db)):
        if not settings.local:
            raise HTTPException(404)
        try:
            session = await browser_session(request)
        except HTTPException as exc:
            if exc.status_code != 401:
                raise
            return secure(RedirectResponse("/login?" + urlencode({"redirect": "/api/mcp/oauth/consent/" + consent_id}), status_code=303))
        row = await consent_row(db, consent_id)
        return secure(templates.TemplateResponse(request=request, name="consent.html", context={
            "row": row, "csrf": csrf(context(row), session, min(int(time.time()) + 600, row.expires_at))}))

    @router.post("/oauth/consent/{consent_id}")
    @limiter.limit("5/minute")
    async def consent_decide(request: Request, consent_id: str, db=Depends(get_db)):
        if not settings.local:
            raise HTTPException(404)
        session = await browser_session(request)
        fields = await small_form(request, settings)
        row = await consent_row(db, consent_id)
        if not check_csrf(one(fields, "csrf"), context(row), session):
            raise HTTPException(403, "Invalid consent CSRF token")
        decision = one(fields, "decision")
        if decision not in ("allow", "deny"):
            raise HTTPException(400, "Explicit consent required")
        scopes = fields.get("scope", [])
        if decision == "allow":
            if not scopes or not set(scopes).issubset(row.data["scopes"]):
                raise HTTPException(400, "Choose only requested scopes")
            if not auth.verify_admin_credentials(auth.ADMIN_USERNAME, one(fields, "password")):
                audit(db, "admin", "oauth_password_failed", client_id=row.client_id)
                await db.commit()
                raise HTTPException(403, "Administrator password verification failed")
        won = await db.execute(update(MCPOAuth).where(MCPOAuth.id == row.id, MCPOAuth.consumed.is_(False))
                               .values(consumed=True).execution_options(synchronize_session=False))
        if won.rowcount != 1:
            raise HTTPException(409, "Consent already handled")
        if decision == "deny":
            url = redirect_result(row.data["redirect_uri"], error="access_denied", state=row.data.get("state"))
            audit(db, "admin", "oauth_denied", client_id=row.client_id)
        else:
            grant_id = secrets.token_hex(24)
            grant = MCPOAuth(id=grant_id, kind="grant", client_id=row.client_id,
                             data={"scopes": scopes}, expires_at=int(time.time()) + 86400 * 30)
            db.add(grant)
            code = secrets.token_urlsafe(48)
            data = {k: row.data[k] for k in ("code_challenge", "redirect_uri", "redirect_uri_provided_explicitly", "resource")}
            data.update(scopes=scopes, subject="admin")
            db.add(MCPOAuth(id=token_hash(code), kind="code", client_id=row.client_id, grant_id=grant_id,
                           data=data, expires_at=int(time.time()) + 60))
            url = redirect_result(row.data["redirect_uri"], code=code, state=row.data.get("state"))
            audit(db, "admin", "oauth_consented", client_id=row.client_id, grant_id=grant_id, scopes=scopes)
        await db.commit()
        return secure(RedirectResponse(url, status_code=303))

    return router
