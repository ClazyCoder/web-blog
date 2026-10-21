"""Small SDK adapters for accurate registration and capability discovery.

SDK 1.30's registration handler requires refresh_token even for code-only
clients, and its metadata advertises Basic but omits public PKCE. Keep SDK
request models, authorization, token/PKCE validation and transport unchanged.
"""
import secrets
import time
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse
from mcp.shared.auth import OAuthClientMetadata, OAuthClientInformationFull
from mcp.server.auth.provider import RegistrationError
from .config import SCOPES
from .registry import AUTH_METHODS, validate_redirects


def install_discovery(app, settings, provider):
    @app.get("/.well-known/oauth-authorization-server")
    async def authorization_metadata():
        return {"issuer": settings.issuer, "authorization_endpoint": settings.origin + "/authorize",
                "token_endpoint": settings.origin + "/token", "registration_endpoint": settings.origin + "/register",
                "revocation_endpoint": settings.origin + "/revoke", "response_types_supported": ["code"],
                "grant_types_supported": ["authorization_code", "refresh_token"],
                "token_endpoint_auth_methods_supported": list(AUTH_METHODS),
                "revocation_endpoint_auth_methods_supported": list(AUTH_METHODS),
                "code_challenge_methods_supported": ["S256"], "scopes_supported": list(SCOPES),
                "client_id_metadata_document_supported": False}

    @app.post("/register")
    async def register(request: Request):
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return JSONResponse({"error": "invalid_client_metadata"}, status_code=415)
        try:
            raw = await request.json()
            if not isinstance(raw, dict):
                raise ValueError("Object required")
            validate_redirects(raw.get("redirect_uris"))
            # RFC 7591 defaults to code-only; the SDK defaults to refresh too.
            metadata = OAuthClientMetadata.model_validate({"grant_types": ["authorization_code"], **raw})
            method = metadata.token_endpoint_auth_method or "client_secret_post"
            client = OAuthClientInformationFull(**{**metadata.model_dump(),
                "token_endpoint_auth_method": method, "scope": metadata.scope if metadata.scope is not None else " ".join(SCOPES)},
                client_id=str(uuid.uuid4()), client_id_issued_at=int(time.time()),
                client_secret=secrets.token_urlsafe(48) if method != "none" else None)
            await provider.register_client(client)
        except (ValueError, RegistrationError):
            # Never echo raw request fields, secret-like values, or validator input.
            return JSONResponse({"error": "invalid_client_metadata",
                "error_description": "Invalid metadata or registration capacity reached"}, status_code=400)
        return JSONResponse(client.model_dump(mode="json", exclude_none=True), status_code=201)
