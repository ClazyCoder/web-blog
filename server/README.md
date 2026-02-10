# Web Blog Server

FastAPI 기반 블로그 백엔드 서버

## 기능

- JWT 기반 인증 (로그인/회원가입)
- 블로그 포스트 CRUD (생성/조회/수정/삭제, 임시저장/발행)
- 이미지 업로드 및 게시글 연결 관리
- Orphan 이미지 자동 정리 (백그라운드 스케줄러)
- 관리용 이미지 현황 조회 및 수동 정리 API
- 프로덕션 환경에서 API 문서 자동 비활성화
- Alembic 기반 DB 마이그레이션
- CORS 설정 / 정적 파일 서빙
- 헬스 체크 엔드포인트

## 프로젝트 구조

```
server/
├── main.py                  # FastAPI 앱 진입점 (lifespan, CORS, 라우터 등록)
├── auth.py                  # JWT 인증 유틸리티
├── routers/                 # API 라우터
│   ├── auth.py              # 인증 관련 API
│   ├── post.py              # 게시글 CRUD API
│   └── image.py             # 이미지 업로드/삭제/관리 API
├── models/                  # SQLAlchemy 모델
│   ├── base.py              # Base 모델
│   ├── post.py              # Post 모델
│   └── image.py             # Image 모델
├── schemas/                 # Pydantic 스키마
│   ├── auth.py              # 인증 스키마
│   └── post.py              # 게시글/이미지 응답 스키마
├── services/                # 백그라운드 서비스
│   └── image_cleanup.py     # Orphan 이미지 자동 정리
├── db/
│   └── session.py           # 비동기 DB 세션 관리
├── blog/                    # Alembic 마이그레이션
│   └── versions/            # 마이그레이션 파일
├── uploads/                 # 업로드된 파일 (자동 생성)
├── pyproject.toml           # 패키지 의존성
├── alembic.ini              # Alembic 설정
├── entrypoint.sh            # Docker 엔트리포인트
├── Dockerfile               # 서버 Docker 이미지
└── .env                     # 환경 변수 (생성 필요)
```

## 설치 및 실행

### 1. 의존성 설치

```bash
# uv 사용 (권장)
uv sync

# 또는 pip 사용
pip install -e .
```

### 2. 환경 변수 설정

```bash
# .env.example을 .env로 복사
cp .env.example .env

# .env 파일 편집하여 SECRET_KEY 등 변경
# SECRET_KEY 생성 예시:
# python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. DB 마이그레이션

```bash
alembic upgrade head
```

### 4. 서버 실행

```bash
# 메인 스크립트로 실행 (자동 리로드)
python main.py

# 또는 uvicorn 직접 실행
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

서버가 `http://localhost:8000`에서 실행됩니다.

## API 문서

개발 환경(`ENV=development` 또는 미설정)에서만 자동 생성된 API 문서를 확인할 수 있습니다:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

> 프로덕션 환경(`ENV=production`)에서는 `/docs`, `/redoc`, `/openapi.json`이 자동으로 비활성화됩니다.

## API 엔드포인트

### 인증 (Auth)

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/auth/register` | - | 회원가입 |
| POST | `/api/auth/login` | - | 로그인 (JWT 발급) |

### 게시글 (Posts)

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| GET | `/api/posts` | - | 게시글 목록 (페이지네이션, 태그/카테고리/검색 필터) |
| GET | `/api/posts/{post_id}` | - | 게시글 상세 (연결된 이미지 목록 포함) |
| GET | `/api/posts/slug/{slug}` | - | 슬러그로 게시글 조회 |
| GET | `/api/posts/tags` | - | 전체 태그 목록 |
| POST | `/api/posts` | 필수 | 게시글 생성 (draft/published) |
| PUT | `/api/posts/{post_id}` | 필수 | 게시글 수정 |
| DELETE | `/api/posts/{post_id}` | 필수 | 게시글 삭제 (soft/permanent) |
| POST | `/api/posts/{post_id}/view` | - | 조회수 증가 |

### 이미지 (Image)

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/upload/image` | 필수 | 이미지 업로드 |
| GET | `/api/upload/temp/{filename}` | - | 임시 이미지 정보 조회 |
| DELETE | `/api/upload/image/{filename}` | 필수 | 이미지 삭제 (soft-delete) |
| GET | `/api/upload/admin/orphans` | 필수 | Orphan 이미지 현황 조회 |
| POST | `/api/upload/admin/cleanup` | 필수 | Orphan 이미지 수동 정리 실행 |

### 시스템

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | API 정보 (프로덕션에서는 최소 정보만 반환) |
| GET | `/health` | 헬스 체크 |

## 이미지 관리

### 이미지-게시글 연결

이미지는 DB의 `images` 테이블에서 `post_id` 외래키로 게시글과 연결됩니다. 게시글 생성/수정 시 마크다운 본문을 분석하여 자동으로 연결을 관리합니다:

- 본문에 포함된 이미지 → `post_id` 설정, `is_temporary=False`
- 본문에서 제거된 이미지 → `post_id=None`, `is_temporary=True`

### Orphan 이미지 자동 정리

서버 시작 시 백그라운드 스케줄러가 자동으로 실행되어 주기적으로 정리합니다:

| 정리 대상 | 조건 | 동작 |
|-----------|------|------|
| 임시 이미지 (orphan) | `is_temporary=True`, `post_id=NULL`, 생성 후 24시간 경과 | 파일 삭제 + soft-delete |
| soft-delete된 이미지 | `deleted_at` 설정 후 7일 경과 | 파일 삭제 + DB 레코드 영구 삭제 |

- 정리 주기: 1시간 간격
- 설정값은 `services/image_cleanup.py`에서 변경 가능

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ENV` | 환경 (`development` / `production`) | `development` |
| `SECRET_KEY` | JWT 시크릿 키 | - (필수 설정) |
| `ALGORITHM` | JWT 알고리즘 | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 토큰 만료 시간 (분) | `30` |
| `DATABASE_URL` | DB 연결 URL | `sqlite+aiosqlite:///./blog.db` |
| `BASE_URL` | 서버 기본 URL (이미지 URL 생성용) | `http://localhost:8000` |
| `CORS_ORIGINS` | CORS 허용 origin (쉼표 구분) | `http://localhost:5173,http://localhost:3000` |
| `ADMIN_USERNAME` | 관리자 계정 이름 | - |
| `ADMIN_PASSWORD` | 관리자 계정 비밀번호 | - |
| `ADMIN_EMAIL` | 관리자 계정 이메일 | - |

## 개발

### 테스트 실행

```bash
# 개발 의존성 설치
uv sync --extra dev

# 테스트 실행
pytest
```

### 코드 포맷팅

```bash
# ruff 사용
ruff check .
ruff format .
```

## TODO

- [ ] 이미지 리사이징/최적화
- [ ] CDN 연동
- [ ] Rate limiting
- [ ] 테스트 코드 작성
