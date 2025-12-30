import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';

export default function AuthorizationWindow({ onClose }) {
	/*общее*/
	const { login,register, error, loading } = useAuthContext();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	/*вход*/
	const [loginError, setLoginError] = useState('');

	const handleLoginSubmit = async (e) => {
		e.preventDefault();
		setLoginError('');
		
		if (!username.trim() || !password.trim()) {
			setLoginError('Заполните все поля');
			return;
		}

		const result = await login(username, password);
		if (!result.success) {
			setLoginError(result.message);
		}
	};
	/*регистрация*/
	const [confirmPassword, setConfirmPassword] = useState('');
	const [registerError, setRegisterError] = useState('');

	const validatePassword = (pass) => {
		if (pass.length < 8) return 'Минимум 8 символов';
		if (!/[A-Z]/.test(pass)) return 'Добавьте заглавную букву';
		if (!/[a-z]/.test(pass)) return 'Добавьте строчную букву';
		if (!/\d/.test(pass)) return 'Добавьте цифру';
		return '';
	};

	const handleRegisterSubmit = async (e) => {
		e.preventDefault();
		setRegisterError('');
		
		if (!username.trim() || !password || !confirmPassword) {
			setRegisterError('Заполните все поля');
			return;
		}

		if (password !== confirmPassword) {
			setRegisterError('Пароли не совпадают');
			return;
		}

		const passwordError = validatePassword(password);
		if (passwordError) {
			setRegisterError(passwordError);
			return;
		}

		if (username.length < 3 || username.length > 20) {
			setRegisterError('Имя пользователя: 3-20 символов');
			return;
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
			setRegisterError('Только буквы, цифры, дефисы и подчеркивания');
			return;
		}

		const result = await register(username, password);
		if (!result.success) {
			setRegisterError(result.message);
		}
	};
	return (
		<>
			<menu role="tablist">
				<li role="tab" aria-selected="true"><a>Вход</a></li>
				<li role="tab"><a>Регистрация</a></li>
			</menu>
			<div className="window" role="tabpanel">
				<div className="window-body">
					<form onSubmit={handleLoginSubmit} style={{ textAlign: 'center' }}>
						{(error || loginError) && (
							<div style={{ 
								color: '#d13438', 
							}}>
								{error || loginError}
							</div>
						)}
						<p><strong>Вход</strong></p>
						<div className='window' style={{padding:'16px'}}>
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
						<div className='window' style={{padding:'16px'}}>
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
					</form>
				</div>
			</div>
			<div className="window" role="tabpanel">
				<div className="window-body">
					<form onSubmit={handleRegisterSubmit} style={{ textAlign: 'center' }}>
						{(error || registerError) && (
							<div style={{ 
								color: '#d13438', 
							}}>
								{error || registerError}
							</div>
						)}
						<p><strong>Регистрация</strong></p>
						<p>
							Роль по умолчанию: <strong>Гость</strong> (10 ГБ хранилища)
						</p>
						<div className='window' style={{padding:'16px'}}>
							<label>
								Имя пользователя (3-20 символов):
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
						<br/>
						<div className='window' style={{padding:'16px'}}>
							<label>
								Пароль (мин. 8 символов, буквы и цифры):
							</label>
							<br/><br/>
							<input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								disabled={loading}
								placeholder="Введите пароль"
							/>
						</div>
						<br/>
						<div className='window' style={{padding:'16px'}}>
							<label>
								Подтвердите пароль:
							</label>
							<br/><br/>
							<input
								type="password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								required
								disabled={loading}
								placeholder="Повторите пароль"
							/>
						</div>
						<br/>
						<button 
							type="submit"
							disabled={loading}
						>
							{loading ? 'Регистрация...' : 'Зарегистрироваться'}
						</button>
					</form>
				</div>
			</div>
		</>
	);
}