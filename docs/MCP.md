# Blog MCP 및 OAuth 운영 안내

기존 FastAPI·PostgreSQL·Redis 인증 구조에 공식 Python MCP SDK의 Streamable HTTP 서버를 추가합니다. 기본 상태는 비활성화이며, 운영 환경에 배포하거나 외부 클라이언트를 연결하는 작업은 별도로 진행해야 합니다.

## 제공 기능

| Tools | 동작 |
| --- | --- |
| `list_posts`, `read_post` | 글 검색 및 조회. 조회수를 증가시키지 않습니다. |
| `create_post`, `update_post`, `delete_post` | 글 작성·수정·소프트 삭제 제안 |
| `list_images`, `read_image` | 이미지 메타데이터와 URL 조회. 원본 픽셀을 MCP 응답에 포함하지 않습니다. |
| `upload_image`, `update_image`, `replace_image`, `delete_image` | 업로드·설명 수정·파일 교체·소프트 삭제 제안 |
| `get_change_request` | 해당 OAuth 클라이언트가 만든 요청의 처리 상태 조회 |

모든 변경은 **제안 → 관리자 브라우저 검토 → 명시적 승인 및 실행** 순서로 처리합니다. 신규 글과 이미지 업로드에도 동일한 승인 절차를 적용합니다. `update_post`는 편집 가능 필드의 전체 교체입니다. 기존 필드를 먼저 읽고 유지할 값을 포함해야 합니다. 생략한 `status`는 `draft`, `is_secret`은 `false`, `tags`는 빈 배열이 됩니다. 승인 화면에서 실제 저장할 전체 필드와 본문 차이를 확인할 수 있습니다.

이미지는 단일 프레임 PNG/JPEG/WebP, 입력 및 정규화 결과 각각 2 MiB 이하, 1,600만 픽셀 이하만 허용합니다. 최대 1920×1920으로 축소하고 메타데이터를 제거한 PNG로 저장합니다. GIF·SVG·원격 URL 다운로드는 지원하지 않습니다. 파일명은 표시용으로만 사용하며 저장 경로에는 사용하지 않습니다.

## 승인 보장과 신뢰 경계

- MCP에는 승인·실행 도구가 없습니다. `approved=true`, 본문의 지시, 도구 설명, 모델의 자체 판단은 승인 근거가 아닙니다.
- 승인 경로 `/api/mcp/review/{id}`는 기존 관리자 HttpOnly 쿠키, 정상 관리자 세션, 동일 출처, 요청 내용과 세션에 바인딩된 CSRF 토큰, 관리자 비밀번호 재입력을 요구합니다. Authorization 헤더가 있으면 거절합니다.
- OAuth 토큰으로 기존 관리자 API에 접근할 수 없고, 기존 관리자 JWT로 MCP에 접근할 수도 없습니다.
- 승인 직전에 요청과 원본의 해시를 검증합니다. 원본 변경·요청 만료·연결 해제 시 실행하지 않습니다. 모델이 읽은 상태가 오래되면 새 제안이 필요합니다.
- 조건부 상태 갱신과 DB 행 잠금으로 중복 승인을 직렬화합니다. 변경·실행 상태·감사 기록을 같은 DB 트랜잭션에 저장합니다.
- 클라이언트의 도구 실행 확인은 추가 보호일 뿐 서버 승인을 대체하지 않습니다. 에이전트에 관리자 쿠키·비밀번호·승인 브라우저 제어권을 제공하면 사람과 자동화를 서버가 구별할 수 없습니다. 승인 브라우저는 사용자 전용으로 유지해야 합니다.

블로그 본문과 이미지 설명은 `untrusted_content`로 반환합니다. 승인 화면은 HTML을 이스케이프하고 스크립트·프레임·외부 리소스를 제한합니다. 범용 URL 요청·SQL·셸 실행 도구는 제공하지 않습니다. 이러한 경계는 모델이 콘텐츠의 악성 지시를 따르더라도 OAuth 권한 밖의 작업이나 자체 승인을 실행하지 못하도록 구성되어 있습니다. 모델 자체의 Prompt Injection 내성은 보장하지 않습니다.

## OAuth 설정

`SITE_URL`은 경로 없는 공개 HTTPS origin이어야 합니다. 예: `https://blog.clazycoder.org`.

```dotenv
MCP_ENABLED=true
MCP_OAUTH_MODE=local
MCP_OAUTH_CLIENTS='[{"client_id":"blog-local-client","redirect_uris":["http://127.0.0.1:8765/callback"],"token_endpoint_auth_method":"none","scope":"blog:read images:read blog:read_private images:read_private blog:propose images:propose"}]'
MCP_OAUTH_REGISTRATION_REDIRECTS=
```

위 클라이언트는 로컬 개발 예시입니다. 실제 OpenAI/Anthropic 클라이언트가 제공한 client ID와 정확한 callback URI로 교체해야 합니다. 외부 callback은 HTTPS, 로컬 callback만 loopback HTTP를 허용합니다. wildcard·임의 callback 등록은 지원하지 않습니다. 공개 클라이언트는 `none`과 PKCE S256을 사용합니다. 기밀 클라이언트는 SDK가 지원하는 인증 방식과 `client_secret`을 설정할 수 있으며 비밀 값은 저장소에 커밋하지 않아야 합니다.

