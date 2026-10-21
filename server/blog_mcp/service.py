"""One DB transaction binds approval, optimistic concurrency, mutation and audit.

All writes are proposals. Only the browser router calls decide(); MCP has no
approve/execute tool. Uploaded bytes are normalized before entering a proposal.
"""
import base64
import hashlib
import json
import re
import time
import uuid
import warnings
from datetime import datetime
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from fastapi import HTTPException
from PIL import Image as PILImage, ImageOps
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from models.post import Post
from models.image import Image
from models.mcp import MCPRequest, MCPAudit
from schemas.post import PostCreate
from routers.post import generate_slug, link_images_to_post, extract_image_urls, extract_storage_keys_from_urls
from routers import image as image_router
from .oauth import owner_id

MAX_IMAGE_BYTES = 2 * 1024 * 1024


class PostInput(PostCreate):
    model_config = ConfigDict(extra="forbid", strict=True)
    content: str = Field(min_length=1, max_length=200_000)
    tags: list[str] = Field(default_factory=list, max_length=30)


class ImageMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    alt_text: str = Field(default="", max_length=200)
    caption: str = Field(default="", max_length=500)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def require(token, *scopes):
    if token is None or not set(scopes).issubset(token.scopes):
        raise HTTPException(403, "Insufficient OAuth scope: " + " ".join(scopes))
    if token.expires_at is None or token.expires_at <= time.time():
        raise HTTPException(401, "OAuth token expired")


def audit(db, actor, event, request_id=None, **details):
    db.add(MCPAudit(actor=actor, event=event, request_id=request_id, details=details))


def normalize_image(encoded: str):
    if len(encoded) > (MAX_IMAGE_BYTES + 2) // 3 * 4:
        raise HTTPException(413, "Image limit is 2 MiB")
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not 0 < len(raw) <= MAX_IMAGE_BYTES:
            raise ValueError()
        with warnings.catch_warnings():
            warnings.simplefilter("error", PILImage.DecompressionBombWarning)
            with PILImage.open(BytesIO(raw)) as probe:
                if probe.format not in ("PNG", "JPEG", "WEBP") or probe.width * probe.height > 16_000_000:
                    raise ValueError()
                if getattr(probe, "n_frames", 1) != 1:
                    raise ValueError()
                probe.verify()
            with PILImage.open(BytesIO(raw)) as source:
                image = ImageOps.exif_transpose(source).convert("RGBA")
                image.thumbnail((1920, 1920))
                out = BytesIO()
                image.save(out, format="PNG")  # Drops EXIF, active metadata and polyglot trailing bytes.
                blob = out.getvalue()
                if len(blob) > MAX_IMAGE_BYTES:
                    raise ValueError()
                return blob, {"sha256": hashlib.sha256(blob).hexdigest(),
                              "file_size": len(blob), "width": image.width,
                              "height": image.height, "mime_type": "image/png"}
    except Exception:
        raise HTTPException(400, "Use a valid, single-frame PNG/JPEG/WebP within image limits") from None


def post_state(post):
    fields = ("id", "title", "content", "slug", "excerpt", "tags", "category_slug",
              "status", "is_secret", "deleted_at", "published_at")
    return {key: value.isoformat() if isinstance(value := getattr(post, key), datetime) else value
            for key in fields}


def image_state(image):
    return {key: value.isoformat() if isinstance(value := getattr(image, key), datetime) else value
            for key in ("id", "storage_key", "original_filename", "file_size", "mime_type",
                        "width", "height", "alt_text", "caption", "post_id", "is_temporary", "deleted_at")}


def replace_image_references(content, old_key, new_key):
    for url in set(extract_image_urls(content)):
        if extract_storage_keys_from_urls([url]) == [old_key]:
            parts = urlsplit(url)
            replacement = urlunsplit((parts.scheme, parts.netloc, "/uploads/" + new_key, parts.query, parts.fragment))
            # A relative URL must not match the path suffix of an external URL.
            content = re.sub(r"(?<![\w:/.-])" + re.escape(url) + r"(?![\w./%-])",
                             lambda match: replacement, content)
    return content


