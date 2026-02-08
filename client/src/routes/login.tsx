import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    // 이전 페이지 경로를 가져옵니다 (없으면 홈으로)
    const from = (location.state as any)?.from?.pathname || '/';

    // 이미 로그인된 경우 리다이렉트
    useEffect(() => {
        if (isAuthenticated) {
            navigate(from, { replace: true });
        }
    }, [isAuthenticated, navigate, from]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        if (!username.trim() || !password.trim()) {
            setError('사용자명과 비밀번호를 입력해주세요.');
            return;
        }

        setIsLoading(true);
        
        try {
            const success = await login(username, password);
            
            if (success) {
                // 로그인 성공 시 이전 페이지로 이동
                navigate(from, { replace: true });
            } else {
                setError('로그인에 실패했습니다. 사용자명과 비밀번호를 확인해주세요.');
            }
        } catch (err: any) {
            // 서버에서 반환한 에러 메시지 표시
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else if (err.response?.status === 401) {
                setError('사용자명 또는 비밀번호가 올바르지 않습니다.');
            } else if (err.response?.status >= 500) {
                setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            } else {
                setError('로그인 중 오류가 발생했습니다.');
            }
            console.error('Login error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        로그인
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        YSG Blog에 오신 것을 환영합니다
                    </p>
                </div>
                
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="username" className="sr-only">
                                사용자명
                            </label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                autoComplete="username"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="사용자명"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">
                                비밀번호
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-4">
                            <div className="flex">
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">
                                        {error}
                                    </h3>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? '로그인 중...' : '로그인'}
                        </button>
                    </div>

                    <div className="text-center space-y-2">
                        <p className="text-sm text-gray-600">
                            테스트 계정: <span className="font-mono font-semibold">root / root</span>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
