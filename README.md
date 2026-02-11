# Web Blog

모던 풀스택 블로그 플랫폼 — **React 19 + FastAPI + Redis**

마크다운 기반 에디터, 실시간 미리보기, 이미지 업로드, JWT 인증 (리프레시 토큰 자동 갱신), Redis 캐싱, 이미지 자동 정리 등을 지원하는 개인 블로그 시스템입니다.

---

## 프로젝트 구조

```
web-blog/
├── client/                   # React + TypeScript 프론트엔드
│   ├── src/
│   │   ├── components/       # 재사용 컴포넌트 (ContentCard, EditorSidebar, ...)
│   │   ├── context/          # AuthContext (인증 상태 관리)
│   │   ├── hooks/            # 커스텀 훅 (useDebounce, ...)
│   │   ├── layouts/          # 페이지 레이아웃 (Header, Footer, Editor, Board, ...)
│   │   ├── routes/           # 라우트 컴포넌트
│   │   └── utils/            # API 클라이언트, 네비게이션 가드
│   ├── Dockerfile            # 멀티 스테이지 빌드 (Node + nginx)
│   ├── nginx.conf            # nginx 설정 (프록시 + 정적 서빙)
│   ├── package.json
│   └── vite.config.ts
│
├── server/                   # FastAPI 비동기 백엔드
│   ├── models/               # SQLAlchemy ORM 모델 (Post, Image)
│   ├── routers/              # API 라우터 (auth, post, image)
│   ├── schemas/              # Pydantic 스키마 (요청/응답 검증)
│   ├── services/             # 백그라운드 서비스 (이미지 정리 등)
│   ├── db/                   # 데이터베이스 세션 + Redis 연결 관리
│   ├── blog/                 # Alembic 마이그레이션
│   ├── main.py               # FastAPI 앱 진입점
│   ├── auth.py               # JWT 인증 로직 (액세스 + 리프레시 토큰)
│   ├── rate_limit.py         # 공유 Rate Limiter (Redis/인메모리)
│   ├── Dockerfile            # Python + uv 기반 빌드
│   ├── entrypoint.sh         # 마이그레이션 + 서버 시작
│   └── pyproject.toml
│
├── docker-compose.yaml       # Docker Compose 설정
├── LICENSE                   # Apache License 2.0
└── README.md
```

---

## 주요 기능

### 블로그 포스트

| 기능 | 설명 |
|------|------|
| 포스트 CRUD | 생성, 조회, 수정, 삭제 (소프트 삭제 지원) |
| 마크다운 에디터 | 분할 화면 실시간 미리보기, 리사이징 가능 |
| 에디터 툴바 | 제목, 볼드, 이탤릭, 코드, 링크, 이미지, 리스트, 인용, 코드 블록 |
| GFM 지원 | GitHub Flavored Markdown (테이블, 체크리스트 등) |
| 코드 하이라이팅 | Highlight.js 기반 구문 강조 |
| 임시 저장/발행 | 초안(draft) 모드와 발행(published) 모드 분리 |
| 임시저장 배너 | 새 글 작성 시 기존 임시저장 글 목록 표시 및 이어쓰기 |
| 태그 시스템 | 포스트당 최대 10개 태그, 태그 기반 필터링, 전체 태그 목록 API |
| 검색 | 제목/내용 전문 검색 (대소문자 무시) |
| 페이지네이션 | 목록 페이지 단위 페이지 처리 |
| 조회수 추적 | 별도 POST 엔드포인트, Redis 기반 IP 중복 조회 방지 (1시간 TTL) |
| 슬러그 URL | 제목 기반 고유 슬러그 자동 생성 (ID 포함 중복 방지) |

### 이미지 관리

| 기능 | 설명 |
|------|------|
| 드래그 앤 드롭 | 에디터에 이미지 드래그 앤 드롭 업로드 |
| 클립보드 붙여넣기 | Ctrl+V로 이미지 즉시 업로드 |
| 파일 선택 | 파일 탐색기를 통한 업로드 |
| 업로드 진행률 | 업로드 상태 실시간 표시 |
| 이미지 사이드바 | 업로드된 이미지 관리 (삽입, 삭제) |
| 자동 연결 | 포스트 저장 시 마크다운 내 이미지 자동 연결/해제 |
| 썸네일 | 포스트 첫 번째 이미지를 썸네일로 자동 추출 |
| 파일 검증 | 허용 확장자 (jpg, png, gif, webp), 최대 5MB |

