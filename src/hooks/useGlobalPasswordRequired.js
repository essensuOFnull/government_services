import { useState, useEffect } from 'react';
import api from '../utils/api';

export function useGlobalPasswordRequired() {
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const check = async () => {
      try {
        const response = await api.request('/global-password-required', { method: 'GET' });
        setRequired(response.required);
      } catch (err) {
        console.error('Failed to check global password requirement', err);
        setError(err);
        setRequired(true); // в случае ошибки требуем пароль для безопасности
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  return { loading, required, error };
}