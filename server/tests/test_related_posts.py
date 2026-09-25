import pytest


def add_post(api, title, tags, **extra):
    response = api.post("/api/posts", headers=api.admin_headers, json={
        "title": title, "content": "관련 글 설명", "tags": tags,
        "status": "published", **extra,
    })
    assert response.status_code == 201
    return response.json()["id"]


def test_related_posts_rank_overlap_and_exclude_private_posts(api):
    assert api.put("/api/posts/1", headers=api.admin_headers,
                   json={"tags": ["Ceph", "Homelab"]}).status_code == 200
    single = add_post(api, "한 태그", ["Ceph"])
    best = add_post(api, "두 태그", ["Ceph", "Homelab"])
    add_post(api, "다른 주제", ["LLM"])
    add_post(api, "비밀 글", ["Ceph", "Homelab"], is_secret=True)
    add_post(api, "초안", ["Ceph", "Homelab"], status="draft")
    deleted = add_post(api, "삭제 글", ["Ceph", "Homelab"])
    assert api.delete(f"/api/posts/{deleted}", headers=api.admin_headers).status_code == 204
    for headers in ({}, api.admin_headers):
        result = api.get("/api/posts/1/related", headers=headers).json()
        assert result["match"] == "topic"
        assert [post["id"] for post in result["items"]] == [best, single]
        assert all(post["excerpt"] == "관련 글 설명" and post["content"] == "" for post in result["items"])


def test_related_posts_fall_back_to_recent_and_limit_results(api):
    ids = [add_post(api, f"새 글 {index}", ["other"]) for index in range(4)]
    result = api.get("/api/posts/1/related").json()
    assert result["match"] == "recent"
    assert [post["id"] for post in result["items"]] == ids[::-1][:3]


def test_related_posts_empty_and_category_match(api):
    assert api.get("/api/posts/1/related").json()["items"] == []
    assert api.put("/api/posts/1", headers=api.admin_headers,
                   json={"category_slug": "infra"}).status_code == 200
    related = add_post(api, "같은 분류", [], category_slug="infra")
    add_post(api, "다른 분류", [])
    result = api.get("/api/posts/1/related").json()
    assert result["match"] == "topic"
    assert [post["id"] for post in result["items"]] == [related]


@pytest.mark.parametrize("ident", [2, 3, 4, 999])
def test_related_posts_cannot_reveal_private_source(api, ident):
    assert api.get(f"/api/posts/{ident}/related").status_code == 404
