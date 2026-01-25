import { useState } from 'react';
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
				<div className="window-body"></div>
			</div>
		</>
	)
}