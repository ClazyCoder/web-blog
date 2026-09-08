"""Tests use isolated SQLite and a fake revocation store, never the local .env."""
import asyncio
import os
import sys
from pathlib import Path

os.environ.update(
    PYTHON_DOTENV_DISABLED="1",
    SECRET_KEY="test-only-key-not-for-deployment-123456789",
    ADMIN_USERNAME="admin",
    ADMIN_PASSWORD="test-password",
    ENV="development",
    SITE_URL="https://testserver",
    DATABASE_URL="sqlite+aiosqlite:///unused-test-database.db",
    REDIS_URL="",
    TRUSTED_PROXY_HOST="",
    DB_HOST="",
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from datetime import datetime
from PIL import Image as PILImage

import auth
from main import app
from db.session import get_db
from db import redis as redis_store
from models.base import Base
from models.post import Post
from models.image import Image
from routers import image as image_router
from rate_limit import limiter


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.fail = False

    def check(self):
        if self.fail:
            raise ConnectionError("unavailable")

    async def ping(self):
        self.check()
        return True

    async def set(self, key, value, ex=None, nx=False):
        self.check()
        if nx and key in self.values:
            return None
        self.values[key] = value
        return True

    async def setex(self, key, ttl, value):
        return await self.set(key, value, ex=ttl)

    async def exists(self, key):
        self.check()
        return int(key in self.values)


@pytest.fixture
def api(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    image_dir = tmp_path / "images"
    image_dir.mkdir()
    monkeypatch.setattr(image_router, "UPLOAD_DIR", image_dir)
    store = FakeRedis()
    monkeypatch.setattr(redis_store, "_redis", store)
    limiter.reset()
    auth.init_admin_user()

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with sessions() as db:
            for ident, state, secret, deleted in (
                (1, "published", False, False), (2, "draft", False, False),
                (3, "published", True, False), (4, "published", False, True),
            ):
                db.add(Post(id=ident, title=f"private-title-{ident}", slug=f"post-{ident}",
                            content=f"body-{ident}", excerpt=f"excerpt-{ident}",
                            status=state, is_secret=secret, tags=[f"tag-{ident}"],
                            deleted_at=datetime.now() if deleted else None))
                db.add(Image(id=ident, storage_key=f"images/{ident}.png",
                             original_filename=f"{ident}.png", file_size=80,
                             post_id=ident, is_temporary=False, mime_type="image/png"))
            db.add(Image(id=5, storage_key="images/5.png", original_filename="5.png",
                         file_size=80, is_temporary=True))
            db.add(Image(id=6, storage_key="images/6.png", original_filename="6.png",
                         file_size=80, deleted_at=datetime.now(), post_id=1))
            await db.commit()
    asyncio.run(setup())
    for ident in range(1, 8):
        PILImage.new("RGB", (16, 16)).save(image_dir / f"{ident}.png")

    async def test_db():
        async with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = test_db
    # Do not run application lifespan (production cleanup scheduler).
    client = TestClient(app, base_url="https://testserver")
    client.headers["Origin"] = "https://testserver"
    client.store = store
    client.admin_headers = {"Authorization": f"Bearer {auth.create_access_token({'sub': 'admin'})}"}
    yield client
    client.close()
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())
