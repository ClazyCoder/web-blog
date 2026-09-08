"""Read-only pre-deployment check. Run from server: uv run python scripts/check_image_links.py."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db.session import AsyncSessionLocal, engine
from sqlalchemy import select
from models.post import Post
from models.image import Image
from routers.post import extract_image_urls, extract_storage_keys_from_urls


async def main():
    issues = []
    async with AsyncSessionLocal() as db:
        posts = (await db.execute(select(Post).where(Post.deleted_at.is_(None)))).scalars().all()
        images = {img.storage_key: img for img in (await db.execute(select(Image))).scalars()}
        for post in posts:
            keys = set(extract_storage_keys_from_urls(extract_image_urls(post.content)))
            for key in keys:
                image = images.get(key)
                if image is None or image.deleted_at is not None:
                    reason = "missing_or_deleted_record"
                elif image.post_id != post.id or image.is_temporary:
                    reason = "ownership_or_temporary_mismatch"
                elif not (Path("uploads") / key).is_file():
                    reason = "missing_file"
                else:
                    continue
                issues.append({"post_id": post.id, "storage_key": key, "reason": reason})
        result = {
            "posts_checked": len(posts),
            "unlinked_active_images": sum(img.post_id is None and img.deleted_at is None for img in images.values()),
            "issues": issues,
        }
    await engine.dispose()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return bool(issues)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
