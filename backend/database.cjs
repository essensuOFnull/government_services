const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Загружаем корневой .env (расположен на уровень выше от backend)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data');
const SQLITE = (() => {
  try {
    return require('better-sqlite3');
  } catch (e) {
    console.error('Missing dependency "better-sqlite3". Please run: npm install better-sqlite3');
    throw e;
  }
})();

// Убедимся, что директории существуют
try {
  fs.mkdirSync(DB_PATH, { recursive: true });
  const logDir = process.env.LOG_DIR || path.join(DB_PATH, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const messengerDataDir = path.dirname(process.env.DATABASE_PATH || path.join(DB_PATH, 'messenger.db'));
  fs.mkdirSync(messengerDataDir, { recursive: true });
  fs.mkdirSync(process.env.UPLOAD_DIR || path.join(DB_PATH, '..', 'data', 'uploads'), { recursive: true });
  fs.mkdirSync(process.env.S3_DATA_DIR || path.join(DB_PATH, '..', 'data', 's3'), { recursive: true });
} catch (err) {
  // Не фатальная ошибка при создании директорий
  console.warn('Warning creating directories for DB/logs/uploads:', err.message);
}

const sqliteFile = process.env.DATABASE_PATH || path.join(DB_PATH, 'app.db');
const db = new SQLITE(sqliteFile);

// Инициализация таблиц
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  userId TEXT UNIQUE,
  password TEXT,
  email TEXT,
  role TEXT,
  status TEXT,
  last_seen INTEGER,
  storage_used INTEGER DEFAULT 0,
  storage_quota INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  ip TEXT,
  attempts INTEGER DEFAULT 1,
  created_at INTEGER
);
`);

function now() { return Date.now(); }

function buildWhere(query) {
  const clauses = [];
  const params = {};
  Object.keys(query || {}).forEach((k) => {
    const p = `_${k}`;
    clauses.push(`${k} = @${p}`);
    params[p] = query[k];
  });
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

function rowToDoc(row) {
  if (!row) return null;
  return Object.assign({}, row);
}

class Database {
  constructor() {
    this._db = db;

    // Поддерживаем API, похожее на NeDB: users / loginAttempts с методами find/findOne/insert/update/remove
    this.users = {
      find: (query, cb) => {
        const q = buildWhere(query);
        const stmt = this._db.prepare(`SELECT * FROM users ${q.where}`);
        const rows = stmt.all(q.params);
        cb && cb(null, rows.map(rowToDoc));
      },
      findOne: (query, cb) => {
        const q = buildWhere(query);
        const stmt = this._db.prepare(`SELECT * FROM users ${q.where} LIMIT 1`);
        const row = stmt.get(q.params);
        cb && cb(null, rowToDoc(row));
      },
      insert: (doc, cb) => {
        const id = doc.id || (typeof require('crypto').randomUUID === 'function' ? require('crypto').randomUUID() : String(Date.now()));
        const nowTs = now();
        const data = Object.assign({}, doc, { id, created_at: nowTs, updated_at: nowTs });
        const keys = Object.keys(data);
        const cols = keys.join(',');
        const placeholders = keys.map(k => `@${k}`).join(',');
        const stmt = this._db.prepare(`INSERT INTO users (${cols}) VALUES (${placeholders})`);
        try {
          stmt.run(data);
          cb && cb(null, data);
        } catch (err) {
          cb && cb(err);
        }
      },
      update: (query, updateObj, options, cb) => {
        const q = buildWhere(query);
        // поддерживаем $set
        let setObj = updateObj && updateObj.$set ? updateObj.$set : updateObj;
        if (!setObj || Object.keys(setObj).length === 0) {
          cb && cb(new Error('No update fields'));
          return;
        }
        setObj.updated_at = now();
        const setKeys = Object.keys(setObj);
        const setClause = setKeys.map(k => `${k} = @set_${k}`).join(', ');
        const params = {};
        setKeys.forEach(k => { params[`set_${k}`] = setObj[k]; });
        Object.assign(params, q.params);
        const stmt = this._db.prepare(`UPDATE users SET ${setClause} ${q.where}`);
        try {
          const result = stmt.run(params);
          cb && cb(null, { affectedRows: result.changes });
        } catch (err) {
          cb && cb(err);
        }
      },
      remove: (query, options, cb) => {
        const q = buildWhere(query);
        const multi = options && options.multi;
        const stmt = this._db.prepare(`DELETE FROM users ${q.where}`);
        try {
          const result = stmt.run(q.params);
          cb && cb(null, { removed: result.changes });
        } catch (err) {
          cb && cb(err);
        }
      },
      ensureIndex: () => { /* noop for compatibility */ }
    };

    this.loginAttempts = {
      insert: (doc, cb) => {
        const id = doc.id || (typeof require('crypto').randomUUID === 'function' ? require('crypto').randomUUID() : String(Date.now()));
        const nowTs = now();
        const params = Object.assign({}, doc, { id, created_at: nowTs });
        const keys = Object.keys(params);
        const cols = keys.join(',');
        const placeholders = keys.map(k => `@${k}`).join(',');
        const stmt = this._db.prepare(`INSERT INTO login_attempts (${cols}) VALUES (${placeholders})`);
        try { stmt.run(params); cb && cb(null, params); } catch (err) { cb && cb(err); }
      },
      findOne: (query, cb) => {
        const q = buildWhere(query);
        const stmt = this._db.prepare(`SELECT * FROM login_attempts ${q.where} LIMIT 1`);
        const row = stmt.get(q.params);
        cb && cb(null, rowToDoc(row));
      },
      remove: (query, options, cb) => {
        const q = buildWhere(query);
        const stmt = this._db.prepare(`DELETE FROM login_attempts ${q.where}`);
        try { const res = stmt.run(q.params); cb && cb(null, { removed: res.changes }); } catch (err) { cb && cb(err); }
      },
      ensureIndex: () => { /* noop */ }
    };
  }
}

module.exports = new Database();