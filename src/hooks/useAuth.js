import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

// Ключ для sessionStorage
const STORAGE_KEY = 'messenger_auth';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Сохранение в sessionStorage
  const saveAuthData = (username, id) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ username, id }));
    } catch (e) {
      console.error('Failed to save auth data to sessionStorage', e);
    }
  };

  const clearAuthData = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear auth data from sessionStorage', e);
    }
  };

  const login = useCallback(async (username, password, globalPassword) => {
    try {
      setError(null);
      const response = await api.login(username, password, globalPassword);
      if (response.success) {
        setUser(response.user);
        saveAuthData(username, response.user.id);
        return { success: true };
      }
      return { success: false, message: response.message || 'Ошибка входа' };
    } catch (err) {
      const message = err.message || 'Ошибка входа';
      setError(message);
      return { success: false, message };
    }
  }, []);

  const register = useCallback(async (username, password, globalPassword) => {
    try {
      setError(null);
      const response = await api.register(username, password, globalPassword);
      if (response.success) {
        setUser(response.user);
        saveAuthData(username, response.user.id);
        return { success: true };
      }
      return { success: false, message: response.message || 'Ошибка регистрации' };
    } catch (err) {
      const message = err.message || 'Ошибка регистрации';
      setError(message);
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearAuthData();
  }, []);

  const changeUsername = useCallback(async (newUsername) => {
    if (!user) return { success: false, message: 'Не авторизован' };
    
    try {
      const response = await api.changeUsername(user.id, newUsername);
      
      if (response.success) {
        // Обновляем данные в sessionStorage
        saveAuthData(newUsername, user.id);
        setUser(prev => ({ ...prev, username: newUsername }));
        return { success: true };
      }
      return { success: false, message: response.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }, [user]);

  const changePassword = useCallback(async (newPassword) => {
    if (!user) return { success: false, message: 'Не авторизован' };
    
    try {
      const response = await api.changePassword(user.id, newPassword);
      
      if (response.success) {
        return { success: true };
      }
      return { success: false, message: response.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }, [user]);

  const updateUser = useCallback((updatedUser) => {
    if (updatedUser) {
      setUser(prev => ({ ...prev, ...updatedUser }));
      // При обновлении данных пользователя обновляем sessionStorage
      if (updatedUser.username) {
        const current = sessionStorage.getItem(STORAGE_KEY);
        if (current) {
          try {
            const authData = JSON.parse(current);
            authData.username = updatedUser.username;
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
          } catch (e) {}
        }
      }
    }
  }, []);

  // Автоматический вход при загрузке страницы (в рамках одной вкладки)
  useEffect(() => {
    const autoLogin = async () => {
      setLoading(true);
      try {
        const authDataStr = sessionStorage.getItem(STORAGE_KEY);
        if (authDataStr) {
          const authData = JSON.parse(authDataStr);
          if (authData && authData.id) {
            // Проверяем, что пользователь существует на сервере
            const response = await api.getUser(authData.id);
            if (response && response.success) {
              setUser(response.user);
            } else {
              // Если пользователь не найден или ошибка, чистим sessionStorage
              clearAuthData();
            }
          } else {
            clearAuthData();
          }
        }
      } catch (err) {
        console.error('Auto-login error:', err);
        clearAuthData();
      } finally {
        setLoading(false);
      }
    };

    autoLogin();
  }, []);

  return {
    user,
    loading,
    error,
    login,
    register,
    logout,
    changeUsername,
    changePassword,
    updateUser,
    isAuthenticated: !!user
  };
};