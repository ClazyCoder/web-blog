"""Single-administrator JWT authentication (cookies and Bearer tokens)."""

from datetime import datetime, timedelta, timezone
from typing import Optional
import math
import os
import uuid

import bcrypt
from fastapi import Cookie, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY must be configured")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD_HASH = None
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")
    if not 1 <= len(password_bytes) <= 72:
        return False
    return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if not 1 <= len(password_bytes) <= 72:
        raise ValueError("Administrator password must be 1-72 UTF-8 bytes")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def init_admin_user():
    global ADMIN_PASSWORD_HASH
    password = os.getenv("ADMIN_PASSWORD")
    if not password:
        raise RuntimeError("ADMIN_PASSWORD must be configured")
    ADMIN_PASSWORD_HASH = get_password_hash(password)


def get_admin_user() -> dict:
    if ADMIN_PASSWORD_HASH is None:
        init_admin_user()
    return {"user_id": "admin", "username": ADMIN_USERNAME,
            "email": ADMIN_EMAIL, "hashed_password": ADMIN_PASSWORD_HASH}


def verify_admin_credentials(username: str, password: str) -> bool:
    admin = get_admin_user()
    # Perform the password check even when the username is incorrect.
    password_matches = verify_password(password, admin["hashed_password"])
    return username == admin["username"] and password_matches


def _create_token(data: dict, token_type: str, lifetime: timedelta) -> str:
    payload = {**data, "type": token_type, "jti": str(uuid.uuid4()),
               "exp": datetime.now(timezone.utc) + lifetime}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    return _create_token(data, "access", expires_delta if expires_delta is not None
                         else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    return _create_token(data, "refresh", expires_delta if expires_delta is not None
                         else timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))


def _decode_token(token: str, token_type: str, *, verify_exp: bool = True) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={
            "require_exp": True, "require_jti": True, "require_sub": True,
            "verify_exp": verify_exp,
        })
        exp = payload.get("exp")
        if (payload.get("type") != token_type or payload.get("sub") != "admin"
                or not isinstance(payload.get("jti"), str) or not payload["jti"]
                or type(exp) not in (int, float) or not math.isfinite(exp)):
            raise JWTError("Invalid claims")
        return payload
    except (JWTError, ValueError, TypeError, OverflowError):
        raise HTTPException(401, "Invalid authentication token",
                            headers={"WWW-Authenticate": "Bearer"}) from None


def decode_access_token(token: str) -> dict:
    return _decode_token(token, "access")


def decode_refresh_token(token: str) -> dict:
    return _decode_token(token, "refresh")


def decode_token_unsafe(token: str) -> Optional[dict]:
    """Verify signature and claims, allowing expiry only for logout."""
    for token_type in ("access", "refresh"):
        try:
            return _decode_token(token, token_type, verify_exp=False)
        except HTTPException:
            continue
    return None


def token_remaining_seconds(payload: dict) -> int:
    return max(0, math.ceil(payload["exp"] - datetime.now(timezone.utc).timestamp()))


async def get_current_user_from_cookie(
    access_token: Optional[str] = Cookie(None, alias="access_token"),
) -> dict:
    from db.redis import is_token_blacklisted
    if not access_token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_access_token(access_token)
    if await is_token_blacklisted(payload["jti"]):
        raise HTTPException(401, "Token has been revoked")
    return {"user_id": payload["sub"], "username": ADMIN_USERNAME, "email": ADMIN_EMAIL}


async def get_current_user(
    access_token: Optional[str] = Cookie(None, alias="access_token"),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if access_token:
        return await get_current_user_from_cookie(access_token)
    if credentials:
        return await get_current_user_from_cookie(credentials.credentials)
    raise HTTPException(401, "Not authenticated")


async def get_current_user_optional(
    access_token: Optional[str] = Cookie(None, alias="access_token"),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    try:
        return await get_current_user(access_token, credentials)
    except HTTPException as exc:
        if exc.status_code == 401:
            return None
        raise
