import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const Header: React.FC = () => {
    return (
        <header className="bg-gray-800 shadow-md">
            <div className="container mx-auto px-4">
                <nav className="flex items-center justify-between h-16">
                    {/* 브랜드 - Link 사용 */}
                    <Link
                        to="/"
                        className="text-white text-xl font-bold hover:text-gray-300 transition-colors"
                    >
                        메뉴
                    </Link>

                    {/* NavLink로 active 상태 자동 처리 */}
                    <div className="flex items-center gap-6">
                        <NavLink
                            to="/"
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
                    </div>
                </nav>
            </div>
        </header>
    );
};

export default Header;