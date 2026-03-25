import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const STORAGE_KEY = 'global_password';

export const useGlobalAuth = () => {
  const [globalPassword, setGlobalPassword] = useState(null);
  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [blockedUntil, setBlockedUntil] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setGlobalPassword(saved);
      verifyPassword(saved);
    } else {
      setIsValidating(false);
    }
  }, []);

  const verifyPassword = async (password) => {
    setIsValidating(true);
    setError(null);
    try {
      const response = await api.verifyGlobalPassword(password);
      if (response.success) {
        setGlobalPassword(password);
        setAttemptsLeft(null);
        setBlockedUntil(null);
      } else {
        // Неверный пароль
        setError(response.message || 'Неверный глобальный пароль');
        setAttemptsLeft(response.attemptsLeft);
        setBlockedUntil(response.blockedUntil);
        localStorage.removeItem(STORAGE_KEY);
        setGlobalPassword(null);
      }
    } catch (err) {
      setError(err.message);
      localStorage.removeItem(STORAGE_KEY);
      setGlobalPassword(null);
    } finally {
      setIsValidating(false);
    }
  };

  const submitPassword = useCallback(async (password) => {
    setIsValidating(true);
    try {
      const response = await api.verifyGlobalPassword(password);
      if (response.success) {
        localStorage.setItem(STORAGE_KEY, password);
        setGlobalPassword(password);
        setError(null);
        setAttemptsLeft(null);
        setBlockedUntil(null);
        return { success: true };
      } else {
        setError(response.message);
        setAttemptsLeft(response.attemptsLeft);
        setBlockedUntil(response.blockedUntil);
        return { success: false, attemptsLeft: response.attemptsLeft, blockedUntil: response.blockedUntil };
      }
    } catch (err) {
      setError(err.message);
      return { success: false };
    } finally {
      setIsValidating(false);
    }
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setGlobalPassword(null);
    setError(null);
    setAttemptsLeft(null);
    setBlockedUntil(null);
    setIsValidating(false);
  }, []);

  return {
    globalPassword,
    isValidating,
    error,
    attemptsLeft,
    blockedUntil,
    submitPassword,
    reset,
    isAuthenticated: !!globalPassword,
  };
};