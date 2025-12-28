import { useState, useCallback, useEffect } from 'react';
import Taskbar from './Taskbar';
import Window from './Window';
import MenuWindow from './MenuWindow';
import { AuthProvider, useAuthContext } from './auth/AuthContext';
import LoginWindow from './auth/LoginWindow';
import RegisterWindow from './auth/RegisterWindow';
import ProfileWindow from './auth/ProfileWindow';

function MainApp() {
  const [windows, setWindows] = useState([]);
  const [zIndexCounter, setZIndexCounter] = useState(1000);
  const { user, loading, isAuthenticated } = useAuthContext();

  const addWindow = (windowData) => {
    const id = `${Date.now()}-${windows.length}`;
    const newWindow = {
      id,
      zIndex: zIndexCounter,
      ...windowData,
      isMaximized: false,
      isMinimized: false,
      position: { x: 50 + windows.length * 20, y: 50 + windows.length * 20 },
      originalSize: { width: windowData.width, height: windowData.height },
      originalPosition: { x: 50 + windows.length * 20, y: 50 + windows.length * 20 }
    };
    
    setWindows(prev => [...prev, newWindow]);
    setZIndexCounter(prev => prev + 1);
  };

  const removeWindow = (id) => {
    setWindows(prev => prev.filter(window => window.id !== id));
  };

  const updateWindow = (id, updates) => {
    setWindows(prev => prev.map(window => 
      window.id === id ? { ...window, ...updates } : window
    ));
  };

  const bringToFront = (id) => {
    setWindows(prev => prev.map(window => 
      window.id === id 
        ? { ...window, zIndex: zIndexCounter, isMinimized: false }
        : { ...window, isMinimized: window.id === id ? false : window.isMinimized }
    ));
    setZIndexCounter(prev => prev + 1);
  };

  const minimizeWindow = useCallback((id) => {
    setWindows(prev => prev.map(window => 
      window.id === id 
        ? { ...window, isMinimized: true }
        : window
    ));
  }, []);

  // Автоматическое открытие окна входа/регистрации при загрузке
  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        // Если не авторизован, открываем окно входа
        if (!windows.find(w => w.title === 'Вход')) {
          addWindow({
            title: 'Вход',
            width: 400,
            height: 300,
            resizable: false,
            showControls: false,
            children: <LoginWindow onRegisterClick={() => {
              // Закрываем окно входа
              const loginWindow = windows.find(w => w.title === 'Вход');
              if (loginWindow) removeWindow(loginWindow.id);
              
              // Открываем окно регистрации
              addWindow({
                title: 'Регистрация',
                width: 400,
                height: 400,
                resizable: false,
                showControls: false,
                children: <RegisterWindow onLoginClick={() => {
                  // Закрываем окно регистрации
                  const regWindow = windows.find(w => w.title === 'Регистрация');
                  if (regWindow) removeWindow(regWindow.id);
                  
                  // Открываем окно входа
                  addWindow({
                    title: 'Вход',
                    width: 400,
                    height: 300,
                    resizable: false,
                    showControls: false,
                    children: <LoginWindow onRegisterClick={() => {
                      const loginWin = windows.find(w => w.title === 'Вход');
                      if (loginWin) removeWindow(loginWin.id);
                      
                      addWindow({
                        title: 'Регистрация',
                        width: 400,
                        height: 400,
                        resizable: false,
                        showControls: false,
                        children: <RegisterWindow onLoginClick={() => {
                          const regWin = windows.find(w => w.title === 'Регистрация');
                          if (regWin) removeWindow(regWin.id);
                          
                          addWindow({
                            title: 'Вход',
                            width: 400,
                            height: 300,
                            resizable: false,
                            showControls: false,
                            children: <LoginWindow />
                          });
                        }} />
                      });
                    }} />
                  });
                }} />
              });
            }} />
          });
        }
      } else {
        // Если авторизован, закрываем все окна авторизации
        const authWindows = windows.filter(w => 
          w.title === 'Вход' || w.title === 'Регистрация' || w.title === 'Профиль'
        );
        authWindows.forEach(window => removeWindow(window.id));
      }
    }
  }, [loading, isAuthenticated]);

  // Добавляем кнопку профиля в меню, если пользователь авторизован
  const getMenuWindowContent = () => {
    if (!isAuthenticated) {
      return MenuWindow().props.children;
    }
    
    // Модифицируем меню для авторизованного пользователя
    return React.cloneElement(MenuWindow().props.children, {
      children: (
        <>
          <div className="menu-section">
            <h3>Профиль</h3>
            <button 
              onClick={() => {
                addWindow({
                  title: 'Профиль',
                  width: 500,
                  height: 400,
                  resizable: false,
                  children: <ProfileWindow />
                });
              }}
              className="menu-item"
            >
              Мой профиль
            </button>
          </div>
          {MenuWindow().props.children.props.children}
        </>
      )
    });
  };

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
      {windows.map(window => (
        <Window
          key={window.id}
          id={window.id}
          title={window.title}
          width={window.width}
          height={window.height}
          isMaximized={window.isMaximized}
          position={window.position}
          zIndex={window.zIndex}
          originalSize={window.originalSize}
          originalPosition={window.originalPosition}
          onClose={() => removeWindow(window.id)}
          onUpdate={(updates) => updateWindow(window.id, updates)}
          onBringToFront={() => bringToFront(window.id)}
          onMinimize={() => minimizeWindow(window.id)}
          isMinimized={window.isMinimized}
        >
          {window.children}
        </Window>
      ))}
      {isAuthenticated && (
        <Taskbar 
          windows={windows}
          onWindowClick={bringToFront}
          onClickMainButton={() => {
            addWindow(MenuWindow().props);
          }}
          user={user}
          onProfileClick={() => {
            if (isAuthenticated) {
              addWindow({
                title: 'Профиль',
                width: 500,
                height: 400,
                resizable: false,
                children: <ProfileWindow />
              });
            }
          }}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}