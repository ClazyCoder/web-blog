"""Optional PostgreSQL concurrency test in a unique disposable schema."""
import asyncio
import os
import time
import uuid

import pytest
from mcp.server.auth.provider import AccessToken
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from blog_mcp import service
from blog_mcp.config import Settings, SCOPES
from db import session as database
from models.base import Base
from models.mcp import MCPOAuth, MCPRequest, MCPAudit
from models.post import Post


@pytest.mark.skipif(not os.getenv("MCP_TEST_POSTGRES_URL"), reason="Isolated PostgreSQL URL not configured")
def test_postgres_concurrent_retry_approval_and_manual_edit(monkeypatch):
    async def run():
        url = os.environ["MCP_TEST_POSTGRES_URL"]
        schema = "mcp_test_" + uuid.uuid4().hex
        admin = create_async_engine(url)
        engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        monkeypatch.setattr(database, "AsyncSessionLocal", sessions)
        settings = Settings("https://testserver", "https://testserver", "", "admin", frozenset({"pg-test"}), True,
                            ({"client_id": "pg-test", "redirect_uris": ["https://client.example/callback"]},))
        token = AccessToken(token="synthetic", client_id="pg-test", scopes=list(SCOPES),
                            expires_at=int(time.time()) + 900, resource=settings.resource,
                            claims={"iss": settings.origin, "grant_id": "pg-grant"})
        try:
            async with admin.begin() as conn:
                await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            async with sessions() as db:
                db.add(MCPOAuth(id="pg-grant", kind="grant", client_id="pg-test", data={"scopes": list(SCOPES)}, expires_at=int(time.time()) + 900))
                db.add(Post(id=1, title="before", content="original", slug="original", status="draft"))
                await db.commit()

            async def proposal(key):
                async with sessions() as db:
                    return await service.propose(db, token, settings, "post.update", 1,
                        service.PostInput(title="approved", content="replacement").model_dump(), key)
            first, retry = await asyncio.gather(proposal("parallel-request"), proposal("parallel-request"))
            assert first["request_id"] == retry["request_id"]
            async def approve(ident):
                async with sessions() as db:
                    return await service.decide(db, await service.get_request(db, ident), "approve", settings)
            results = await asyncio.gather(approve(first["request_id"]), approve(first["request_id"]))
            assert [r["state"] for r in results] == ["executed", "executed"]
            async with sessions() as db:
                assert await db.scalar(select(func.count()).select_from(MCPRequest)) == 1
                assert await db.scalar(select(func.count()).select_from(MCPAudit).where(MCPAudit.event == "proposal_executed")) == 1
                assert (await db.get(Post, 1)).content == "replacement"

            pending = await proposal("manual-edit-race")
            async with sessions() as manual:
                post = await manual.scalar(select(Post).where(Post.id == 1).with_for_update())
                post.content = "manual change wins"
                task = asyncio.create_task(approve(pending["request_id"]))
                # Yield while the manual transaction still holds the row lock.
                await asyncio.sleep(0.1)
                await manual.commit()
                assert (await task)["state"] == "stale"
            async with sessions() as db:
                assert (await db.get(Post, 1)).content == "manual change wins"
        finally:
            await engine.dispose()
            async with admin.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            await admin.dispose()
    asyncio.run(run())
