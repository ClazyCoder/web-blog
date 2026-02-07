# Web Blog

모던한 블로그 플랫폼 - React + FastAPI

## 프로젝트 구조

```
web-blog/
├── client/              # React + TypeScript 프론트엔드
│   ├── src/
│   │   ├── components/  # 재사용 가능한 컴포넌트
│   │   ├── layouts/     # 레이아웃 컴포넌트
│   │   ├── routes/      # 라우트 컴포넌트
│   │   └── ...
│   └── package.json
│
├── server/              # FastAPI 백엔드
│   ├── routers/         # API 라우터
│   │   ├── auth.py      # 인증 API
│   │   └── image.py     # 이미지 업로드 API
│   ├── main.py          # FastAPI 앱
│   ├── auth.py          # JWT 인증
│   └── pyproject.toml
│
└── README.md
```

## 주요 기능

### 프론트엔드 (Client)
- ✅ 마크다운 에디터 (실시간 미리보기)
- ✅ 이미지 업로드 (드래그 앤 드롭, 클립보드)
- ✅ 다크모드 지원
- ✅ 반응형 디자인
- ✅ GitHub Flavored Markdown
- ✅ 코드 하이라이팅
- 📝 블로그 포스트 목록/상세 (개발 중)

### 백엔드 (Server)
- ✅ JWT 기반 인증 (로그인/회원가입)
- ✅ 이미지 업로드 API
- ✅ CORS 설정
- ✅ 자동 API 문서 (Swagger/ReDoc)
- 📝 블로그 포스트 CRUD (예정)
- 📝 댓글 시스템 (예정)

## 빠른 시작

### 필수 요구사항

- **Node.js** >= 18.x
- **Python** >= 3.12
- **uv** (Python 패키지 관리자, 선택사항)

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

클라이언트: http://localhost:5173

### 2. 서버 실행

```bash
cd server

# 의존성 설치
uv sync
# 또는
pip install -e .

# 환경 변수 설정
cp .env.example .env
# SECRET_KEY 생성 및 .env 파일 수정

# 서버 실행
python main.py
```

서버: http://localhost:8000

API 문서: http://localhost:8000/docs

## 개발 가이드

### 클라이언트 개발

```bash
cd client

# 개발 서버
npm run dev

# 빌드
npm run build

# 린트
npm run lint
```

### 서버 개발

```bash
cd server

# 개발 서버 (자동 리로드)
python main.py

# 또는
uvicorn main:app --reload

# 테스트
pytest
```

## API 문서

서버 실행 후:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 환경 변수

### 클라이언트 (.env.local)
```env
VITE_API_URL=http://localhost:8000
```

### 서버 (.env)
```env
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## 기술 스택

### 프론트엔드
- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- React Router
- React Markdown
- Highlight.js

### 백엔드
- FastAPI
- Python 3.12
- JWT (python-jose)
- Passlib (비밀번호 해싱)
- Pillow (이미지 처리)

## 주요 문서

- [이미지 업로드 가이드](./IMAGE_UPLOAD_GUIDE.md)
- [서버 API 문서](./server/README.md)

## 로드맵

- [x] 마크다운 에디터
- [x] 이미지 업로드
- [x] JWT 인증
- [ ] 데이터베이스 연동
- [ ] 블로그 포스트 CRUD
- [ ] 댓글 시스템
- [ ] 사용자 프로필
- [ ] 검색 기능
- [ ] 태그/카테고리
- [ ] SEO 최적화

## 라이선스

MIT

