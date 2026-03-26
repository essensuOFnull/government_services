// AuthWrapper.jsx
import { useState } from 'react';
import { useGlobalAuth } from '../../hooks/useGlobalAuth';
import GlobalPasswordPrompt from '../GlobalPasswordPrompt';
import AuthorizationWindow from './AuthorizationWindow';

export default function AuthWrapper({ onClose }) {
  const {
    isValidating,
    error,
    attemptsLeft,
    blockedUntil,
    submitPassword,
    reset,
    isAuthenticated,
  } = useGlobalAuth();

  const [globalPassword, setGlobalPassword] = useState('');

  const handleSubmitPassword = async (password) => {
    const result = await submitPassword(password);
    if (result.success) {
      setGlobalPassword(password); // сохраняем пароль в состоянии
    }
  };

  if (isValidating) {
    return <div>Загрузка...</div>;
  }

  if (!isAuthenticated) {
    return (
      <GlobalPasswordPrompt
        onSubmit={handleSubmitPassword}
        error={error}
        attemptsLeft={attemptsLeft}
        blockedUntil={blockedUntil}
        isLoading={isValidating}
      />
    );
  }

  return (
    <AuthorizationWindow
      onClose={onClose}
      onGlobalPasswordInvalid={reset}
      globalPassword={globalPassword}
    />
  );
}