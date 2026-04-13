# Web Blog Client

웹 블로그 프론트엔드 애플리케이션입니다.  
React + TypeScript + Vite 기반이며, 마크다운 렌더링/에디팅과 인증 연동 UI를 제공합니다.

## 주요 기능

- 게시글 목록/상세/검색/태그 필터
- 마크다운 에디터(미리보기, 코드 하이라이트, 수식/다이어그램 지원)
- 이미지 업로드(드래그앤드롭, 붙여넣기, 파일 선택)
- 인증 흐름(로그인, 만료 시 자동 토큰 갱신, 보호 라우트)
- 관리자 페이지(`/admin`)에서 orphan 이미지 관리

## 라우팅

- `/` 홈
- `/board` 게시글 목록
- `/board/:id` 게시글 상세
- `/editor`, `/editor/:id` 글 작성/수정
- `/login` 로그인
- `/admin` 관리자
- `/unauthorized` 접근 거부

## 시작하기

```bash
cd client
npm install
cp .env.example .env.local
npm run dev
```

- 개발 서버: `http://localhost:5173`

## 스크립트

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 결과 확인
npm run lint     # ESLint
```

## 환경 변수

```env
VITE_API_URL=http://localhost:8000
VITE_SITE_NAME=YSG Blog
VITE_ADMIN_EMAIL=admin@example.com
```

> [!TIP]
> Docker Compose 배포 시에는 nginx가 `/api`를 백엔드로 프록시하므로, 브라우저에서 직접 API 주소를 의식하지 않아도 동작합니다.

## 디렉토리 개요

```text
client/
├─ src/components/   # UI 컴포넌트
├─ src/context/      # 인증 상태 관리
├─ src/layouts/      # 페이지 레이아웃
├─ src/routes/       # 페이지 라우트
├─ src/utils/        # API 클라이언트, 파서 등
└─ src/hooks/        # 커스텀 훅
```
