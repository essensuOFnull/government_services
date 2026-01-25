import { useState, useMemo } from 'react';

export default function DecorDisassembling() {
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
									<th colSpan={3} style={{whiteSpace: 'normal'}}>
										Введите за сколько вы будете продавать каждый из данных видов ресурсов 
										<b style={{textDecoration:'underline'}}> БЕЗ</b> учёта комиссии
									</th>
								</tr>
								<tr>
									<th style={{width: '120px'}}>Монет за</th>
									<th style={{width: '140px'}}>Количество единиц</th>
									<th style={{width: '100px'}}>Ресурса</th>
								</tr>
							</thead>
							<tbody>
								{resources.map((resource,y)=>(
									<tr key={`y:${y}`}>
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
											/>
										</td>
										<td>
											<img src={resource[0]} alt="" style={{maxWidth: '100%'}}/>
										</td>
									</tr>
								))}
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
										<td style={{
											background: rarity[1],
											fontWeight: 'bold'
										}}>
											{rarity[0]}
										</td>
										<td>
											{calculateResults[y]?.grossValue || '0.00'} монет
										</td>
										<td style={{
											background: parseFloat(calculateResults[y]?.netValue || 0) > 0 ? '#d4edda' : 'transparent',
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
							fontStyle: 'italic',
							textAlign: 'center',
							background: '#fff3cd',
							padding: '10px',
							borderRadius: '5px'
						}}>
							Подбредье на вашей стороне, удачного фарма 😎
						</p>
					</div>
				</div>
			</div>
		</>
	)
}