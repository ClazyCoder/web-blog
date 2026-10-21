"""OAuth 2.1 code/PKCE provider using the official SDK endpoint validators.

Single-admin resource server, opaque access tokens, rotating refresh tokens,
one-use authorization codes, durable grants and immediate local revocation.
"""
import hashlib
import secrets
import time

from mcp.server.auth.provider import AuthorizationCode, RefreshToken, AccessToken, TokenError, AuthorizeError, RegistrationError
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy import select, update, func

from db import session as database
from models.mcp import MCPOAuth
from . import storage


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


async def active_grant(db, ident, *, lock=False):
    stmt = select(MCPOAuth).where(MCPOAuth.id == ident, MCPOAuth.kind == "grant")
    row = await db.scalar(stmt.with_for_update() if lock else stmt)
    return row if row and not row.consumed and row.expires_at > time.time() else None


class LocalOAuth:
    def __init__(self, settings):
        self.settings = settings
        self.clients = {}
        for value in settings.client_metadata:
            client = OAuthClientInformationFull.model_validate({
                "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"], "scope": "blog:read images:read", **value})
            if not client.redirect_uris or client.client_id in self.clients:
                raise RuntimeError("OAuth clients require unique IDs and callback URLs")
            if client.token_endpoint_auth_method != "none" and not client.client_secret:
                raise RuntimeError("Confidential OAuth clients require client_secret")
            self.clients[client.client_id] = client

    async def get_client(self, client_id):
        async with database.AsyncSessionLocal() as db:
            return await self.client_in_session(db, client_id)

    async def client_in_session(self, db, client_id, *, allow_pending=False):
        if client_id in self.clients:
            return self.clients[client_id]
        row = await db.get(MCPOAuth, token_hash("client:" + client_id))
        if row and row.kind == "client" and not row.consumed:
            now = int(time.time())
            if row.expires_at <= now and not await db.scalar(select(storage.live_dependencies(
                    client_id, now, include_consent=allow_pending))):
                return None
            client = OAuthClientInformationFull.model_validate(row.data)
            if set(map(str, client.redirect_uris)).issubset(self.settings.registration_redirects):
                return client
        return None

    async def register_client(self, client_info):
        if (client_info.token_endpoint_auth_method != "none" or not client_info.redirect_uris
                or not set(map(str, client_info.redirect_uris)).issubset(self.settings.registration_redirects)):
            raise RegistrationError(error="invalid_client_metadata", error_description="Only pre-allowlisted exact callback URLs and public PKCE clients may register")
        data = client_info.model_dump(mode="json")
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
        data["scopes"] = params.scopes or ["blog:read", "images:read"]
        if not storage.bounded_payload(data):
            raise AuthorizeError(error="invalid_request", error_description="Consent parameters exceed the storage limit")
        async with database.AsyncSessionLocal() as db:
            await storage.lock_storage(db)
            now = int(time.time())
            await storage.prune_storage(db, now)
            if not await self.client_in_session(db, client.client_id):
                await db.commit()
                raise AuthorizeError(error="invalid_request", error_description="Client registration expired")
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

    async def issue(self, db, client_id, scopes, grant_id):
        access, refresh = secrets.token_urlsafe(48), secrets.token_urlsafe(48)
        now = int(time.time())
        grant = await active_grant(db, grant_id)
        if not grant:
            raise TokenError(error="invalid_grant", error_description="Grant revoked or expired")
        data = {"scopes": scopes, "resource": self.settings.resource, "subject": "admin"}
        for token, kind, expiry in ((access, "access", now + 900), (refresh, "refresh", min(now + 86400 * 7, grant.expires_at))):
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
            result = await self.issue(db, client.client_id, scopes, row.grant_id)
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
