import { useState, useEffect,useCallback } from 'react';
import Taskbar from './Taskbar';
import Window from './Window';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { WindowsProvider, useWindowsManager } from '../hooks/useWindowsManager';
import AuthWrapper from './AuthWrapper';
import { loadWallpaper, applyWallpaper, loadWallpaperMode } from '../utils/wallpaperUtils';

import { AvatarCacheProvider } from '../contexts/AvatarCacheContext';
import { useMessengerWebSocket } from '../hooks/useMessengerWebSocket';

function MainApp() {
  const { user, loading, isAuthenticated } = useAuthContext();
  const { windows, openWindow, closeWindow, updateWindow, bringToFront, minimizeWindow } = useWindowsManager();

  // Обработчик сообщений WebSocket (можно добавить логику для чата)
  const handleWebSocketMessage = useCallback((data) => {
    // Здесь можно обрабатывать другие типы сообщений
  }, []);

  // Подключаем WebSocket для получения уведомлений об аватарках
  const { send, wsRef } = useMessengerWebSocket(user?.id, handleWebSocketMessage);

  // Применяем фон рабочего стола
  useEffect(() => {
    const wallpaper = loadWallpaper();
    const mode = loadWallpaperMode();
    if (wallpaper) {
      applyWallpaper(wallpaper.type, wallpaper.url, mode);
    }
  }, []);

  // Предупреждение при обновлении страницы
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Вы действительно хотите покинуть страницу? Несохранённые данные могут быть потеряны.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Автоматическое открытие окна входа при загрузке
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      if (!windows.some(w => w.type === 'authorization')) {
        openWindow({
          type: 'authorization',
          title: 'Авторизация',
          children: <AuthWrapper />,
        });
      }
    } else if (!loading && isAuthenticated) {
      windows.forEach(w => {
        if (w.type === 'authorization') {
          closeWindow(w.id);
        }
      });
    }
  }, [loading, isAuthenticated, windows, openWindow, closeWindow]);

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0078d4',
        color: 'white',
        fontSize: '24px'
      }}>
        Загрузка системы...
      </div>
    );
  }

  return (
    <>
      {windows.map(windowData => (
        <Window
          key={windowData.id}
          {...windowData}
          onClose={() => closeWindow(windowData.id)}
          onUpdate={(updates) => updateWindow(windowData.id, updates)}
          onBringToFront={() => bringToFront(windowData.id)}
          onMinimize={() => minimizeWindow(windowData.id)}
        >
          {windowData.children}
        </Window>
      ))}
      <Taskbar
        windows={windows}
        onWindowClick={bringToFront} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WindowsProvider>
        <AvatarCacheProvider>
          <MainApp />
        </AvatarCacheProvider>
      </WindowsProvider>
    </AuthProvider>
  );
}