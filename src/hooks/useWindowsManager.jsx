import { createContext, useContext, useState, useCallback } from 'react';

const WindowsContext = createContext();

/**
 * Провайдер для управления окнами
 */
export function WindowsProvider({ children }) {
  const [windows, setWindows] = useState([]);
  const [zIndexCounter, setZIndexCounter] = useState(1000);

  const openWindow = useCallback((config) => {
    const id = `${Date.now()}-${Math.random()}`;
    const offset = windows.length * 20;
    
    const newWindow = {
      id,
      zIndex: zIndexCounter,
      isMaximized: false,
      isMinimized: false,
      position: { x: 50 + offset, y: 50 + offset },
      ...config,
    };

    // Сохраняем оригинальные размеры и позицию
    if (!newWindow.originalSize) {
      newWindow.originalSize = {
        width: newWindow.width || 400,
        height: newWindow.height || 300,
      };
    }

    if (!newWindow.originalPosition) {
      newWindow.originalPosition = { ...newWindow.position };
    }

    setWindows((prev) => [...prev, newWindow]);
    setZIndexCounter((prev) => prev + 1);

    return id;
  }, [windows.length, zIndexCounter]);

  const closeWindow = useCallback((id) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const updateWindow = useCallback((id, updates) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
    );
  }, []);

  const bringToFront = useCallback((id) => {
    setZIndexCounter((prev) => prev + 1);
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, zIndex: zIndexCounter, isMinimized: false }
          : w
      )
    );
  }, [zIndexCounter]);

  const minimizeWindow = useCallback((id) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w))
    );
  }, []);

  const closeAllWindows = useCallback(() => {
    setWindows([]);
  }, []);

  const getWindow = useCallback((id) => {
    return windows.find((w) => w.id === id);
  }, [windows]);

  const getAllWindows = useCallback(() => {
    return windows;
  }, [windows]);

  const value = {
    windows,
    openWindow,
    closeWindow,
    updateWindow,
    bringToFront,
    minimizeWindow,
    closeAllWindows,
    getWindow,
    getAllWindows,
  };

  return (
    <WindowsContext.Provider value={value}>{children}</WindowsContext.Provider>
  );
}

/**
 * Хук для использования управления окнами
 * @returns {Object} методы управления окнами
 */
export function useWindowsManager() {
  const context = useContext(WindowsContext);

  if (!context) {
    throw new Error(
      'useWindowsManager должен использоваться внутри WindowsProvider'
    );
  }

  return context;
}

export default WindowsContext;
