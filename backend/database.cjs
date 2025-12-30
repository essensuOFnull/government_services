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
  created_at INTEGER,
  type TEXT,
  expiresAt INTEGER,
  timestamp INTEGER,
  username TEXT
);
`);

// Backwards-compatibility: некоторые части кода ожидают колонку `storageLimit`.
// Проверим наличие колонки и добавим её, если нужно.
try {
  const cols = db.prepare("PRAGMA table_info('users')").all();
  const names = cols.map(c => c.name);
  if (!names.includes('storageLimit')) {
    db.prepare('ALTER TABLE users ADD COLUMN storageLimit INTEGER').run();
  }
  if (!names.includes('createdAt')) {
    db.prepare("ALTER TABLE users ADD COLUMN createdAt INTEGER").run();
  }
  if (!names.includes('updatedAt')) {
    db.prepare("ALTER TABLE users ADD COLUMN updatedAt INTEGER").run();
  }
  if (!names.includes('storageUsed')) {
    db.prepare("ALTER TABLE users ADD COLUMN storageUsed INTEGER DEFAULT 0").run();
  }
  // Ensure login_attempts columns exist for legacy rate-limiter
  try {
    const la = db.prepare("PRAGMA table_info('login_attempts')").all();
    const lanames = la.map(c => c.name);
    if (!lanames.includes('type')) db.prepare("ALTER TABLE login_attempts ADD COLUMN type TEXT").run();
    if (!lanames.includes('expiresAt')) db.prepare("ALTER TABLE login_attempts ADD COLUMN expiresAt INTEGER").run();
    if (!lanames.includes('timestamp')) db.prepare("ALTER TABLE login_attempts ADD COLUMN timestamp INTEGER").run();
    if (!lanames.includes('username')) db.prepare("ALTER TABLE login_attempts ADD COLUMN username TEXT").run();
  } catch (e) {
    // ignore
  }
} catch (err) {
  console.warn('Could not ensure storageLimit column:', err.message);
}

function now() { return Date.now(); }

function sanitizeValue(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
  if (Buffer.isBuffer && Buffer.isBuffer(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

function buildWhere(query) {
  const clauses = [];
  const params = {};
  Object.keys(query || {}).forEach((k) => {
    const val = query[k];
    const p = `_${k}`;
    // Support simple operator objects like { $gt: value }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (val.$gt !== undefined) {
        clauses.push(`${k} > @${p}`);
        params[p] = sanitizeValue(val.$gt);
        return;
      }
      if (val.$lt !== undefined) {
        clauses.push(`${k} < @${p}`);
        params[p] = sanitizeValue(val.$lt);
        return;
      }
      if (val.$gte !== undefined) {
        clauses.push(`${k} >= @${p}`);
        params[p] = sanitizeValue(val.$gte);
        return;
      }
      if (val.$lte !== undefined) {
        clauses.push(`${k} <= @${p}`);
        params[p] = sanitizeValue(val.$lte);
        return;
      }
      if (val.$ne !== undefined) {
        clauses.push(`${k} != @${p}`);
        params[p] = sanitizeValue(val.$ne);
        return;
      }
      if (val.$in && Array.isArray(val.$in)) {
        const placeholders = val.$in.map((_, i) => `@${p}_${i}`);
        clauses.push(`${k} IN (${placeholders.join(',')})`);
        val.$in.forEach((v, i) => { params[`${p}_${i}`] = sanitizeValue(v); });
        return;
      }
      // Fallback: attempt exact match on serialized object
      clauses.push(`${k} = @${p}`);
      params[p] = sanitizeValue(val);
      return;
    }

    // Primitive value
    clauses.push(`${k} = @${p}`);
    params[p] = sanitizeValue(val);
  });
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

function rowToDoc(row) {
  if (!row) return null;
  const doc = Object.assign({}, row);
  // совместимость: expose storageLimit for старого кода
  if (doc.storageLimit === undefined && doc.storage_quota !== undefined) {
    doc.storageLimit = doc.storage_quota;
  }
  // expose camelCase fields expected by frontend/backend legacy code
  if (doc.createdAt === undefined && doc.created_at !== undefined) {
    doc.createdAt = doc.created_at;
  }
  if (doc.updatedAt === undefined && doc.updated_at !== undefined) {
    doc.updatedAt = doc.updated_at;
  }
  if (doc.storageUsed === undefined && doc.storage_used !== undefined) {
    doc.storageUsed = doc.storage_used;
  }
  return doc;
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
        // Поддержка backward-compat: если передали storageLimit, скопируем в storage_quota
        if (data.storageLimit !== undefined && data.storage_quota === undefined) {
          data.storage_quota = data.storageLimit;
        }
        // Поддержка camelCase полей: createdAt/updatedAt/storageUsed
        if (data.createdAt !== undefined && data.created_at === undefined) {
          try { const ts = (data.createdAt instanceof Date) ? data.createdAt.getTime() : new Date(data.createdAt).getTime(); data.created_at = ts; data.createdAt = ts; } catch (e) { data.created_at = nowTs; data.createdAt = nowTs; }
        }
        if (data.updatedAt !== undefined && data.updated_at === undefined) {
          try { const ts = (data.updatedAt instanceof Date) ? data.updatedAt.getTime() : new Date(data.updatedAt).getTime(); data.updated_at = ts; data.updatedAt = ts; } catch (e) { data.updated_at = nowTs; data.updatedAt = nowTs; }
        }
        if (data.storageUsed !== undefined && data.storage_used === undefined) {
          const n = Number(data.storageUsed) || 0; data.storage_used = n; data.storageUsed = n;
        }
        if (data.storageLimit !== undefined && data.storage_quota === undefined) {
          const n = Number(data.storageLimit) || null; data.storage_quota = n; data.storageLimit = n;
        }
        const keys = Object.keys(data);
        const cols = keys.join(',');
        const placeholders = keys.map(k => `@${k}`).join(',');
        const stmt = this._db.prepare(`INSERT INTO users (${cols}) VALUES (${placeholders})`);
        // sanitize values to allowed sqlite bind types
        const safeData = {};
        for (const k of keys) {
          safeData[k] = sanitizeValue(data[k]);
        }
        try {
          stmt.run(safeData);
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
        // map camelCase updates to snake_case storage
        if (setObj.updatedAt !== undefined) { setObj.updated_at = (setObj.updatedAt instanceof Date) ? setObj.updatedAt.getTime() : new Date(setObj.updatedAt).getTime(); delete setObj.updatedAt; }
        if (setObj.createdAt !== undefined) { setObj.created_at = (setObj.createdAt instanceof Date) ? setObj.createdAt.getTime() : new Date(setObj.createdAt).getTime(); delete setObj.createdAt; }
        if (setObj.storageUsed !== undefined) { setObj.storage_used = Number(setObj.storageUsed); delete setObj.storageUsed; }
        if (setObj.storageLimit !== undefined) { setObj.storage_quota = Number(setObj.storageLimit); }
        setObj.updated_at = now();
        const setKeys = Object.keys(setObj);
        const setClause = setKeys.map(k => `${k} = @set_${k}`).join(', ');
        const params = {};
        setKeys.forEach(k => { params[`set_${k}`] = setObj[k]; });
        Object.assign(params, q.params);
        // sanitize params
        for (const p of Object.keys(params)) {
          params[p] = sanitizeValue(params[p]);
        }
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
        // sanitize params
        Object.keys(params).forEach(k => { params[k] = sanitizeValue(params[k]); });
        const keys = Object.keys(params);
        const cols = keys.join(',');
        const placeholders = keys.map(k => `@${k}`).join(',');
        const stmt = this._db.prepare(`INSERT INTO login_attempts (${cols}) VALUES (${placeholders})`);
        try { stmt.run(params); cb && cb(null, params); } catch (err) { cb && cb(err); }
      },
      find: (query, cb) => {
        const q = buildWhere(query);
        const stmt = this._db.prepare(`SELECT * FROM login_attempts ${q.where}`);
        try {
          const rows = stmt.all(q.params);
          cb && cb(null, rows.map(rowToDoc));
        } catch (err) {
          cb && cb(err);
        }
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