동적 등록이 필요한 클라이언트는 `MCP_OAUTH_REGISTRATION_REDIRECTS`에 신뢰할 수 있는 callback URI를 정확히 등록합니다. 그 경우에만 `/register`가 활성화됩니다. 자동으로 알려지지 않은 callback을 신뢰하거나 외부 메타데이터 URL을 가져오지 않습니다. Client ID Metadata Document 방식은 현재 지원하지 않습니다.

| 경로 | 용도 |
| --- | --- |
| `/mcp` | 표준 Streamable HTTP, JSON 응답, stateless transport |
| `/.well-known/oauth-protected-resource/mcp` | 리소스·권한 서버·scope 발견 |
| `/.well-known/oauth-authorization-server` | OAuth 서버 메타데이터 |
| `/authorize`, `/token`, `/revoke` | 코드+PKCE 인가, 토큰 발급·회전, 연결 취소 |
| `/api/mcp/oauth/consent/{id}` | 사용자 전용 권한 동의 화면 |
| `/admin` | 승인 요청, 연결·권한, 이미지, 처리 이력 |

액세스 토큰은 15분, refresh token은 최대 7일, 연결은 최대 30일 유효합니다. 인가 코드는 60초·1회용이며 refresh token은 회전합니다. 유효한 코드/refresh token 재사용이 감지되면 해당 연결 전체를 폐기합니다. 토큰 원문은 DB에 저장하지 않고 SHA-256 식별자로 보관합니다. 연결 해제는 후속 토큰 검증과 승인에 즉시 적용됩니다. 이미 실행 중인 트랜잭션은 행 잠금 순서에 따라 연결 해제보다 먼저 완료될 수 있습니다.

| Scope | 권한 |
| --- | --- |
| `blog:read` | 공개 글 조회 |
| `blog:read_private` | `blog:read`에 추가하여 초안·비밀글 조회 |
| `blog:propose` | `blog:read_private`와 함께 글 변경 제안 |
| `images:read` | 공개 글에 연결된 공개 이미지 조회 |
| `images:read_private` | `images:read`에 추가하여 비공개·미연결 이미지 조회 |
| `images:propose` | `images:read_private`와 함께 이미지 변경 제안 |

권한 동의 화면에서는 공개 읽기만 기본 선택합니다. 연결된 이미지가 있는 글을 바꾸려면 이미지의 비공개 읽기·변경 제안 권한도 필요합니다. 글에 연결된 이미지를 바꾸려면 글의 비공개 읽기·변경 제안 권한도 필요합니다. 권한 부족 시 자동 확장하지 않습니다.

외부 OAuth가 이미 있는 경우 `MCP_OAUTH_MODE=external`, `MCP_OAUTH_ISSUER`, `MCP_OAUTH_JWKS_URL`, `MCP_OAUTH_ADMIN_SUBJECT`, `MCP_OAUTH_CLIENT_IDS`로 RS256 JWT 검증 모드를 선택할 수 있습니다. issuer·audience(`/mcp` URL)·subject·client·scope·만료·jti를 검증하며 수명은 최대 15분입니다. 외부 토큰의 원격 폐기 상태를 조회하지 않으므로 즉시 연결 해제와 관리자 연결 목록은 로컬 OAuth 모드에서만 제공됩니다. 기본 권장 구성은 로컬 모드입니다.

## 설치와 배포

1. 기존 DB와 uploads 볼륨을 백업합니다. `.env.example`을 참고하여 origin, OAuth 클라이언트, Redis 인증을 설정합니다.
2. `server`에서 `uv sync --frozen --extra dev`, `uv run alembic upgrade head`로 의존성과 마이그레이션을 적용합니다. 신규 revision은 `7e9a1c2d4f60`입니다. 기존 데이터는 유지하며 MCP 테이블 3개와 이미지 보존 플래그를 추가합니다.
3. 기존 배포 방식으로 백엔드와 프론트엔드를 함께 빌드합니다. Docker entrypoint도 기존 방식대로 migration을 수행합니다.
4. nginx의 `/mcp`, OAuth 및 well-known 경로를 백엔드로 전달합니다. 저장소 nginx 설정에 반영되어 있습니다. Cloudflare가 해당 기계 클라이언트 경로에 브라우저 챌린지·HTML 인증 페이지·캐시를 반환하지 않도록 별도로 확인해야 합니다. 관리자 승인 화면은 기존 브라우저 인증을 유지합니다.
5. 공개 HTTPS에서 metadata, OAuth+PKCE 연결, `list_posts`, 승인 전후 상태를 확인합니다. 이 저장소의 로컬 테스트는 운영 Cloudflare 정책이나 실제 모델 계정 연결을 검증하지 않습니다.

