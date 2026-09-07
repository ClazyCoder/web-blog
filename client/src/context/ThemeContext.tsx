import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { getInitialTheme, ThemeContext, THEME_STORAGE_KEY } from './theme';
import type { Theme, ThemeContextValue } from './theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(getInitialTheme);

    useLayoutEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('dark', theme === 'dark');
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
    }, [theme]);

    useEffect(() => {
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // 저장이 차단되어도 현재 세션의 테마 전환은 유지한다.
        }
    }, [theme]);

    const value = useMemo<ThemeContextValue>(() => ({
        theme,
        toggleTheme: () => setTheme(currentTheme => currentTheme === 'dark' ? 'light' : 'dark'),
    }), [theme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
