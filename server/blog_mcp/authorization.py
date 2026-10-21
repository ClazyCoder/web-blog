"""OAuth 2.1 code/PKCE provider using the official SDK endpoint validators.

Single-admin resource server, opaque access tokens, rotating refresh tokens,
one-use authorization codes, durable grants and immediate local revocation.
"""
import hashlib
import secrets
import time

from mcp.server.auth.provider import AuthorizationCode, RefreshToken, AccessToken, TokenError, AuthorizeError, RegistrationError
from mcp.shared.auth import OAuthToken
from sqlalchemy import select, update, func

from db import session as database
from models.mcp import MCPOAuth
from . import storage
from . import registry


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


async def active_grant(db, ident, *, lock=False):
    stmt = select(MCPOAuth).where(MCPOAuth.id == ident, MCPOAuth.kind == "grant")
    row = await db.scalar(stmt.with_for_update() if lock else stmt)
    return row if row and not row.consumed and row.expires_at > time.time() else None


class LocalOAuth:
    def __init__(self, settings):
        self.settings = settings

    async def get_client(self, client_id):
        async with database.AsyncSessionLocal() as db:
            return await self.client_in_session(db, client_id)

    async def client_in_session(self, db, client_id, *, allow_pending=False):
        if not isinstance(client_id, str) or len(client_id) > 200:
            return None
        row = await db.get(MCPOAuth, token_hash("client:" + client_id))
        if row and row.kind in registry.CLIENT_KINDS and not row.consumed:
            now = int(time.time())
            if row.kind == "client" and row.expires_at <= now and not await db.scalar(select(storage.live_dependencies(
                    client_id, now, include_consent=allow_pending))):
                return None
            return registry.client_from_row(row)
        return None

    async def register_client(self, client_info):
        try:
            registry.validate_client(client_info)
        except ValueError as exc:
            raise RegistrationError(error="invalid_client_metadata", error_description=str(exc)) from None
        data = registry.stored_metadata(client_info)
        if not storage.bounded_payload(data):
            raise RegistrationError(error="invalid_client_metadata", error_description="Client metadata exceeds the storage limit")
        async with database.AsyncSessionLocal() as db:
            await storage.lock_storage(db)
            now = int(time.time())
            await storage.prune_storage(db, now)
            count = await db.scalar(select(func.count()).select_from(MCPOAuth).where(MCPOAuth.kind == "client"))
            if count >= storage.MAX_CLIENTS:
                await db.commit()
                raise RegistrationError(error="invalid_client_metadata", error_description="Client registration capacity reached; retry later")
            clients = (await db.scalars(select(MCPOAuth).where(MCPOAuth.kind == "client"))).all()
            for callback in set(map(str, client_info.redirect_uris)):
                if sum(callback in row.data.get("redirect_uris", []) for row in clients) >= storage.MAX_CLIENTS_PER_CALLBACK:
                    await db.commit()
                    raise RegistrationError(error="invalid_client_metadata", error_description="Callback registration capacity reached; retry later")
            db.add(MCPOAuth(id=token_hash("client:" + client_info.client_id), kind="client", client_id=client_info.client_id,
                           data=data, expires_at=now + storage.CLIENT_TTL))
            await db.commit()

    async def authorize(self, client, params):
        from .config import SCOPES
        if params.resource not in (None, self.settings.resource):
            raise AuthorizeError(error="invalid_target", error_description="Wrong MCP resource")
        if not set(params.scopes or []).issubset(SCOPES):
            raise AuthorizeError(error="invalid_scope", error_description="Unknown scope")
        # Exact URI match also for loopback; SDK's optional-port matching is not used here.
        if str(params.redirect_uri) not in set(map(str, client.redirect_uris)):
            raise AuthorizeError(error="invalid_request", error_description="Exact callback URI required")
        ident = secrets.token_hex(24)
        data = params.model_dump(mode="json")
        data["resource"] = self.settings.resource
        data["scopes"] = params.scopes if params.scopes is not None else [
            scope for scope in ("blog:read", "images:read") if scope in (client.scope or "").split()]
        if not data["scopes"]:
            raise AuthorizeError(error="invalid_scope", error_description="Request an explicitly registered scope")
        if not storage.bounded_payload(data):
            raise AuthorizeError(error="invalid_request", error_description="Consent parameters exceed the storage limit")
        async with database.AsyncSessionLocal() as db:
            await storage.lock_storage(db)
            now = int(time.time())
            await storage.prune_storage(db, now)
            current = await self.client_in_session(db, client.client_id)
            if not current:
                await db.commit()
                raise AuthorizeError(error="invalid_request", error_description="Client registration expired")
            # The SDK may have loaded metadata before a concurrent admin edit.
            if str(params.redirect_uri) not in set(map(str, current.redirect_uris)):
                raise AuthorizeError(error="invalid_request", error_description="Client callback changed; restart authorization")
            if not set(data["scopes"]).issubset((current.scope or "").split()):
                raise AuthorizeError(error="invalid_scope", error_description="Scope exceeds client registration")
            count = await db.scalar(select(func.count()).select_from(MCPOAuth).where(MCPOAuth.kind == "consent"))
            own = await db.scalar(select(func.count()).select_from(MCPOAuth).where(
                MCPOAuth.kind == "consent", MCPOAuth.client_id == client.client_id))
            if count >= storage.MAX_CONSENTS or own >= storage.MAX_CONSENTS_PER_CLIENT:
                await db.commit()
                raise AuthorizeError(error="temporarily_unavailable", error_description="Consent capacity reached; retry after expiry")
            db.add(MCPOAuth(id=ident, kind="consent", client_id=client.client_id, data=data,
                           expires_at=now + 600))
            await db.commit()
        return self.settings.origin + "/api/mcp/oauth/consent/" + ident

    async def load_authorization_code(self, client, authorization_code):
        async with database.AsyncSessionLocal() as db:
            row = await db.get(MCPOAuth, token_hash(authorization_code))
            if row and row.kind == "code" and row.client_id == client.client_id:
                return AuthorizationCode(code=authorization_code, client_id=row.client_id,
                                         expires_at=row.expires_at, **row.data)
        return None

    async def issue(self, db, client, scopes, grant_id):
        client_id = client.client_id
        access = secrets.token_urlsafe(48)
        refresh = secrets.token_urlsafe(48) if "refresh_token" in client.grant_types else None
        now = int(time.time())
        grant = await active_grant(db, grant_id)
        if not grant:
            raise TokenError(error="invalid_grant", error_description="Grant revoked or expired")
        data = {"scopes": scopes, "resource": self.settings.resource, "subject": "admin"}
        for token, kind, expiry in ((access, "access", now + 900), (refresh, "refresh", min(now + 86400 * 7, grant.expires_at))):
            if token is None:
                continue
            db.add(MCPOAuth(id=token_hash(token), kind=kind, client_id=client_id, grant_id=grant_id,
                           data=data, expires_at=expiry))
        return OAuthToken(access_token=access, refresh_token=refresh, expires_in=900, scope=" ".join(scopes))

    async def exchange(self, client, raw, kind, scopes):
        from .service import audit
        async with database.AsyncSessionLocal() as db:
            row = await db.get(MCPOAuth, token_hash(raw))
            if row is None or row.kind != kind or row.client_id != client.client_id or row.expires_at <= time.time():
                raise TokenError(error="invalid_grant", error_description="Invalid or expired credential")
            grant = await active_grant(db, row.grant_id, lock=True)
            if not grant:
                raise TokenError(error="invalid_grant", error_description="Grant revoked")
            won = await db.execute(update(MCPOAuth).where(MCPOAuth.id == row.id, MCPOAuth.consumed.is_(False))
                                   .values(consumed=True).execution_options(synchronize_session=False))
            if won.rowcount != 1:
                grant.consumed = True
                audit(db, "oauth", "credential_replay_revoked", client_id=client.client_id, grant_id=grant.id)
                await db.commit()
                raise TokenError(error="invalid_grant", error_description="Credential replay; connection revoked")
            if not set(scopes).issubset(row.data["scopes"]):
                raise TokenError(error="invalid_scope", error_description="Scope escalation denied")
            result = await self.issue(db, client, scopes, row.grant_id)
            audit(db, "oauth", "token_issued", client_id=client.client_id, grant_id=grant.id, grant_type=kind)
            await db.commit()
            return result

    async def exchange_authorization_code(self, client, authorization_code):
        return await self.exchange(client, authorization_code.code, "code", authorization_code.scopes)

    async def load_refresh_token(self, client, refresh_token):
        async with database.AsyncSessionLocal() as db:
            row = await db.get(MCPOAuth, token_hash(refresh_token))
            if row and row.kind == "refresh" and row.client_id == client.client_id:
                return RefreshToken(token=refresh_token, client_id=row.client_id, expires_at=row.expires_at, **row.data)
        return None

    async def exchange_refresh_token(self, client, refresh_token, scopes):
        return await self.exchange(client, refresh_token.token, "refresh", scopes)

    async def load_access_token(self, token):
        if len(token) > 256:
            return None
        async with database.AsyncSessionLocal() as db:
            row = await db.get(MCPOAuth, token_hash(token))
            if (row and row.kind == "access" and not row.consumed and row.expires_at > time.time()
                    and await active_grant(db, row.grant_id) and await self.client_in_session(db, row.client_id)):
                return AccessToken(token=token, client_id=row.client_id, expires_at=row.expires_at,
                                   claims={"iss": self.settings.origin, "grant_id": row.grant_id}, **row.data)
        return None

    async def revoke_token(self, token):
        from .service import audit
        async with database.AsyncSessionLocal() as db:
            row = await db.get(MCPOAuth, token_hash(token.token))
            if row:
                await db.execute(update(MCPOAuth).where(MCPOAuth.id == row.grant_id).values(consumed=True))
                audit(db, "oauth", "grant_revoked", client_id=row.client_id, grant_id=row.grant_id)
                await db.commit()
