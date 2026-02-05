import React from 'react';
import { NavLink } from 'react-router-dom';

const Footer: React.FC = () => {
    return (
        <footer className="bg-gray-800 py-4">
            <nav className="flex justify-center items-center gap-6">
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
                <span className="text-gray-500 cursor-not-allowed">
                    Others
                </span>
            </nav>
        </footer>
    );
};

export default Footer;