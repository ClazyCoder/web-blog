# ============================================
# Stage 1: Build React app
# ============================================
FROM node:22-alpine AS build

WORKDIR /app

# 의존성 파일 먼저 복사 (캐시 활용)
COPY package.json package-lock.json ./

# 의존성 설치
RUN npm ci

# 소스 코드 복사
COPY . .

# 빌드 시 환경변수 설정
ENV VITE_API_URL=""

ARG VITE_SITE_NAME="YSG Blog"
ARG VITE_ADMIN_EMAIL="admin@example.com"
ENV VITE_SITE_NAME=$VITE_SITE_NAME
ENV VITE_ADMIN_EMAIL=$VITE_ADMIN_EMAIL

# 프로덕션 빌드
RUN npm run build

# ============================================
# Stage 2: Serve with nginx
# ============================================
FROM nginx:alpine

# nginx 설정 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 빌드 결과물 복사
COPY --from=build /app/dist /usr/share/nginx/html

# uploads 정적 서빙을 위한 디렉토리 생성
RUN mkdir -p /data/uploads

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]