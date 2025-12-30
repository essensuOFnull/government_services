import Window from './Window';
import { useState } from 'react';
import Messenger from './Messenger';

export default function MenuWindow({ userId }) {
	const [activeTab, setActiveTab] = useState(0);
	const group_link="https://t.me/c/3601903002";
	const threads_id={
		ПРКПН:4,
		SRDI:7,
		ОМГ:8,
		ОСОС:13,
		ХВЗ:14
	};
	const ПРКПН_link=`${group_link}/${threads_id.ПРКПН}`,
	SRDI_link=`${group_link}/${threads_id.SRDI}`,
	ОМГ_link=`${group_link}/${threads_id.ОМГ}`,
	ОСОС_link=`${group_link}/${threads_id.ОСОС}`,
	ХВЗ_link=`${group_link}/${threads_id.ХВЗ}`;

	function copyToClipboard(text,then_func) {
		navigator.clipboard.writeText(text)
		.then(() => {
			alert('Заготовка обращения скопирована в буфер обмена.');
			then_func();
		})
		.catch(err => {
			// Fallback для старых браузеров
			console.error(err);
		});
	}
	const other="Я подтверждаю, что, находясь в здравом уме и трезвой памяти, просмотрел полный перечень предоставляемых запросов и НЕ нашел подходящий под мои нужды.";
	return(
		<>
			<menu role="tablist">
				<li role="tab" aria-selected={activeTab === 0} onClick={() => setActiveTab(0)}><a>Мессенджер</a></li>
				<li role="tab" aria-selected={activeTab === 1} onClick={() => setActiveTab(1)}><a>Хранилище</a></li>
				<li role="tab" aria-selected={activeTab === 2} onClick={() => setActiveTab(2)}><a>Организации</a></li>
			</menu>
			<div className="window" role="tabpanel" style={{ display: activeTab === 0 ? 'block' : 'none' }}>
				<div className="window-body">
					{activeTab === 'messenger' && (
						<div style={{ padding: 8 }}>
							<Messenger userId={userId} />
						</div>
					)}
				</div>
			</div>
			<div className="window" role="tabpanel" style={{ display: activeTab === 1 ? 'block' : 'none' }}>
				<div className="window-body">
					<p>Хранилище - в разработке</p>
				</div>
			</div>
			<div className="window" role="tabpanel" style={{ display: activeTab === 2 ? 'block' : 'none' }}>
				<div className="window-body">
					<ul className="tree-view">
						<details open>
							<summary>Список услуг:</summary>
							<ul>
								<details>
									<summary>ПРКПН (ПодбредРосКомПозорНадзор)</summary>
									<ul>
										<li>
											<button onClick={()=>{
												copyToClipboard('Мне нужна консультация по поводу обхода блокировок. Каким образом происходит данный процесс?',()=>{
													window.open(ПРКПН_link, '_blank');
												});
											}}>Запросить консультацию по обходу блокировок</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Мне нужен текущий общий конфигурационный файл для обхода блокировок, а также приложение для его запуска.',()=>{
													window.open(ПРКПН_link, '_blank');
												});
											}}>Получить текущий сбособ обхода блокировок</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Мне нужен новый конфигурационный файл для обхода блокировок.',()=>{
													window.open(ПРКПН_link, '_blank');
												});
											}}>Запросить новый конфиг</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard(other,()=>{
													window.open(ПРКПН_link, '_blank');
												});
											}}>Обращение по другому поводу</button>
										</li>
									</ul>
								</details>
								<details>
									<summary>SRDI (Steal-ReDistribute-Internet)</summary>
									<ul>
										<li>
											<button onClick={()=>{
												copyToClipboard('Научите меня взламывать wifi.',()=>{
													window.open(SRDI_link, '_blank');
												});
											}}>Запросить консультацию по взлому wifi</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Мне нужно оборудовние для захвата хендшейков.',()=>{
													window.open(SRDI_link, '_blank');
												});
											}}>Запросить оборудование для захвата хендшейков</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Мне нужны вычислительные мощности для брутфоса.',()=>{
													window.open(SRDI_link, '_blank');
												});
											}}>Запросить брутфорс хендшейка</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard(other,()=>{
													window.open(SRDI_link, '_blank');
												});
											}}>Обращение по другому поводу</button>
										</li>
									</ul>
								</details>
								<details>
									<summary>ОМГ (Отдел Майнинга и Генерации)</summary>
									<ul>
										<li>
											<button onClick={()=>{
												copyToClipboard('Научите меня программировать.',()=>{
													window.open(ОМГ_link, '_blank');
												});
											}}>Запросить консультацию по программированию</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Создайте программу для',()=>{
													window.open(ОМГ_link, '_blank');
												});
											}}>Запросить создание программы</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Модифицируйте существующую программу',()=>{
													window.open(ОМГ_link, '_blank');
												});
											}}>Запросить модификацию программы</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard(other,()=>{
													window.open(ОМГ_link, '_blank');
												});
											}}>Обращение по другому поводу</button>
										</li>
									</ul>
								</details>
								<details>
									<summary>ОСОС (Отдел Сервисного Обслуживания Сети)</summary>
									<ul>
										<li>
											<button onClick={()=>{
												copyToClipboard('Как мне сделать так, чтобы друг смог зайти на мой сервер?',()=>{
													window.open(ОСОС_link, '_blank');
												});
											}}>Запросить консультацию по предоставлению доступа к игровому серверу</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Как мне открыть порт?',()=>{
													window.open(ОСОС_link, '_blank');
												});
											}}>Запросить консультацию по открытию порта</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Как мне создать виртуальную локальную сеть?',()=>{
													window.open(ОСОС_link, '_blank');
												});
											}}>Запросить консультацию по созданию виртуальной локальной сети</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard(other,()=>{
													window.open(ОСОС_link, '_blank');
												});
											}}>Обращение по другому поводу</button>
										</li>
									</ul>
								</details>
								<details>
									<summary>ХВЗ (Хранилище Вечного Знания)</summary>
									<ul>
										<li>
											<button onClick={()=>{
												copyToClipboard('Мне нужна книга.',()=>{
													window.open(ХВЗ_link, '_blank');
												});
											}}>Запрос на предоставление доступа к книге</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Посоветуйте книгу.',()=>{
													window.open(ХВЗ_link, '_blank');
												});
											}}>Рекомендация книги по запросу</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard('Посоветуйте случайную книгу.',()=>{
													window.open(ХВЗ_link, '_blank');
												});
											}}>Рекомендация случайной книги</button>
										</li>
										<li>
											<button onClick={()=>{
												copyToClipboard(other,()=>{
													window.open(ХВЗ_link, '_blank');
												});
											}}>Обращение по другому поводу</button>
										</li>
									</ul>
								</details>
							</ul>
						</details>
					</ul>
				</div>
			</div>
		</>
	)
}