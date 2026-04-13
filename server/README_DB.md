# Database Guide

`web-blog` 서버의 데이터베이스 구성, 마이그레이션, 운영 포인트를 정리한 문서입니다.

## 지원 DB

- 기본: SQLite (`sqlite+aiosqlite:///./blog.db`)
- 권장(운영): PostgreSQL + `asyncpg`

앱은 아래 우선순위로 DB URL을 결정합니다.

1. `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`가 모두 있으면 조합해서 PostgreSQL URL 생성
2. 없으면 `DATABASE_URL` 사용
3. 둘 다 없으면 SQLite 기본값 사용

## 스키마 개요

### `posts`

- `id` (PK)
- `title`, `content`, `slug`(unique)
- `excerpt`, `tags`(JSON 배열), `category_slug`
- `status` (`draft`/`published`), `is_secret`
- `view_count`
- `created_at`, `updated_at`, `published_at`, `deleted_at`

### `images`

- `id` (PK)
- `storage_key`(unique), `original_filename`
- `file_size`, `mime_type`, `width`, `height`
- `alt_text`, `caption`
- `post_id` (FK -> `posts.id`, nullable)
- `is_temporary`
- `created_at`, `updated_at`, `deleted_at`

## 관계 및 데이터 라이프사이클

- 이미지 업로드 직후: `is_temporary=True`, `post_id=NULL`
- 게시글 본문에 포함되면: `post_id` 연결, `is_temporary=False`
- 본문에서 제거되거나 게시글 삭제 시: 다시 orphan(`post_id=NULL`, `is_temporary=True`)
- 정리 정책:
  - orphan 24시간 초과 -> 파일 삭제 + soft-delete
  - soft-delete 7일 초과 -> 파일 삭제 + 레코드 영구 삭제

## 마이그레이션

```bash
cd server
alembic upgrade head
```

새 마이그레이션 생성:

```bash
alembic revision --autogenerate -m "describe changes"
```

> [!TIP]
> 모델 변경 후에는 로컬에서 `upgrade head`까지 실행해 실제 쿼리 에러 여부를 확인한 뒤 커밋하는 것을 권장합니다.

## 환경 변수 예시

### SQLite (로컬)

```env
DATABASE_URL=sqlite+aiosqlite:///./blog.db
```

### PostgreSQL (직접 URL)

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/blog_db
```

### PostgreSQL (개별 파라미터)

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=blog_user
DB_PASSWORD=blog_password
DB_NAME=blog_db
```

## 운영 체크리스트

- 마이그레이션 적용 상태(`alembic current`)를 배포 파이프라인에 포함
- PostgreSQL 연결 정보는 URL 인코딩 이슈를 피하기 위해 개별 파라미터 사용 권장
- Redis 미설정 시 캐시/rate limit 일부 기능이 폴백되므로 운영 환경에서는 `REDIS_URL` 설정 권장
