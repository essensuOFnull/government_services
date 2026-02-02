import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';

export default function DecorDisassembling() {
	const { user } = useAuth();
	const wsRef = useRef(null);
	const [activeTab, setActiveTab] = useState(0);

	const [rarityResources, setRarityResources] = useState([
		[150, 50,  0, 0,  0,  0],
		[40, 100, 60,30,  0,  0],
		[80, 150,170,80,  0,  0],
		[50, 250,  0, 0,250,250]
	]);

	const rarityLabels=[
		['Редкая','#379BFE'],
		['Особая','#48C2CE'],
		['Эпическая','#CA40FF'],
		['Легендарная','#FFA217']
	];

	const [resources, setResources] = useState([
		["./crossout/scrap_metal.png",0,100],
		["./crossout/copper.png",0,100],
		["./crossout/wires.png",0,100],
		["./crossout/plastic.png",0,100],
		["./crossout/batteries.png",0,10],
		["./crossout/electronics.png",0,10]
	]);

	// Состояние для отслеживания информации об изменении
	const [priceHistory, setPriceHistory] = useState({});
	
	// Для отслеживания значений перед редактированием
	const [resourcesBeforeEdit, setResourcesBeforeEdit] = useState(null);

	// Инициализация WebSocket и загрузка данных
	useEffect(() => {
		const initializeComponent = async () => {
			console.log('Initializing crossout component, user:', user);

			if (!user?.id) {
				console.warn('User not authenticated yet');
				return;
			}

			// Загружаем последние цены из базы
			try {
				console.log('Fetching latest prices...');
				const response = await fetch('/api/messenger/crossout/get-latest-prices', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-user-id': user?.id
					},
					body: JSON.stringify({
						resources: [0, 1, 2, 3, 4, 5]
					})
				});

				console.log('Response status:', response.status);
				
				if (!response.ok) {
					console.error('Response error:', response.status, response.statusText);
					const errorText = await response.text();
					console.error('Response body:', errorText);
					return;
				}

				const data = await response.json();
				console.log('Loaded prices data:', data);

				if (data.success && data.data) {
					const history = {};
					const newResources = [...resources];

					Object.entries(data.data).forEach(([resourceIndex, info]) => {
						const idx = parseInt(resourceIndex);
						if (info.price) {
							newResources[idx][1] = info.price.value;
							history[`${idx}-price`] = {
								username: info.price.username,
								changedAt: info.price.changedAt
							};
						}
						if (info.packSize) {
							newResources[idx][2] = info.packSize.value;
							history[`${idx}-pack_size`] = {
								username: info.packSize.username,
								changedAt: info.packSize.changedAt
							};
						}
					});

					setResources(newResources);
					setResourcesBeforeEdit(JSON.parse(JSON.stringify(newResources)));
					setPriceHistory(history);
					console.log('Resources updated');
				}
			} catch (error) {
				console.error('Error loading prices:', error);
			}

			// Подключаемся к WebSocket
			if (!wsRef.current) {
				const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const wsUrl = `${protocol}//${window.location.host}/ws/messenger?userId=${user?.id}`;
				
				try {
					const ws = new WebSocket(wsUrl);
					
					ws.onopen = () => {
						console.log('WebSocket connected for Crossout updates');
					};

					ws.onmessage = (event) => {
						try {
							const message = JSON.parse(event.data);
							if (message.type === 'crossout_price_updated') {
								handleRemoteUpdate(message);
							}
						} catch (error) {
							console.error('Error parsing WebSocket message:', error);
						}
					};

					ws.onerror = (error) => {
						console.error('WebSocket error:', error);
					};

					ws.onclose = () => {
						console.log('WebSocket disconnected');
						wsRef.current = null;
					};

					wsRef.current = ws;
				} catch (error) {
					console.error('Error connecting to WebSocket:', error);
				}
			}
		};

		if (user?.id) {
			initializeComponent();
		}

		return () => {
			// Не закрываем WebSocket при размонтировании, так как он может использоваться другими компонентами
		};
	}, [user?.id]);

	// Обработчик обновлений с других пользователей
	const handleRemoteUpdate = (message) => {
		const { resourceIndex, fieldType, value, username, changedAt } = message;

		setResources(prev => {
			const updated = prev.map((row, idx) => {
				if (idx === resourceIndex) {
					const fieldIdx = fieldType === 'price' ? 1 : 2;
					const newRow = [...row];
					newRow[fieldIdx] = value;
					return newRow;
				}
				return row;
			});
			return updated;
		});

		setPriceHistory(prev => ({
			...prev,
			[`${resourceIndex}-${fieldType}`]: {
				username,
				changedAt
			}
		}));
	};

	// Функция для отправки обновлений на сервер
	const updatePrice = async (resourceIndex, fieldType, value) => {
		try {
			console.log('Updating price:', { resourceIndex, fieldType, value, userId: user?.id });

			// Отправляем на сервер через REST API
			const response = await fetch('/api/messenger/crossout/save-price', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-id': user?.id
				},
				body: JSON.stringify({
					resourceIndex,
					fieldType,
					value: parseFloat(value)
				})
			});

			console.log('Save price response:', response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Error saving price:', response.status, errorText);
				return;
			}

			const data = await response.json();
			console.log('Price saved successfully:', data);

			// Отправляем обновление через WebSocket всем подключенным пользователям
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				console.log('Sending WebSocket update');
				wsRef.current.send(JSON.stringify({
					type: 'crossout_price_update',
					resourceIndex,
					fieldType,
					value: parseFloat(value)
				}));
			} else {
				console.warn('WebSocket not connected, skipping broadcast');
			}
		} catch (error) {
			console.error('Error updating price:', error);
		}
	};

	// Обработчик потери фокуса для поля ввода
	const handleInputBlur = (resourceIndex, fieldType, currentValue) => {
		const parsedCurrent = parseFloat(currentValue);
		
		// Получаем предыдущее значение из сохраненного состояния
		const fieldIdx = fieldType === 'price' ? 1 : 2;
		const previousValue = resourcesBeforeEdit ? resourcesBeforeEdit[resourceIndex][fieldIdx] : null;
		const parsedPrevious = parseFloat(previousValue);

		console.log('Input blur:', { resourceIndex, fieldType, parsedCurrent, parsedPrevious, previousValue });

		// Сохраняем только если значение действительно изменилось
		if (parsedCurrent !== parsedPrevious) {
			console.log('Value changed, updating price');
			updatePrice(resourceIndex, fieldType, parsedCurrent);
			// Обновляем "до редактирования" значение, чтобы следующее сравнение было корректным
			setResourcesBeforeEdit(prev => {
				if (!prev) return null;
				const updated = prev.map((row, idx) => 
					idx === resourceIndex 
						? row.map((cell, colIdx) => colIdx === fieldIdx ? parsedCurrent : cell)
						: [...row]
				);
				return updated;
			});
		} else {
			console.log('Value not changed, skipping update');
		}
	};

	// Рассчитываем результаты для каждой редкости
	const calculateResults = useMemo(() => {
		return rarityResources.map((rarityRow, rowIndex) => {
			let totalValue = 0;
			
			// Проходим по каждому ресурсу для данной редкости
			rarityRow.forEach((resourceCount, resourceIndex) => {
				const resourcePrice = resources[resourceIndex][1]; // цена за пакет
				const resourcePackSize = resources[resourceIndex][2]; // количество в пакете
				
				// Если количество в пакете > 0, рассчитываем стоимость
				if (resourcePackSize > 0 && resourceCount > 0) {
					// Стоимость = (количество ресурса / размер пакета) * цена за пакет
					totalValue += (resourceCount / resourcePackSize) * resourcePrice;
				}
			});
			
			// Учитываем комиссию 10% (оставляем 90%)
			const valueAfterCommission = totalValue * 0.9;
			
			return {
				grossValue: totalValue.toFixed(2), // стоимость без комиссии
				netValue: valueAfterCommission.toFixed(2), // стоимость с учетом комиссии
				color: rarityLabels[rowIndex][1]
			};
		});
	}, [rarityResources, resources]);

	// Форматирование времени
	const formatTime = (timestamp) => {
		if (!timestamp) return '-';
		const date = new Date(timestamp);
		return date.toLocaleString('ru-RU');
	};

	return(
		<>
			<menu role="tablist">
				<li role="tab" aria-selected={activeTab === 0} onClick={() => setActiveTab(0)}>
					<a>Исходные данные</a>
				</li>
				<li role="tab" aria-selected={activeTab === 1} onClick={() => setActiveTab(1)}>
					<a>Результат</a>
				</li>
			</menu>
			<div className="window" role="tabpanel" style={{ display: activeTab === 0 ? 'block' : 'none' }}>
				<div className="window-body" style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: '16px',
					alignItems: 'flex-start'
				}}>
					<div className="sunken-panel" style={{
						flex: '1 1 400px',
						minWidth: '300px',
						maxWidth: '100%',
						overflow: 'auto'
					}}>
						<table className="interactive" style={{
							textAlign:'center',
							width: '100%',
							tableLayout: 'fixed'
						}}>
							<thead>
								<tr>
									<th colSpan={5} style={{whiteSpace: 'normal'}}>
										Введите за сколько вы будете продавать каждый из данных видов ресурсов <b style={{textDecoration:'underline'}}>БЕЗ</b> учёта комиссии
									</th>
								</tr>
								<tr>
									<th>Дата изменения</th>
									<th>Кем изменено</th>
									<th>Монет за</th>
									<th>Количество единиц</th>
									<th>Ресурса</th>
								</tr>
							</thead>
							<tbody>
								{resources.map((resource,y)=>{
									const priceInfo = priceHistory[`${y}-price`];
									const packSizeInfo = priceHistory[`${y}-pack_size`];
									const latestChangeInfo = priceInfo || packSizeInfo;

									return (
									<tr key={`y:${y}`}>
										<td className="field-border-disabled" style={{fontSize: '12px'}}>
											{latestChangeInfo ? formatTime(latestChangeInfo.changedAt) : '-'}
										</td>
										<td className="field-border-disabled" style={{fontSize: '12px'}}>
											{latestChangeInfo ? latestChangeInfo.username : '-'}
										</td>
										<td>
											<input 
												type='number' 
												step="0.01" 
												value={resource[1]} 
												onChange={(e) => {
													const newValue = parseFloat(e.target.value) || 0;
													setResources(prev => 
														prev.map((row, rowIndex) => 
															rowIndex === y 
																? row.map((cell, colIndex) => 
																	colIndex === 1 ? newValue : cell
																)
																: [...row]
														)
													);
												}}
												onBlur={(e) => {
													const currentValue = e.target.value;
												handleInputBlur(y, 'price', currentValue);
												}}
											/>
										</td>
										<td>
											<input 
												type='number' 
												value={resource[2]} 
												onChange={(e) => {
													const newValue = parseFloat(e.target.value) || 0;
													setResources(prev => 
														prev.map((row, rowIndex) => 
															rowIndex === y 
																? row.map((cell, colIndex) => 
																	colIndex === 2 ? newValue : cell
																)
																: [...row]
														)
													);
												}}
												onBlur={(e) => {
													const currentValue = e.target.value;
												handleInputBlur(y, 'pack_size', currentValue);
												}}
											/>
										</td>
										<td>
											<img src={resource[0]} alt="" style={{maxWidth: '100%'}}/>
										</td>
									</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					<div className="sunken-panel" style={{
						flex: '1 1 600px',
						minWidth: '350px',
						maxWidth: '100%',
						overflow: 'auto'
					}}>
						<table className="interactive" style={{
							textAlign:'center',
							width: '100%',
							tableLayout: 'fixed'
						}}>
							<thead>
								<tr>
									<th colSpan={resources.length+1} style={{whiteSpace: 'normal'}}>
										Сколько выдаётся ресурсов за разбор декора разной редкости
									</th>
								</tr>
								<tr>
									<th style={{width: '100px'}}></th>
									{resources.map((resource,i)=>(
										<th key={i} style={{width: '80px'}}>
											<img src={resource[0]} alt="" style={{maxWidth: '100%'}}/>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rarityLabels.map((rarity,y)=>(
									<tr key={`y:${y}`}>
										<th style={{
											background:rarity[1],
										}}>
											{rarity[0]}
										</th>
										{rarityResources[y].map((count,x)=>(
											<td key={`x:${x} y:${y}`}>
												<input 
													type='number' 
													value={count} 
													style={{maxWidth:'100%'}}
													onChange={(e) => {
														const newValue = parseFloat(e.target.value) || 0;
														setRarityResources(prev => 
															prev.map((row, rowIndex) => 
																rowIndex === y 
																	? row.map((cell, colIndex) => 
																		colIndex === x ? newValue : cell
																	)
																	: [...row]
															)
														);
													}}
												/>
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
			<div className="window" role="tabpanel" style={{ display: activeTab === 1 ? 'block' : 'none' }}>
				<div className="window-body">
					<div className="sunken-panel" style={{
						flex: '1 1 400px',
						minWidth: '300px',
						maxWidth: '100%',
						overflow: 'auto',
						marginBottom: '20px'
					}}>
						<table className="interactive" style={{
							textAlign:'center',
							width: '100%',
							tableLayout: 'fixed'
						}}>
							<thead>
								<tr>
									<th colSpan={3} style={{whiteSpace: 'normal'}}>
										Вот сколько вы получите за разбор одного декора каждой редкости
									</th>
								</tr>
								<tr>
									<th style={{width: '120px'}}>Редкость</th>
									<th style={{width: '140px'}}>Без комиссии (для крафтов)</th>
									<th style={{width: '140px'}}>С комиссией 10%</th>
								</tr>
							</thead>
							<tbody>
								{rarityLabels.map((rarity,y)=>(
									<tr key={`result-${y}`}>
										<th style={{
											background: rarity[1],
											fontWeight: 'bold'
										}}>
											{rarity[0]}
										</th>
										<td>
											{calculateResults[y]?.grossValue || '0.00'} монет
										</td>
										<td style={{
											fontWeight: 'bold'
										}}>
											{calculateResults[y]?.netValue || '0.00'} монет
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="sunken-panel" style={{
						flex: '1 1 400px',
						minWidth: '300px',
						maxWidth: '100%',
						overflow: 'auto',
						padding: '15px'
					}}>
						<h3 style={{marginTop: 0}}>Как работает расчет:</h3>
						<ul style={{textAlign: 'left', margin: 0, paddingLeft: '20px'}}>
							<li>Для каждого ресурса рассчитывается стоимость: <strong>(количество ресурса ÷ размер пакета) × цена за пакет</strong></li>
							<li>Суммируем стоимость всех ресурсов для каждой редкости декора</li>
							<li>Учитываем комиссию маркета 10% (остается 90% от суммы)</li>
							<li>Результат - чистая прибыль за разбор одного декора</li>
						</ul>
						<p style={{
							marginTop: '15px',
							textAlign: 'center',
							background: '#fff3cd56',
							padding: '10px',
							borderRadius: '5px'
						}}><span style={{fontStyle: 'italic',}}>Подбредье на вашей стороне, удачного фарма </span>😎
						</p>
					</div>
				</div>
			</div>
		</>
	)
}