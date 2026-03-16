import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import api from '../utils/api';

interface User {
    id: string;
    username: string;
    email: string;
}

export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (username: string, password: string, rememberMe?: boolean) => Promise<boolean>;
    logout: () => Promise<void>;
    isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_SESSION_HINT_KEY = 'auth.hasSessionHint';

const hasSessionHint = (): boolean => {
    try {
        return localStorage.getItem(AUTH_SESSION_HINT_KEY) === '1';
    } catch {
        return false;
    }
};

const setSessionHint = () => {
    try {
        localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
    } catch {
        // ignore storage failures
    }
};

const clearSessionHint = () => {
    try {
        localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    } catch {
        // ignore storage failures
    }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 컴포넌트 마운트 시 쿠키의 토큰으로 사용자 정보 확인
    useEffect(() => {
        const initAuth = async () => {
            // 로그인 힌트가 없으면 인증 확인 호출을 생략
            if (!hasSessionHint()) {
                setIsLoading(false);
                return;
            }

            try {
                // HttpOnly 쿠키의 토큰으로 현재 사용자 정보 가져오기
                const response = await api.get('/api/auth/me');
                setUser(response.data);
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 401) {
                    clearSessionHint();
                }
                // 토큰이 없거나 유효하지 않으면 무시
                console.log('Not authenticated');
            } finally {
                setIsLoading(false);
            }
        };
        
        initAuth();
    }, []);

    const login = async (username: string, password: string, rememberMe: boolean = false): Promise<boolean> => {
        try {
            // 서버에 로그인 요청 (HttpOnly 쿠키에 토큰 저장됨)
            await api.post('/api/auth/login', {
                username,
                password,
                remember_me: rememberMe,
            });

            // 사용자 정보 가져오기
            const userResponse = await api.get('/api/auth/me');
            const userData: User = userResponse.data;

            setUser(userData);
            setSessionHint();

            return true;
        } catch (error) {
            console.error('Login error:', error);
            return false;
        }
    };

    const logout = async () => {
        try {
            // 서버에 로그아웃 요청 (HttpOnly 쿠키 제거)
            await api.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            clearSessionHint();
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                login,
                logout,
                isLoading
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

// re-export: 기존 import 경로 호환
export { useAuth } from './useAuth';