### Orphan 이미지 자동 정리

| 기능 | 설명 |
|------|------|
| 백그라운드 스케줄러 | asyncio 기반 주기적 실행 (1시간 간격) |
| 분산 락 | Redis SETNX 기반 — 멀티 워커 환경에서 중복 실행 방지 |
| 임시 이미지 정리 | 업로드 후 게시글에 미연결 상태로 24시간 경과 시 자동 삭제 |
| Soft-delete 영구 삭제 | 소프트 삭제 후 7일 경과 시 파일 + DB 레코드 영구 삭제 |
| 관리 API | Orphan 현황 조회, 목록 조회 및 수동 정리 실행 엔드포인트 제공 |
| 관리자 페이지 | 고아 이미지 통계, 목록 확인, 개별 삭제 및 일괄 정리 UI (로그인 시 Header에 Admin 링크 표시) |

### 인증 시스템

| 기능 | 설명 |
|------|------|
| JWT 이중 토큰 | 액세스 토큰 (30분) + 리프레시 토큰 (7일) |
| HttpOnly 쿠키 | Secure + SameSite=Lax, 리프레시 토큰은 `/api/auth` 경로 제한 |
| 로그인 유지 | "로그인 유지" 체크박스 — 체크 시 리프레시 토큰 발급 |
| 자동 토큰 갱신 | 액세스 토큰 만료 시 Axios 인터셉터가 자동으로 `/api/auth/refresh` 호출 후 원래 요청 재시도 |
| 동시 요청 처리 | 여러 요청이 동시에 401을 받아도 하나의 refresh만 실행, 나머지는 대기 후 재시도 |
| 토큰 블랙리스트 | 로그아웃/토큰 회전 시 Redis에 JTI 등록 (TTL = 토큰 남은 수명) |
| Refresh Token Rotation | 리프레시 시 이전 토큰을 블랙리스트에 등록하여 재사용 차단 |
| 에디터 세션 보호 | 토큰 갱신 실패 시에도 편집 내용 보존, 새 탭에서 재로그인 안내 |
| 관리자 계정 | 환경 변수 기반 단일 관리자 설정 |
| Bearer 토큰 | 레거시 Authorization 헤더 지원 |

### UI/UX

| 기능 | 설명 |
|------|------|
| 반응형 디자인 | 모바일/태블릿/데스크톱 대응 (Tailwind CSS) |
| 다크 모드 | 시스템 테마 자동 감지 (`prefers-color-scheme`) |
| 반응형 에디터 | 모바일: 편집/미리보기 토글, 데스크톱: 분할 화면 + 리사이징 |
| 미저장 변경 감지 | 에디터에서 이탈 시 확인 다이얼로그 (beforeunload + SPA 가드) |
| 세션 만료 대응 | 에디터에서 세션 만료 시 작성 중 내용 보존 + 자동 토큰 갱신 시도 |
| 로딩/에러 상태 | 모든 비동기 요청에 대한 상태 처리 |
| XSS 방어 | 이미지/링크 URL 검증, HTML 태그 제거, 파일명 정제 |

### Redis 활용

| 기능 | Redis 키 패턴 | TTL | 설명 |
|------|--------------|-----|------|
| Rate Limiting | slowapi 내부 관리 | 자동 | 분산 환경에서 모든 워커가 동일한 카운터 공유 |
| 토큰 블랙리스트 | `blacklist:{jti}` | 토큰 남은 수명 | 로그아웃/토큰 회전 시 즉시 무효화 |
| 조회수 중복 방지 | `view:{post_id}:{ip}` | 1시간 | 같은 IP의 반복 조회 카운트 차단 |
| 게시글 목록 캐싱 | `cache:posts:list:{params}` | 5분 | 검색어 없는 목록 요청 캐싱 |
| 태그 목록 캐싱 | `cache:posts:tags` | 10분 | 전체 태그 목록 캐싱 |
| 게시글 상세 캐싱 | `cache:posts:detail:{id}` | 10분 | published 게시글 개별 캐싱 |
| 슬러그 조회 캐싱 | `cache:posts:slug:{slug}` | 10분 | 슬러그 기반 조회 캐싱 |
| 분산 락 | `lock:{name}` | 10분 | 이미지 클린업 스케줄러 중복 실행 방지 |

