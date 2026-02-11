import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

// 커스텀 config 속성 타입 확장
declare module 'axios' {
    interface AxiosRequestConfig {
        _skipAuthRedirect?: boolean;
        _retry?: boolean; // 토큰 갱신 후 재시도 플래그
    }
}

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

// 401 리다이렉트를 건너뛸 경로 (인증 관련 요청)
const SKIP_AUTH_REDIRECT = ['/api/auth/me', '/api/auth/login', '/api/auth/logout', '/api/auth/refresh'];

// 토큰 갱신 중복 방지: 동시에 하나의 refresh 요청만 실행
let isRefreshing = false;
let refreshSubscribers: Array<(success: boolean) => void> = [];

/** 갱신 완료 후 대기 중인 요청들에게 결과 알림 */
function onRefreshComplete(success: boolean) {
    refreshSubscribers.forEach(cb => cb(success));
    refreshSubscribers = [];
}

/** 갱신 대기열에 콜백 등록 (Promise로 래핑) */
function waitForRefresh(): Promise<boolean> {
    return new Promise(resolve => {
        refreshSubscribers.push(resolve);
    });
}

// 응답 인터셉터: 401 → 토큰 갱신 시도 → 재시도 or 리다이렉트
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & AxiosRequestConfig;

        if (error.response?.status === 401) {
            const requestUrl = originalRequest?.url || '';
            const isAuthEndpoint = SKIP_AUTH_REDIRECT.some(path => requestUrl.includes(path));

            // 인증 관련 엔드포인트이거나 이미 재시도한 요청이면 그대로 에러 반환
            if (isAuthEndpoint || originalRequest?._retry) {
                return Promise.reject(error);
            }

            // 이미 다른 요청이 갱신 중이면 그 결과를 기다림
            if (isRefreshing) {
                const success = await waitForRefresh();
                if (success) {
                    originalRequest._retry = true;
                    return api(originalRequest);
                }
                // 갱신 실패: 리다이렉트 또는 에러 반환
                return handleRefreshFailure(originalRequest, error);
            }

            // 토큰 갱신 시도
            isRefreshing = true;

            try {
                await axios.post(`${API_BASE_URL}/api/auth/refresh`, null, {
                    withCredentials: true,
                });

                isRefreshing = false;
                onRefreshComplete(true);

                // 원래 요청 재시도
                originalRequest._retry = true;
                return api(originalRequest);
            } catch {
                // 리프레시 토큰도 만료 또는 없음 → 갱신 실패
                isRefreshing = false;
                onRefreshComplete(false);

                return handleRefreshFailure(originalRequest, error);
            }
        }

        return Promise.reject(error);
    }
);

/** 토큰 갱신 실패 시 처리: _skipAuthRedirect이면 에러만, 아니면 로그인 리다이렉트 */
function handleRefreshFailure(config: AxiosRequestConfig, error: unknown) {
    const skipByConfig = config?._skipAuthRedirect === true;

    if (!skipByConfig) {
        const currentPath = window.location.pathname;
        if (currentPath !== '/login') {
            window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
        }
    }

    return Promise.reject(error);
}

export default api;
