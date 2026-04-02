import { useWindowsManager } from '../hooks/useWindowsManager';
import { useTheme } from '../contexts/ThemeContext';
import ProfileWindow from './ProfileWindow';
import MenuWindow from './MenuWindow';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { useAvatarCache } from '../contexts/AvatarCacheContext';
import { useMessengerWebSocket } from '../hooks/useMessengerWebSocket';
import { useCallback } from 'react';

export default function Taskbar(props) {
    const { openWindow, closeWindow } = useWindowsManager();
    const { theme, toggleTheme } = useTheme();
    const { user, loading, isAuthenticated } = useAuthContext();

    // Заглушка для входящих сообщений WebSocket (можно расширить позже)
    const handleIncomingMessage = useCallback((message) => {
        // Обработка других типов сообщений, если понадобится
    }, []);

    const { wsRef } = useMessengerWebSocket(user?.id, handleIncomingMessage);
    const cache = useAvatarCache();
    
    return (
        <footer className='window taskbar'>
            {isAuthenticated && (
                <button onClick={() => {
                    openWindow({
                        title: 'Меню услуг',
                        children: <MenuWindow />,
                    })
                }}>Открыть меню</button>
            )}
            
            <img src="icon.svg" style={{ width: "32px", height: "32px" }} alt="icon" />
            <p>Госуслуги Подбредья</p>
            
            <fieldset className="taskbar-windows">
                {props.windows && props.windows.map(window => (
                    <button
                        key={window.id}
                        className="taskbar-window-button"
                        onClick={() => props.onWindowClick(window.id)}
                    >
                        {window.title}
                    </button>
                ))}
            </fieldset>

            <button
                onClick={toggleTheme}
                style={{ marginLeft: 'auto', marginRight: '16px' }}
            >
                {theme === 'light' ? '🌙 Тёмная тема' : '☀️ Светлая тема'}
            </button>
            {isAuthenticated && (
                <button
                    onClick={() => {
                        openWindow({
                            title: 'Профиль',
                            children: <ProfileWindow 
                                wsRef={wsRef}
                                cache={cache}
                            />,
                        })
                    }}
                    style={{ marginRight: '16px' }}
                >
                    Профиль
                </button>
            )}
        </footer>
    );
}