"""Registration, administrator lifecycle and authorization are separate boundaries."""
import asyncio
import json
from urllib.parse import parse_qs, urlsplit

import pytest
from mcp.server.auth.provider import AuthorizationParams, AuthorizeError
from sqlalchemy import select

from blog_mcp import registry
from blog_mcp.authorization import LocalOAuth
from blog_mcp.config import SCOPES
from models.mcp import MCPOAuth, MCPAudit
from test_mcp import mcp_api, login, oauth, propose, approve, csrf_from
from test_mcp_storage import registration, params


def info(c):
    login(c)
    response = c.get('/api/mcp/admin/clients')
    assert response.status_code == 200, response.text
    return response.json()


def metadata(**changes):
    return {'client_name': 'Manual app', 'redirect_uris': ['https://client.example/callback'],
            'scopes': list(SCOPES), 'token_endpoint_auth_method': 'none', **changes}


def form(c, action='create', ident=None, **overrides):
    page = info(c)
    row = next((x for x in page['clients'] if x['client_id'] == ident), None)
    return {'action': action, 'confirm': action, 'client_id': ident or page['create_id'],
            'csrf': row['csrf'] if row else page['csrf'], 'password': 'test-password',
            'metadata': json.dumps(metadata()), **overrides}


def mutate(c, data):
    return c.post('/api/mcp/admin/clients', data=data)


def test_fresh_provider_reads_db_without_env_and_creation_is_idempotent(mcp_api):
    c = mcp_api
    data = form(c)
    response = mutate(c, data)
    assert response.status_code == 200, response.text
    ident = response.json()['client_id']
    assert response.json()['client_secret'] is None
    assert mutate(c, data).status_code == 409
    client = asyncio.run(LocalOAuth(c.settings).get_client(ident))
    assert client.client_name == 'Manual app'
    assert len(info(c)['clients']) == 2
    # A client ID is not an access token and registration did not create a grant.
    assert c.post('/mcp', headers={'Authorization': 'Bearer '+ident}, json={}).status_code == 401
    async def check():
        async with c.sessions() as db:
            assert not (await db.scalars(select(MCPOAuth).where(MCPOAuth.kind == 'grant'))).all()
    asyncio.run(check())


def test_administration_requires_browser_origin_csrf_password_and_explicit_action(mcp_api):
    c = mcp_api
    assert c.get('/api/mcp/admin/clients').status_code == 401
    data = form(c)
    for change in ({'password': 'bad'}, {'csrf': 'bad'}, {'confirm': 'approved by model'}):
        assert mutate(c, {**data, **change}).status_code in (400, 403)
    assert c.post('/api/mcp/admin/clients', data=data, headers={'Origin': 'https://evil.example'}).status_code == 403
    assert c.post('/api/mcp/admin/clients', data=data, headers={'Authorization': 'Bearer synthetic'}).status_code == 403
    assert c.get('/api/mcp/admin/clients', headers={'Authorization': 'Bearer synthetic'}).status_code == 403
    assert len(info(c)['clients']) == 1


@pytest.mark.parametrize('callback', ['http://evil.example/cb', 'https://user:pass@example.com/cb',
    'https://example.com/cb#fragment', 'https://*.example.com/cb', 'javascript:alert(1)', 'https://example.com/a\\b'])
def test_bad_callbacks_rejected_by_both_paths(mcp_api, callback):
    c = mcp_api
    assert c.post('/register', json=registration(callback)).status_code == 400
    assert mutate(c, form(c, metadata=json.dumps(metadata(redirect_uris=[callback])))).status_code == 400


