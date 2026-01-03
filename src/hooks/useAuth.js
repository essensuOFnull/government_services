import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { storage } from '../utils/storage';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const login = useCallback(async (username, password) => {
    try {
      setError(null);
      const response = await api.login(username, password);
      
      if (response.success) {
        setUser(response.user);
        storage.saveAuthData(username, response.user.id);
        return { success: true };
      }
    } catch (err) {
      const message = err.message || 'Ошибка входа';
      setError(message);
      return { success: false, message };
    }
  }, []);

  const register = useCallback(async (username, password) => {
    try {
      setError(null);
      const response = await api.register(username, password);
      
      if (response.success) {
        setUser(response.user);
        storage.saveAuthData(username, response.user.id);
        return { success: true };
      }
    } catch (err) {
      const message = err.message || 'Ошибка регистрации';
      setError(message);
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    storage.clearAuthData();
  }, []);

  const changeUsername = useCallback(async (newUsername) => {
    if (!user) return { success: false, message: 'Не авторизован' };
    
    try {
      const response = await api.changeUsername(user.id, newUsername);
      
      if (response.success) {
        // Обновляем данные в storage (без пароля)
        storage.updateAuthData(newUsername, user.id);
        setUser(prev => ({ ...prev, username: newUsername }));
        return { success: true };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  }, [user]);

  const changePassword = useCallback(async (newPassword) => {
    if (!user) return { success: false, message: 'Не авторизован' };
    
    try {
      const response = await api.changePassword(user.id, newPassword);
      
      if (response.success) {
        // Не сохраняем пароль локально
        return { success: true };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  }, [user]);

  const updateUser = useCallback((updatedUser) => {
    if (updatedUser) {
      setUser(prev => ({ ...prev, ...updatedUser }));
    }
  }, []);

  // Автоматический вход при загрузке
  useEffect(() => {
    const autoLogin = async () => {
      try {
        const authData = storage.getAuthData();

        if (authData && authData.id) {
          try {
            const response = await api.getUser(authData.id);
            if (response && response.success) {
              setUser(response.user);
            } else {
              storage.clearAuthData();
            }
          } catch (err) {
            storage.clearAuthData();
          }
        }
      } catch (err) {
        console.error('Auto-login error:', err);
      } finally {
        setLoading(false);
      }
    };

    autoLogin();
  }, [login]);

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