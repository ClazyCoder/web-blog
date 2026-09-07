import { createContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
    theme: Theme;
    toggleTheme: () => void;
}

export const THEME_STORAGE_KEY = 'ysg-blog-theme';
export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function getInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'light';

    try {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {
        // localStorage를 사용할 수 없는 환경에서는 시스템 설정을 사용한다.
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

