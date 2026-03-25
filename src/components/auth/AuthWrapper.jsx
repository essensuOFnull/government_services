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

  if (isValidating) {
    return <div>Загрузка...</div>;
  }

  if (!isAuthenticated) {
    return (
      <GlobalPasswordPrompt
        onSubmit={submitPassword}
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
    />
  );
}