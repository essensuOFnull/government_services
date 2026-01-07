import { useWindowsManager } from '../hooks/useWindowsManager';
import { useTheme } from '../contexts/ThemeContext';
import ProfileWindow from './auth/ProfileWindow';
import MenuWindow from './MenuWindow';
import { AuthProvider, useAuthContext } from './auth/AuthContext';

export default function Taskbar(props) {
    const { openWindow, closeWindow } = useWindowsManager();
    const { theme, toggleTheme } = useTheme();
	const { user, loading, isAuthenticated } = useAuthContext();

    return (
        <footer className='taskbar'>
			{isAuthenticated && (
				<button onClick={() => {
					openWindow({
						title: 'Меню услуг',
						children: <MenuWindow />,
					})
				}}>Открыть меню</button>
			)}
            
            <img src="icon.svg" style={{ width: "32px", height: "32px" }} alt="icon"></img>
            <p>Госуслуги Подбредья</p>
            
            <div className="taskbar-windows status-field-border">
                {props.windows && props.windows.map(window => (
                    <button
                        key={window.id}
                        className="taskbar-window-button"
                        onClick={() => props.onWindowClick(window.id)}
                    >
                        {window.title}
                    </button>
                ))}
            </div>

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
							children: <ProfileWindow />,
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