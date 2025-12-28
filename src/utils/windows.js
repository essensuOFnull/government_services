/**
 * Вспомогательные функции для работы с окнами
 * Используются вместе с useWindowsManager хуком
 */

/**
 * Открывает окно с компонентом
 * @param {Function} useWindowsManager - хук для управления окнами
 * @param {string} title - заголовок окна
 * @param {ReactNode} component - React компонент для отображения
 * @param {object} options - дополнительные опции (width, height, resizable и т.д.)
 * @returns {string} id открытого окна
 */
export function openComponentWindow(useWindowsManager, title, component, options = {}) {
  const { openWindow } = useWindowsManager();
  
  return openWindow({
    title,
    width: options.width || 500,
    height: options.height || 400,
    resizable: options.resizable !== false,
    children: component,
    ...options,
  });
}

/**
 * Закрывает окно по id
 * @param {Function} useWindowsManager - хук для управления окнами
 * @param {string} windowId - id окна для закрытия
 */
export function closeComponentWindow(useWindowsManager, windowId) {
  const { closeWindow } = useWindowsManager();
  closeWindow(windowId);
}

/**
 * Предустановленные конфигурации для стандартных окон
 */
export const windowConfigs = {
  small: { width: 400, height: 300 },
  medium: { width: 600, height: 500 },
  large: { width: 800, height: 600 },
  dialog: { width: 500, height: 400, resizable: false },
};

/**
 * Быстрое открытие окна с предустановкой размера
 * @example
 * const { openWindow } = useWindowsManager();
 * openQuickWindow(openWindow, 'Мой диалог', <MyComponent />, 'dialog');
 */
export function openQuickWindow(openWindow, title, component, size = 'medium', options = {}) {
  const config = windowConfigs[size] || windowConfigs.medium;
  
  return openWindow({
    title,
    ...config,
    children: component,
    resizable: config.resizable !== false,
    ...options,
  });
}