async def snapshot(db, action, target_id, payload, *, lock=False):
    """Lock posts before images, same order as normal web mutations."""
    post = image = None
    if action.startswith("post.") and target_id is not None:
        stmt = select(Post).where(Post.id == target_id)
        post = await db.scalar(stmt.with_for_update() if lock else stmt)
        if post is None or post.deleted_at is not None:
            raise HTTPException(409, "Post is missing or deleted")
    if action.startswith("image.") and target_id is not None:
        image = await db.get(Image, target_id)
        if image is None or image.deleted_at is not None:
            raise HTTPException(409, "Image is missing or deleted")
        if image.post_id:
            stmt = select(Post).where(Post.id == image.post_id)
            post = await db.scalar(stmt.with_for_update() if lock else stmt)
        # Reload after acquiring the post lock: another writer may have relinked it.
        stmt = select(Image).where(Image.id == target_id).execution_options(populate_existing=True)
        image = await db.scalar(stmt.with_for_update() if lock else stmt)
        if image is None or image.deleted_at is not None or (image.post_id and (post is None or post.id != image.post_id)):
            raise HTTPException(409, "Image changed; create a fresh proposal")
    keys = set(extract_storage_keys_from_urls(extract_image_urls(payload.get("content", ""))))
    stmt = select(Image).where(Image.storage_key.in_(keys))
    if post:
        stmt = select(Image).where((Image.storage_key.in_(keys)) | (Image.post_id == post.id))
    images = list((await db.scalars(stmt.order_by(Image.id).with_for_update() if lock else stmt.order_by(Image.id))).all())
    if keys:
        valid = {i.storage_key for i in images if i.deleted_at is None and i.post_id in (None, post.id if post else None)}
        if not keys.issubset(valid):
            raise HTTPException(409, "An image is missing, deleted, or belongs to another post")
    if image and image.id not in {i.id for i in images}:
        images.append(image)
    return {"post": post_state(post) if post else None,
            "images": [image_state(i) for i in sorted(images, key=lambda i: i.id)]}


def request_status(req, origin):
    state = "expired" if req.state == "pending" and req.expires_at <= time.time() else req.state
    return {"request_id": req.id, "state": state, "action": req.action,
            "expires_at": req.expires_at, "payload_sha256": req.payload_hash,
            "review_url": origin + "/api/mcp/review/" + req.id, "result": req.result}


async def propose(db, token, settings, action, target_id, payload, key, blob=None):
    domain = "blog" if action.startswith("post.") else "images"
    require(token, domain + ":propose", domain + ":read_private")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{8,128}", key):
        raise HTTPException(400, "idempotency_key must contain 8-128 safe characters")
    if target_id is not None and target_id < 1:
        raise HTTPException(400, "target ID must be positive")
    payload_hash = digest({"action": action, "target": target_id, "payload": payload})
    owner = owner_id(token)
    # Expired staging bytes do not accumulate indefinitely; keep idempotency tombstones.
    await db.execute(update(MCPRequest).where(MCPRequest.state == "pending", MCPRequest.expires_at <= int(time.time()))
                     .values(state="expired", blob=None))
    previous = await db.scalar(select(MCPRequest).where(MCPRequest.owner == owner, MCPRequest.idempotency_key == key))
    if previous:
        if previous.payload_hash != payload_hash:
            raise HTTPException(409, "Idempotency key already used for different content")
        return request_status(previous, settings.origin)
    # Bound persisted payload growth for the single-admin blog.
    pending = await db.scalar(select(func.count()).select_from(MCPRequest).where(
        MCPRequest.state == "pending", MCPRequest.expires_at > int(time.time())))
    if pending >= 50:
        raise HTTPException(429, "Too many pending proposals; review or wait for expiry")
    daily = await db.scalar(select(func.count()).select_from(MCPRequest).where(MCPRequest.created_at > int(time.time()) - 86400))
    if daily >= 200:
        raise HTTPException(429, "Daily proposal limit reached")
    before = await snapshot(db, action, target_id, payload)
    if before["post"] and domain == "images":
        require(token, "blog:read_private", "blog:propose")
    if before["images"] and domain == "blog":
        require(token, "images:read_private", "images:propose")
    req = MCPRequest(id=str(uuid.uuid4()), owner=owner, client_id=token.client_id,
                     grant_id=(token.claims or {}).get("grant_id"),
                     idempotency_key=key, action=action, target_id=target_id,
                     payload=payload, payload_hash=payload_hash, snapshot=before,
                     snapshot_hash=digest(before), blob=blob, state="pending",
                     expires_at=min(int(time.time()) + 600, token.expires_at))
    db.add(req)
    audit(db, owner, "proposal_created", req.id, action=action, payload_hash=payload_hash)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # A concurrent retry may have won the unique key. Its payload must still match.
        previous = await db.scalar(select(MCPRequest).where(MCPRequest.owner == owner, MCPRequest.idempotency_key == key))
        if previous is None or previous.payload_hash != payload_hash:
            raise HTTPException(409, "Concurrent idempotency conflict") from None
        req = previous
    return request_status(req, settings.origin)