롤백 시 먼저 `MCP_ENABLED=false`로 비활성화합니다. 감사 기록·idempotency 정보·보존 플래그가 사라지는 migration downgrade는 운영에서 권장하지 않습니다. MCP 테이블을 유지한 채 코드를 되돌릴 수 있지만, 이전 cleanup 코드는 보존 플래그를 무시하므로 이미지 정리 작업을 중지해야 합니다.

## 호출 예시

공식 Python SDK로 이미 취득한 액세스 토큰을 사용하는 예시입니다. 토큰은 환경변수나 비밀 저장소로 전달하고 모델 대화나 명령 인수에 포함하지 않아야 합니다.

```python
import asyncio, os
import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

async def main():
    async with httpx.AsyncClient(headers={
        "Authorization": "Bearer " + os.environ["BLOG_MCP_ACCESS_TOKEN"]
    }) as http:
        async with streamable_http_client(
            "https://blog.clazycoder.org/mcp", http_client=http
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                print(await session.call_tool("list_posts", {"limit": 10}))
                # A mutation returns a review URL; only the user opens and approves it.
                proposal = await session.call_tool("create_post", {
                    "post": {"title": "새 글", "content": "본문", "status": "draft"},
                    "idempotency_key": "draft-example-20261021-01"
                })
                print(proposal)

asyncio.run(main())
```

idempotency key는 클라이언트·사용자 범위에서 8~128자의 영문·숫자·`_.:-`를 사용합니다. 같은 내용과 키를 재전송하면 기존 요청을 반환합니다. 다른 내용으로 재사용하면 충돌합니다. 만료·거절된 요청도 같은 키로 다시 실행되지 않습니다. 수정한 제안에는 새 키가 필요합니다. 제안은 최대 10분 또는 해당 액세스 토큰 만료 시점까지 유효합니다.

OpenAI Responses API와 Anthropic Messages MCP connector에 `/mcp` URL 및 OAuth 액세스 토큰을 제공할 수 있는 표준 전송 구조입니다. OAuth 흐름을 직접 수행하지 않는 API 통합은 호스트 애플리케이션에서 먼저 토큰을 받아야 합니다. 각 제품의 UI, 요금제, callback, 동적 등록 지원은 달라질 수 있으므로 실제 연결 전 해당 제품 문서를 확인해야 합니다. 특정 제품과의 운영 연결 완료를 의미하지 않습니다.

## 데이터 보존과 운영 한계

- MCP 삭제는 소프트 삭제입니다. 이미지 교체는 새로운 고유 파일을 생성하고 연결된 글의 로컬 이미지 주소를 갱신합니다. 이전 파일은 보존합니다. 외부에서 사용한 기존 URL은 갱신하지 않습니다.
- MCP가 변경한 이미지는 `mcp_managed=true`로 표시하여 기존 자동 orphan 정리와 purge에서 제외합니다. 관리자 이미지 화면에서 직접 선택하여 삭제하면 명시적인 영구 삭제가 됩니다.
- DB와 파일시스템은 단일 트랜잭션이 아닙니다. 파일 생성 후 DB rollback/crash 시 미참조 파일이 남을 수 있으나 기존 파일을 덮어쓰지 않습니다. 복구·보존 파일의 영구 정리는 관리자 확인 후 수행해야 합니다.
- 감사 기록은 애플리케이션에서 append-only로 사용하지만 DBA에 대한 변조 방지 로그는 아닙니다. 필요하면 DB 접근 권한을 제한하고 외부 보관소로 export해야 합니다. 요청 snapshot에는 비공개 글 내용이 포함될 수 있으므로 DB와 백업 접근을 보호해야 합니다.
- 제안은 동시에 최대 50개, 하루 최대 200개로 제한합니다. tool 호출은 클라이언트·사용자별 분당 60회, 주요 MCP/OAuth 경로는 IP별 분당 120회입니다. Redis가 응답하지 않으면 허용하지 않습니다.
- 만료된 제안의 이미지 staging bytes는 다음 제안 생성 시 제거합니다. 감사·idempotency 기록과 만료 OAuth 행은 자동 삭제하지 않습니다. 보존 정책에 맞춘 별도 정리가 필요합니다. IP별 제한은 전역 공격량을 제한하는 대체 수단이 아니므로 기존 edge 제한도 유지해야 합니다.

## 검증

```sh
cd server
uv run pytest tests -q
cd ../client
npm ci
npm run lint
npm run build
```

회귀 테스트는 격리된 SQLite·가짜 Redis를 사용합니다. MCP 테스트는 실제 SDK OAuth 및 HTTP 경로를 통해 승인 우회, CSRF, scope, PKCE, 재사용, stale 상태, rollback, 이미지 보존을 검증합니다. PostgreSQL 동시성 테스트는 `MCP_TEST_POSTGRES_URL`을 명시한 별도 테스트 DB에서만 실행하도록 구성합니다.

참고: [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [공식 Python SDK](https://github.com/modelcontextprotocol/python-sdk), [OpenAI MCP 연결](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), [Anthropic MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector).
