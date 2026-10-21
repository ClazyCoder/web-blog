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

## 서버 설정과 앱 연결

서버 배포 설정은 기존 DB·Redis·관리자 인증 외에 공개 HTTPS 주소와 활성화 여부만 필요합니다. 클라이언트 ID, 비밀값, 콜백 목록을 환경 변수에 넣지 않습니다.

```dotenv
SITE_URL=https://blog.clazycoder.org
MCP_ENABLED=true
```

1. 관리자 페이지의 **연결·권한**에서 MCP 서버 주소를 복사합니다.
2. 사용하는 앱의 원격 MCP 연결 화면에 주소를 입력합니다. 자동 등록(DCR)을 지원하면 사전 ID 발급은 필요하지 않습니다.
3. 앱이 여는 블로그 OAuth 화면에서 관리자 계정으로 로그인합니다. 앱 이름은 자체 신고 정보입니다. 직접 연결한 앱인지 실제 반환 주소와 함께 확인합니다.
4. 필요한 권한만 선택하고 관리자 비밀번호로 연결에 동의합니다. 연결을 허용해도 글·이미지 변경은 건별 승인이 필요합니다.

앱이 수동 ID/비밀값을 요구하면 **앱에서 클라이언트 ID·비밀값을 요구하나요? → 수동 클라이언트 등록**을 사용합니다. 해당 앱이 안내한 정확한 반환 주소와 요청 가능한 권한 상한을 입력합니다. 비밀값을 보관할 수 없는 공개 클라이언트는 `none`+PKCE, 기밀 클라이언트는 `client_secret_post`+PKCE를 사용합니다. 공개 클라이언트도 PKCE S256은 필수입니다. `client_secret_basic`, CIMD, client_credentials, implicit grant는 지원하거나 광고하지 않습니다.

자동 등록과 수동 등록은 같은 검증을 사용합니다. HTTPS 또는 loopback HTTP 콜백을 최대 10개 허용하며, 사용자 정보·fragment·wildcard·역슬래시·제어 문자가 있는 주소는 거절합니다. 등록은 접근 승인이나 신원 검증이 아닙니다. 이름과 외부 URI는 신뢰하지 않으며 로고·메타데이터를 서버가 다운로드하지 않습니다. 등록 직후에는 액세스 토큰이 없고 관리자 동의 없이 콘텐츠를 읽을 수 없습니다. DCR의 scope 생략은 서버가 지원하는 scope를 요청 가능한 상한으로 등록합니다. 이것은 권한 부여가 아닙니다. OAuth 연결 요청에서 scope를 생략하면 등록된 공개 읽기 범위만 요청하고, 실제 토큰에는 사용자가 동의한 범위만 포함합니다. grant_types 생략은 authorization_code만 허용합니다. refresh_token을 요청한 클라이언트에만 갱신 토큰을 발급합니다.

등록부와 활성 연결은 DB에서 별도로 관리합니다. 수동 등록은 최대 100개이며 재시작 후에도 유지됩니다. 설정 수정·비밀값 재발급·등록 삭제는 같은 트랜잭션에서 해당 클라이언트의 모든 연결과 미처리 동의를 폐기합니다. 이 변경으로 기존 토큰과 대기 중 변경 승인도 사용할 수 없으며, 다시 사용하려면 새로 연결해야 합니다. 자동 등록 메타데이터는 수정하지 않으며 앱에서 재연결합니다. **연결 해제**는 특정 동의의 권한만 폐기하고 앱 등록 자체는 유지합니다.

관리 API는 관리자 쿠키, 동일 출처, CSRF, 명시적인 작업 종류와 비밀번호 재확인을 요구합니다. 조회 응답에는 비밀값을 포함하지 않습니다. 생성·재발급 시 한 번 반환되는 비밀값은 안전하게 보관합니다. 저장 시 기존 `SECRET_KEY`에서 용도별로 파생한 Fernet 키로 암호화하며, DB 단독 유출에 대비한 보호입니다. DB와 서버 키가 함께 유출되면 보호되지 않습니다. `SECRET_KEY` 변경 시 비밀값을 사용하는 등록은 재발급 또는 재등록이 필요합니다. 응답을 잃어버린 경우 목록에서 상태를 확인하고 비밀값을 재발급합니다. 같은 생성 확인 정보로 재시도해도 등록을 중복 생성하지 않습니다.

