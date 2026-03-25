const API_BASE_URL = (import.meta.env.MODE === 'development')
  ? '/api'
  : (import.meta.env.VITE_API_URL || '/api');

const api = {
  async verifyGlobalPassword(globalPassword) {
    return this.request('/verify-global-password', {
      method: 'POST',
      body: JSON.stringify({ globalPassword })
    });
  },
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`API request -> ${options.method || 'GET'} ${url}`);

    // Читаем userId из sessionStorage
    let userId = null;
    try {
      const authDataStr = sessionStorage.getItem('messenger_auth');
      if (authDataStr) {
        const authData = JSON.parse(authDataStr);
        userId = authData.id;
      }
    } catch (e) {
      userId = null;
    }

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

      console.log(`API response <- ${response.status} ${url}`, data);

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

  async register(username, password, globalPassword) {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, globalPassword })
    });
  },

  async login(username, password, globalPassword) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, globalPassword })
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

  async findUserByUsername(username) {
    return this.request(`/messenger/find-user?username=${encodeURIComponent(username)}`);
  }
};

export default api;