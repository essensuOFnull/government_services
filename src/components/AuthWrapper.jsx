import { useState, useCallback } from 'react';
import { useGlobalPasswordRequired } from '../hooks/useGlobalPasswordRequired';
import { useGlobalAuth } from '../hooks/useGlobalAuth';
import GlobalPasswordPrompt from './GlobalPasswordPrompt';
import AuthorizationWindow from './AuthorizationWindow';

export default function AuthWrapper({ onClose }) {
  const { loading: checking, required, error: checkError } = useGlobalPasswordRequired();
  const {
    isValidating,
    error: authError,
    attemptsLeft,
    blockedUntil,
    submitPassword,
    isAuthenticated,
    reset,
  } = useGlobalAuth();
  const [globalPassword, setGlobalPassword] = useState(null);

  const handleGlobalPasswordSuccess = useCallback(async (password) => {
    const result = await submitPassword(password);
    if (result.success) {
      setGlobalPassword(password);
    }
  }, [submitPassword]);

  const handleGlobalPasswordInvalid = useCallback(() => {
    reset();
    setGlobalPassword(null);
  }, [reset]);

  if (checking) return <div>Загрузка...</div>;

  // Если ошибка проверки – показываем ввод пароля для безопасности
  if (checkError) {
    return (
      <GlobalPasswordPrompt
        onSubmit={handleGlobalPasswordSuccess}
        error={authError}
        attemptsLeft={attemptsLeft}
        blockedUntil={blockedUntil}
        isLoading={isValidating}
      />
    );
  }

  // Если требуется глобальный пароль и он ещё не введён
  if (required && !globalPassword) {
    return (
      <GlobalPasswordPrompt
        onSubmit={handleGlobalPasswordSuccess}
        error={authError}
        attemptsLeft={attemptsLeft}
        blockedUntil={blockedUntil}
        isLoading={isValidating}
      />
    );
  }

  // Пароль не требуется или уже введён – показываем окно входа
  return (
    <AuthorizationWindow
      onClose={onClose}
      onGlobalPasswordInvalid={handleGlobalPasswordInvalid}
      globalPassword={globalPassword}
    />
  );
}