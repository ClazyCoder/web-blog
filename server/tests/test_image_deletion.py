"""Image deletion failures must preserve retryable database records."""

import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import update

from models.image import Image
from routers import image as image_router
from services import image_cleanup


def fail_unlink(monkeypatch, paths, error_type=PermissionError):
    original_unlink = Path.unlink

    def unlink(path, *args, **kwargs):
        if path in paths:
            raise error_type("Image storage unavailable")
        return original_unlink(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink)


@pytest.mark.parametrize("error_type", [PermissionError, OSError])
@pytest.mark.parametrize("exists_returns_false", [False, True])
def test_delete_failure_preserves_image(api, monkeypatch, error_type, exists_returns_false):
    path = image_router.UPLOAD_DIR / "1.png"
    original_bytes = path.read_bytes()
    with monkeypatch.context() as patch:
        fail_unlink(patch, {path}, error_type)
        if exists_returns_false:
            original_exists = Path.exists
            patch.setattr(Path, "exists", lambda p: False if p == path else original_exists(p))
        response = api.delete("/api/upload/image/1.png", headers=api.admin_headers)

    assert response.status_code == 500
    assert path.read_bytes() == original_bytes
    assert api.get("/uploads/images/1.png").status_code == 200

    async def check():
        async with api.sessions() as db:
            image = await db.get(Image, 1)
            assert image.deleted_at is None
            assert image.post_id == 1

    asyncio.run(check())
    assert api.delete("/api/upload/image/1.png", headers=api.admin_headers).status_code == 200
    assert not path.exists()


@pytest.mark.parametrize("missing", [False, True])
def test_delete_success_and_missing_file_are_idempotent(api, missing):
    path = image_router.UPLOAD_DIR / "1.png"
    if missing:
        path.unlink()
    for _ in range(2):
        response = api.delete("/api/upload/image/1.png", headers=api.admin_headers)
        assert response.status_code == 200
        assert response.json()["success"] is True
    assert not path.exists()
    assert api.get("/uploads/images/1.png").status_code == 404


async def prepare_cleanup(api, operation):
    old = datetime.now() - timedelta(days=60)
    async with api.sessions() as db:
        await db.execute(update(Image).where(Image.id.in_([5, 6])).values(
            post_id=None, is_temporary=True, created_at=old,
            deleted_at=old if operation == "purge" else None,
        ))
        await db.commit()


async def clean(db, operation):
    if operation == "purge":
        return await image_cleanup.purge_soft_deleted_images(db)
    return await image_cleanup.cleanup_orphan_images(db, force=True)


@pytest.mark.parametrize("operation", ["orphan", "purge"])
@pytest.mark.parametrize("failed_ids", [(5, 6), (5,), ()])
def test_cleanup_commits_only_successful_deletions(api, monkeypatch, operation, failed_ids):
    monkeypatch.setattr(image_cleanup, "UPLOAD_DIR", image_router.UPLOAD_DIR)
    paths = {image_router.UPLOAD_DIR / f"{ident}.png" for ident in failed_ids}

    async def run():
        await prepare_cleanup(api, operation)
        with monkeypatch.context() as patch:
            fail_unlink(patch, paths)
            async with api.sessions() as db:
                commit = AsyncMock(wraps=db.commit)
                rollback = AsyncMock(wraps=db.rollback)
                patch.setattr(db, "commit", commit)
                patch.setattr(db, "rollback", rollback)
                result = await clean(db, operation)
                succeeded = 2 - len(failed_ids)
                assert result["found"] == 2
                assert result["purged" if operation == "purge" else "deleted"] == succeeded
                assert len(result["errors"]) == len(failed_ids)
                assert commit.await_count == int(succeeded > 0)
                assert rollback.await_count == int(succeeded == 0)
                assert not db.in_transaction()

        # Read from a fresh session to verify persisted state, not ORM attributes.
        async with api.sessions() as db:
            for ident in (5, 6):
                image = await db.get(Image, ident)
                failed = ident in failed_ids
                assert (image_router.UPLOAD_DIR / f"{ident}.png").exists() == failed
                if operation == "purge":
                    assert (image is not None) == failed
                else:
                    assert (image.deleted_at is None) == failed

        async with api.sessions() as db:
            retry = await clean(db, operation)
            assert retry["found"] == len(failed_ids)
            assert retry["purged" if operation == "purge" else "deleted"] == len(failed_ids)
            assert not retry["errors"]

    asyncio.run(run())


@pytest.mark.parametrize("operation", ["orphan", "purge"])
def test_cleanup_accepts_already_missing_files(api, monkeypatch, operation):
    monkeypatch.setattr(image_cleanup, "UPLOAD_DIR", image_router.UPLOAD_DIR)
    for ident in (5, 6):
        (image_router.UPLOAD_DIR / f"{ident}.png").unlink()

    async def run():
        await prepare_cleanup(api, operation)
        async with api.sessions() as db:
            result = await clean(db, operation)
            assert result["purged" if operation == "purge" else "deleted"] == 2
            assert not result["errors"]

    asyncio.run(run())


@pytest.mark.parametrize("failure", ["delete", "commit"])
def test_cleanup_database_failure_rolls_back(api, monkeypatch, failure):
    monkeypatch.setattr(image_cleanup, "UPLOAD_DIR", image_router.UPLOAD_DIR)

    async def run():
        await prepare_cleanup(api, "purge")
        async with api.sessions() as db:
            monkeypatch.setattr(image_cleanup, "AsyncSessionLocal", lambda: db)
            commit = AsyncMock(wraps=db.commit)
            rollback = AsyncMock(wraps=db.rollback)
            monkeypatch.setattr(db, "commit", commit)
            monkeypatch.setattr(db, "rollback", rollback)
            if failure == "delete":
                original_delete = db.delete

                async def delete_then_fail(image):
                    await original_delete(image)
                    raise RuntimeError("Database delete failed")

                monkeypatch.setattr(db, "delete", delete_then_fail)
            else:
                commit.side_effect = RuntimeError("Database commit failed")

            result = await image_cleanup.run_cleanup(use_lock=False)
            assert "error" in result
            assert "purge_soft_deleted" not in result
            assert commit.await_count == int(failure == "commit")
            # Empty orphan cleanup and the failed purge each release their transaction.
            assert rollback.await_count == 2

        async with api.sessions() as db:
            assert await db.get(Image, 5) is not None
            assert await db.get(Image, 6) is not None

    asyncio.run(run())


@pytest.mark.parametrize("operation", ["orphan", "purge"])
def test_cleanup_preserves_mcp_managed_images(api, monkeypatch, operation):
    monkeypatch.setattr(image_cleanup, "UPLOAD_DIR", image_router.UPLOAD_DIR)

    async def run():
        await prepare_cleanup(api, operation)
        async with api.sessions() as db:
            await db.execute(update(Image).where(Image.id.in_([5, 6])).values(mcp_managed=True))
            await db.commit()
            result = await clean(db, operation)
            assert result["found"] == 0
            assert not result["errors"]
        async with api.sessions() as db:
            for ident in (5, 6):
                assert await db.get(Image, ident) is not None
                assert (image_router.UPLOAD_DIR / f"{ident}.png").is_file()

    asyncio.run(run())