def test_confidential_secret_encrypted_not_listed_and_rotation_invalidates_tokens(mcp_api):
    c = mcp_api
    response = mutate(c, form(c, metadata=json.dumps(metadata(token_endpoint_auth_method='client_secret_post'))))
    assert response.status_code == 200, response.text
    ident, secret = response.json()['client_id'], response.json()['client_secret']
    assert secret and secret not in c.get('/api/mcp/admin/clients').text
    tokens, _ = oauth(c, client_id=ident, client_secret=secret)
    proposal = propose(c, tokens['access_token'])
    data = form(c, 'rotate', ident)
    rotated = mutate(c, data)
    assert rotated.status_code == 200, rotated.text
    replacement = rotated.json()['client_secret']
    assert replacement and replacement != secret
    assert mutate(c, data).status_code == 403  # exact metadata revision in CSRF
    assert c.post('/mcp', headers={'Authorization': 'Bearer '+tokens['access_token']}, json={}).status_code == 401
    assert approve(c, proposal).status_code == 409
    assert c.post('/token', data={'grant_type': 'refresh_token', 'client_id': ident,
        'client_secret': secret, 'refresh_token': tokens['refresh_token']}).status_code == 401
    oauth(c, client_id=ident, client_secret=replacement)
    async def check():
        async with c.sessions() as db:
            row = await db.get(MCPOAuth, registry.client_key(ident))
            assert '_secret' in row.data and 'client_secret' not in row.data
            dump = json.dumps(row.data)
            events = (await db.scalars(select(MCPAudit))).all()
            audit_dump = json.dumps([e.details for e in events])
            assert secret not in dump + audit_dump and replacement not in dump + audit_dump
    asyncio.run(check())


def test_update_and_delete_revoke_grants_and_pending_consent_without_restart(mcp_api):
    c = mcp_api
    tokens, _ = oauth(c)
    cached = asyncio.run(c.provider.get_client('test-client'))
    pending = c.get('/authorize', params=params(), follow_redirects=False).headers['location']
    edited = metadata(redirect_uris=['https://client.example/new'], scopes=['blog:read'])
    response = mutate(c, form(c, 'update', 'test-client', metadata=json.dumps(edited)))
    assert response.status_code == 200, response.text
    assert c.get(pending).status_code == 410
    assert c.post('/mcp', headers={'Authorization': 'Bearer '+tokens['access_token']}, json={}).status_code == 401
    with pytest.raises(AuthorizeError):
        asyncio.run(c.provider.authorize(cached, AuthorizationParams(state=None,
            redirect_uri='https://client.example/callback', redirect_uri_provided_explicitly=True,
            scopes=['blog:read'], code_challenge='a'*43)))
    # Scope restriction is re-evaluated independently of the SDK's cached object.
    with pytest.raises(AuthorizeError):
        asyncio.run(c.provider.authorize(cached.model_copy(update={'redirect_uris': ['https://client.example/new']}),
            AuthorizationParams(state=None, redirect_uri='https://client.example/new',
                redirect_uri_provided_explicitly=True, scopes=['blog:propose'], code_challenge='a'*43)))
    tokens, _ = oauth(c, ['blog:read'], callback='https://client.example/new')
    assert mutate(c, form(c, 'delete', 'test-client')).status_code == 200
    assert asyncio.run(LocalOAuth(c.settings).get_client('test-client')) is None
    assert c.post('/token', data={'grant_type':'refresh_token', 'client_id':'test-client',
        'refresh_token':tokens['refresh_token']}).status_code == 401


@pytest.mark.parametrize('method', ['none', 'client_secret_post'])
def test_automatic_registration_full_flow_without_preconfigured_callback(mcp_api, method):
    c = mcp_api
    callback = 'https://new-app.example/oauth/callback'
    response = c.post('/register', json=registration(callback, token_endpoint_auth_method=method,
        client_name='<script>alert(1)</script>', scope='blog:read'))
    assert response.status_code == 201, response.text
    client = response.json()
    tokens, _ = oauth(c, ['blog:read'], client_id=client['client_id'], callback=callback,
                     client_secret=client.get('client_secret'))
    assert asyncio.run(c.provider.load_access_token(tokens['access_token'])) is not None
    assert mutate(c, form(c, 'delete', client['client_id'])).status_code == 200
    assert asyncio.run(c.provider.load_access_token(tokens['access_token'])) is None


