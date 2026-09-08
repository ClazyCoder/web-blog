import asyncio
from datetime import timedelta
from io import BytesIO

import pytest
from fastapi import HTTPException
from jose import jwt
from PIL import Image
from starlette.requests import Request

import auth
from db import redis as store
from rate_limit import get_client_ip


@pytest.mark.parametrize("path", ["/api/posts", "/api/posts?search=body",
                                "/api/posts?status=draft", "/api/posts/tags"])
def test_anonymous_lists_exclude_private_content(api, path):
    response = api.get(path)
    assert response.status_code == 200
    for ident in (2, 3, 4):
        assert f"private-title-{ident}" not in response.text
        assert f"tag-{ident}" not in response.text
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("ident", [1, 2, 3, 4])
@pytest.mark.parametrize("path", ["/api/posts/{id}", "/api/posts/slug/post-{id}", "/og/board/{id}"])
def test_public_detail_and_og_visibility(api, ident, path):
    response = api.get(path.format(id=ident), headers={"User-Agent": "Twitterbot"})
    assert response.status_code == (200 if ident == 1 else 404)
    if ident != 1:
        assert f"private-title-{ident}" not in response.text
        assert f"body-{ident}" not in response.text
    if not path.startswith("/og"):
        assert api.get(path.format(id=ident), headers=api.admin_headers).status_code == (
            404 if ident == 4 else 200)
    else:
        assert api.get(path.format(id=ident), headers=api.admin_headers).status_code == (
            200 if ident == 1 else 404)


@pytest.mark.parametrize("ident", [1, 2, 3, 4, 5, 6, 7])
@pytest.mark.parametrize("path", ["/uploads/images/{id}.png", "/api/upload/temp/{id}.png"])
def test_image_visibility_and_metadata(api, ident, path):
    response = api.get(path.format(id=ident))
    assert response.status_code == (200 if ident == 1 else 404)
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert api.get(path.format(id=ident), headers=api.admin_headers).status_code == (
        200 if ident < 6 else 404)


def test_visibility_change_takes_effect_immediately(api):
    assert api.get("/api/posts/1").status_code == 200
    assert api.get("/uploads/images/1.png").status_code == 200
    result = api.put("/api/posts/1", json={"is_secret": True}, headers=api.admin_headers)
    assert result.status_code == 200
    for path in ("/api/posts/1", "/api/posts/slug/post-1", "/og/board/1", "/uploads/images/1.png"):
        assert api.get(path).status_code == 404
    assert api.head("/uploads/images/1.png").status_code == 404
    assert api.head("/uploads/images/1.png", headers=api.admin_headers).status_code == 200


def test_view_checks_visibility_before_redis(api):
    for ident in (2, 3, 4, 999):
        assert api.post(f"/api/posts/{ident}/view").status_code == 404
    assert not api.store.values
    assert api.post("/api/posts/1/view").status_code == 204
    assert api.post("/api/posts/1/view").status_code == 204
    assert api.get("/api/posts/1").json()["view_count"] == 1


def test_image_cannot_be_reassigned(api):
    response = api.put("/api/posts/2", headers=api.admin_headers,
                       json={"content": "![stolen](/uploads/images/1.png)"})
    assert response.status_code == 409
    assert api.get("/api/upload/temp/1.png").json()["post_id"] == 1


def test_html_image_linking_and_external_urls(api):
    from routers.post import extract_image_urls, extract_storage_keys_from_urls
    content = '<img src="/uploads/images/5.png">'
    assert extract_storage_keys_from_urls(extract_image_urls(content)) == ["images/5.png"]
    assert extract_storage_keys_from_urls(["https://evil.example/uploads/images/5.png"]) == []
    assert api.put("/api/posts/1", headers=api.admin_headers,
                   json={"content": content}).status_code == 200
    assert api.get("/uploads/images/5.png").status_code == 200
    assert api.put("/api/posts/2", headers=api.admin_headers,
                   json={"content": content}).status_code == 409


def test_forged_host_cannot_skip_login_origin_check(api):
    del api.headers["Origin"]
    response = api.post("/api/auth/login", headers={"Host": "evil.example/ignored#"},
                        json={"username": "admin", "password": "test-password"})
    assert response.status_code in (400, 403)


def test_refresh_cannot_authenticate_as_access(api):
    token = auth.create_refresh_token({"sub": "admin"})
    assert api.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    api.cookies.set("access_token", token)
    assert api.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("claim,value", [
    ("sub", "other"), ("sub", None), ("jti", None), ("jti", ""),
    ("exp", None), ("exp", "tomorrow"), ("type", None), ("type", "refresh"),
])
def test_invalid_claims_rejected(api, claim, value):
    claims = auth.decode_access_token(auth.create_access_token({"sub": "admin"}))
    if value is None:
        claims.pop(claim)
    else:
        claims[claim] = value
    token = jwt.encode(claims, auth.SECRET_KEY, algorithm=auth.ALGORITHM)
    assert api.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_refresh_replay_and_expiry(api):
    token = auth.create_refresh_token({"sub": "admin"})
    api.cookies.set("refresh_token", token, path="/api/auth")
    assert api.post("/api/auth/refresh").status_code == 200
    api.cookies.clear()
    api.cookies.set("refresh_token", token, path="/api/auth")
    assert api.post("/api/auth/refresh").status_code == 401
    expired = auth.create_access_token({"sub": "admin"}, timedelta(seconds=-1))
    assert api.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_atomic_refresh_consumption(api):
    async def consume():
        return await asyncio.gather(*(store.consume_refresh_token("same-jti", 60) for _ in range(10)))
    assert asyncio.run(consume()).count(True) == 1