async def get_request(db, ident, token=None):
    req = await db.get(MCPRequest, ident)
    if req is None or (token is not None and req.owner != owner_id(token)):
        raise HTTPException(404, "Request not found")
    return req


async def apply_change(db, req):
    now = datetime.now()
    data = req.payload
    if req.action == "post.create":
        post = Post(**data, slug="mcp-" + req.id, created_at=now, updated_at=now)
        if post.status == "published":
            post.published_at = now
        db.add(post)
        await db.flush()
        post.slug = generate_slug(post.title, post.id)
        await link_images_to_post(post.id, post.content, db)
        result = {"post_id": post.id}
    elif req.action in ("post.update", "post.delete"):
        post = await db.get(Post, req.target_id)
        if req.action == "post.delete":
            post.deleted_at = now  # Keep image associations and bytes for manual recovery.
        else:
            for key, value in data.items():
                setattr(post, key, value)
            post.slug = generate_slug(post.title, post.id)
            post.updated_at = now
            if post.status == "published" and post.published_at is None:
                post.published_at = now
            await link_images_to_post(post.id, post.content, db)
        result = {"post_id": post.id}
    else:
        image = await db.get(Image, req.target_id) if req.target_id else None
        if req.action in ("image.upload", "image.replace"):
            # Immutable unique file; DB rollback cannot overwrite an existing image.
            filename = "mcp-" + req.id + ".png"
            path = image_router.UPLOAD_DIR / filename
            if not path.exists():
                with path.open("xb") as output:
                    output.write(req.blob)
                    output.flush()
                    import os
                    os.fsync(output.fileno())
            elif hashlib.sha256(path.read_bytes()).hexdigest() != data["sha256"]:
                raise HTTPException(409, "Stored file differs from approved content")
            if image is None:
                image = Image(storage_key="images/" + filename, original_filename=data["filename"],
                              is_temporary=True, mcp_managed=True)
                db.add(image)
            else:
                old_key = image.storage_key
                if image.post_id:
                    post = await db.get(Post, image.post_id)
                    post.content = replace_image_references(post.content, old_key, "images/" + filename)
                    post.updated_at = now
                image.storage_key = "images/" + filename
                image.original_filename = data["filename"]
            for key in ("file_size", "mime_type", "width", "height", "alt_text", "caption"):
                setattr(image, key, data[key])
        elif req.action == "image.update":
            image.alt_text, image.caption = data["alt_text"], data["caption"]
        elif req.action == "image.delete":
            image.deleted_at = now
        else:
            raise HTTPException(400, "Unknown action")
        image.mcp_managed = True
        await db.flush()
        result = {"image_id": image.id, "url": image.get_url("")}
    # Preserve images affected by post edits from the legacy automatic orphan purge.
    for old_image in req.snapshot["images"]:
        image = await db.get(Image, old_image["id"])
        if image:
            image.mcp_managed = True
    if req.action.startswith("post."):
        for image in (await db.scalars(select(Image).where(Image.post_id == result["post_id"]))).all():
            image.mcp_managed = True
    await db.flush()
    return result


