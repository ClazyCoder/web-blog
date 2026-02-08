import axios from 'axios';

// API 베이스 URL 설정
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// axios 인스턴스 생성
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 요청 인터셉터: JWT 토큰을 헤더에 자동 추가
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// 응답 인터셉터: 401 에러 처리
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // 토큰이 만료되었거나 유효하지 않은 경우
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            // 로그인 페이지로 리다이렉트 (현재 페이지 정보를 state로 전달)
            const currentPath = window.location.pathname;
            if (currentPath !== '/login') {
                window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
            }
        }
        return Promise.reject(error);
    }
);

export default api;
