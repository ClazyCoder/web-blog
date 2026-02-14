import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { confirmNavigation } from '../utils/navigationGuard';

const Header: React.FC = () => {
    const { user, isAuthenticated, logout } = useAuth();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const userMenuRef = useRef<HTMLDivElement>(null);

    // 라우트 변경 시 메뉴 닫기
    useEffect(() => {
        setIsMobileMenuOpen(false);
        setShowUserMenu(false);
    }, [location.pathname]);

    // 스크롤 시 헤더 배경 강화
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // 외부 클릭으로 사용자 메뉴 닫기
    useEffect(() => {
        if (!showUserMenu) return;
        const onClickOutside = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [showUserMenu]);

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
        `relative px-1 py-1 text-sm font-medium transition-colors duration-200 ${
            isActive
                ? 'text-white'
                : 'text-gray-300 hover:text-white'
        }`;

    const navIndicatorClass = (isActive: boolean) =>
        `absolute -bottom-1 left-0 right-0 h-0.5 rounded-full transition-all duration-200 ${
            isActive ? 'bg-emerald-400 scale-x-100' : 'bg-transparent scale-x-0'
        }`;

    const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 py-3 px-4 text-[15px] font-medium rounded-xl transition-all duration-200 ${
            isActive
                ? 'text-white bg-white/10'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
        }`;

    const siteName = import.meta.env.VITE_SITE_NAME || 'YSG Blog';

    return (
        <header
            className={`sticky top-0 z-40 transition-all duration-300 ${
                scrolled
                    ? 'bg-gray-900/95 backdrop-blur-md shadow-lg shadow-black/5'
                    : 'bg-gray-900/80 backdrop-blur-sm'
            }`}
        >
            <div className="max-w-6xl mx-auto px-4">
                <nav className="flex items-center justify-between h-16">
                    {/* 브랜드 */}
                    <NavLink
                        to="/"
                        onClick={handleNavClick}
                        className="flex items-center gap-2 text-white font-bold text-lg hover:opacity-80 transition-opacity"
                    >
                        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-sm font-bold shadow-md shadow-emerald-500/20">
                            {siteName.charAt(0)}
                        </div>
                        <span className="hidden sm:inline">{siteName}</span>
                    </NavLink>

                    {/* 데스크톱 네비게이션 */}
                    <div className="hidden md:flex items-center gap-1">
                        <div className="flex items-center gap-6 mr-6">
                            <NavLink to="/" end onClick={handleNavClick} className={navLinkClass}>
                                {({ isActive }) => (
                                    <span className="relative">
                                        Home
                                        <span className={navIndicatorClass(isActive)} />
                                    </span>
                                )}
                            </NavLink>
                            <NavLink to="/board" onClick={handleNavClick} className={navLinkClass}>
                                {({ isActive }) => (
                                    <span className="relative">
                                        Board
                                        <span className={navIndicatorClass(isActive)} />
                                    </span>
                                )}
                            </NavLink>
                            {isAuthenticated && (
                                <NavLink to="/admin" onClick={handleNavClick} className={navLinkClass}>
                                    {({ isActive }) => (
                                        <span className="relative">
                                            Admin
                                            <span className={navIndicatorClass(isActive)} />
                                        </span>
                                    )}
                                </NavLink>
                            )}
                        </div>

                        {/* 구분선 */}
                        <div className="w-px h-5 bg-gray-700 mr-4" />

                        {/* 로그인/사용자 메뉴 */}
                        <div className="relative" ref={userMenuRef}>
                            {isAuthenticated ? (
                                <>
                                    <button
                                        onClick={() => setShowUserMenu(!showUserMenu)}
                                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors"
                                        aria-label="사용자 메뉴"
                                        aria-haspopup="true"
                                        aria-expanded={showUserMenu}
                                    >
                                        <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center ring-2 ring-emerald-400/30">
                                            <span className="text-sm font-semibold text-white">
                                                {user?.username.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium text-gray-200">{user?.username}</span>
                                        <svg
                                            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {/* 드롭다운 메뉴 */}
                                    <div
                                        className={`absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-gray-800 shadow-xl ring-1 ring-black/5 dark:ring-white/10 transition-all duration-200 origin-top-right ${
                                            showUserMenu
                                                ? 'opacity-100 scale-100 translate-y-0'
                                                : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
                                        }`}
                                    >
                                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.username}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user?.email}</p>
                                        </div>
                                        <div className="p-1.5">
                                            <button
                                                onClick={handleLogout}
                                                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                                            >
                                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                </svg>
                                                로그아웃
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <NavLink
                                    to="/login"
                                    onClick={handleNavClick}
                                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all duration-200 shadow-md shadow-emerald-600/20 hover:shadow-emerald-500/30"
                                >
                                    로그인
                                </NavLink>
                            )}
                        </div>
                    </div>

                    {/* 모바일 햄버거 버튼 */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="md:hidden relative w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
                        aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
                    >
                        <div className="relative w-5 h-4">
                            <span
                                className={`absolute left-0 right-0 h-0.5 bg-white rounded-full transition-all duration-300 ${
                                    isMobileMenuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0'
                                }`}
                            />
                            <span
                                className={`absolute left-0 right-0 h-0.5 bg-white rounded-full top-1/2 -translate-y-1/2 transition-all duration-300 ${
                                    isMobileMenuOpen ? 'opacity-0 scale-x-0' : 'opacity-100'
                                }`}
                            />
                            <span
                                className={`absolute left-0 right-0 h-0.5 bg-white rounded-full transition-all duration-300 ${
                                    isMobileMenuOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-0'
                                }`}
                            />
                        </div>
                    </button>
                </nav>
            </div>

            {/* 모바일 메뉴 */}
            <div
                className={`md:hidden fixed inset-0 top-16 z-30 transition-all duration-300 ${
                    isMobileMenuOpen ? 'visible' : 'invisible'
                }`}
            >
                {/* 배경 오버레이 */}
                <div
                    className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
                        isMobileMenuOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                />

                {/* 메뉴 패널 */}
                <div
                    className={`absolute top-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-white/5 shadow-xl transition-all duration-300 ${
                        isMobileMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
                    }`}
                >
                    <div className="max-w-6xl mx-auto px-4 py-3 space-y-1">
                        <NavLink to="/" end onClick={handleNavClick} className={mobileNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    <svg className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                                    </svg>
                                    Home
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/board" onClick={handleNavClick} className={mobileNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    <svg className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                                    </svg>
                                    Board
                                </>
                            )}
                        </NavLink>

                        {isAuthenticated && (
                            <NavLink to="/admin" onClick={handleNavClick} className={mobileNavLinkClass}>
                                {({ isActive }) => (
                                    <>
                                        <svg className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Admin
                                    </>
                                )}
                            </NavLink>
                        )}

                        {/* 구분선 */}
                        <div className="border-t border-white/5 my-2" />

                        {/* 로그인/사용자 영역 */}
                        {isAuthenticated ? (
                            <>
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center ring-2 ring-emerald-400/20 shrink-0">
                                        <span className="text-sm font-bold text-white">
                                            {user?.username.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-white">{user?.username}</div>
                                        <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-3 w-full py-3 px-4 text-[15px] font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                                >
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    로그아웃
                                </button>
                            </>
                        ) : (
                            <NavLink
                                to="/login"
                                onClick={handleNavClick}
                                className="flex items-center justify-center py-3 px-4 text-[15px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors shadow-md shadow-emerald-600/20"
                            >
                                로그인
                            </NavLink>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
