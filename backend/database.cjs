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
// Load unified schema from SQL file (recreate safe schema)
try {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8');
  db.exec(schemaSql);
} catch (e) {
  console.warn('Could not load schema SQL file, falling back to defaults:', e.message);
}

// Helper to load query SQL files from `sql/queries` folder (supports both 'table.query' and 'table/query' paths)
function loadSql(name) {
  try {
    // First try direct path with dots (e.g., 'users.getById')
    const dotPath = path.join(__dirname, 'sql', 'queries', name + '.sql');
    if (fs.existsSync(dotPath)) {
      return fs.readFileSync(dotPath, 'utf8');
    }
    // Otherwise try nested path with slashes (e.g., 'users/getById')
    const slashPath = path.join(__dirname, 'sql', 'queries', name + '.sql');
    return fs.readFileSync(slashPath, 'utf8');
  } catch (e) {
    throw new Error(`Missing SQL file for: ${name} (${e.message})`);
  }
}

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

// --- Messenger-related schema + helpers ---
// Ensure WAL/foreign keys for messenger operations
try { db.pragma('journal_mode = WAL'); } catch (e) {}
try { db.pragma('foreign_keys = ON'); } catch (e) {}

const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

async function compressContent(text) {
  if (text == null) return null;
  const buffer = Buffer.from(String(text), 'utf-8');
  return await gzip(buffer);
}

async function decompressContent(compressedBuffer) {
  if (!compressedBuffer) return null;
  const buffer = await gunzip(compressedBuffer);
  return buffer.toString('utf-8');
}

// Re-create or ensure messenger tables from unified schema (idempotent)
function initializeDatabase() {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8');
    db.exec(schemaSql);
  } catch (e) {
    console.warn('Could not initialize DB schema from file:', e.message);
  }
}

// Minimal compatibility layer exposing messenger-like API (copied/adapted)
const Users = {
  create: (userId, username, role = 'guest') => {
    // Generate separate UUID for internal id, keep userId as provided
    const { v4: uuid } = require('uuid');
    const id = uuid();
    const now = Date.now();
    const stmt = db.prepare(loadSql('users/insert'));
    stmt.run(id, userId, username, null, null, role, 'offline', null, 0, null, 0, now, now);
    const quotaBytes = role === 'guest' ? 10 * 1024 * 1024 * 1024 : null;
    db.prepare(loadSql('users/insert_or_ignore')).run(userId, quotaBytes);
    return { id, userId, username, role };
  },
  getById: (userId) => db.prepare(loadSql('users/getById')).get(userId),
  getByUserId: (userId) => db.prepare(loadSql('users/getByUserId')).get(userId),
  getByUsername: (username) => db.prepare(loadSql('users/getByUsername')).get(username),
  updateStatus: (userId, status) => db.prepare(loadSql('users/updateByUserId')).run(status, null, null, null, status, null, null, null, null, Date.now(), userId),
  updateLastSeen: (userId) => db.prepare(loadSql('users/updateByUserId')).run(null, null, null, null, null, Date.now(), null, null, null, Date.now(), userId)
};

const Messages = {
  create: async (id, conversationId, senderId, content, fileIds = []) => {
    // senderId может быть userId (email) или id (UUID)
    // Получим пользователя и используем его внутренний id
    let user = Users.getByUserId(senderId);
    if (!user) {
      user = Users.getById(senderId);
    }
    const actualSenderId = user ? user.id : senderId;
    
    const compressedContent = content ? await compressContent(content) : null;
    const now = Date.now();
    db.prepare(loadSql('messages/insert')).run(id, conversationId, actualSenderId, compressedContent, JSON.stringify(fileIds), now);
    return { id, conversationId, senderId, fileIds, created_at: new Date() };
  },
  getById: async (messageId) => {
    const msg = db.prepare(loadSql('messages/getById')).get(messageId);
    if (msg && msg.content_compressed) { msg.content = await decompressContent(msg.content_compressed); delete msg.content_compressed; }
    if (msg && msg.file_ids) msg.file_ids = JSON.parse(msg.file_ids);
    return msg;
  },
  getConversationMessages: async (conversationId, limit = 50, offset = 0) => {
    const messages = db.prepare(loadSql('messages/getConversationMessages')).all(conversationId, limit, offset);
    for (const msg of messages) {
      if (msg.content_compressed) { msg.content = await decompressContent(msg.content_compressed); delete msg.content_compressed; }
      if (msg.file_ids) msg.file_ids = JSON.parse(msg.file_ids);
      
      // Если sender_username отсутствует, попытаемся получить его из БД
      if (!msg.sender_username && msg.sender_id) {
        const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(msg.sender_id);
        msg.sender_username = sender ? sender.username : msg.sender_id;
      }
    }
    return messages.reverse();
  },
  update: async (messageId, content) => { const compressedContent = await compressContent(content); const now = Date.now(); db.prepare(loadSql('messages/update')).run(compressedContent, now, messageId); },
  delete: (messageId) => { const now = Date.now(); db.prepare(loadSql('messages/delete')).run(now, messageId); },
  markAsRead: (messageId, userId) => db.prepare(loadSql('message_reads/insert')).run(`${messageId}-${userId}`, messageId, userId)
};

