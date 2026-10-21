"""Browser-only client administration; never exposed as MCP tools."""
import json
import secrets
import time
import uuid
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select

import auth
from db.session import get_db
from models.mcp import MCPOAuth
from rate_limit import limiter
from . import registry, storage
from .management import context, one, small_form
from .review import browser_session, csrf, check_csrf
from .service import audit


def creation_context(ident):
    return SimpleNamespace(id=ident, data={"purpose": "create-oauth-client"})


def public_client(row, session):
    # Explicit projection: neither encrypted nor plaintext secrets leave this API.
    data = row.data
    return {"client_id": row.client_id, "client_name": data.get("client_name", ""),
            "redirect_uris": data.get("redirect_uris", []), "scopes": data.get("scope", "").split(),
            "auth_method": data.get("token_endpoint_auth_method", "none"),
            "source": "manual" if row.kind == "managed_client" else "automatic",
            "disabled": row.consumed, "expires_at": row.expires_at if row.kind == "client" else None,
            "csrf": csrf(context(row), session, int(time.time()) + 600)}


def parse_metadata(fields):
    try:
        return registry.ClientInput.model_validate(json.loads(one(fields, "metadata")))
    except ValueError:
        raise HTTPException(400, "Invalid client metadata: check name, exact callbacks, scopes and authentication method") from None


def build_registry_routes(settings):
    router = APIRouter(prefix="/admin/clients")

    @router.get("")
    @limiter.limit("30/minute")
    async def clients(request: Request, db=Depends(get_db)):
        session = await browser_session(request)
        rows = (await db.scalars(select(MCPOAuth).where(MCPOAuth.kind.in_(registry.CLIENT_KINDS),
            MCPOAuth.consumed.is_(False)).order_by(MCPOAuth.client_id).limit(
                registry.MAX_MANAGED_CLIENTS + storage.MAX_CLIENTS))).all()
        ident = str(uuid.uuid4())
        return {"clients": [public_client(row, session) for row in rows], "create_id": ident,
                "csrf": csrf(context(creation_context(ident)), session, int(time.time()) + 600)}

    @router.post("")
    @limiter.limit("5/minute")
    async def mutate(request: Request, db=Depends(get_db)):
        session = await browser_session(request)
        fields = await small_form(request, settings)
        action, ident = one(fields, "action"), one(fields, "client_id")
        if action not in ("create", "update", "rotate", "delete") or len(ident) > 200:
            raise HTTPException(400, "Invalid client operation")
        # Verify password before holding the shared database transaction lock.
        if not auth.verify_admin_credentials(auth.ADMIN_USERNAME, one(fields, "password")):
            raise HTTPException(403, "Administrator password verification failed")
        await storage.lock_storage(db)
        if action == "create":
            try:
                if str(uuid.UUID(ident)) != ident:
                    raise ValueError()
            except ValueError:
                raise HTTPException(400, "Invalid creation identifier") from None
            target = creation_context(ident)
        else:
            target = await db.get(MCPOAuth, registry.client_key(ident))
            if not target or target.kind not in registry.CLIENT_KINDS or target.consumed:
                raise HTTPException(404, "Client not found")
        if not check_csrf(one(fields, "csrf"), context(target), session):
            raise HTTPException(403, "The client form expired or changed; reload it")
        if one(fields, "confirm") != action:
            raise HTTPException(400, "Explicit client operation confirmation required")
        secret = None
        if action == "create":
            try:
                secret = await registry.create_managed(db, ident, parse_metadata(fields))
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from None
        else:
            if action != "delete" and target.kind != "managed_client":
                raise HTTPException(400, "Automatic client metadata is immutable; reconnect from the app")
            if action == "delete":
                target.consumed = True
                target.data = {**target.data, "_revision": target.data.get("_revision", 0) + 1}
            else:
                current = registry.client_from_row(target)
                if action == "rotate":
                    if target.data.get("token_endpoint_auth_method") != "client_secret_post":
                        raise HTTPException(400, "Public PKCE clients do not have a secret")
                    value = registry.ClientInput(client_name=target.data["client_name"],
                        redirect_uris=target.data["redirect_uris"], scopes=target.data["scope"].split(),
                        token_endpoint_auth_method="client_secret_post")
                else:
                    value = parse_metadata(fields)
                if value.token_endpoint_auth_method == "none":
                    retained_secret = None
                elif action == "rotate" or not current or not current.client_secret:
                    secret = retained_secret = secrets.token_urlsafe(48)
                else:
                    retained_secret = current.client_secret
                data = registry.stored_metadata(registry.make_client(ident, value, retained_secret),
                    revision=target.data.get("_revision", 0) + 1)
                if not storage.bounded_payload(data):
                    raise HTTPException(400, "Client metadata exceeds the storage limit")
                target.data = data
            await registry.revoke_client_grants(db, ident)
        audit(db, "admin", "oauth_client_" + action, client_id=ident)
        await db.commit()
        return {"client_id": ident, "client_secret": secret, "action": action}

    return router
