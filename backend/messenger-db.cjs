const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/messenger.db');

// Создаем директорию для данных если её нет
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Инициализация схемы БД
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'guest' CHECK(role IN ('guest', 'sponsor', 'member')),
      total_storage_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'offline'
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      participant_ids TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_message_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content_compressed BLOB,
      file_ids TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      edited_at DATETIME,
      deleted_at DATETIME,
      forwarded_from TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      s3_key TEXT NOT NULL,
      uploader_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      delete_after_days INTEGER DEFAULT 30,
      reference_count INTEGER DEFAULT 1,
      last_referenced_by TEXT,
      FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_references (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      UNIQUE(file_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS user_storage_quota (
      user_id TEXT PRIMARY KEY,
      storage_limit_bytes INTEGER,
      storage_used_bytes INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(message_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(participant_ids);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploader_id);
    CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
    CREATE INDEX IF NOT EXISTS idx_file_references_file ON file_references(file_id);
    CREATE INDEX IF NOT EXISTS idx_user_storage ON user_storage_quota(user_id);
  `);
}

// Сжатие текста
async function compressContent(text) {
  const buffer = Buffer.from(text, 'utf-8');
  return await gzip(buffer);
}

// Распаковка текста
async function decompressContent(compressedBuffer) {
  const buffer = await gunzip(compressedBuffer);
  return buffer.toString('utf-8');
}

// Функции работы с пользователями
const Users = {
  create: (id, username, role = 'guest') => {
    const stmt = db.prepare(`
      INSERT INTO users (id, username, role)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, username, role);

    // Установка квоты в зависимости от роли
    const quotaBytes = role === 'guest' ? 10 * 1024 * 1024 * 1024 : null; // 10GB для гостей
    db.prepare(`
      INSERT INTO user_storage_quota (user_id, storage_limit_bytes)
      VALUES (?, ?)
    `).run(id, quotaBytes);

    return { id, username, role };
  },

  getById: (userId) => {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  },

  getByUsername: (username) => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  updateStatus: (userId, status) => {
    db.prepare('UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, userId);
  },

  updateLastSeen: (userId) => {
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  }
};

// Функции работы с сообщениями
const Messages = {
  create: async (id, conversationId, senderId, content, fileIds = []) => {
    const compressedContent = content ? await compressContent(content) : null;
    
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, content_compressed, file_ids, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, conversationId, senderId, compressedContent, JSON.stringify(fileIds));

    return { id, conversationId, senderId, fileIds, created_at: new Date() };
  },

  getById: async (messageId) => {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (msg && msg.content_compressed) {
      msg.content = await decompressContent(msg.content_compressed);
      delete msg.content_compressed;
    }
    if (msg && msg.file_ids) {
      msg.file_ids = JSON.parse(msg.file_ids);
    }
    return msg;
  },

  getConversationMessages: async (conversationId, limit = 50, offset = 0) => {
    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE conversation_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(conversationId, limit, offset);

    for (const msg of messages) {
      if (msg.content_compressed) {
        msg.content = await decompressContent(msg.content_compressed);
        delete msg.content_compressed;
      }
      if (msg.file_ids) {
        msg.file_ids = JSON.parse(msg.file_ids);
      }
    }

    return messages.reverse();
  },

  update: async (messageId, content) => {
    const compressedContent = await compressContent(content);
    db.prepare(`
      UPDATE messages 
      SET content_compressed = ?, edited_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(compressedContent, messageId);
  },

  delete: (messageId) => {
    db.prepare('UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(messageId);
  },

  markAsRead: (messageId, userId) => {
    db.prepare(`
      INSERT OR IGNORE INTO message_reads (id, message_id, user_id)
      VALUES (?, ?, ?)
    `).run(`${messageId}-${userId}`, messageId, userId);
  }
};

// Функции работы с файлами
const Files = {
  create: (id, filename, mimeType, size, s3Key, uploaderId, ownerId = null) => {
    const stmt = db.prepare(`
      INSERT INTO files (id, original_filename, mime_type, size, s3_key, uploader_id, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, filename, mimeType, size, s3Key, uploaderId, ownerId || uploaderId);
    
    return { id, filename, mimeType, size, s3_key: s3Key };
  },

  getById: (fileId) => {
    return db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  },

  addReference: (fileId, messageId) => {
    db.prepare(`
      INSERT OR IGNORE INTO file_references (id, file_id, message_id)
      VALUES (?, ?, ?)
    `).run(`${fileId}-${messageId}`, fileId, messageId);

    db.prepare('UPDATE files SET reference_count = reference_count + 1 WHERE id = ?')
      .run(fileId);
  },

  removeReference: (fileId, messageId) => {
    db.prepare('DELETE FROM file_references WHERE file_id = ? AND message_id = ?')
      .run(fileId, messageId);

    db.prepare('UPDATE files SET reference_count = reference_count - 1 WHERE id = ?')
      .run(fileId);
  },

  getUserFiles: (userId) => {
    return db.prepare(`
      SELECT * FROM files 
      WHERE owner_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `).all(userId);
  },

  getTotalUserStorage: (userId) => {
    const result = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as total FROM files
      WHERE owner_id = ? AND deleted_at IS NULL
    `).get(userId);
    return result.total;
  },

  delete: (fileId) => {
    db.prepare('UPDATE files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(fileId);
  },

  getExpiredFiles: (days = 30) => {
    return db.prepare(`
      SELECT * FROM files
      WHERE deleted_at IS NOT NULL
      AND datetime(deleted_at, '+' || delete_after_days || ' days') <= datetime('now')
      AND reference_count = 0
    `).all();
  },

  permanentlyDelete: (fileId) => {
    db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  },

  forwardOwnership: (fileId, newOwnerId) => {
    db.prepare(`
      UPDATE files
      SET owner_id = ?, last_referenced_by = ?
      WHERE id = ?
    `).run(newOwnerId, newOwnerId, fileId);
  }
};

// Функции работы с квотами
const Storage = {
  getQuota: (userId) => {
    return db.prepare('SELECT * FROM user_storage_quota WHERE user_id = ?').get(userId);
  },

  updateQuota: (userId, limitBytes) => {
    db.prepare('UPDATE user_storage_quota SET storage_limit_bytes = ? WHERE user_id = ?')
      .run(limitBytes, userId);
  },

  addToUsedStorage: (userId, bytes) => {
    db.prepare('UPDATE user_storage_quota SET storage_used_bytes = storage_used_bytes + ? WHERE user_id = ?')
      .run(bytes, userId);
  },

  removeFromUsedStorage: (userId, bytes) => {
    db.prepare('UPDATE user_storage_quota SET storage_used_bytes = GREATEST(0, storage_used_bytes - ?) WHERE user_id = ?')
      .run(bytes, userId);
  },

  getServerFreeDisk: () => {
    // Это должно быть реализовано отдельно
    return null;
  }
};

// Функции работы с разговорами
const Conversations = {
  create: (id, participantIds) => {
    db.prepare(`
      INSERT INTO conversations (id, participant_ids)
      VALUES (?, ?)
    `).run(id, JSON.stringify(participantIds));
    return { id, participantIds };
  },

  getOrCreate: (participantIds) => {
    const sorted = participantIds.sort().join(',');
    let conv = db.prepare(`
      SELECT * FROM conversations 
      WHERE participant_ids = ?
    `).get(JSON.stringify(sorted));

    if (!conv) {
      const { v4: uuid } = require('uuid');
      const id = uuid();
      conv = Conversations.create(id, sorted);
    }

    return conv;
  },

  getUserConversations: (userId) => {
    return db.prepare(`
      SELECT * FROM conversations
      WHERE participant_ids LIKE ?
      ORDER BY last_message_at DESC
    `).all(`%${userId}%`);
  },

  updateLastMessage: (conversationId) => {
    db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(conversationId);
  }
};

// Инициализируем БД при загрузке модуля
initializeDatabase();

module.exports = {
  db,
  initializeDatabase,
  compressContent,
  decompressContent,
  Users,
  Messages,
  Files,
  Storage,
  Conversations
};
