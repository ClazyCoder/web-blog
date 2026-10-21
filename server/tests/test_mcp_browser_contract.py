"""HTTP contracts backing native browser consent and administrator navigation."""
import asyncio
import base64
import hashlib
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import update

from blog_mcp.management import consent_response
from models.mcp import MCPOAuth
from rate_limit import limiter
from test_mcp import mcp_api, login, csrf_from, oauth, propose
from test_mcp_storage import params, registration


@pytest.mark.parametrize('callback', [
    'https://client.example/callback?next=https://evil.example/;script-src',
    'http://127.0.0.1:48001/callback',
])
@pytest.mark.parametrize('decision', ['allow', 'deny'])
def test_consent_only_allows_registered_callback_origin(mcp_api, callback, decision):
    c = mcp_api
    ident = c.post('/register', json=registration(callback)).json()['client_id']
    url = c.get('/authorize', params=params(ident, callback), follow_redirects=False).headers['location']
    login(c)
    page = c.get(url)
    parts = urlsplit(callback)
    expected = f"form-action 'self' {parts.scheme}://{parts.netloc}"
    assert expected in page.headers['content-security-policy'].split('; ')
    assert 'evil.example' not in page.headers['content-security-policy']
    assert "default-src 'none'" in page.headers['content-security-policy']
    assert page.headers['referrer-policy'] == 'same-origin'
    fields = {'csrf': csrf_from(page), 'decision': decision, 'password': 'test-password', 'scope': 'blog:read'}
    # Preserve exact-origin enforcement, including opaque/sandbox origins.
    assert c.post(url, data=fields, headers={'Origin': 'null'}).status_code == 403
    assert c.post(url, data=fields, headers={'Origin': 'https://evil.example'}).status_code == 403
    result = c.post(url, data=fields, follow_redirects=False)
    assert result.status_code == 303
    assert expected in result.headers['content-security-policy'].split('; ')
    assert result.headers['referrer-policy'] == 'no-referrer'
    assert result.headers['location'].startswith(callback + ('&' if '?' in callback else '?'))
    query = parse_qs(urlsplit(result.headers['location']).query)
    assert query['state'] == ['state']
    assert ('code' in query) == (decision == 'allow')
    if decision == 'deny':
        assert query['error'] == ['access_denied']
        assert c.get('/api/mcp/admin').json()['connections'] == []
    assert c.post(url, data=fields, follow_redirects=False).status_code == 410


@pytest.mark.parametrize('callback', ['https://evil;default-src.example/cb', 'https://evil,other.example/cb'])
def test_callback_host_cannot_inject_csp(callback):
    with pytest.raises(HTTPException):
        consent_response(HTMLResponse(''), callback)


def test_destructive_review_keeps_same_origin_form_policy(mcp_api):
    c = mcp_api
    token, _ = oauth(c)
    proposal = propose(c, token['access_token'])
    login(c)
    page = c.get(proposal['review_url'])
    assert page.status_code == 200
    assert "form-action 'self'" in page.headers['content-security-policy'].split('; ')
    assert 'client.example' not in page.headers['content-security-policy']
    assert page.headers['referrer-policy'] == 'same-origin'


def test_admin_does_not_report_consent_as_token_issuance(mcp_api):
    c = mcp_api
    verifier = 'v' * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    query = params(code_challenge=challenge)
    url = c.get('/authorize', params=query, follow_redirects=False).headers['location']
    login(c)
    response = c.post(url, data={'csrf': csrf_from(c.get(url)), 'decision': 'allow',
        'scope': 'blog:read', 'password': 'test-password'}, follow_redirects=False)
    assert c.get('/api/mcp/admin').json()['connections'][0]['status'] == 'awaiting_exchange'
    code = parse_qs(urlsplit(response.headers['location']).query)['code'][0]
    form = {'client_id': 'test-client', 'grant_type': 'authorization_code', 'code': code,
        'code_verifier': verifier, 'redirect_uri': query['redirect_uri']}
    assert c.post('/token', data={**form, 'code_verifier': 'wrong' * 12}).status_code == 400
    assert c.get('/api/mcp/admin').json()['connections'][0]['status'] == 'awaiting_exchange'
    assert c.post('/token', data=form).status_code == 200
    assert c.get('/api/mcp/admin').json()['connections'][0]['status'] == 'token_issued'
    async def expire():
        async with c.sessions() as db:
            await db.execute(update(MCPOAuth).where(MCPOAuth.kind.in_(['code', 'access', 'refresh'])).values(expires_at=1))
            await db.commit()
    asyncio.run(expire())
    assert c.get('/api/mcp/admin').json()['connections'][0]['status'] == 'incomplete'


def test_admin_reads_are_not_throttled_but_still_require_login(mcp_api, monkeypatch):
    c = mcp_api
    monkeypatch.setattr(limiter, 'enabled', True)
    urls = ['/api/mcp/admin', '/api/mcp/admin/clients', '/api/upload/admin/orphans', '/api/upload/admin/orphans/list']
    for url in urls:
        assert c.get(url).status_code == 401
    login(c)
    for _ in range(65):
        for url in urls:
            assert c.get(url).status_code == 200
