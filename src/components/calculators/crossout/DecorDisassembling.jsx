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

	return(
		<>
			<menu role="tablist">
				<li role="tab" aria-selected={activeTab === 0} onClick={() => setActiveTab(0)}><a>Исходные данные</a></li>
				<li role="tab" aria-selected={activeTab === 1} onClick={() => setActiveTab(1)}><a>Результат</a></li>
			</menu>
			<div className="window" role="tabpanel" style={{ display: activeTab === 0 ? 'block' : 'none' }}>
				<div className="window-body">
					<div className="sunken-panel" style={{maxWidth:'max-content'}}>
						<table className="interactive" style={{textAlign:'center'}}>
							<thead>
							<tr>
								<th colSpan={7}>Сколько выдаётся ресуров за разбор декора разной редкости</th>
							</tr>
							<tr>
								<th></th>
								<th>
									<img src="./crossout/scrap_metal.png"/>
								</th>
								<th>
									<img src="./crossout/copper.png"/>
								</th>
								<th>
									<img src="./crossout/wires.png"/>
								</th>
								<th>
									<img src="./crossout/plastic.png"/>
								</th>
								<th>
									<img src="./crossout/batteries.png"/>
								</th>
								<th>
									<img src="./crossout/electronics.png"/>
								</th>
							</tr>
							</thead>
							<tbody>
								{rarityLabels.map((rarity,y)=>(
									<tr key={`y:${y}`}>
										<th style={{background:rarity[1]}}>{rarity[0]}</th>
										{rarityResources[y].map((count,x)=>(
											<td key={`x:${x} y:${y}`}>
												<input type='number' value={count} onChange={(e) => {
													const newValue = parseInt(e.target.value) || 0;
													setRarityResources(prev => 
														prev.map((row, rowIndex) => 
															rowIndex === y 
																? row.map((cell, colIndex) => 
																	colIndex === x ? newValue : cell
																)
																: [...row]
														)
													);
												}}/>
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