async def decide(db, req, decision, settings):
    from .authorization import active_grant, LocalOAuth
    if not await LocalOAuth(settings).get_client(req.client_id) or not await active_grant(db, req.grant_id, lock=True):
        raise HTTPException(409, "OAuth connection revoked or expired; create a new proposal")
    # Conditional write serializes competing decisions on PostgreSQL AND SQLite.
    won = await db.execute(update(MCPRequest).where(MCPRequest.id == req.id, MCPRequest.state == "pending")
                           .values(state="deciding").execution_options(synchronize_session=False))
    if won.rowcount != 1:
        ident = req.id
        await db.rollback()
        return request_status(await get_request(db, ident), settings.origin)
    await db.refresh(req)
    if req.expires_at <= int(time.time()):
        req.state = "expired"
    elif decision == "reject":
        req.state = "rejected"
    else:
        if (req.payload_hash != digest({"action": req.action, "target": req.target_id, "payload": req.payload})
                or req.snapshot_hash != digest(req.snapshot)
                or (req.blob is not None and hashlib.sha256(req.blob).hexdigest() != req.payload["sha256"])):
            raise HTTPException(409, "Proposal integrity check failed")
        try:
            current = await snapshot(db, req.action, req.target_id, req.payload, lock=True)
            if digest(current) != req.snapshot_hash:
                raise HTTPException(409, "Resource changed after proposal")
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
            req.state = "stale"
        else:
            req.result = await apply_change(db, req)
            req.state = "executed"
    req.blob = None  # Binary staging data is not part of long-term audit retention.
    audit(db, "admin", "proposal_" + req.state, req.id, action=req.action,
          payload_hash=req.payload_hash, snapshot_hash=req.snapshot_hash, result=req.result)
    await db.commit()
    return request_status(req, settings.origin)


async def list_posts(db, token, offset, limit, search):
    require(token, "blog:read")
    conditions = [Post.deleted_at.is_(None)]
    if "blog:read_private" not in token.scopes:
        conditions.extend(Post.public_conditions())
    if search:
        conditions.append(Post.title.contains(search, autoescape=True) | Post.content.contains(search, autoescape=True))
    rows = (await db.scalars(select(Post).options(selectinload(Post.images)).where(*conditions)
                            .order_by(Post.id).offset(offset).limit(limit))).all()
    return {"untrusted_content": True, "items": [p.to_dict(False) for p in rows], "next_offset": offset + len(rows)}


async def read_post(db, token, ident):
    require(token, "blog:read")
    post = await db.scalar(select(Post).options(selectinload(Post.images)).where(Post.id == ident, Post.deleted_at.is_(None)))
    if post is None or ("blog:read_private" not in token.scopes and not post.is_public):
        raise HTTPException(404, "Post not found")
    return {"untrusted_content": True, "post": post.to_dict()}


async def list_images(db, token, offset, limit, ident=None):
    require(token, "images:read")
    stmt = select(Image).where(Image.deleted_at.is_(None))
    if "images:read_private" not in token.scopes:
        stmt = stmt.join(Post).where(*Post.public_conditions(), Image.is_temporary.is_(False))
    if ident is not None:
        stmt = stmt.where(Image.id == ident)
    rows = (await db.scalars(stmt.order_by(Image.id).offset(offset).limit(limit))).all()
    if ident is not None and not rows:
        raise HTTPException(404, "Image not found")
    return {"untrusted_content": True, "items": [i.to_dict("") for i in rows], "next_offset": offset + len(rows)}
