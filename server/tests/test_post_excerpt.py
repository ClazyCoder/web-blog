import pytest

from services.post_excerpt import strip_markdown


@pytest.mark.parametrize(("content", "expected"), [
    ("# 제목\n\n**Ceph**와 `k8s` 연결 기록.", "Ceph와 k8s 연결 기록."),
    ("```python\nsecret = 1\n```\n실제 설명", "실제 설명"),
    ("~~~text\n명령 출력\n~~~\n실제 설명", "실제 설명"),
    ("설명\n```text\n끝나지 않은 코드", "설명"),
    ("![그림](/image.png)\n[문서](https://example.com) 참고", "문서 참고"),
    ("<p>처음 &amp; 끝</p><script>숨긴 코드</script><p>다음</p>", "처음 & 끝 다음"),
    ("| 열 | 값 |\n| --- | --- |\n\n요약할 문장", "요약할 문장"),
    ("", ""),
])
def test_readable_excerpt(content, expected):
    assert strip_markdown(content) == expected


def test_excerpt_length():
    assert strip_markdown("가" * 201) == "가" * 200 + "…"


def test_list_fallback_preserves_authored_excerpt_and_content(api):
    body = "# 제목\n\n**기존 글**도 본문에서 발췌한다.\n```bash\nprivate-command\n```"
    assert api.put("/api/posts/1", headers=api.admin_headers,
                   json={"excerpt": "", "content": body}).status_code == 200
    item = api.get("/api/posts").json()["items"][0]
    assert item["excerpt"] == "기존 글도 본문에서 발췌한다."
    assert item["content"] == ""
    detail = api.get("/api/posts/1").json()
    assert detail["excerpt"] == ""
    assert detail["content"] == body
    assert api.put("/api/posts/1", headers=api.admin_headers,
                   json={"excerpt": "직접 작성한 요약"}).status_code == 200
    assert api.get("/api/posts").json()["items"][0]["excerpt"] == "직접 작성한 요약"
