import { useState } from 'react';
export default function DecorDisassembling() {
    const [activeTab, setActiveTab] = useState(0);
    return(
        <>
            <menu role="tablist">
				<li role="tab" aria-selected={activeTab === 0} onClick={() => setActiveTab(0)}><a>Исходные данные</a></li>
				<li role="tab" aria-selected={activeTab === 1} onClick={() => setActiveTab(1)}><a>Результат</a></li>
			</menu>
			<div className="window" role="tabpanel" style={{ display: activeTab === 0 ? 'block' : 'none' }}>
				<div className="window-body"></div>
            </div>
            <div className="window" role="tabpanel" style={{ display: activeTab === 1 ? 'block' : 'none' }}>
				<div className="window-body"></div>
            </div>
        </>
    )
}