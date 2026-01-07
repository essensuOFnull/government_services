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
        // Динамически загружаем CSS файл темы
        const loadThemeCSS = (themeName) => {
            // Удаляем старый link если есть
            const oldLink = document.getElementById('theme-styles');
            if (oldLink) {
                oldLink.remove();
            }

            if (themeName === 'dark') {
                const link = document.createElement('link');
                link.id = 'theme-styles';
                link.rel = 'stylesheet';
                link.href = '/styles/98/dark-theme.css';
                document.head.appendChild(link);
                
                document.body.classList.add('dark-theme');
                document.body.classList.remove('light-theme');
            } else {
                const link = document.createElement('link');
                link.id = 'theme-styles';
                link.rel = 'stylesheet';
                link.href = '/styles/98/light-theme.css';
                document.head.appendChild(link);
                
                document.body.classList.add('light-theme');
                document.body.classList.remove('dark-theme');
            }
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