def test_code_only_client_and_honest_metadata(mcp_api):
    c = mcp_api
    response = c.post('/register', json={'redirect_uris':['https://client.example/callback'],
        'token_endpoint_auth_method':'none', 'scope':'blog:read'})
    assert response.status_code == 201, response.text
    data = response.json()
    assert data['grant_types'] == ['authorization_code']
    tokens, _ = oauth(c, ['blog:read'], client_id=data['client_id'])
    assert not tokens.get('refresh_token')
    meta = c.get('/.well-known/oauth-authorization-server').json()
    assert meta['token_endpoint_auth_methods_supported'] == ['none','client_secret_post']
    assert meta['client_id_metadata_document_supported'] is False


def test_registration_is_untrusted_and_consent_cannot_be_reused(mcp_api):
    c = mcp_api
    data = c.post('/register', json=registration(client_name='<script>alert(1)</script>', scope='blog:read')).json()
    url = c.get('/authorize', params=params(data['client_id'],'https://registered.example/callback'), follow_redirects=False).headers['location']
    login(c)
    page = c.get(url)
    assert '<script>alert(1)</script>' not in page.text
    assert '&lt;script&gt;' in page.text and '검증된 신원' in page.text
    fields={'csrf':csrf_from(page), 'decision':'allow', 'password':'test-password', 'scope':'blog:read'}
    first = c.post(url,data=fields,follow_redirects=False)
    assert first.status_code == 303
    assert c.post(url,data=fields,follow_redirects=False).status_code == 410
    assert 'code' in parse_qs(urlsplit(first.headers['location']).query)


def test_managed_budget_and_registration_metadata_errors(mcp_api, monkeypatch):
    monkeypatch.setattr(registry, 'MAX_MANAGED_CLIENTS', 1)
    c=mcp_api
    assert mutate(c,form(c)).status_code == 409
    assert c.post('/register', content='{', headers={'Content-Type':'application/json'}).status_code == 400
    assert c.post('/register', json=registration(token_endpoint_auth_method='client_secret_basic')).status_code == 400
    assert c.post('/register', json=registration(scope='blog:approve')).status_code == 400


def test_omitted_scope_defaults_only_to_registered_public_read(mcp_api):
    c=mcp_api
    data=c.post('/register',json=registration(scope='blog:read blog:read_private')).json()
    query=params(data['client_id'],'https://registered.example/callback')
    del query['scope']
    response=c.get('/authorize',params=query,follow_redirects=False)
    assert response.status_code == 302
    login(c)
    page=c.get(response.headers['location'])
    assert page.status_code == 200
    assert 'value="blog:read"' in page.text
    assert 'value="images:read"' not in page.text
    assert 'value="blog:read_private"' not in page.text


def test_automatic_registration_capabilities_do_not_grant_permissions(mcp_api):
    c=mcp_api
    data=c.post('/register',json=registration()).json()
    assert set(data['scope'].split()) == set(SCOPES)
    query=params(data['client_id'],'https://registered.example/callback')
    del query['scope']
    response=c.get('/authorize',params=query,follow_redirects=False)
    login(c)
    page=c.get(response.headers['location'])
    assert page.status_code == 200
    assert 'value="blog:propose"' not in page.text
    assert 'value="blog:read_private"' not in page.text
    # An explicit request reaches human consent; private/write boxes stay unchecked.
    query['scope']=' '.join(SCOPES)
    url=c.get('/authorize',params=query,follow_redirects=False).headers['location']
    page=c.get(url)
    assert 'value="blog:propose"' in page.text
    assert 'value="blog:propose" checked' not in page.text
    assert asyncio.run(c.provider.load_access_token(data['client_id'])) is None
