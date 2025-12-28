import { useState, useRef, useEffect, useMemo } from 'react';

export default function Window(props) {
	const {
		id,
		title = 'Окно',
		width = Math.floor(window.innerWidth/3*2),
		height = Math.floor(window.innerHeight/3*2),
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
		isMinimized=false,
	} = props;

	const windowRef = useRef(null);
	const titleBarRef = useRef(null);
	const tabListRef = useRef(null);
	const tabsContentRef = useRef(null);
	
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
	const [tabs, setTabs] = useState([]);
	const [tabPanels, setTabPanels] = useState([]);

	// Инициализация вкладок из children
	useEffect(() => {
		if (!windowRef.current) return;

		const container = windowRef.current;
		
		// Находим все элементы с ролью tablist
		const tabLists = container.querySelectorAll('[role="tablist"]');
		
		tabLists.forEach((tabList, listIndex) => {
			// Находим вкладки и панели
			const tabElements = tabList.querySelectorAll('[role="tab"]');
			const tabPanelElements = container.querySelectorAll('[role="tabpanel"]');
			
			// Устанавливаем href для вкладок
			tabElements.forEach((tab, tabIndex) => {
				tab.setAttribute('href', `#${id}-tab-${listIndex}-${tabIndex}`);
				tab.setAttribute('aria-selected', tabIndex === 0 ? 'true' : 'false');
				
				// Добавляем обработчик клика
				tab.addEventListener('click', (e) => {
					e.preventDefault();
					const index = Array.from(tabElements).indexOf(e.currentTarget);
					setActiveTabIndex(index);
					
					// Обновляем состояние всех вкладок
					tabElements.forEach((t, i) => {
						t.setAttribute('aria-selected', i === index ? 'true' : 'false');
					});
					
					// Обновляем видимость панелей
					tabPanelElements.forEach((panel, panelIndex) => {
						if (panelIndex === index) {
							panel.style.display = 'block';
							panel.style.visibility = 'visible';
						} else {
							panel.style.display = 'none';
							panel.style.visibility = 'hidden';
						}
					});
				});
			});
			
			// Устанавливаем id для панелей и управляем их видимостью
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
		
		// Очистка обработчиков при размонтировании
		return () => {
			tabLists.forEach(tabList => {
				const tabElements = tabList.querySelectorAll('[role="tab"]');
				tabElements.forEach(tab => {
					tab.replaceWith(tab.cloneNode(true));
				});
			});
		};
	}, [id, children]);

	// Обновляем видимость панелей при изменении activeTabIndex
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

	// Синхронизация с props
	useEffect(() => {
		setIsMaximized(initialMaximized);
		setPosition(initialPosition);
		setSize({ width, height });
		setOriginalSize(initialOriginalSize || { width, height });
		setOriginalPosition(initialOriginalPosition || initialPosition);
	}, [initialMaximized, initialPosition, width, height, initialOriginalSize, initialOriginalPosition]);

	// Обработчики перетаскивания
	const handleMouseDown = (e) => {
		if (e.target.closest('.title-bar-controls')) return;
		if (isMaximized) return;
		
		onBringToFront?.();
		setIsDragging(true);
		const rect = windowRef.current.getBoundingClientRect();
		setDragOffset({
			x: e.clientX - rect.left,
			y: e.clientY - rect.top
		});
		e.preventDefault();
	};

	// Обработчики изменения размера
	const handleResizeMouseDown = (e, direction) => {
		if (isMaximized) return;
		
		onBringToFront?.();
		setIsResizing(true);
		setResizeDirection(direction);
		setResizeStart({
			x: e.clientX,
			y: e.clientY,
			width: size.width,
			height: size.height
		});
		e.stopPropagation();
		e.preventDefault();
	};

	// Глобальные обработчики мыши
	useEffect(() => {
		const handleMouseMove = (e) => {
			if (isDragging && !isMaximized) {
				const newX = e.clientX - dragOffset.x;
				const newY = e.clientY - dragOffset.y;
				
				// Ограничиваем перемещение в пределах экрана
				const maxX = window.innerWidth - size.width;
				const maxY = window.innerHeight - size.height;
				
				const newPosition = {
					x: Math.max(0, Math.min(newX, maxX)),
					y: Math.max(0, Math.min(newY, maxY))
				};
				
				setPosition(newPosition);
				
				// Обновляем позицию в реальном времени
				onUpdate?.({
					position: newPosition
				});
			}

			if (isResizing && !isMaximized) {
				const deltaX = e.clientX - resizeStart.x;
				const deltaY = e.clientY - resizeStart.y;
				const newSize = { ...size };
				const newPosition = { ...position };

				// Минимальные размеры окна
				const minWidth = 200;
				const minHeight = 150;

				// Изменение размера с правой стороны
				if (resizeDirection.includes('e')) {
					newSize.width = Math.max(minWidth, resizeStart.width + deltaX);
				}
				
				// Изменение размера с левой стороны
				if (resizeDirection.includes('w')) {
					const newWidth = Math.max(minWidth, resizeStart.width - deltaX);
					const widthDiff = newSize.width - newWidth;
					newSize.width = newWidth;
					newPosition.x += widthDiff;
				}
				
				// Изменение размера с нижней стороны
				if (resizeDirection.includes('s')) {
					newSize.height = Math.max(minHeight, resizeStart.height + deltaY);
				}
				
				// Изменение размера с верхней стороны
				if (resizeDirection.includes('n')) {
					const newHeight = Math.max(minHeight, resizeStart.height - deltaY);
					const heightDiff = newSize.height - newHeight;
					newSize.height = newHeight;
					newPosition.y += heightDiff;
				}

				// Ограничиваем позицию, чтобы окно не вышло за пределы экрана
				newPosition.x = Math.max(0, Math.min(newPosition.x, window.innerWidth - newSize.width));
				newPosition.y = Math.max(0, Math.min(newPosition.y, window.innerHeight - newSize.height));

				setSize(newSize);
				setPosition(newPosition);
				
				// Обновляем размер в реальном времени
				onUpdate?.({
					width: newSize.width,
					height: newSize.height,
					position: newPosition
				});
			}
		};

		const handleMouseUp = () => {
			if (isDragging || isResizing) {
				onUpdate?.({
					position,
					width: size.width,
					height: size.height
				});
			}
			setIsDragging(false);
			setIsResizing(false);
		};

		if (isDragging || isResizing) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
			
			return () => {
				document.removeEventListener('mousemove', handleMouseMove);
				document.removeEventListener('mouseup', handleMouseUp);
			};
		}
	}, [isDragging, isResizing, dragOffset, resizeDirection, position, size, isMaximized, onUpdate, resizeStart]);

	const handleClose = () => {
		onClose?.(id);
	};

	const handleMinimize = () => {
		onMinimize?.(id);
	};

	const handleMaximizeRestore = () => {
		if (isMaximized) {
			// Восстанавливаем исходные размеры и позицию
			setIsMaximized(false);
			setSize(originalSize);
			setPosition(originalPosition);
			onUpdate?.({
				isMaximized: false,
				position: originalPosition,
				width: originalSize.width,
				height: originalSize.height
			});
		} else {
			// Сохраняем текущие размеры и позицию
			setOriginalSize(size);
			setOriginalPosition(position);
			
			// Разворачиваем на весь экран
			setIsMaximized(true);
			setPosition({ x: 0, y: 0 });
			setSize({
				width: window.innerWidth,
				height: window.innerHeight
			});
			onUpdate?.({
				isMaximized: true,
				position: { x: 0, y: 0 },
				width: window.innerWidth,
				height: window.innerHeight,
				originalSize: size,
				originalPosition: position
			});
		}
		onBringToFront?.();
	};

	// Обработчик клика по окну
	const handleWindowClick = (e) => {
		// Не вызываем bringToFront если кликнули на элементы управления
		if (!e.target.closest('.title-bar-controls') && !e.target.closest('.resize-handle')) {
			onBringToFront?.();
		}
	};

	// Стили для resize handles
	const resizeHandleStyle = {
		position: 'absolute',
		backgroundColor: 'transparent'
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
				cursor: isDragging ? 'move' : 'default',
				display:isMinimized?'none':'flex',
				flexDirection:'column'
			}}
			onClick={handleWindowClick}
		>
			{/* Title Bar */}
			<div 
				ref={titleBarRef}
				className="title-bar"
				onMouseDown={handleMouseDown}
				style={{ cursor: isMaximized ? 'default' : 'move', userSelect: 'none' }}
			>
				<div className="title-bar-text">{title}</div>
				<div className="title-bar-controls">
					<button aria-label="Minimize" onClick={handleMinimize}></button>
					<button 
						aria-label={isMaximized ? "Restore" : "Maximize"} 
						onClick={handleMaximizeRestore}
					></button>
					<button aria-label="Close" onClick={handleClose}></button>
				</div>
			</div>

			{/* Window children */}
			<div 
				className="window-body" 
				style={{
					overflow: 'auto',
					maxWidth:'100%',
					maxHeight:'100%',
					boxSizing:'border-box',
					minWidth:'0',
					minHeight:'0',
					flexGrow:1,
					position: 'relative'
				}}
			>
				{children}
			</div>

			{/* Resize Handles */}
			{!isMaximized && (
				<>
					<div className="resize-handle n" 
						style={{ ...resizeHandleStyle, top: 0, left: 0, right: 0, height: 5, cursor: 'n-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 'n')} 
					/>
					<div className="resize-handle e" 
						style={{ ...resizeHandleStyle, top: 0, right: 0, bottom: 0, width: 5, cursor: 'e-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 'e')} 
					/>
					<div className="resize-handle s" 
						style={{ ...resizeHandleStyle, bottom: 0, left: 0, right: 0, height: 5, cursor: 's-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 's')} 
					/>
					<div className="resize-handle w" 
						style={{ ...resizeHandleStyle, top: 0, left: 0, bottom: 0, width: 5, cursor: 'w-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 'w')} 
					/>
					<div className="resize-handle ne" 
						style={{ ...resizeHandleStyle, top: 0, right: 0, width: 10, height: 10, cursor: 'ne-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} 
					/>
					<div className="resize-handle nw" 
						style={{ ...resizeHandleStyle, top: 0, left: 0, width: 10, height: 10, cursor: 'nw-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} 
					/>
					<div className="resize-handle se" 
						style={{ ...resizeHandleStyle, bottom: 0, right: 0, width: 10, height: 10, cursor: 'se-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 'se')} 
					/>
					<div className="resize-handle sw" 
						style={{ ...resizeHandleStyle, bottom: 0, left: 0, width: 10, height: 10, cursor: 'sw-resize' }}
						onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} 
					/>
				</>
			)}
		</div>
	);
}