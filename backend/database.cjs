const Datastore = require('nedb');
const path = require('path');

class Database {
  constructor() {
    this.users = new Datastore({
      filename: path.join(__dirname, 'users.db'),
      autoload: true,
      timestampData: true
    });
    
    this.loginAttempts = new Datastore({
      filename: path.join(__dirname, 'login-attempts.db'),
      autoload: true
    });
    
    // Создаем индексы для быстрого поиска
    this.users.ensureIndex({ fieldName: 'username', unique: true });
    this.users.ensureIndex({ fieldName: 'userId', unique: true });
    this.loginAttempts.ensureIndex({ fieldName: 'ip', expireAfterSeconds: 600 }); // Автоудаление через 10 мин
  }
}

module.exports = new Database();