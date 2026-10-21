"""OAuth persistence limits through HTTP and the shared database boundary."""
import asyncio
import time
from dataclasses import replace
from urllib.parse import parse_qs, urlsplit

import pytest
from mcp.server.auth.provider import AuthorizationParams, AuthorizeError, RegistrationError
from mcp.shared.auth import OAuthClientInformationFull
from sqlalchemy import select, update

from blog_mcp import storage
from blog_mcp.authorization import token_hash
from models.mcp import MCPOAuth
from test_mcp import mcp_api, login, csrf_from


def params(client_id="test-client", callback="https://client.example/callback", **extra):
    return {"client_id": client_id, "redirect_uri": callback, "response_type": "code",
            "code_challenge": "a" * 43, "code_challenge_method": "S256",
            "scope": "blog:read", "state": "state", **extra}


def registration(callback="https://registered.example/callback", **extra):
    return {"redirect_uris": [callback], "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"], **extra}


def error(response):
    assert response.status_code == 302
    return parse_qs(urlsplit(response.headers["location"]).query).get("error")


async def rows(c, kind):
    async with c.sessions() as db:
        return list((await db.scalars(select(MCPOAuth).where(MCPOAuth.kind == kind))).all())


def test_consent_capacity_and_expiry_reclamation(mcp_api):
    c = mcp_api
    for _ in range(storage.MAX_CONSENTS_PER_CLIENT):
        assert error(c.get("/authorize", params=params(), follow_redirects=False)) is None
    assert error(c.post("/authorize", data=params(), follow_redirects=False)) == ["temporarily_unavailable"]
    assert len(asyncio.run(rows(c, "consent"))) == storage.MAX_CONSENTS_PER_CLIENT
    async def expire():
        async with c.sessions() as db:
            await db.execute(update(MCPOAuth).where(MCPOAuth.kind == "consent").values(expires_at=int(time.time())-1))
            await db.commit()
    asyncio.run(expire())
    assert error(c.get("/authorize", params=params(), follow_redirects=False)) is None
    assert len(asyncio.run(rows(c, "consent"))) == 1


@pytest.mark.parametrize("method,state", [("get", "s" * 7000), ("post", "한" * 1400)])
def test_oversized_consent_is_not_persisted(mcp_api, method, state):
    c = mcp_api
    response = (c.get("/authorize", params=params(state=state), follow_redirects=False) if method == "get"
                else c.post("/authorize", data=params(state=state), follow_redirects=False))
    assert error(response) == ["invalid_request"]
    assert not asyncio.run(rows(c, "consent"))


def test_registration_capacity_metadata_and_reclamation(mcp_api):
    c = mcp_api
    for large in ("n" * 12000, "한" * 1400):
        assert c.post("/register", json=registration(client_name=large)).status_code == 400
    assert not asyncio.run(rows(c, "client"))
    for _ in range(storage.MAX_CLIENTS_PER_CALLBACK):
        assert c.post("/register", json=registration()).status_code == 201
    assert c.post("/register", json=registration()).status_code == 400
    assert len(asyncio.run(rows(c, "client"))) == storage.MAX_CLIENTS_PER_CALLBACK
    async def expire():
        async with c.sessions() as db:
            await db.execute(update(MCPOAuth).where(MCPOAuth.kind == "client").values(expires_at=int(time.time())-1))
            await db.commit()
    asyncio.run(expire())
    asyncio.run(storage.cleanup())
    assert not asyncio.run(rows(c, "client"))
    assert c.post("/register", json=registration()).status_code == 201


def test_every_callback_and_global_registration_budget(mcp_api, monkeypatch):
    c = mcp_api
    a, b = "https://registered.example/callback", "https://second.example/callback"
    c.provider.settings = replace(c.provider.settings, registration_redirects=(a, b))
    monkeypatch.setattr(storage, "MAX_CLIENTS_PER_CALLBACK", 1)
    assert c.post("/register", json=registration(a)).status_code == 201
    assert c.post("/register", json=registration(redirect_uris=[b, a])).status_code == 400
    monkeypatch.setattr(storage, "MAX_CLIENTS", 1)
    assert c.post("/register", json=registration(b)).status_code == 400
    assert len(asyncio.run(rows(c, "client"))) == 1


