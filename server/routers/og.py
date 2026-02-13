"""
Open Graph 메타태그 제공 라우터
소셜 미디어 크롤러(봇)를 위한 동적 OG 메타태그 HTML 반환
"""

import os
import re
from html import escape

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db.session import get_db
from models.post import Post

router = APIRouter(
    prefix="/og",
    tags=["opengraph"],
)

SITE_NAME = os.getenv("SITE_NAME", "YSG Blog")


def strip_markdown(text: str, max_length: int = 200) -> str:
    """마크다운 문법을 제거하고 순수 텍스트만 추출"""
    if not text:
        return ""
    # 이미지 제거
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    # 링크 텍스트만 유지
    text = re.sub(r"\[([^\]]+)\]\(.*?\)", r"\1", text)
    # 헤딩 마크다운 제거
    text = re.sub(r"#{1,6}\s+", "", text)
    # 볼드·이탤릭 제거
    text = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}(.*?)_{1,3}", r"\1", text)
    # 코드 블록 제거
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # 인용문 마크다운 제거
    text = re.sub(r">\s+", "", text)
    # 수평선 제거
    text = re.sub(r"---+", "", text)
    # 연속 공백 정리
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) > max_length:
        return text[:max_length] + "..."
    return text


def _get_site_url(request: Request) -> str:
    """요청 헤더 또는 환경변수에서 사이트 기본 URL 추출"""
    site_url = os.getenv("SITE_URL", "").rstrip("/")
    if site_url:
        return site_url

    # 요청 헤더에서 추론
    proto = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("host", "localhost")
    return f"{proto}://{host}"


def _build_og_html(
    *,
    title: str,
    description: str,
    url: str,
    image: str | None = None,
    site_name: str = SITE_NAME,
) -> str:
    """OG 메타태그가 포함된 최소한의 HTML 페이지 생성"""
    t = escape(title)
    d = escape(description)
    u = escape(url)
    s = escape(site_name)

    image_tags = ""
    if image:
        img = escape(image)
        image_tags = (
            f'\n    <meta property="og:image" content="{img}" />'
            f'\n    <meta name="twitter:image" content="{img}" />'
        )

    twitter_card = "summary_large_image" if image else "summary"

    return f"""<!doctype html>
<html lang="ko">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{t} - {s}</title>

    <!-- Open Graph -->
    <meta property="og:type" content="article" />
    <meta property="og:title" content="{t}" />
    <meta property="og:description" content="{d}" />
    <meta property="og:url" content="{u}" />
    <meta property="og:site_name" content="{s}" />{image_tags}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="{twitter_card}" />
    <meta name="twitter:title" content="{t}" />
    <meta name="twitter:description" content="{d}" />

    <!-- Standard Meta -->
    <meta name="description" content="{d}" />

    <!-- Redirect to actual page for non-bot visitors -->
    <meta http-equiv="refresh" content="0;url={u}" />
</head>
<body>
    <p><a href="{u}">{t}</a></p>
</body>
</html>"""


@router.get("/board/{post_id}", response_class=HTMLResponse)
async def get_og_page(
    request: Request,
    post_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    게시글 Open Graph 메타태그 HTML 반환

    소셜 미디어 크롤러(봇)가 /board/{id} 접근 시 nginx에서
    이 엔드포인트로 프록시하여 OG 메타태그를 제공합니다.
    """
    stmt = (
        select(Post)
        .options(selectinload(Post.images))
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()

    site_url = _get_site_url(request)

    if not post:
        return HTMLResponse(
            content=_build_og_html(
                title=SITE_NAME,
                description="페이지를 찾을 수 없습니다.",
                url=site_url,
            ),
            status_code=404,
        )

    post_url = f"{site_url}/board/{post.id}"

    # Description: excerpt 우선, 없으면 본문에서 추출
    description = post.excerpt or strip_markdown(post.content)

    # Thumbnail URL → 절대 경로로 변환 (없으면 favicon 사용)
    thumbnail = post.thumbnail
    if thumbnail and not thumbnail.startswith("http"):
        thumbnail = f"{site_url}{thumbnail}"
    if not thumbnail:
        thumbnail = f"{site_url}/android-chrome-512x512.png"

    return HTMLResponse(
        content=_build_og_html(
            title=post.title,
            description=description,
            url=post_url,
            image=thumbnail,
        )
    )
