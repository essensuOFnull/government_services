// In development, force relative API path so requests go to same origin (Vite middleware)
const API_BASE_URL = (import.meta.env.MODE === 'development')
  ? '/api'
  : (import.meta.env.VITE_API_URL || '/api');

const api = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`API request -> ${options.method || 'GET'} ${url}`);
    // Получаем userId из storage, если есть
    let userId = null;
    try {
      const storageModule = await import('./storage');
      const authData = storageModule.storage.getAuthData();
      userId = authData?.id || null;
    } catch (e) { userId = null; }
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {})
      },
      credentials: 'include'
    };
    try {
      const response = await fetch(url, {
        ...defaultOptions,
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers,
        },
      });

      let data;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      console.log(`API response <- ${response.status} ${url}` , data);

      if (!response.ok) {
        const msg = (data && data.message) ? data.message : `HTTP ${response.status}`;
        throw new Error(msg || 'Ошибка сети');
      }

      return data;
    } catch (err) {
      console.error(`API request error -> ${url}`, err);
      throw err;
    }
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

  async changeUsername(id, newUsername) {
    return this.request('/change-username', {
      method: 'POST',
      body: JSON.stringify({ id, newUsername })
    });
  },

  async changePassword(id, newPassword) {
    return this.request('/change-password', {
      method: 'POST',
      body: JSON.stringify({ id, newPassword })
    });
  },

  async getUser(id) {
    return this.request(`/user/${id}`);
  },
  // Поиск пользователя по username
  async findUserByUsername(username) {
    return this.request(`/messenger/find-user?username=${encodeURIComponent(username)}`);
  }
};
export default api;