익명 OAuth 저장량은 IP 제한과 별도로 제한합니다. 동의 요청은 전체 100개·클라이언트별 10개, 동적 등록은 전체 100개·각 callback별 10개까지 허용하며, 여러 callback을 등록하면 각각의 한도를 적용합니다. 저장할 동의 파라미터와 클라이언트 메타데이터는 UTF-8 JSON 기준 각각 4 KiB 이하입니다. 초과 시 OAuth 오류를 반환하며 새 레코드를 저장하지 않습니다. 동시 요청도 PostgreSQL 트랜잭션 잠금(SQLite 개발 환경은 즉시 쓰기 잠금)으로 동일한 한도를 공유합니다.

사용하지 않은 동적 등록은 24시간 후 만료됩니다. 진행 중인 동의 절차는 완료할 수 있으며 활성 연결이 있는 등록은 연결 만료·해제 전까지 유지합니다. 활성 연결이 없는 만료 등록으로 새 동의 절차를 시작하려면 다시 등록해야 합니다. 만료·처리 완료 동의 요청과 의존성이 없는 만료 등록은 서버 시작 시, 새 요청 저장 전, 이후 60초 간격으로 정리합니다. 이전 버전의 장기 등록에는 최초 정리 시 24시간의 유예 기간을 부여합니다. 관리자 수동 등록에는 등록 만료를 적용하지 않습니다. 익명 한도 고갈은 신규 등록을 거절하므로 가용성 공격이 완전히 사라지는 것은 아닙니다. 기존 연결을 퇴출하여 자리를 만들지는 않습니다.

| 경로 | 용도 |
| --- | --- |
| `/mcp` | 표준 Streamable HTTP, JSON 응답, stateless transport |
| `/.well-known/oauth-protected-resource/mcp` | 리소스·권한 서버·scope 발견 |
| `/.well-known/oauth-authorization-server` | OAuth 서버 메타데이터 |
| `/authorize`, `/token`, `/revoke` | 코드+PKCE 인가, 토큰 발급·회전, 연결 취소 |
| `/register` | 등록 후에도 별도 관리자 동의가 필요한 표준 DCR |
| `/api/mcp/admin/clients` | 브라우저 전용 클라이언트 목록·등록·수정·재발급·삭제 |
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

## 이전 구현에서 전환

환경 변수 기반 클라이언트 및 콜백 등록은 제거되었습니다. 이전 `MCP_OAUTH_CLIENTS`, `MCP_OAUTH_REGISTRATION_REDIRECTS` 값을 자동으로 가져오거나 재시작 때 복원하지 않습니다. 기존 환경 변수 정적 클라이언트는 관리자 화면에서 새 ID를 발급하거나 앱의 자동 등록을 통해 **다시 연결해야 합니다**. 기존 DB 동적 등록과 그 유효한 연결은 유지됩니다. 글·이미지·감사 기록은 삭제하지 않습니다.

외부 JWT 검증 모드는 로컬 연결과 같은 즉시 폐기를 보장하지 못하므로 제거했습니다. 해당 모드를 사용했다면 로컬 OAuth로 다시 연결해야 합니다. 직접 서버 실행 시 `MCP_OAUTH_MODE=external`이 남아 있으면 전환 안내 오류로 시작을 중단합니다. Compose는 더 이상 이전 OAuth 환경 변수를 전달하지 않습니다. 외부 IdP 연동은 폐기·동의 수명까지 통합하는 별도 설계가 필요합니다.

상세 설계와 검증 기준은 [MCP 보안 설계](MCP-SECURITY-DESIGN.md)를 참고해 주세요.

## 설치와 배포

