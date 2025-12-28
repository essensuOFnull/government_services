const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    };

    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Ошибка сети');
    }

    return data;
  },

  // Методы API
  async register(username, password) {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async login(username, password) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async changeUsername(userId, newUsername) {
    return this.request('/change-username', {
      method: 'POST',
      body: JSON.stringify({ userId, newUsername })
    });
  },

  async changePassword(userId, newPassword) {
    return this.request('/change-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword })
    });
  },

  async getUser(userId) {
    return this.request(`/user/${userId}`);
  }
};