import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';
import { useWindowsManager } from '../../hooks/useWindowsManager';
import RegisterWindow from './RegisterWindow';

export default function LoginWindow({ onClose }) {
	const { login, error, loading } = useAuthContext();
	const { openWindow, closeWindow } = useWindowsManager();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [localError, setLocalError] = useState('');

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLocalError('');
		
		if (!username.trim() || !password.trim()) {
			setLocalError('Заполните все поля');
			return;
		}

		const result = await login(username, password);
		if (!result.success) {
			setLocalError(result.message);
		}
	};

	const handleRegisterClick = () => {
		if (onClose) onClose();
		openWindow({
			title: 'Регистрация',
			children: <RegisterWindow />,
		});
	};

	return (
		<form onSubmit={handleSubmit} style={{ textAlign: 'center' }}>
			{(error || localError) && (
				<div style={{ 
					color: '#d13438', 
				}}>
					{error || localError}
				</div>
			)}
			<div className='status-field-border' style={{padding:'16px'}}>
				<p><strong>Вход</strong></p>
				<div className='status-field-border' style={{padding:'16px'}}>
					<label>Имя пользователя:</label>
					<br/><br/>
					<input
						type="text"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						required
						disabled={loading}
					/>
				</div>
				<br/>
				<div className='status-field-border' style={{padding:'16px'}}>
					<label>Пароль:</label>
					<br/><br/>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						disabled={loading}
					/>
				</div>
				<br/>
				<button 
					type="submit"
					disabled={loading}
				>
					{loading ? 'Вход...' : 'Войти'}
				</button>
			</div>
			<p>Нет аккаунта?</p>
			<button 
				type="button"
				onClick={handleRegisterClick}
			>
				Зарегистрироваться
			</button>
		</form>
	);
}