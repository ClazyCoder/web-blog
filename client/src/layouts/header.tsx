import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Header: React.FC = () => {
    const { user, isAuthenticated, logout } = useAuth();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        setShowUserMenu(false);
        navigate('/');
    };

    return (
        <header className="bg-gray-800 shadow-md">
            <div className="container mx-auto px-4">
                <nav className="flex items-center justify-between h-16">
                    {/* 브랜드 - Link 사용 */}
                    <Link
                        to="/"
                        className="text-white text-xl font-bold hover:text-gray-300 transition-colors"
                    >
                        YSG Blog
                    </Link>

                    {/* NavLink로 active 상태 자동 처리 */}
                    <div className="flex items-center gap-6">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) =>
                                `transition-colors duration-200 ${isActive
                                    ? 'text-white font-semibold'
                                    : 'text-gray-300 hover:text-white'
                                }`
                            }
                        >
                            Home
                        </NavLink>
                        <NavLink
                            to="/board"
                            className={({ isActive }) =>
                                `transition-colors duration-200 ${isActive
                                    ? 'text-white font-semibold'
                                    : 'text-gray-300 hover:text-white'
                                }`
                            }
                        >
                            Board
                        </NavLink>
                        <NavLink
                            to="/others"
                            className={({ isActive }) =>
                                `transition-colors duration-200 ${isActive
                                    ? 'text-white font-semibold'
                                    : 'text-gray-300 hover:text-white'
                                }`
                            }
                        >
                            Others
                        </NavLink>

                        {/* 로그인/사용자 메뉴 */}
                        <div className="relative ml-4">
                            {isAuthenticated ? (
                                <>
                                    <button
                                        onClick={() => setShowUserMenu(!showUserMenu)}
                                        className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors"
                                    >
                                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                            <span className="text-sm font-semibold">
                                                {user?.username.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium">{user?.username}</span>
                                    </button>

                                    {showUserMenu && (
                                        <>
                                            {/* 배경 클릭 시 메뉴 닫기 */}
                                            <div
                                                className="fixed inset-0 z-10"
                                                onClick={() => setShowUserMenu(false)}
                                            />
                                            
                                            {/* 드롭다운 메뉴 */}
                                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20">
                                                <div className="px-4 py-2 text-sm text-gray-700 border-b">
                                                    <div className="font-semibold">{user?.username}</div>
                                                    <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                                                </div>
                                                <button
                                                    onClick={handleLogout}
                                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                                >
                                                    로그아웃
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </>
                            ) : (
                                <NavLink
                                    to="/login"
                                    className={({ isActive }) =>
                                        `px-4 py-2 rounded transition-colors duration-200 ${isActive
                                            ? 'bg-blue-700 text-white'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`
                                    }
                                >
                                    로그인
                                </NavLink>
                            )}
                        </div>
                    </div>
                </nav>
            </div>
        </header>
    );
};

export default Header;