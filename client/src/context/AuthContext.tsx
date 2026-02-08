import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../utils/api';

interface User {
    id: string;
    username: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 컴포넌트 마운트 시 토큰으로 사용자 정보 확인
    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    // 토큰으로 현재 사용자 정보 가져오기
                    const response = await api.get('/api/auth/me');
                    setUser(response.data);
                } catch (error) {
                    console.error('Failed to fetch user data:', error);
                    // 토큰이 유효하지 않으면 제거
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            }
            setIsLoading(false);
        };
        
        initAuth();
    }, []);

    const login = async (username: string, password: string): Promise<boolean> => {
        try {
            // 서버에 로그인 요청
            const response = await api.post('/api/auth/login', {
                username,
                password
            });
            
            const { access_token } = response.data;
            
            // 토큰 저장
            localStorage.setItem('token', access_token);
            
            // 사용자 정보 가져오기
            const userResponse = await api.get('/api/auth/me');
            const userData: User = userResponse.data;
            
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
            
            return true;
        } catch (error) {
            console.error('Login error:', error);
            return false;
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
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

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
