"""Database-owned client lifecycle; registration never grants resource access."""
import base64
import hashlib
import secrets
import time
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, update, func

import auth
from models.mcp import MCPOAuth
from .config import SCOPES
from . import storage

CLIENT_KINDS = ("client", "managed_client")
MAX_MANAGED_CLIENTS = 100
AUTH_METHODS = ("none", "client_secret_post")


def client_key(client_id):
    return hashlib.sha256(("client:" + client_id).encode()).hexdigest()


def cipher():
    key = hashlib.sha256(b"blog-oauth-client-secret-v1\0" + auth.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def validate_redirects(values):
    if (not isinstance(values, list) or not 1 <= len(values) <= 10
            or not all(isinstance(value, str) for value in values) or len(set(values)) != len(values)):
        raise ValueError("Provide 1 to 10 unique callback URLs")
    for value in values:
        url = urlsplit(value)
        if (len(value) > 1000 or any(ord(c) < 33 or ord(c) == 127 for c in value)
                or "*" in value or "\\" in value or url.fragment or url.username or url.password
                or not url.hostname or (url.scheme != "https" and not (
                    url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")))):
            raise ValueError("Callbacks require HTTPS or loopback HTTP, without credentials, fragments or wildcards")
    return values


class ClientInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    client_name: str = Field(min_length=1, max_length=100)
    redirect_uris: list[str]
    scopes: list[str] = Field(min_length=1, max_length=len(SCOPES))
    token_endpoint_auth_method: str = "none"

    @field_validator("redirect_uris")
    @classmethod
    def redirects(cls, values):
        return validate_redirects(values)

    @field_validator("scopes")
    @classmethod
    def scopes_valid(cls, values):
        if len(set(values)) != len(values) or not set(values).issubset(SCOPES):
            raise ValueError("Unknown or duplicate scope")
        return values

    @field_validator("token_endpoint_auth_method")
    @classmethod
    def method(cls, value):
        if value not in AUTH_METHODS:
            raise ValueError("Unsupported client authentication method")
        return value


def validate_client(client):
    validate_redirects(list(map(str, client.redirect_uris or [])))
    if (client.token_endpoint_auth_method not in AUTH_METHODS
            or "authorization_code" not in client.grant_types
            or not set(client.grant_types).issubset({"authorization_code", "refresh_token"})
            or client.response_types != ["code"]
            or not set((client.scope or "").split()).issubset(SCOPES)
            or len(client.client_name or "") > 100):
        raise ValueError("Unsupported OAuth client metadata")
    if client.token_endpoint_auth_method != "none" and not client.client_secret:
        raise ValueError("Confidential client requires a secret")
    if client.token_endpoint_auth_method == "none" and client.client_secret:
        raise ValueError("Public client cannot have a secret")


def stored_metadata(client, revision=1):
    data = client.model_dump(mode="json", exclude_none=True)
    secret = data.pop("client_secret", None)
    if secret:
        data["_secret"] = cipher().encrypt(secret.encode()).decode()
    data["_revision"] = revision
    return data


def client_from_row(row):
    data = {k: v for k, v in row.data.items() if not k.startswith("_")}
    try:
        if row.data.get("_secret"):
            data["client_secret"] = cipher().decrypt(row.data["_secret"].encode()).decode()
        client = OAuthClientInformationFull.model_validate(data)
        validate_client(client)
        return client
    except (ValueError, InvalidToken):
        return None


async def revoke_client_grants(db, client_id):
    # Grant updates acquire the same row locks as token exchange and approval.
    await db.execute(update(MCPOAuth).where(MCPOAuth.client_id == client_id,
        MCPOAuth.kind.in_(("grant", "consent"))).values(consumed=True))


def make_client(client_id, value, secret=None):
    return OAuthClientInformationFull(client_id=client_id, client_name=value.client_name,
        client_secret=secret, redirect_uris=value.redirect_uris, scope=" ".join(value.scopes),
        token_endpoint_auth_method=value.token_endpoint_auth_method,
        grant_types=["authorization_code", "refresh_token"], response_types=["code"],
        client_id_issued_at=int(time.time()))


async def create_managed(db, client_id, value):
    if await db.get(MCPOAuth, client_key(client_id)):
        raise ValueError("Client creation was already processed")
    count = await db.scalar(select(func.count()).select_from(MCPOAuth).where(
        MCPOAuth.kind == "managed_client", MCPOAuth.consumed.is_(False)))
    if count >= MAX_MANAGED_CLIENTS:
        raise ValueError("Managed client capacity reached")
    secret = secrets.token_urlsafe(48) if value.token_endpoint_auth_method != "none" else None
    data = stored_metadata(make_client(client_id, value, secret))
    if not storage.bounded_payload(data):
        raise ValueError("Client metadata exceeds the storage limit")
    db.add(MCPOAuth(id=client_key(client_id), kind="managed_client", client_id=client_id,
                   data=data, expires_at=2147483647))
    return secret
