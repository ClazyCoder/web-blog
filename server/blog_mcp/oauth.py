"""Pinned external OAuth issuer. Blog cookies/JWTs are never MCP credentials."""
import asyncio
import hashlib
import logging
import time

import httpx
import jwt
from mcp.server.auth.provider import AccessToken
from .config import SCOPES, Settings

logger = logging.getLogger("blog.mcp.auth")


class OAuthVerifier:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._keys = []
        self._expires = 0
        self._lock = asyncio.Lock()

    async def keys(self):
        async with self._lock:
            if time.time() >= self._expires:
                # Never follow jku/x5u from tokens, redirects, or ambient proxy settings.
                async with httpx.AsyncClient(timeout=5, follow_redirects=False, trust_env=False) as client:
                    async with client.stream("GET", self.settings.jwks_url) as response:
                        response.raise_for_status()
                        body = bytearray()
                        async for part in response.aiter_bytes():
                            body.extend(part)
                            if len(body) > 65536:
                                raise ValueError("Oversized JWKS")
                import json
                self._keys = json.loads(body)["keys"]
                self._expires = time.time() + 60
            return self._keys

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            if len(token) > 16384:
                return None
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not header.get("kid"):
                return None
            keys = [k for k in await self.keys() if k.get("kid") == header["kid"]
                    and k.get("kty") == "RSA" and k.get("use", "sig") == "sig"
                    and k.get("alg", "RS256") == "RS256"]
            if len(keys) != 1:
                return None
            key = jwt.PyJWK.from_dict(keys[0], algorithm="RS256").key
            claims = jwt.decode(token, key, algorithms=["RS256"],
                                issuer=self.settings.issuer, audience=self.settings.resource,
                                options={"require": ["exp", "iat", "sub", "iss", "aud", "jti"]})
            client_id = claims.get("client_id") or claims.get("azp")
            if (claims["sub"] != self.settings.subject or client_id not in self.settings.clients
                    or type(claims["exp"]) is not int or type(claims["iat"]) is not int
                    or not 0 < claims["exp"] - claims["iat"] <= 900
                    or not isinstance(claims["jti"], str) or not claims["jti"]
                    or not isinstance(claims.get("scope", ""), str)):
                return None
            scopes = claims.get("scope", "").split()
            return AccessToken(token=token, client_id=client_id,
                               scopes=[s for s in scopes if s in SCOPES],
                               expires_at=claims["exp"], resource=self.settings.resource,
                               subject=claims["sub"], claims={"iss": claims["iss"]})
        except (jwt.PyJWTError, ValueError, KeyError, TypeError, httpx.HTTPError):
            # No token, claims, URL response, or content in logs.
            logger.warning("mcp_authentication_failed")
            return None


def owner_id(token: AccessToken):
    return hashlib.sha256(f"{token.claims['iss']}\0{token.subject}\0{token.client_id}".encode()).hexdigest()
