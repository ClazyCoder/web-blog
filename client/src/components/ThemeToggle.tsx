import React from 'react';
import { useTheme } from '../context/useTheme';

const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';
    const label = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className={`group/theme relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-gray-300 transition-colors duration-200 hover:border-emerald-400/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${className}`}
            aria-label={label}
            aria-pressed={isDark}
            title={label}
        >
            <span className="absolute inset-x-2 bottom-1 h-px scale-x-0 bg-emerald-400 transition-transform duration-200 group-hover/theme:scale-x-100" />
            {isDark ? (
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" strokeWidth="1.8" />
                    <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.28 5.28l1.42 1.42M17.3 17.3l1.42 1.42M18.72 5.28 17.3 6.7M6.7 17.3l-1.42 1.42" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            ) : (
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M20.2 15.35A8.5 8.5 0 0 1 8.65 3.8 8.5 8.5 0 1 0 20.2 15.35Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            )}
        </button>
    );
};

export default ThemeToggle;
