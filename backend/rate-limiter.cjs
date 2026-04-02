const db = require('./database.cjs');

class RateLimiter {
  constructor() {
    this.blockDuration = 10000; // 10 секунд
    this.maxAttempts = 5;
  }

  async checkAndRecord(ip, username) {
    const now = Date.now();
    const blockKey = `block:${ip}`;
    
    // Проверяем, не заблокирован ли IP
    const existingBlock = await new Promise((resolve) => {
      db.loginAttempts.findOne({ 
        ip: blockKey, 
        type: 'block',
        expiresAt: { $gt: now }
      }, (err, doc) => {
        if (err) resolve(null);
        resolve(doc);
      });
    });

    if (existingBlock) {
      return { blocked: true, remainingTime: existingBlock.expiresAt - now };
    }

    // Записываем попытку
    await new Promise((resolve) => {
      db.loginAttempts.insert({
        ip: blockKey,
        type: 'attempt',
        username,
        timestamp: now
      }, resolve);
    });

    // Подсчитываем попытки за последние 10 секунд
    const attempts = await new Promise((resolve) => {
      db.loginAttempts.find({
        ip: blockKey,
        type: 'attempt',
        timestamp: { $gt: now - 10000 }
      }, (err, docs) => {
        if (err) resolve([]);
        resolve(docs || []);
      });
    });

    if (attempts.length >= this.maxAttempts) {
      // Блокируем IP
      await new Promise((resolve) => {
        db.loginAttempts.insert({
          ip: blockKey,
          type: 'block',
          expiresAt: now + this.blockDuration,
          timestamp: now
        }, resolve);
      });
      
      return { blocked: true, remainingTime: this.blockDuration };
    }

    return { blocked: false };
  }

  async clearAttempts(ip) {
    const blockKey = `block:${ip}`;
    await new Promise((resolve) => {
      db.loginAttempts.remove({ ip: blockKey }, { multi: true }, resolve);
    });
  }
}

module.exports = new RateLimiter();