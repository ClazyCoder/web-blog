# ============================================
# FastAPI Server with uv
# ============================================
FROM python:3.12-slim

WORKDIR /app

# 시스템 패키지 설치 (PostgreSQL 클라이언트 라이브러리)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# uv 설치
RUN pip install --no-cache-dir uv

# 의존성 파일 먼저 복사 (캐시 활용)
COPY pyproject.toml uv.lock ./

# 의존성 설치
RUN uv sync --frozen --no-dev

# 소스 코드 복사
COPY . .

# uploads 디렉토리 생성
RUN mkdir -p uploads/images

# entrypoint 실행 권한 부여
RUN chmod +x entrypoint.sh

# non-root 사용자로 실행
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --no-create-home appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