1. 기존 DB와 uploads 볼륨을 백업합니다. `.env.example`을 참고하여 공개 origin, MCP 활성화, Redis 인증을 설정합니다. 클라이언트 등록 설정은 필요하지 않습니다.
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
- 만료된 제안의 이미지 staging bytes는 다음 제안 생성 시 제거합니다. OAuth 동의 요청과 미사용 동적 등록은 위 정책으로 자동 정리합니다. 감사·idempotency 기록 및 OAuth 연결·인가 코드·토큰 재사용 탐지 기록은 유지하므로 별도 보존 정책이 필요합니다. 기존에 한도를 초과하여 저장된 유효 데이터는 임의로 삭제하지 않으며, 만료 정리로 한도 아래가 될 때까지 새 저장을 거절합니다. IP별 제한은 전역 공격량을 제한하는 대체 수단이 아니므로 기존 edge 제한도 유지해야 합니다.

## 검증

### 동의 후 콜백이 열리지 않는 경우

동의 POST의 `303`은 서버에서 인가 코드를 생성했다는 뜻이며 클라이언트 연결 완료를 증명하지 않습니다. 동의 페이지의 CSP는 `'self'`와 **해당 요청의 검증된 콜백 출처**만 `form-action`에 허용합니다. Chromium은 폼 제출 이후 리다이렉트에도 이 정책을 적용하므로 `'self'`만 허용하면 303 이후 화면이 멈출 수 있습니다. 글·이미지 변경 승인 페이지는 계속 `'self'`만 허용합니다.

MCP HTML 페이지는 `Referrer-Policy: same-origin`을 사용합니다. `no-referrer`를 HTML 폼 페이지에 적용하면 브라우저가 정상 POST의 `Origin`을 `null`로 보낼 수 있습니다. 출처 검사를 완화하는 대신 이 정책으로 동일 출처 POST를 유지하고 외부로는 Referer를 보내지 않습니다. OAuth 리다이렉트와 JSON 응답에는 `no-referrer`를 유지합니다. 앞단 프록시에서 더 제한적인 `form-action 'self'` 또는 `Referrer-Policy: no-referrer`를 HTML 응답에 추가하면 동일 문제가 재발할 수 있습니다.

관리자 화면은 인증 코드 교환 대기, 토큰 발급 완료, 유효한 토큰 없음 상태를 구분합니다. 토큰 발급 완료 역시 클라이언트가 응답을 저장했다는 보장은 아닙니다. 앱 등록만으로 데이터 접근 권한은 생기지 않습니다. 이미 소비되었거나 만료된 동의 페이지를 재제출하지 말고 클라이언트에서 연결 절차를 새로 시작해야 합니다. 서버는 인가 코드를 다시 노출하거나 재사용하지 않습니다.

관리자 MCP 현황·앱 목록·이미지 통계와 목록 GET은 조회 횟수 제한에서 제외합니다. 관리자 인증은 유지하며 로그인, 비밀번호 재확인이 필요한 변경 POST, OAuth/MCP 공개 진입점 제한은 유지합니다.

### 브라우저 회귀 확인

격리된 테스트 DB와 관리자 계정으로, 블로그와 다른 출처의 콜백 서버를 등록하여 실제 브라우저에서 확인합니다. API 테스트가 `Location`을 직접 파싱하는 것만으로는 브라우저의 CSP 차단을 발견할 수 없습니다.

1. DCR → `/authorize` → 관리자 로그인 → 동의 화면을 엽니다. 앱의 PKCE verifier와 state는 콜백 서버가 보관합니다.
2. 공개 읽기 권한을 허용하고 **브라우저가 콜백으로 이동하는지** 확인합니다. 콜백 서버에서 state 검증, `/token` 교환, `/mcp` 초기화까지 확인합니다.
3. 새 연결에서 거절하여 콜백에 `error=access_denied`와 원래 state가 전달되고 토큰이 발급되지 않는지 확인합니다.
4. 동의 전후 관리자 상태를 비교하고 코드 교환 전에는 토큰 발급 완료로 표시되지 않는지 확인합니다. 데스크톱과 좁은 화면에서 상태를 읽을 수 있어야 합니다.

참고: [CSP form-action](https://www.w3.org/TR/CSP/#directive-form-action), [Fetch Origin 처리](https://fetch.spec.whatwg.org/#append-a-request-origin-header).

### 자동 테스트

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
