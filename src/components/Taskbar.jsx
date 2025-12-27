export default function Taskbar(props) {
return (
	<footer className='taskbar'>
	<button onClick={props.onClickMainButton}>Открыть меню</button>
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
	</footer>
);
}