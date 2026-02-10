import axios from 'axios';

// API 베이스 URL 설정
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// axios 인스턴스 생성
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // HttpOnly 쿠키 전송을 위해 필수
});

// 401 리다이렉트를 건너뛸 경로 (인증 확인용 요청)
const SKIP_AUTH_REDIRECT = ['/api/auth/me', '/api/auth/login', '/api/auth/logout'];

// 응답 인터셉터: 401 에러 처리
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const requestUrl = error.config?.url || '';
            const shouldSkip = SKIP_AUTH_REDIRECT.some(path => requestUrl.includes(path));

            if (!shouldSkip) {
                const currentPath = window.location.pathname;
                if (currentPath !== '/login') {
                    window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