const Files = {
  create: (id, filename, mimeType, size, s3Key, uploaderId, ownerId = null) => {
    const now = Date.now();
    db.prepare(loadSql('files/insert')).run(id, filename, mimeType, size, s3Key, uploaderId, ownerId || uploaderId, now);
    return { id, filename, mimeType, size, s3_key: s3Key };
  },
  getById: (fileId) => db.prepare(loadSql('files/getById')).get(fileId),
  addReference: (fileId, messageId) => { db.prepare(loadSql('file_references/insert')).run(`${fileId}-${messageId}`, fileId, messageId); db.prepare('UPDATE files SET reference_count = reference_count + 1 WHERE id = ?').run(fileId); },
  removeReference: (fileId, messageId) => { db.prepare(loadSql('file_references/delete')).run(fileId, messageId); db.prepare('UPDATE files SET reference_count = reference_count - 1 WHERE id = ?').run(fileId); },
  getUserFiles: (userId) => db.prepare(loadSql('files/getUserFiles')).all(userId),
  getTotalUserStorage: (userId) => { const result = db.prepare(loadSql('files/getUserFiles')).all(userId).reduce((s, f) => s + (f.size || 0), 0); return result; },
  delete: (fileId) => { const now = Date.now(); db.prepare(loadSql('files/delete')).run(now, fileId); },
  getExpiredFiles: (days = 30) => db.prepare(loadSql('files/getExpiredFiles')).all(),
  permanentlyDelete: (fileId) => db.prepare(loadSql('files/permanentlyDelete')).run(fileId),
  forwardOwnership: (fileId, newOwnerId) => db.prepare('UPDATE files SET owner_id = ?, last_referenced_by = ? WHERE id = ?').run(newOwnerId, newOwnerId, fileId)
};

const Storage = {
  getQuota: (userId) => db.prepare(loadSql('user_storage_quota/get')).get(userId),
  updateQuota: (userId, limitBytes) => db.prepare(loadSql('user_storage_quota/update_limit')).run(limitBytes, userId),
  addToUsedStorage: (userId, bytes) => db.prepare(loadSql('user_storage_quota/add')).run(bytes, userId),
  removeFromUsedStorage: (userId, bytes) => db.prepare(loadSql('user_storage_quota/remove')).run(bytes, bytes, userId),
  getServerFreeDisk: () => null
};

const Conversations = {
  create: (id, participantIds) => { 
    // participantIds должна быть массивом userIds
    const stored = Array.isArray(participantIds) ? participantIds : [participantIds];
    db.prepare(loadSql('conversations/insert')).run(id, JSON.stringify(stored), Date.now(), null); 
    return { id, participantIds: stored }; 
  },
  getOrCreate: (participantIds) => {
    // Убедимся, что это массив, сортируем по значениям
    const idsArray = Array.isArray(participantIds) ? participantIds : [participantIds];
    const sorted = idsArray.sort();
    const key = JSON.stringify(sorted);
    
    let conv = db.prepare(loadSql('conversations/getByParticipantIds')).get(key);
    if (!conv) {
      const { v4: uuid } = require('uuid');
      const id = uuid();
      conv = Conversations.create(id, sorted);
    } else {
      // Преобразуем participant_ids из БД в participantIds (camelCase для API)
      const participants = typeof conv.participant_ids === 'string' 
        ? JSON.parse(conv.participant_ids) 
        : conv.participant_ids;
      const { participant_ids, ...rest } = conv;
      conv = {
        ...rest,
        participantIds: participants
      };
    }
    return conv;
  },
  getUserConversations: (userId) => {
    const convs = db.prepare("SELECT * FROM conversations WHERE participant_ids LIKE ? ORDER BY last_message_at DESC").all(`%${userId}%`);
    return convs.map(c => {
      let participantIds = [];
      
      // Пробуем распарсить как JSON массив
      if (typeof c.participant_ids === 'string') {
        try {
          participantIds = JSON.parse(c.participant_ids);
          if (!Array.isArray(participantIds)) {
            participantIds = [participantIds];
          }
        } catch (e) {
          // Если не JSON, это может быть строка с запятыми
          participantIds = c.participant_ids.split(',').map(p => p.trim()).filter(p => p);
        }
      } else if (Array.isArray(c.participant_ids)) {
        participantIds = c.participant_ids;
      } else {
        participantIds = [c.participant_ids];
      }
      
      const { participant_ids, ...rest } = c;
      return {
        ...rest,
        participantIds
      };
    });
  },
  updateLastMessage: (conversationId) => db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(Date.now(), conversationId)
};

// Run messenger initialization now (safe, idempotent)
initializeDatabase();

// Export both legacy Database instance and messenger API in one module
module.exports = Object.assign(module.exports, {
  db,
  initializeDatabase,
  compressContent,
  decompressContent,
  Users,
  Messages,
  Files,
  Storage,
  Conversations
});

// expose SQL loader for other modules
module.exports.loadSql = loadSql;