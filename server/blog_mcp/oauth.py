"""Stable proposal ownership, independent of access-token rotation."""
import hashlib
from mcp.server.auth.provider import AccessToken


def owner_id(token: AccessToken):
    return hashlib.sha256(f"{token.claims['iss']}\0{token.subject}\0{token.client_id}".encode()).hexdigest()