- **Graceful Degradation**: `REDIS_URL` 미설정 또는 Redis 미연결 시 모든 Redis 기능이 무시되고 기존과 동일하게 동작 (개발 환경에서 Redis 없이도 정상 동작)
- **캐시 무효화**: 게시글 CUD 시 `cache:posts:*` 패턴 일괄 삭제

---

## 기술 스택

### 프론트엔드

| 기술 | 버전 | 용도 |
|------|------|------|
| React | 19.2 | UI 프레임워크 |
| TypeScript | 5.9 | 정적 타입 |
| Vite | 7.2 | 빌드 도구 |
| Tailwind CSS | 4.1 | 유틸리티 CSS |
| React Router | 7.13 | 클라이언트 라우팅 |
| Axios | 1.13 | HTTP 클라이언트 |
| react-markdown | 10.1 | 마크다운 렌더링 |
| remark-gfm | 4.0 | GitHub Flavored Markdown |
| rehype-highlight | 7.0 | 코드 구문 강조 |

### 백엔드

| 기술 | 버전 | 용도 |
|------|------|------|
| FastAPI | 0.128+ | 비동기 웹 프레임워크 |
| Python | 3.12+ | 런타임 |
| SQLAlchemy | (async) | ORM / 비동기 DB 액세스 |
| Alembic | 1.18+ | DB 마이그레이션 |
| Redis | 7+ | 캐시, Rate Limiting, 토큰 블랙리스트 |
| redis-py | 7.1+ | Redis 비동기 클라이언트 |
| slowapi | 0.1.9+ | Rate Limiting (Redis/인메모리 백엔드) |
| python-jose | 3.3+ | JWT 토큰 (액세스 + 리프레시) |
| bcrypt | 4.0+ | 비밀번호 해싱 |
| Pillow | 10.4+ | 이미지 처리 (크기 추출) |
| asyncpg | 0.31+ | PostgreSQL 비동기 드라이버 |
| aiosqlite | 0.20+ | SQLite 비동기 드라이버 |

---

## API 엔드포인트

### 인증

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| `POST` | `/api/auth/login` | 로그인 (액세스 토큰 + 로그인 유지 시 리프레시 토큰 발급) | - |
| `POST` | `/api/auth/refresh` | 리프레시 토큰으로 액세스 토큰 갱신 (Token Rotation) | 쿠키 |
| `GET` | `/api/auth/me` | 현재 사용자 정보 | 필요 |
| `POST` | `/api/auth/logout` | 로그아웃 (토큰 블랙리스트 등록 + 쿠키 제거) | - |

### 포스트

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| `POST` | `/api/posts` | 포스트 생성 | 필요 |
| `GET` | `/api/posts` | 포스트 목록 (페이지네이션, 필터) | - |
| `GET` | `/api/posts/tags` | 전체 태그 목록 (published 게시글 기준) | - |
| `GET` | `/api/posts/{id}` | 포스트 상세 조회 | - |
| `GET` | `/api/posts/slug/{slug}` | 슬러그로 포스트 조회 | - |
| `POST` | `/api/posts/{id}/view` | 조회수 증가 | - |
| `PUT` | `/api/posts/{id}` | 포스트 수정 | 필요 |
| `DELETE` | `/api/posts/{id}` | 포스트 삭제 (`?permanent=true` 영구 삭제) | 필요 |

### 이미지 업로드

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| `POST` | `/api/upload/image` | 이미지 업로드 | 필요 |
| `GET` | `/api/upload/temp/{filename}` | 임시 이미지 정보 | - |
| `DELETE` | `/api/upload/image/{filename}` | 이미지 삭제 (소프트 삭제) | 필요 |

### 이미지 관리 (Admin)

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/api/upload/admin/orphans` | Orphan 이미지 현황 조회 | 필요 |
| `GET` | `/api/upload/admin/orphans/list` | Orphan 이미지 목록 조회 | 필요 |
| `POST` | `/api/upload/admin/cleanup` | Orphan 이미지 수동 정리 실행 | 필요 |

### 기타

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/` | API 정보 (프로덕션에서는 최소 정보만 반환) |
| `GET` | `/health` | 헬스 체크 |
| `GET` | `/docs` | Swagger UI 문서 (개발 환경 전용) |
| `GET` | `/redoc` | ReDoc 문서 (개발 환경 전용) |

