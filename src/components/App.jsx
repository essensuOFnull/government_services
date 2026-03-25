import { useState, useEffect } from 'react';
import Taskbar from './Taskbar';
import Window from './Window';
import { AuthProvider, useAuthContext } from './auth/AuthContext';
import { WindowsProvider, useWindowsManager } from '../hooks/useWindowsManager';
import AuthWrapper from './auth/AuthWrapper';
import ProfileWindow from './auth/ProfileWindow';
import MenuWindow from './MenuWindow';
import { loadWallpaper, applyWallpaper, loadWallpaperMode } from '../utils/wallpaperUtils';

function MainApp() {
  /*применяем фон рабочего стола*/
  useEffect(() => {
    const wallpaper = loadWallpaper();
    const mode = loadWallpaperMode();
    if (wallpaper) {
      applyWallpaper(wallpaper.type, wallpaper.url, mode);
    }
  }, []);
  /**/
  const { user, loading, isAuthenticated } = useAuthContext();
  const { windows, openWindow, closeWindow, updateWindow, bringToFront, minimizeWindow } = useWindowsManager();
  // Автоматическое открытие окна входа при загрузке
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Если нет окна входа, открываем его
      if (!windows.some(w => w.type === 'authorization')) {
        openWindow({
          type: 'authorization',
          title: 'Авторизация',
          children: <AuthWrapper />,
        });
      }
    } else if (!loading && isAuthenticated) {
      // Закрываем окна авторизации при входе
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
        onWindowClick={bringToFront}
        onClickMainButton={() => {
          openWindow({
            title: 'Меню услуг',
            children: <MenuWindow />,
          });
        }}
        user={user}
        onProfileClick={() => {
          openWindow({
            title: 'Профиль',
            children: <ProfileWindow />,
          });
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WindowsProvider>
        <MainApp />
      </WindowsProvider>
    </AuthProvider>
  );
}