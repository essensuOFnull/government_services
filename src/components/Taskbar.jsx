import { useWindowsManager } from '../hooks/useWindowsManager';
import ProfileWindow from './auth/ProfileWindow';
import MenuWindow from './MenuWindow';
export default function Taskbar(props) {
	const { openWindow, closeWindow } = useWindowsManager();
	return (
		<footer className='taskbar'>
			<button onClick={()=>{openWindow({
				title: 'Меню услуг',
				children: <MenuWindow/>,
			})}}>Открыть меню</button>
			<img src="icon.svg" style={{width:"32px",height:"32px"}} alt="icon"></img>
			<p>Госуслуги Подбредья</p>
			<div className="taskbar-windows status-field-border">
				{props.windows && props.windows.map(window => (
					<button 
						key={window.id}
						className="taskbar-window-button"
						onClick={() => props.onWindowClick(window.id)}
					>
						{window.title}
					</button>
				))}
			</div>
			<button
				onClick={()=>{openWindow({
					title: 'Профиль',
					children: <ProfileWindow/>,
				})}}
				style={{marginLeft:'auto',marginRight:'16px'}}
			>
				Профиль
			</button>
		</footer>
	);
}