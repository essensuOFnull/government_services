import { useState, useCallback } from 'react';
import Taskbar from './Taskbar';
import Window from './Window';
import MenuWindow from './MenuWindow';

export default function App() {
	const [windows, setWindows] = useState([]);
	const [zIndexCounter, setZIndexCounter] = useState(1000);

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
	return (
		<>
			{windows.map(window => !window.isMinimized && (
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
				>
					{window.children}
				</Window>
			))}
			<Taskbar 
				windows={windows}
				onWindowClick={bringToFront}
				onClickMainButton={() => {
					addWindow(MenuWindow().props);
				}}
			/>
		</>
	);
}