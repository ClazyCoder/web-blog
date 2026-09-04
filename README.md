# Web Blog

React + FastAPI 기반의 개인 블로그 플랫폼입니다.  
마크다운 에디터, 이미지 업로드/정리, JWT 쿠키 인증, Redis 캐시/블랙리스트, 관리자용 이미지 정리 기능을 제공합니다.

## 빠른 링크

- 프론트엔드 가이드: [`client/README.md`](./client/README.md)
- 백엔드 가이드: [`server/README.md`](./server/README.md)
- DB 운영/마이그레이션: [`server/README_DB.md`](./server/README_DB.md)

## 핵심 기능

- 마크다운 에디터(실시간 미리보기, 코드 하이라이트, KaTeX/ Mermaid 렌더링)
- 게시글 CRUD(초안/발행, 태그/검색/페이지네이션, 슬러그 기반 조회)
- 비밀글(`is_secret`) 및 인증 사용자 전용 조회 흐름
- 이미지 업로드(5MB 제한, 스트리밍 크기 검사, 포맷 검증, 최적화, 게시글 본문 기반 자동 연결/해제)
- orphan 이미지 자동 정리(스케줄러 + 관리자 강제 정리 API)
- JWT 쿠키 인증(Access + Refresh Rotation, Redis 블랙리스트, `/api/auth/refresh` rate limit)

## 기술 스택

- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Backend: FastAPI, SQLAlchemy Async, Alembic, Redis, slowapi
- Infra: Docker Compose, PostgreSQL, nginx

## 프로젝트 구조

```text
web-blog/
├─ client/              # React 앱
├─ server/              # FastAPI API 서버
├─ docker-compose.yaml  # 통합 실행
└─ .env.example         # compose용 환경 변수 예시
```

## 실행 방법

### 1) Docker Compose (권장)

```bash
cp .env.example .env
docker compose up -d --build
```

- App: `http://localhost:8080`
- API(직접): `http://localhost:8000` (개발 모드에서만 docs 사용 권장)

### 2) 로컬 개발

```bash
# terminal 1
cd server
cp .env.example .env
uv sync
alembic upgrade head
python main.py

# terminal 2
cd client
cp .env.example .env.local
npm install
npm run dev
```

- Client dev: `http://localhost:5173`
- API dev: `http://localhost:8000`

> [!NOTE]
> Docker Compose 환경에서는 서버가 `ENV=production`으로 실행되어 `/docs`, `/redoc`, `/openapi.json`이 비활성화됩니다.

## 환경 변수

루트 `.env`는 Docker Compose용입니다.

```env
# required
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
SECRET_KEY=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...

# optional
POSTGRES_DB=blog_db
POSTGRES_USER=blog_user
ADMIN_EMAIL=admin@example.com
SITE_URL=https://yourdomain.com
SITE_NAME=YSG Blog
```

`ADMIN_EMAIL` is embedded in the client bundle for the footer, so rebuild the `client` image after changing it (for example, `docker compose up -d --build client`).
> [!WARNING]
> `SECRET_KEY`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`는 예시값으로 두지 말고 배포 전 반드시 강한 값으로 교체하세요. `SITE_URL`은 프로덕션에서 Open Graph canonical URL 생성을 위해 설정을 권장합니다.

세부 변수는 각 문서를 참고하세요.

- [`client/README.md`](./client/README.md)
- [`server/README.md`](./server/README.md)
