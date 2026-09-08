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
ENV VITE_SITE_NAME=$VITE_SITE_NAME

ARG VITE_ADMIN_EMAIL="admin@example.com"
ENV VITE_ADMIN_EMAIL=$VITE_ADMIN_EMAIL

# 프로덕션 빌드
RUN npm run build

# ============================================
# Stage 2: Serve with nginx (non-root)
# ============================================
FROM nginxinc/nginx-unprivileged:alpine

USER root
RUN apk add --no-cache iproute2
USER nginx

# nginx 설정 및 런타임 trusted proxy 탐지 스크립트
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/05-cf-trusted-proxy.envsh /docker-entrypoint.d/05-cf-trusted-proxy.envsh
ENV CF_TRUSTED_PROXY="unix:"

# 빌드 결과물 복사
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
