const STORAGE_KEY = 'auth_data';

export const storage = {
  // Сохранение данных аутентификации (без пароля)
  saveAuthData(username, id) {
    try {
      const data = {
        username,
        id,
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
      if (!parsed.username || !parsed.id) return null;

      // Проверяем, не устарели ли данные (например, больше 30 дней)
      if (Date.now() - parsed.timestamp > 30 * 24 * 60 * 60 * 1000) {
        this.clearAuthData();
        return null;
      }

      return {
        username: parsed.username,
        id: parsed.id
      };
    } catch (error) {
      console.error('Ошибка чтения данных:', error);
      this.clearAuthData();
      return null;
    }
  },

  // Обновление данных
  updateAuthData(username, id) {
    const current = this.getAuthData() || {};
    const newUsername = username || current.username;
    const newId = id || current.id;
    if (!newUsername || !newId) return false;
    return this.saveAuthData(newUsername, newId);
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