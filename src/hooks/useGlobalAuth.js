import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

export const useGlobalAuth = () => {
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [blockedUntil, setBlockedUntil] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const submitPassword = useCallback(async (password) => {
    setIsValidating(true);
    try {
      const response = await api.verifyGlobalPassword(password);
      if (response.success) {
        setIsAuthenticated(true);
        setError(null);
        setAttemptsLeft(null);
        setBlockedUntil(null);
        return { success: true };
      } else {
        setIsAuthenticated(false);
        setError(response.message);
        setAttemptsLeft(response.attemptsLeft);
        setBlockedUntil(response.blockedUntil);
        return { success: false, attemptsLeft: response.attemptsLeft, blockedUntil: response.blockedUntil };
      }
    } catch (err) {
      setIsAuthenticated(false);
      setError(err.message);
      return { success: false };
    } finally {
      setIsValidating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsAuthenticated(false);
    setError(null);
    setAttemptsLeft(null);
    setBlockedUntil(null);
    setIsValidating(false);
  }, []);

  return {
    isValidating,
    error,
    attemptsLeft,
    blockedUntil,
    submitPassword,
    reset,
    isAuthenticated,
  };
};