---

## Docker 배포

Docker Compose를 사용하여 전체 스택을 한 번에 실행할 수 있습니다.

### 아키텍처

```
[Browser] → [nginx (client)]
               ├── / ─────────→ SPA 정적 파일
               ├── /api/* ────→ [FastAPI (server)] → [PostgreSQL (db)]
               │                       ↕
               │                  [Redis (redis)]
               └── /uploads/* → 공유 볼륨 (정적 서빙)
                                      ↑
                              [server 이미지 업로드]
```

- **client** (nginx): React 빌드 파일 서빙, API 리버스 프록시, 업로드 이미지 정적 서빙
- **server** (FastAPI): API 서버, 이미지 업로드 처리, DB 마이그레이션 자동 실행, 이미지 정리 스케줄러
- **db** (PostgreSQL): 데이터 저장소
- **redis** (Redis): 캐시, Rate Limiting, 토큰 블랙리스트, 조회수 중복 방지, 분산 락

### 실행

```bash
# 전체 스택 빌드 및 실행
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 중지
docker compose down

# 데이터 포함 완전 삭제
docker compose down -v
```

> 접속: http://localhost
>
> API 문서: http://localhost/docs

### 환경 변수 커스터마이징

프로젝트 루트에 `.env` 파일을 생성하여 기본값을 덮어쓸 수 있습니다.

```env
# .env (프로젝트 루트)
SECRET_KEY=your-production-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
ADMIN_EMAIL=admin@example.com
ENV=production
```

### 서비스 구성

| 서비스 | 이미지 | 포트 | 볼륨 |
|--------|--------|------|------|
| client | nginx:alpine | 80:80 | `uploads` (읽기 전용) |
| server | python:3.12-slim | 8000 (내부) | `uploads` (읽기/쓰기) |
| db | postgres:18.1-alpine | 5432 (내부) | `pgdata` |
| redis | redis:7-alpine | 6379 (내부) | `redisdata` |

---

## 로컬 개발 (Docker 없이)

### 필수 요구사항

- **Node.js** >= 18.x
- **Python** >= 3.12
- **uv** (Python 패키지 관리자, 권장) 또는 pip

### 1. 클라이언트 실행

```bash
cd client

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env.local

# 개발 서버 실행
npm run dev
```

> 클라이언트: http://localhost:5173

### 2. 서버 실행

```bash
cd server

# 의존성 설치
uv sync
# 또는: pip install -e .

# 환경 변수 설정
cp .env.example .env
# .env 파일에서 SECRET_KEY, ADMIN_USERNAME, ADMIN_PASSWORD 설정

# DB 마이그레이션
alembic upgrade head

# 서버 실행
python main.py
```

> 서버: http://localhost:8000
>
> API 문서: http://localhost:8000/docs

---

## 환경 변수

### 클라이언트 (`client/.env.local`)

```env
VITE_API_URL=http://localhost:8000
```

### 서버 (`server/.env`)

```env
# 인증
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# 관리자 계정
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password
ADMIN_EMAIL=admin@example.com

# 데이터베이스 (미설정 시 SQLite 사용)
DATABASE_URL=sqlite+aiosqlite:///./blog.db
# PostgreSQL 예시: postgresql+asyncpg://user:pass@localhost:5432/blogdb

# Redis (캐시, Rate Limiting, 토큰 블랙리스트)
# 미설정 시 인메모리 폴백 (개발 환경에서는 없어도 동작)
# REDIS_URL=redis://localhost:6379/0

# CORS 허용 오리진 (쉼표 구분)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# 이미지 URL 베이스 (빈 문자열 = 상대 경로, nginx 프록시 환경에서 사용)
BASE_URL=

# 환경 (development / production)
# production: API 문서 (/docs, /redoc, /openapi.json) 비활성화
ENV=development
```

---

## 개발 가이드

### 클라이언트

```bash
cd client

npm run dev       # 개발 서버 (HMR)
npm run build     # 프로덕션 빌드
npm run preview   # 빌드 미리보기
npm run lint      # ESLint 검사
```

### 서버

