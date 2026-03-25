import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export default function Window(props) {
  const {
    id,
    title = 'Окно',
    width = Math.floor(window.innerWidth / 3 * 2),
    height = Math.floor(window.innerHeight / 3 * 2),
    children,
    isMaximized: initialMaximized = false,
    position: initialPosition = { x: 100, y: 100 },
    zIndex = 1000,
    originalSize: initialOriginalSize,
    originalPosition: initialOriginalPosition,
    onClose,
    onUpdate,
    onBringToFront,
    onMinimize,
    isMinimized = false,
    showControls = true,
  } = props;

  const { theme } = useTheme();
  const windowRef = useRef(null);
  const titleBarRef = useRef(null);
  // Храним элементы, которым мы изменили курсор, и их исходные значения
  const cursorOverridesRef = useRef(new Map());

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(initialMaximized);
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState({ width, height });
  const [originalSize, setOriginalSize] = useState(initialOriginalSize || { width, height });
  const [originalPosition, setOriginalPosition] = useState(initialOriginalPosition || initialPosition);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Состояние для управления вкладками
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // ========== Инициализация вкладок из children ==========
  useEffect(() => {
    if (!windowRef.current) return;

    const container = windowRef.current;

    const tabLists = container.querySelectorAll('[role="tablist"]');

    tabLists.forEach((tabList, listIndex) => {
      const tabElements = tabList.querySelectorAll('[role="tab"]');
      const tabPanelElements = container.querySelectorAll('[role="tabpanel"]');

      tabElements.forEach((tab, tabIndex) => {
        tab.setAttribute('href', `#${id}-tab-${listIndex}-${tabIndex}`);
        tab.setAttribute('aria-selected', tabIndex === 0 ? 'true' : 'false');

        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const index = Array.from(tabElements).indexOf(e.currentTarget);
          setActiveTabIndex(index);

          tabElements.forEach((t, i) => {
            t.setAttribute('aria-selected', i === index ? 'true' : 'false');
          });

          tabPanelElements.forEach((panel, panelIndex) => {
            if (panelIndex === index) {
              panel.style.display = 'block';
            } else {
              panel.style.display = 'none';
            }
          });
        });
      });

      tabPanelElements.forEach((panel, panelIndex) => {
        panel.id = `${id}-tab-${listIndex}-${panelIndex}`;
        if (panelIndex === 0) {
          panel.style.display = 'block';
          panel.style.visibility = 'visible';
        } else {
          panel.style.display = 'none';
          panel.style.visibility = 'hidden';
        }
      });
    });

    return () => {
      tabLists.forEach((tabList) => {
        const tabElements = tabList.querySelectorAll('[role="tab"]');
        tabElements.forEach((tab) => {
          tab.replaceWith(tab.cloneNode(true));
        });
      });
    };
  }, [id, children]);

  useEffect(() => {
    if (!windowRef.current) return;

    const container = windowRef.current;
    const tabPanelElements = container.querySelectorAll('[role="tabpanel"]');

    tabPanelElements.forEach((panel, panelIndex) => {
      if (panelIndex === activeTabIndex) {
        panel.style.display = 'block';
        panel.style.visibility = 'visible';
      } else {
        panel.style.display = 'none';
        panel.style.visibility = 'hidden';
      }
    });
  }, [activeTabIndex]);

  useEffect(() => {
    setIsMaximized(initialMaximized);
    setPosition(initialPosition);
    setSize({ width, height });
    setOriginalSize(initialOriginalSize || { width, height });
    setOriginalPosition(initialOriginalPosition || initialPosition);
  }, [initialMaximized, initialPosition, width, height, initialOriginalSize, initialOriginalPosition]);

  // ========== Обработка touch / mouse ==========
  const getClientCoords = (e) => {
    if (e.touches) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      return { x: e.clientX, y: e.clientY };
    }
  };

  const handleDragStart = (e) => {
    if (isMaximized) return;
    e.preventDefault();
    onBringToFront?.();
    setIsDragging(true);

    const rect = windowRef.current.getBoundingClientRect();
    const coords = getClientCoords(e);
    setDragOffset({
      x: coords.x - rect.left,
      y: coords.y - rect.top,
    });
  };

  const handleResizeStart = (e, direction) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    onBringToFront?.();
    setIsResizing(true);
    setResizeDirection(direction);

    const coords = getClientCoords(e);
    setResizeStart({
      x: coords.x,
      y: coords.y,
      width: size.width,
      height: size.height,
    });
  };

  const updatePositionAndSize = (e) => {
    if (isDragging && !isMaximized) {
      const coords = getClientCoords(e);
      const newX = coords.x - dragOffset.x;
      const newY = coords.y - dragOffset.y;

      const maxX = window.innerWidth - size.width;
      const maxY = window.innerHeight - size.height;

      const newPosition = {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      };

      setPosition(newPosition);
      onUpdate?.({ position: newPosition });
    }

    if (isResizing && !isMaximized) {
      const coords = getClientCoords(e);
      const deltaX = coords.x - resizeStart.x;
      const deltaY = coords.y - resizeStart.y;
      const newSize = { ...size };
      const newPosition = { ...position };

      const minWidth = 200;
      const minHeight = 150;

      if (resizeDirection.includes('e')) {
        newSize.width = Math.max(minWidth, resizeStart.width + deltaX);
      }
      if (resizeDirection.includes('w')) {
        const newWidth = Math.max(minWidth, resizeStart.width - deltaX);
        const widthDiff = newSize.width - newWidth;
        newSize.width = newWidth;
        newPosition.x += widthDiff;
      }
      if (resizeDirection.includes('s')) {
        newSize.height = Math.max(minHeight, resizeStart.height + deltaY);
      }
      if (resizeDirection.includes('n')) {
        const newHeight = Math.max(minHeight, resizeStart.height - deltaY);
        const heightDiff = newSize.height - newHeight;
        newSize.height = newHeight;
        newPosition.y += heightDiff;
      }

      newPosition.x = Math.max(0, Math.min(newPosition.x, window.innerWidth - newSize.width));
      newPosition.y = Math.max(0, Math.min(newPosition.y, window.innerHeight - newSize.height));

      setSize(newSize);
      setPosition(newPosition);
      onUpdate?.({
        width: newSize.width,
        height: newSize.height,
        position: newPosition,
      });
    }
  };

  const handleEnd = () => {
    if (isDragging || isResizing) {
      onUpdate?.({
        position,
        width: size.width,
        height: size.height,
      });
    }
    setIsDragging(false);
    setIsResizing(false);
  };

  // Глобальные обработчики (мышь + touch)
  useEffect(() => {
    const handleMouseMove = (e) => updatePositionAndSize(e);
    const handleMouseUp = () => handleEnd();

    const handleTouchMove = (e) => {
      e.preventDefault();
      updatePositionAndSize(e);
    };
    const handleTouchEnd = () => handleEnd();

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, isResizing, dragOffset, resizeDirection, position, size, isMaximized, onUpdate, resizeStart]);

  // ========== Обработчики кнопок ==========
  const handleClose = () => {
    onClose?.(id);
  };

  const handleMinimize = () => {
    onMinimize?.(id);
  };

  const handleMaximizeRestore = () => {
    if (isMaximized) {
      setIsMaximized(false);
      setSize(originalSize);
      setPosition(originalPosition);
      onUpdate?.({
        isMaximized: false,
        position: originalPosition,
        width: originalSize.width,
        height: originalSize.height,
      });
    } else {
      setOriginalSize(size);
      setOriginalPosition(position);

      setIsMaximized(true);
      setPosition({ x: 0, y: 0 });
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      onUpdate?.({
        isMaximized: true,
        position: { x: 0, y: 0 },
        width: window.innerWidth,
        height: window.innerHeight,
        originalSize: size,
        originalPosition: position,
      });
    }
    onBringToFront?.();
  };

  const handleWindowClick = (e) => {
    if (!e.target.closest('.title-bar-controls') && !e.target.closest('.resize-handle')) {
      onBringToFront?.();
    }
  };

  // ========== Новый обработчик перетаскивания: проверяем курсор цели ==========
  const handleWindowMouseDown = (e) => {
    if (isMaximized) return;
    // Не начинаем перетаскивание при клике на элементы управления окном и ручки ресайза
    if (e.target.closest('.title-bar-controls')) return;
    if (e.target.closest('.resize-handle')) return;

    // Получаем вычисленный курсор целевого элемента
    const targetCursor = getComputedStyle(e.target).cursor;
    // Если курсор 'move' — значит элемент помечен как перетаскиваемый (наша замена)
    if (targetCursor === 'move') {
      handleDragStart(e);
    }
  };

  const handleDownload = async () => {
    const windowBodyElement = windowRef.current?.querySelector('.window-body');
    if (!windowBodyElement) return;

    const clonedBody = windowBodyElement.cloneNode(true);
    clonedBody.querySelectorAll('[onclick]').forEach((el) => el.removeAttribute('onclick'));

    const contentMarkup = clonedBody.innerHTML;

    try {
      const commonCss = await fetch('/styles/98/common.css').then((r) => r.text());
      const themeFile = theme === 'dark' ? 'dark-theme.css' : 'light-theme.css';
      const themeCss = await fetch(`/styles/98/${themeFile}`).then((r) => r.text());

      const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Экспорт</title>
  <style>
    ${commonCss}
  </style>
  <style>
    ${themeCss}
  </style>
</head>
<body>
  <div class="window-body">
    ${contentMarkup}
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const tabLists = document.querySelectorAll('[role="tablist"]');

      tabLists.forEach((tabList) => {
        const tabs = tabList.querySelectorAll('[role="tab"]');
        const tabPanels = document.querySelectorAll('[role="tabpanel"]');

        if (tabs.length > 0) {
          tabs.forEach((tab, index) => {
            if (tab.getAttribute('aria-selected') === 'true') {
              tabPanels[index]?.style.display = 'block';
            } else {
              tabPanels[index]?.style.display = 'none';
            }
          });

          tabs.forEach((tab, index) => {
            tab.addEventListener('click', function(e) {
              e.preventDefault();

              tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
              this.setAttribute('aria-selected', 'true');

              tabPanels.forEach((panel, panelIndex) => {
                panel.style.display = panelIndex === index ? 'block' : 'none';
              });
            });
          });
        }
      });
    });
  </script>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^\wа-яА-Я]+/g, '_')}_content.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Ошибка при загрузке CSS файлов:', error);
    }
  };

  const resizeHandleStyle = {
    position: 'absolute',
    backgroundColor: 'transparent',
  };

  return (
    <div
      ref={windowRef}
      className={`window ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: zIndex,
        display: isMinimized ? 'none' : 'flex',
        flexDirection: 'column',
      }}
      onClick={handleWindowClick}
      onMouseDown={handleWindowMouseDown}
      onTouchStart={handleWindowMouseDown}
    >
      {/* Title Bar */}
      <div
        ref={titleBarRef}
        className="title-bar"
        style={{ cursor: isMaximized ? 'default' : 'move', userSelect: 'none' }}
      >
        <div className="title-bar-text">{title}</div>
        {showControls && (
          <div className="title-bar-controls">
            <button aria-label="Download" onClick={handleDownload}></button>
            <button aria-label="Minimize" onClick={handleMinimize}></button>
            <button
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
              onClick={handleMaximizeRestore}
            ></button>
            <button aria-label="Close" onClick={handleClose}></button>
          </div>
        )}
      </div>

      {/* Window children */}
      <div
        className="window-body"
        style={{
          overflow: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          boxSizing: 'border-box',
          minWidth: '0',
          minHeight: '0',
          flexGrow: 1,
          position: 'relative',
        }}
      >
        {children}
      </div>

      {/* Resize Handles */}
      {!isMaximized && (
        <>
          <div
            className="resize-handle n"
            style={{ ...resizeHandleStyle, top: 0, left: 0, right: 0, height: 5, cursor: 'n-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 'n')}
            onTouchStart={(e) => handleResizeStart(e, 'n')}
          />
          <div
            className="resize-handle e"
            style={{ ...resizeHandleStyle, top: 0, right: 0, bottom: 0, width: 5, cursor: 'e-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            onTouchStart={(e) => handleResizeStart(e, 'e')}
          />
          <div
            className="resize-handle s"
            style={{ ...resizeHandleStyle, bottom: 0, left: 0, right: 0, height: 5, cursor: 's-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 's')}
            onTouchStart={(e) => handleResizeStart(e, 's')}
          />
          <div
            className="resize-handle w"
            style={{ ...resizeHandleStyle, top: 0, left: 0, bottom: 0, width: 5, cursor: 'w-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            onTouchStart={(e) => handleResizeStart(e, 'w')}
          />
          <div
            className="resize-handle ne"
            style={{ ...resizeHandleStyle, top: 0, right: 0, width: 10, height: 10, cursor: 'ne-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
            onTouchStart={(e) => handleResizeStart(e, 'ne')}
          />
          <div
            className="resize-handle nw"
            style={{ ...resizeHandleStyle, top: 0, left: 0, width: 10, height: 10, cursor: 'nw-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
            onTouchStart={(e) => handleResizeStart(e, 'nw')}
          />
          <div
            className="resize-handle se"
            style={{ ...resizeHandleStyle, bottom: 0, right: 0, width: 10, height: 10, cursor: 'se-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            onTouchStart={(e) => handleResizeStart(e, 'se')}
          />
          <div
            className="resize-handle sw"
            style={{ ...resizeHandleStyle, bottom: 0, left: 0, width: 10, height: 10, cursor: 'sw-resize' }}
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            onTouchStart={(e) => handleResizeStart(e, 'sw')}
          />
        </>
      )}
    </div>
  );
}