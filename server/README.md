# Web Blog Server

FastAPI 기반 백엔드 API 서버입니다.  
게시글/이미지/인증 API와 Redis 기반 캐시·토큰 블랙리스트·rate limit를 제공합니다.

## 핵심 기능

- JWT 인증 (`/api/auth/login`, `/refresh`, `/me`, `/logout`), Redis 블랙리스트, `/api/auth/refresh` rate limit
- 게시글 CRUD + 슬러그 조회 + 조회수 증가 + 비밀글 처리 + 서버측 HTML 정제(`nh3`)
- 이미지 업로드/최적화(5MB 스트리밍 제한, magic-bytes 검증, 리사이즈, 포맷별 압축) 및 게시글 자동 연결
- orphan 이미지 자동 정리 스케줄러 + 관리자 수동 정리 API
- Redis 캐시(목록/상세/태그) 및 캐시 무효화
- `ENV=production`에서 문서 엔드포인트 자동 비활성화

## 빠른 시작

```bash
cd server
cp .env.example .env
uv sync
alembic upgrade head
python main.py
```

- API: `http://localhost:8000`
- Docs(개발 모드): `http://localhost:8000/docs`

> [!WARNING]
> 인증 쿠키가 `secure=True`로 설정되어 있어 HTTPS 환경을 전제로 합니다. 로컬 HTTP 환경에서는 브라우저 정책에 따라 쿠키 전달 동작을 반드시 점검하세요.

## API 개요

### Auth

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/auth/login` | 로그인 및 쿠키 발급 |
| `POST` | `/api/auth/refresh` | 리프레시 토큰으로 재발급(회전, IP당 분당 10회 제한) |
| `GET` | `/api/auth/me` | 현재 사용자 조회 |
| `POST` | `/api/auth/logout` | 로그아웃 + 블랙리스트 등록 |

### Posts

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/posts` | 목록(검색/태그/상태/비밀글 필터) |
| `GET` | `/api/posts/tags` | 태그 집계/목록 |
| `GET` | `/api/posts/{post_id}` | 상세 조회 |
| `GET` | `/api/posts/slug/{slug}` | 슬러그 조회 |
| `POST` | `/api/posts` | 생성(인증 필요) |
| `PUT` | `/api/posts/{post_id}` | 수정(인증 필요) |
| `DELETE` | `/api/posts/{post_id}` | 삭제(인증 필요) |
| `POST` | `/api/posts/{post_id}/view` | 조회수 증가 |

### Images

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/upload/image` | 이미지 업로드(인증 필요, 5MB 스트리밍 제한 + 실제 이미지 포맷 검증) |
| `GET` | `/api/upload/temp/{filename}` | 임시 이미지 정보 |
| `DELETE` | `/api/upload/image/{filename}` | 이미지 삭제(인증 필요) |
| `GET` | `/api/upload/admin/orphans` | orphan 통계(인증 필요) |
| `GET` | `/api/upload/admin/orphans/list` | orphan 목록(인증 필요) |
| `POST` | `/api/upload/admin/cleanup` | 강제 정리(인증 필요) |

## 환경 변수

```env
ENV=development
SECRET_KEY=change-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
ADMIN_EMAIL=admin@example.com

# 개별 DB 설정 또는 DATABASE_URL 중 하나 사용
DB_HOST=
DB_PORT=5432
DB_USER=
DB_PASSWORD=
DB_NAME=
DATABASE_URL=sqlite+aiosqlite:///./blog.db

# optional
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
BASE_URL=http://localhost:8000
SITE_URL=
SITE_NAME=YSG Blog
```

> [!WARNING]
> `SECRET_KEY`, `ADMIN_PASSWORD`, `DB_PASSWORD`/`DATABASE_URL`, `REDIS_URL`은 반드시 실제 비밀값으로 설정하고, 예시 자격증명이나 기본 비밀번호를 재사용하지 마세요.
>
> `SITE_URL`은 프로덕션에서 Open Graph URL 생성을 위해 설정을 권장합니다. 비워두면 개발용 요청 정보만 사용합니다.

> [!NOTE]
> DB 접속은 `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME`가 모두 있으면 이를 우선 사용하고, 없으면 `DATABASE_URL`로 동작합니다.

## 개발 명령어

```bash
uv sync --extra dev
pytest
```

DB 스키마/운영 상세는 [`README_DB.md`](./README_DB.md)를 참고하세요.
