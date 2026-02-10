import React from 'react';
import { useNavigate } from 'react-router-dom';

interface UnauthorizedAccessProps {
    title?: string;
    message?: string;
    redirectPath?: string;
    showHomeButton?: boolean;
}

const UnauthorizedAccess: React.FC<UnauthorizedAccessProps> = ({
    title = '접근 권한이 없습니다',
    message = '이 페이지는 로그인한 사용자만 접근할 수 있습니다.',
    redirectPath,
    showHomeButton = true
}) => {
    const navigate = useNavigate();

    const handleLoginClick = () => {
        const currentPath = redirectPath || window.location.pathname;
        navigate('/login', { state: { from: { pathname: currentPath } } });
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
            <div className="max-w-md w-full">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                    <div className="mb-6">
                        <svg 
                            className="w-20 h-20 mx-auto text-red-500 dark:text-red-400" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                            />
                        </svg>
                    </div>
                    
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                        {title}
                    </h2>
                    
                    <p className="text-gray-600 dark:text-gray-400 mb-8 whitespace-pre-line">
                        {message}
                        {'\n'}로그인 후 다시 시도해주세요.
                    </p>
                    
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleLoginClick}
                            className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                        >
                            로그인하기
                        </button>
                        
                        {showHomeButton && (
                            <button
                                onClick={() => navigate('/')}
                                className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                            >
                                홈으로 돌아가기
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UnauthorizedAccess;
