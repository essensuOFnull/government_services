-- Unified schema for application (single source of truth)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE,
  username TEXT UNIQUE NOT NULL,
  password TEXT,
  role TEXT DEFAULT 'guest' CHECK(role IN ('guest','sponsor','member')),
  status TEXT DEFAULT 'offline',
  last_seen INTEGER,
  storage_used INTEGER DEFAULT 0,
  storage_quota INTEGER,
  total_storage_used INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
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

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  participant_ids TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  last_message_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content_compressed BLOB,
  file_ids TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  edited_at INTEGER,
  deleted_at INTEGER,
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
  created_at INTEGER DEFAULT (strftime('%s','now')),
  deleted_at INTEGER,
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
  read_at INTEGER DEFAULT (strftime('%s','now')),
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
