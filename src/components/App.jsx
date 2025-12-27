import { useState, useCallback } from 'react';
import Taskbar from './Taskbar';
import Window from './Window';

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
					addWindow({
						title: "Меню услуг",
						width: 400,
						height: 300,
						children:
							<ul className="tree-view">
								<details open>
									<summary>Список услуг:</summary>
									<ul>
										<details>
											<summary>ПРКПН (ПодбредРосКомПозорНадзор)</summary>
											<ul>
												<li>
													<button>Запросить консультацию по обходу блокировок</button>
												</li>
												<li>
													<button>Получить текущий сбособ обхода блокировок</button>
												</li>
												<li>
													<button>Запросить новый конфиг</button>
												</li>
												<li>
													<button>Обращение по другому поводу</button>
												</li>
											</ul>
										</details>
										<details>
											<summary>SRDI (Steal-ReDistribute-Internet)</summary>
											<ul>
												<li>
													<button>Запросить консультацию по взлому wifi</button>
												</li>
												<li>
													<button>Запросить оборудование для захвата хендшейков</button>
												</li>
												<li>
													<button>Запросить брутфорс хендшейка</button>
												</li>
												<li>
													<button>Обращение по другому поводу</button>
												</li>
											</ul>
										</details>
										<details>
											<summary>ОМГ (Отдел Майнинга и Генерации)</summary>
											<ul>
												<li>
													<button>Запросить консультацию по программированию</button>
												</li>
												<li>
													<button>Запросить создание программы</button>
												</li>
												<li>
													<button>Запросить модификацию программы</button>
												</li>
												<li>
													<button>Обращение по другому поводу</button>
												</li>
											</ul>
										</details>
										<details>
											<summary>ОСОС (Отдел Сервисного Обслуживания Сети)</summary>
											<ul>
												<li>
													<button>Запросить консультацию по предоставлению доступа к игровому серверу</button>
												</li>
												<li>
													<button>Запросить консультацию по открытию порта</button>
												</li>
												<li>
													<button>Запросить консультацию по созданию виртуальной локальной сети</button>
												</li>
												<li>
													<button>Обращение по другому поводу</button>
												</li>
											</ul>
										</details>
										<details>
											<summary>ХВЗ (Хранилище Вечного Знания)</summary>
											<ul>
												<li>
													<button>Запрос на предоставление доступа к книге</button>
												</li>
												<li>
													<button>Рекомендация книги по запросу</button>
												</li>
												<li>
													<button>Рекомендация случайной книги</button>
												</li>
												<li>
													<button>Обращение по другому поводу</button>
												</li>
											</ul>
										</details>
									</ul>
								</details>
							</ul>
					});
				}}
			/>
		</>
	);
}