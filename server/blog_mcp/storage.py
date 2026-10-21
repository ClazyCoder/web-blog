"""Bound anonymous OAuth persistence independently of IP rate limits."""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager, suppress

from sqlalchemy import delete, exists, select, text, update
from sqlalchemy.orm import aliased

from db import session as database
from models.mcp import MCPOAuth

MAX_CONSENTS = 100
MAX_CONSENTS_PER_CLIENT = 10
MAX_CLIENTS = 100
MAX_CLIENTS_PER_CALLBACK = 10
MAX_PAYLOAD_BYTES = 4096
CLIENT_TTL = 86400
CLEANUP_INTERVAL = 60
# Transaction-scoped, shared by all workers connected to this database.
STORAGE_LOCK = 0x424C4F474F415554
logger = logging.getLogger("blog.mcp.storage")


def bounded_payload(data):
    return len(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) <= MAX_PAYLOAD_BYTES


async def lock_storage(db):
    """Must be the first database operation in the transaction."""
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": STORAGE_LOCK})
    elif dialect == "sqlite":
        await db.execute(text("BEGIN IMMEDIATE"))
    else:
        raise RuntimeError("OAuth storage requires PostgreSQL or SQLite")


def live_dependencies(client_id, now, *, include_consent=False):
    dependency = aliased(MCPOAuth)
    kinds = ("grant", "consent") if include_consent else ("grant",)
    return exists(select(dependency.id).where(
        dependency.client_id == client_id, dependency.kind.in_(kinds),
        dependency.consumed.is_(False), dependency.expires_at > now))


async def prune_storage(db, now):
    # Older releases used 2038 for registrations. Give these a bounded grace
    # period; live grants and pending consent still protect them from removal.
    await db.execute(update(MCPOAuth).where(
        MCPOAuth.kind == "client", MCPOAuth.expires_at > now + CLIENT_TTL
    ).values(expires_at=now + CLIENT_TTL))
    await db.execute(delete(MCPOAuth).where(
        MCPOAuth.kind == "consent",
        (MCPOAuth.expires_at <= now) | MCPOAuth.consumed.is_(True)))
    await db.execute(delete(MCPOAuth).where(
        MCPOAuth.kind == "client", MCPOAuth.expires_at <= now,
        ~live_dependencies(MCPOAuth.client_id, now, include_consent=True)
    ).execution_options(synchronize_session=False))
    # Codes, token replay markers, grants and audit records have separate
    # retention semantics and are deliberately not removed here.


async def cleanup():
    async with database.AsyncSessionLocal() as db:
        await lock_storage(db)
        await prune_storage(db, int(time.time()))
        await db.commit()


@asynccontextmanager
async def maintenance():
    async def run():
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL)
            try:
                await cleanup()
            except Exception:
                logger.error("mcp_oauth_cleanup_failed")
    await cleanup()
    task = asyncio.create_task(run())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
