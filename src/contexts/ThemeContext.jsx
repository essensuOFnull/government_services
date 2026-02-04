import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
    theme: 'light',
    toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme || 'light';
    });

    useEffect(() => {
        // Динамически загружаем CSS файл темы с кэш-busterом
        const loadThemeCSS = (themeName) => {
            // Удаляем старый link если есть
            const oldLink = document.getElementById('theme-styles');
            if (oldLink) {
                oldLink.remove();
            }

            const timestamp = new Date().getTime();
            const themeFile = themeName === 'dark' ? 'dark-theme.css' : 'light-theme.css';
            
            const link = document.createElement('link');
            link.id = 'theme-styles';
            link.rel = 'stylesheet';
            link.href = `/styles/98/${themeFile}?v=${timestamp}`;
            document.head.appendChild(link);
            
            // Обновляем классы на body
            document.body.classList.remove('dark-theme', 'light-theme');
            document.body.classList.add(themeName === 'dark' ? 'dark-theme' : 'light-theme');
            
            // Добавляем атрибут data для дополнительного контроля
            document.documentElement.setAttribute('data-theme', themeName);
        };

        loadThemeCSS(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};