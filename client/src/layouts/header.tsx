import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { confirmNavigation } from '../utils/navigationGuard';

const Header: React.FC = () => {
    const { user, isAuthenticated, logout } = useAuth();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    // 라우트 변경 시 모바일 메뉴 닫기
    useEffect(() => {
        setIsMobileMenuOpen(false);
        setShowUserMenu(false);
    }, [location.pathname]);

    // 네비게이션 가드를 적용하는 링크 클릭 핸들러
    const handleNavClick = (e: React.MouseEvent) => {
        if (!confirmNavigation()) {
            e.preventDefault();
        }
    };

    const handleLogout = () => {
        if (!confirmNavigation()) return;
        logout();
        setShowUserMenu(false);
        setIsMobileMenuOpen(false);
        navigate('/');
    };

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `transition-colors duration-200 ${isActive
            ? 'text-white font-semibold'
            : 'text-gray-300 hover:text-white'
        }`;

    const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
        `block py-3 px-4 text-base font-medium rounded-lg transition-colors duration-200 ${isActive
            ? 'text-white bg-emerald-800'
            : 'text-gray-300 hover:text-white hover:bg-emerald-800'
        }`;

    return (
        <header className="bg-emerald-900 shadow-md relative z-40">
            <div className="container mx-auto px-4">
                <nav className="flex items-center justify-between h-16">
                    {/* 브랜드 */}
                    <NavLink
                        to="/"
                        onClick={handleNavClick}
                        className="text-white text-xl font-bold hover:text-gray-300 transition-colors"
                    >
                        {import.meta.env.VITE_SITE_NAME || 'YSG Blog'}
                    </NavLink>

                    {/* 데스크톱 네비게이션 (md 이상) */}
                    <div className="hidden md:flex items-center gap-6">
                        <NavLink to="/" end onClick={handleNavClick} className={navLinkClass}>
                            Home
                        </NavLink>
                        <NavLink to="/board" onClick={handleNavClick} className={navLinkClass}>
                            Board
                        </NavLink>
                        <NavLink to="/others" onClick={handleNavClick} className={navLinkClass}>
                            Others
                        </NavLink>

                        {/* 로그인/사용자 메뉴 (데스크톱) */}
                        <div className="relative ml-4">
                            {isAuthenticated ? (
                                <>
                                    <button
                                        onClick={() => setShowUserMenu(!showUserMenu)}
                                        className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors"
                                    >
                                        <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center">
                                            <span className="text-sm font-semibold">
                                                {user?.username.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium">{user?.username}</span>
                                    </button>

                                    {showUserMenu && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-10"
                                                onClick={() => setShowUserMenu(false)}
                                            />
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
                                    onClick={handleNavClick}
                                    className={({ isActive }) =>
                                        `px-4 py-2 rounded transition-colors duration-200 ${isActive
                                            ? 'bg-emerald-700 text-white'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        }`
                                    }
                                >
                                    로그인
                                </NavLink>
                            )}
                        </div>
                    </div>

                    {/* 모바일 햄버거 버튼 (md 미만) */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="md:hidden p-2 text-white hover:text-gray-300 transition-colors"
                        aria-label="메뉴 열기"
                    >
                        {isMobileMenuOpen ? (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        )}
                    </button>
                </nav>
            </div>

            {/* 모바일 드롭다운 메뉴 */}
            {isMobileMenuOpen && (
                <>
                    {/* 배경 오버레이 */}
                    <div
                        className="fixed inset-0 bg-black/30 z-30 md:hidden"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="md:hidden absolute top-16 left-0 right-0 bg-emerald-900 border-t border-emerald-800 shadow-lg z-40">
                        <div className="container mx-auto px-4 py-3 space-y-1">
                            <NavLink to="/" end onClick={handleNavClick} className={mobileNavLinkClass}>
                                Home
                            </NavLink>
                            <NavLink to="/board" onClick={handleNavClick} className={mobileNavLinkClass}>
                                Board
                            </NavLink>
                            <NavLink to="/others" onClick={handleNavClick} className={mobileNavLinkClass}>
                                Others
                            </NavLink>

                            {/* 구분선 */}
                            <div className="border-t border-emerald-800 my-2"></div>

                            {/* 로그인/사용자 영역 (모바일) */}
                            {isAuthenticated ? (
                                <>
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center shrink-0">
                                            <span className="text-sm font-semibold text-white">
                                                {user?.username.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-white">{user?.username}</div>
                                            <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="block w-full text-left py-3 px-4 text-base font-medium text-gray-300 hover:text-white hover:bg-emerald-800 rounded-lg transition-colors"
                                    >
                                        로그아웃
                                    </button>
                                </>
                            ) : (
                                <NavLink
                                    to="/login"
                                    onClick={handleNavClick}
                                    className="block py-3 px-4 text-base font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg text-center transition-colors"
                                >
                                    로그인
                                </NavLink>
                            )}
                        </div>
                    </div>
                </>
            )}
        </header>
    );
};

export default Header;