```bash
cd server

python main.py              # 개발 서버 (자동 리로드)
uvicorn main:app --reload   # 또는 직접 uvicorn 실행

# DB 마이그레이션
alembic revision --autogenerate -m "설명"   # 마이그레이션 생성
alembic upgrade head                        # 마이그레이션 적용

# 테스트
pytest
```

---

## 데이터베이스

### 지원 DB

- **SQLite** — 개발 환경 기본값 (`aiosqlite`)
- **PostgreSQL** — 프로덕션 권장 (`asyncpg`)

### 데이터 모델

```
┌──────────────────────────┐       ┌──────────────────────────┐
│          posts           │       │          images          │
├──────────────────────────┤       ├──────────────────────────┤
│ id          (PK)         │──┐    │ id          (PK)         │
│ title       (String)     │  │    │ storage_key (String)     │
│ content     (Text)       │  │    │ original_filename        │
│ slug        (Unique)     │  │    │ file_size   (Integer)    │
│ excerpt     (String)     │  │    │ mime_type   (String)     │
│ tags        (JSON)       │  │    │ width / height           │
│ category_slug (String)   │  │    │ alt_text / caption       │
│ status      (String)     │  └───>│ post_id     (FK)         │
│ view_count  (Integer)    │       │ is_temporary (Boolean)   │
│ created_at  (DateTime)   │       │ created_at  (DateTime)   │
│ updated_at  (DateTime)   │       │ updated_at  (DateTime)   │
│ published_at (DateTime)  │       │ deleted_at  (DateTime)   │
│ deleted_at  (DateTime)   │       └──────────────────────────┘
└──────────────────────────┘
```

- **소프트 삭제**: 두 모델 모두 `deleted_at` 필드를 통한 소프트 삭제 지원
- **이미지 연결**: 포스트 마크다운 내 이미지 URL 파싱으로 자동 연결/해제
- **이미지 정리**: 미연결 임시 이미지(24시간) 및 소프트 삭제 이미지(7일) 자동 정리
- **비동기 처리**: SQLAlchemy AsyncSession 기반 완전 비동기 DB 액세스

---

## 라우팅 구조

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/` | Home | 최근 발행된 포스트 카드 그리드 |
| `/board` | Board List | 포스트 목록 (검색, 태그 필터, 페이지네이션) |
| `/board/:id` | Post Detail | 포스트 상세 (마크다운 렌더링, 조회수) |
| `/editor` | Editor | 새 포스트 작성 (인증 필요) |
| `/editor/:id` | Editor | 포스트 수정 (인증 필요) |
| `/admin` | Admin | 관리자 페이지 (인증 필요, 고아 이미지 관리) |
| `/login` | Login | 로그인 페이지 |
| `/unauthorized` | Unauthorized | 접근 거부 페이지 |

---

## 보안

- **HttpOnly 쿠키**: JWT 토큰을 HttpOnly + Secure + SameSite=Lax 쿠키에 저장
- **이중 토큰 전략**: 단기 액세스 토큰 (30분) + 장기 리프레시 토큰 (7일), 리프레시 토큰은 `/api/auth` 경로로 제한
- **Refresh Token Rotation**: 리프레시 시 이전 토큰을 Redis 블랙리스트에 등록, 토큰 탈취 시 재사용 차단
- **토큰 블랙리스트**: 로그아웃/토큰 회전 시 JTI를 Redis에 등록하여 즉시 무효화
- **비밀번호 해싱**: bcrypt 기반 단방향 해싱
- **Rate Limiting**: Redis 기반 분산 Rate Limiting (로그인 5/분, 이미지 업로드 30/분 등)
- **XSS 방어**: 콘텐츠 내 `<script>`, `javascript:`, 이벤트 핸들러 제거
- **URL 검증**: 이미지/링크 URL에서 위험한 프로토콜 차단 (`javascript:`, `data:`, `vbscript:`)
- **파일명 정제**: 업로드 파일명에서 경로 탐색 문자 제거, 안전 문자만 허용
- **입력 검증**: Pydantic 스키마를 통한 모든 입력값 검증
- **CORS 설정**: 환경 변수 기반 허용 오리진 관리
- **프로덕션 보호**: `ENV=production`에서 API 문서 (`/docs`, `/redoc`, `/openapi.json`) 자동 비활성화

---

## 라이선스

[Apache License 2.0](./LICENSE) - Copyright 2025 CLazyCoder63