def test_expired_registration_preserves_pending_consent_and_active_grant(mcp_api):
    import base64
    import hashlib
    c = mcp_api
    callback = "https://registered.example/callback"
    client_id = c.post("/register", json=registration()).json()["client_id"]
    cached_client = asyncio.run(c.provider.get_client(client_id))
    verifier = "v" * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    url = c.get("/authorize", params=params(client_id, callback, code_challenge=challenge), follow_redirects=False).headers["location"]
    async def expire():
        async with c.sessions() as db:
            await db.execute(update(MCPOAuth).where(MCPOAuth.id == token_hash("client:" + client_id)).values(expires_at=int(time.time())-1))
            await db.commit()
    asyncio.run(expire())
    asyncio.run(storage.cleanup())
    with pytest.raises(AuthorizeError):
        asyncio.run(c.provider.authorize(cached_client, AuthorizationParams(state=None,
            redirect_uri=callback, redirect_uri_provided_explicitly=True,
            scopes=["blog:read"], code_challenge=challenge)))
    assert len(asyncio.run(rows(c, "client"))) == 1
    # An existing consent may finish, but cannot keep renewing anonymous consent.
    assert c.get("/authorize", params=params(client_id, callback), follow_redirects=False).status_code == 400
    login(c)
    csrf = csrf_from(c.get(url))
    response = c.post(url, data={"csrf": csrf, "decision": "allow", "password": "test-password", "scope": "blog:read"}, follow_redirects=False)
    code = parse_qs(urlsplit(response.headers["location"]).query)["code"][0]
    asyncio.run(storage.cleanup())
    assert not asyncio.run(rows(c, "consent"))
    tokens = c.post("/token", data={"grant_type": "authorization_code", "client_id": client_id,
                    "code": code, "code_verifier": verifier, "redirect_uri": callback}).json()
    assert "access_token" in tokens
    rotated = c.post("/token", data={"grant_type": "refresh_token", "client_id": client_id,
                                     "refresh_token": tokens["refresh_token"]})
    assert rotated.status_code == 200
    assert asyncio.run(c.provider.load_access_token(rotated.json()["access_token"])) is not None
    assert c.post("/revoke", data={"client_id": client_id, "token": rotated.json()["access_token"]}).status_code == 200
    asyncio.run(storage.cleanup())
    assert not asyncio.run(rows(c, "client"))
    assert asyncio.run(c.provider.load_access_token(rotated.json()["access_token"])) is None
    # Cleanup must retain code/token replay markers and grants.
    assert asyncio.run(rows(c, "code")) and asyncio.run(rows(c, "refresh")) and asyncio.run(rows(c, "grant"))


async def exercise_concurrent_budgets(provider, sessions):
    """Same check on SQLite and PostgreSQL; independent provider transactions."""
    client = await provider.get_client("test-client")
    auth_params = AuthorizationParams(state=None, redirect_uri="https://client.example/callback",
        redirect_uri_provided_explicitly=True, scopes=["blog:read"], code_challenge="a" * 43)
    async def consent():
        try:
            await provider.authorize(client, auth_params)
            return True
        except AuthorizeError:
            return False
    assert sum(await asyncio.gather(*(consent() for _ in range(12)))) == 3
    async def register(index):
        metadata = OAuthClientInformationFull(client_id=f"concurrent-{index}", **registration())
        try:
            await provider.register_client(metadata)
            return True
        except RegistrationError:
            return False
    assert sum(await asyncio.gather(*(register(i) for i in range(12)))) == 3
    async with sessions() as db:
        assert len((await db.scalars(select(MCPOAuth).where(MCPOAuth.kind == "consent"))).all()) == 3
        assert len((await db.scalars(select(MCPOAuth).where(MCPOAuth.kind == "client"))).all()) == 3


def test_sqlite_concurrent_global_budgets(mcp_api, monkeypatch):
    monkeypatch.setattr(storage, "MAX_CONSENTS", 3)
    monkeypatch.setattr(storage, "MAX_CLIENTS", 3)
    asyncio.run(exercise_concurrent_budgets(mcp_api.provider, mcp_api.sessions))


def test_legacy_client_grace_and_idle_maintenance(mcp_api, monkeypatch):
    c = mcp_api
    async def check():
        async with c.sessions() as db:
            db.add(MCPOAuth(id="legacy", client_id="legacy", kind="client", data={}, expires_at=2147483647))
            db.add(MCPOAuth(id="expired-consent", client_id="legacy", kind="consent", data={}, expires_at=1))
            await db.commit()
        now = int(time.time())
        await storage.cleanup()
        async with c.sessions() as db:
            assert now + storage.CLIENT_TTL <= (await db.get(MCPOAuth, "legacy")).expires_at <= int(time.time()) + storage.CLIENT_TTL
            assert await db.get(MCPOAuth, "expired-consent") is None
        monkeypatch.setattr(storage, "CLEANUP_INTERVAL", 0.01)
        async with storage.maintenance():
            async with c.sessions() as db:
                await db.execute(update(MCPOAuth).where(MCPOAuth.id == "legacy").values(expires_at=1))
                await db.commit()
            for _ in range(100):
                await asyncio.sleep(0.01)
                async with c.sessions() as db:
                    if await db.get(MCPOAuth, "legacy") is None:
                        break
            else:
                pytest.fail("Idle maintenance did not reclaim the expired registration")
    asyncio.run(check())
