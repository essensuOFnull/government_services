const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('./database.cjs');
const rateLimiter = require('./rate-limiter.cjs');

class AuthMiddleware {
  constructor() {
    this.saltRounds = 12;
  }

  async validatePassword(password) {
    if (!password || password.length < 8) {
      throw new Error('Пароль должен содержать минимум 8 символов');
    }
    
    if (password.length > 100) {
      throw new Error('Пароль слишком длинный');
    }

    // Проверка на сложность (опционально)
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      throw new Error('Пароль должен содержать заглавные и строчные буквы, а также цифры');
    }

    return true;
  }

  async validateUsername(username) {
    if (!username || username.length < 3) {
      throw new Error('Имя пользователя должно содержать минимум 3 символа');
    }
    
    if (username.length > 20) {
      throw new Error('Имя пользователя слишком длинное');
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      throw new Error('Имя пользователя может содержать только буквы, цифры, дефисы и нижние подчеркивания');
    }

    return true;
  }

  async hashPassword(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  async registerUser(username, password) {
    await this.validateUsername(username);
    await this.validatePassword(password);

    const existingUser = await new Promise((resolve) => {
      db.users.findOne({ username }, (err, user) => {
        if (err) resolve(null);
        resolve(user);
      });
    });

    if (existingUser) {
      throw new Error('Пользователь с таким именем уже существует');
    }

    const id = uuidv4();
    const hashedPassword = await this.hashPassword(password);

    const user = {
      id,
      username,
      password: hashedPassword,
      role: 'guest',
      storageLimit: 10 * 1024 * 1024 * 1024, // 10 GB в байтах
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return new Promise((resolve, reject) => {
      db.users.insert(user, (err, newUser) => {
        if (err) reject(err);
        // Не возвращаем пароль в ответе
        delete newUser.password;
        resolve(newUser);
      });
    });
  }

  async authenticate(username, password, ip) {
    // Проверка блокировки
    const blockCheck = await rateLimiter.checkAndRecord(ip, username);
    if (blockCheck.blocked) {
      throw new Error(`Превышено количество попыток. Попробуйте через ${Math.ceil(blockCheck.remainingTime / 1000)} секунд`);
    }

    const user = await new Promise((resolve) => {
      db.users.findOne({ username }, (err, user) => {
        if (err) resolve(null);
        resolve(user);
      });
    });

    if (!user) {
      throw new Error('Неверное имя пользователя или пароль');
    }

    const passwordValid = await this.comparePassword(password, user.password);
    if (!passwordValid) {
      throw new Error('Неверное имя пользователя или пароль');
    }

    // Очищаем попытки при успешном входе
    await rateLimiter.clearAttempts(ip);

    // Возвращаем пользователя без пароля
    const userWithoutPassword = { ...user };
    delete userWithoutPassword.password;
    
    return userWithoutPassword;
  }

  async changeUsername(id, newUsername) {
    await this.validateUsername(newUsername);

    const existingUser = await new Promise((resolve) => {
      db.users.findOne({ username: newUsername }, (err, user) => {
        if (err) resolve(null);
        resolve(user);
      });
    });

    if (existingUser && existingUser.id !== id) {
      throw new Error('Это имя пользователя уже занято');
    }

    return new Promise((resolve, reject) => {
      db.users.update(
        { id },
        { $set: { username: newUsername, updatedAt: new Date() } },
        {},
        (err) => {
          if (err) reject(err);
          resolve(true);
        }
      );
    });
  }

  async changePassword(id, newPassword) {
    await this.validatePassword(newPassword);
    const hashedPassword = await this.hashPassword(newPassword);

    return new Promise((resolve, reject) => {
      db.users.update(
        { id },
        { $set: { password: hashedPassword, updatedAt: new Date() } },
        {},
        (err) => {
          if (err) reject(err);
          resolve(true);
        }
      );
    });
  }

  async getUserById(id) {
    return new Promise((resolve) => {
      db.users.findOne({ id }, (err, user) => {
        if (err || !user) {
          resolve(null);
          return;
        }
        delete user.password;
        resolve(user);
      });
    });
  }
}

module.exports = new AuthMiddleware();