def test_logout_revokes_both_tokens(api):
    access = auth.create_access_token({"sub": "admin"})
    refresh = auth.create_refresh_token({"sub": "admin"})
    api.cookies.set("access_token", access)
    api.cookies.set("refresh_token", refresh, path="/api/auth")
    assert api.post("/api/auth/logout").status_code == 200
    api.cookies.clear()
    assert api.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"}).status_code == 401
    api.cookies.set("refresh_token", refresh, path="/api/auth")
    assert api.post("/api/auth/refresh").status_code == 401


def test_redis_failure_does_not_downgrade_authentication(api):
    api.store.fail = True
    assert api.get("/api/posts", headers=api.admin_headers).status_code == 503
    assert api.get("/api/auth/me", headers=api.admin_headers).status_code == 503
    assert api.post("/api/auth/login", json={"username": "admin", "password": "test-password"}).status_code == 503
    api.cookies.set("access_token", auth.create_access_token({"sub": "admin"}))
    response = api.post("/api/auth/logout")
    assert response.status_code == 503
    assert len(response.headers.get_list("set-cookie")) == 2
    assert all("Max-Age=0" in value for value in response.headers.get_list("set-cookie"))


@pytest.mark.parametrize("origin", ["https://evil.example", "https://testserver.evil.example", "null", ""])
def test_login_origin_rejected(api, origin):
    api.headers["Origin"] = origin
    response = api.post("/api/auth/login", json={"username": "admin", "password": "test-password"})
    assert response.status_code == 403


def test_origin_referer_and_bearer_rules(api):
    del api.headers["Origin"]
    assert api.post("/api/auth/logout").status_code == 403
    assert api.post("/api/auth/logout", headers={"Referer": "https://testserver/editor"}).status_code == 200
    # Invalid Origin cannot fall back to an allowed Referer.
    assert api.post("/api/auth/logout", headers={"Origin": "null", "Referer": "https://testserver/"}).status_code == 403
    assert api.put("/api/posts/1", headers=api.admin_headers, json={"title": "updated"}).status_code == 200
    api.cookies.set("access_token", auth.create_access_token({"sub": "admin"}))
    assert api.put("/api/posts/1", json={"title": "forged"}).status_code == 403


def test_rate_limits_cover_login_and_undecorated_routes(api):
    responses = [api.post("/api/auth/login", json={"username": "admin", "password": "wrong"}) for _ in range(6)]
    assert [r.status_code for r in responses] == [401] * 5 + [429]
    responses = [api.get("/api/posts/tags") for _ in range(61)]
    assert responses[-1].status_code == 429


def test_password_byte_limit(api):
    response = api.post("/api/auth/login", json={"username": "admin", "password": "가" * 25})
    assert response.status_code == 422
    with pytest.raises(ValueError):
        auth.get_password_hash("가" * 25)


def test_proxy_headers_need_trusted_peer(monkeypatch):
    import rate_limit
    request = Request({"type": "http", "client": ("192.0.2.10", 1234),
                       "headers": [(b"x-real-ip", b"198.51.100.7")]})
    assert get_client_ip(request) == "192.0.2.10"
    monkeypatch.setenv("TRUSTED_PROXY_HOST", "client")
    monkeypatch.setattr(rate_limit.socket, "getaddrinfo", lambda *args: [(None, None, None, None, ("192.0.2.10", 0))])
    assert get_client_ip(request) == "198.51.100.7"


@pytest.mark.parametrize("fmt,ext", [("JPEG", "jpg"), ("PNG", "png"), ("GIF", "gif"), ("WEBP", "webp")])
def test_valid_image_upload_and_invalid_content(api, fmt, ext):
    content = BytesIO()
    Image.new("RGB", (32, 32)).save(content, format=fmt)
    response = api.post("/api/upload/image", headers=api.admin_headers,
                        files={"file": (f"test.{ext}", content.getvalue(), f"image/{ext}")})
    assert response.status_code == 200, response.text
    url = response.json()["url"]
    assert api.get(url).status_code == 404
    assert api.get(url, headers=api.admin_headers).status_code == 200
    response = api.post("/api/upload/image", headers=api.admin_headers,
                        files={"file": (f"fake.{ext}", b"<script>alert(1)</script>", f"image/{ext}")})
    assert response.status_code == 400
