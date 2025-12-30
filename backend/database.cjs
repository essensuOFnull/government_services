const Datastore = require('nedb');
const path = require('path');
require('dotenv').config({ path: '../.env' })
const DB_PATH=process.env.DB_PATH
class Database {
  constructor() {
    this.users = new Datastore({
      filename: path.join(DB_PATH, 'users.db'),
      autoload: true,
      timestampData: true
    });
    
    this.loginAttempts = new Datastore({
      filename: path.join(DB_PATH, 'login-attempts.db'),
      autoload: true
    });
    
    // Создаем индексы для быстрого поиска
    this.users.ensureIndex({ fieldName: 'username', unique: true });
    this.users.ensureIndex({ fieldName: 'userId', unique: true });
    this.loginAttempts.ensureIndex({ fieldName: 'ip', expireAfterSeconds: 600 }); // Автоудаление через 10 мин
  }
}

module.exports = new Database();