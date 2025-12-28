const STORAGE_KEY = 'auth_data';

export const storage = {
  // Сохранение данных аутентификации (без пароля)
  saveAuthData(username, userId) {
    try {
      const data = {
        username,
        userId,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Ошибка сохранения данных:', error);
      return false;
    }
  },

  // Получение данных аутентификации
  getAuthData() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;

      const parsed = JSON.parse(data);
      if (!parsed.username || !parsed.userId) return null;

      // Проверяем, не устарели ли данные (например, больше 30 дней)
      if (Date.now() - parsed.timestamp > 30 * 24 * 60 * 60 * 1000) {
        this.clearAuthData();
        return null;
      }

      return {
        username: parsed.username,
        userId: parsed.userId
      };
    } catch (error) {
      console.error('Ошибка чтения данных:', error);
      this.clearAuthData();
      return null;
    }
  },

  // Обновление данных
  updateAuthData(username, userId) {
    const current = this.getAuthData() || {};
    const newUsername = username || current.username;
    const newUserId = userId || current.userId;
    if (!newUsername || !newUserId) return false;
    return this.saveAuthData(newUsername, newUserId);
  },

  // Очистка данных
  clearAuthData() {
    localStorage.removeItem(STORAGE_KEY);
  },

  // Проверка наличия данных
  hasAuthData() {
    return !!localStorage.getItem(STORAGE_KEY);
  }
};