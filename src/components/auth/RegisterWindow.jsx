import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';
import { useWindowsManager } from '../../hooks/useWindowsManager';
import LoginWindow from './LoginWindow';

const RegisterWindow = ({ onClose }) => {
	const { register, error, loading } = useAuthContext();
	const { openWindow, closeWindow } = useWindowsManager();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [localError, setLocalError] = useState('');

	const validatePassword = (pass) => {
		if (pass.length < 8) return 'Минимум 8 символов';
		if (!/[A-Z]/.test(pass)) return 'Добавьте заглавную букву';
		if (!/[a-z]/.test(pass)) return 'Добавьте строчную букву';
		if (!/\d/.test(pass)) return 'Добавьте цифру';
		return '';
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLocalError('');
		
		if (!username.trim() || !password || !confirmPassword) {
			setLocalError('Заполните все поля');
			return;
		}

		if (password !== confirmPassword) {
			setLocalError('Пароли не совпадают');
			return;
		}

		const passwordError = validatePassword(password);
		if (passwordError) {
			setLocalError(passwordError);
			return;
		}

		if (username.length < 3 || username.length > 20) {
			setLocalError('Имя пользователя: 3-20 символов');
			return;
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
			setLocalError('Только буквы, цифры, дефисы и подчеркивания');
			return;
		}

		const result = await register(username, password);
		if (!result.success) {
			setLocalError(result.message);
		}
	};

	const handleLoginClick = () => {
		if (onClose) onClose();
		openWindow({
			title: 'Вход',
			children: <LoginWindow />,
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
				<p><strong>Регистрация</strong></p>
				<p>
					Роль по умолчанию: <strong>Гость</strong> (10 ГБ хранилища)
				</p>
				<div>
					<label>
						Имя пользователя: (3-20 символов)
					</label>
					<br/><br/>
					<input
						type="text"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						required
						disabled={loading}
						placeholder="Введите имя пользователя"
					/>
				</div>
				
				<div>
					<label>
						Пароль:
						<span>
							(мин. 8 символов, буквы и цифры)
						</span>
					</label>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						disabled={loading}
						placeholder="Введите пароль"
					/>
				</div>
				
				<div>
					<label>
						Подтвердите пароль:
					</label>
					<input
						type="password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
						disabled={loading}
						placeholder="Повторите пароль"
					/>
				</div>
				
				<button 
					type="submit"
					disabled={loading}
				>
					{loading ? 'Регистрация...' : 'Зарегистрироваться'}
				</button>
				
				<div>
					<span>Уже есть аккаунт?</span>
					<button 
						type="button"
						onClick={handleLoginClick}
					>
						Войти
					</button>
				</div>
			</div>
		</form>
	);
};

export default RegisterWindow;