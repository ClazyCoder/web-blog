# Web Blog Server

FastAPI 기반 블로그 백엔드 서버

## 기능

- ✅ JWT 기반 인증 (로그인/회원가입)
- ✅ 이미지 업로드 API
- ✅ CORS 설정
- ✅ 정적 파일 서빙
- 📝 블로그 포스트 CRUD (예정)
- 📝 댓글 시스템 (예정)

## 프로젝트 구조

```
server/
├── main.py              # FastAPI 앱 진입점
├── auth.py              # JWT 인증 유틸리티
├── routers/             # API 라우터
│   ├── __init__.py
│   ├── auth.py          # 인증 관련 API
│   └── image.py         # 이미지 업로드 API
├── uploads/             # 업로드된 파일 (자동 생성)
├── pyproject.toml       # 패키지 의존성
└── .env                 # 환경 변수 (생성 필요)
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

# .env 파일 편집하여 SECRET_KEY 변경
# SECRET_KEY 생성 예시:
# python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. 서버 실행

```bash
# 메인 스크립트로 실행 (자동 리로드)
python main.py

# 또는 uvicorn 직접 실행
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

서버가 `http://localhost:8000`에서 실행됩니다.

## API 문서

서버 실행 후 다음 URL에서 자동 생성된 API 문서를 확인할 수 있습니다:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API 엔드포인트

### 인증 (Auth)

#### 회원가입
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "username": "testuser"
}
```

#### 로그인
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**응답:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 이미지 업로드

#### 이미지 업로드
```http
POST /api/upload/image
Content-Type: multipart/form-data
Authorization: Bearer {token}  # 선택사항

file: [이미지 파일]
```

**응답:**
```json
{
  "success": true,
  "url": "http://localhost:8000/uploads/images/20240208_123456_abc123.jpg",
  "filename": "20240208_123456_abc123.jpg",
  "original_filename": "my-image.jpg",
  "size": 123456
}
```

#### 이미지 정보 조회
```http
GET /api/upload/temp/{filename}
```

#### 이미지 삭제
```http
DELETE /api/upload/image/{filename}
Authorization: Bearer {token}  # 필수
```

## 인증 사용법

### 토큰 포함하여 요청

```javascript
// JavaScript/TypeScript 예시
const token = 'your-jwt-token';

fetch('http://localhost:8000/api/upload/image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### 라우터에서 인증 적용

```python
from fastapi import Depends
from auth import get_current_user

@router.post("/protected")
async def protected_route(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}
```

## 개발

### 테스트 실행

```bash
pytest
```

### 코드 포맷팅

```bash
# black 사용
black .

# ruff 사용
ruff check .
```

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| SECRET_KEY | JWT 시크릿 키 | - |
| ALGORITHM | JWT 알고리즘 | HS256 |
| ACCESS_TOKEN_EXPIRE_MINUTES | 토큰 만료 시간 (분) | 30 |
| MAX_FILE_SIZE | 최대 파일 크기 (bytes) | 5242880 (5MB) |
| UPLOAD_DIR | 업로드 디렉토리 | uploads/images |

## TODO

- [ ] 데이터베이스 연동 (PostgreSQL/MySQL)
- [ ] 사용자 관리 시스템
- [ ] 블로그 포스트 CRUD API
- [ ] 댓글 시스템
- [ ] 이미지 리사이징/최적화
- [ ] CDN 연동
- [ ] Rate limiting
- [ ] 로깅 시스템
- [ ] 테스트 코드 작성
