// Новый backend на Sequelize
const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const { Sequelize, DataTypes, Op, Model } = require('sequelize');
const DB_PATH = config.DATABASE_PATH || path.resolve(__dirname, '../data/app.db');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: DB_PATH,
  logging: false,
  define: {
    timestamps: false, // Отключаем автоматические timestamps
    underscored: true, // Используем snake_case для имен полей в БД
    freezeTableName: true // Не изменяем имена таблиц
  }
});

// Модели
class User extends Model {}
User.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING, defaultValue: 'guest' },
  status: { type: DataTypes.STRING, defaultValue: 'offline' },
  last_seen: { type: DataTypes.BIGINT },
  storage_used: { type: DataTypes.BIGINT, defaultValue: 0 },
  storage_quota: { type: DataTypes.BIGINT },
  total_storage_used: { type: DataTypes.BIGINT, defaultValue: 0 },
  avatar_file_id: { type: DataTypes.STRING },
  created_at: { type: DataTypes.BIGINT },
  updated_at: { type: DataTypes.BIGINT },
  is_banned: { type: DataTypes.BOOLEAN, defaultValue: false },
  banned_reason: { type: DataTypes.STRING },
  banned_at: { type: DataTypes.BIGINT },
}, { 
  sequelize, 
  modelName: 'User',
  tableName: 'users'
});

class LoginAttempt extends Model {}
LoginAttempt.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  ip: { type: DataTypes.STRING },
  attempts: { type: DataTypes.INTEGER, defaultValue: 1 },
  created_at: { type: DataTypes.BIGINT },
  type: { type: DataTypes.STRING },
  expires_at: { type: DataTypes.BIGINT }, // Исправлено на expires_at
  username: { type: DataTypes.STRING }
}, { 
  sequelize, 
  modelName: 'LoginAttempt',
  tableName: 'login_attempts'
});

class Conversation extends Model {}
Conversation.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  created_at: { type: DataTypes.BIGINT },
  last_message_at: { type: DataTypes.BIGINT }
}, { 
  sequelize, 
  modelName: 'Conversation',
  tableName: 'conversations'
});

class ConversationParticipant extends Model {}
ConversationParticipant.init({
  id: { type: DataTypes.STRING, primaryKey: true }, // Добавлен primary key
  conversation_id: { 
    type: DataTypes.STRING, 
    references: { model: 'conversations', key: 'id' } 
  },
  participant_id: { 
    type: DataTypes.STRING, 
    references: { model: 'users', key: 'id' } 
  }
}, { 
  sequelize, 
  modelName: 'ConversationParticipant',
  tableName: 'conversations_participants'
});

class Message extends Model {}
Message.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  conversation_id: { 
    type: DataTypes.STRING, 
    references: { model: 'conversations', key: 'id' } 
  },
  sender_id: { 
    type: DataTypes.STRING, 
    references: { model: 'users', key: 'id' } 
  },
  content_compressed: { type: DataTypes.BLOB },
  file_ids: { type: DataTypes.TEXT },
  created_at: { type: DataTypes.BIGINT },
  edited_at: { type: DataTypes.BIGINT },
  deleted_at: { type: DataTypes.BIGINT },
  forwarded_from: { type: DataTypes.STRING }
}, { 
  sequelize, 
  modelName: 'Message',
  tableName: 'messages'
});

class File extends Model {}
File.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  original_filename: { type: DataTypes.STRING, allowNull: false },
  mime_type: { type: DataTypes.STRING, allowNull: false },
  size: { type: DataTypes.BIGINT, allowNull: false },
  s3_key: { type: DataTypes.STRING, allowNull: false },
  uploader_id: { 
    type: DataTypes.STRING, 
    references: { model: 'users', key: 'id' } 
  },
  owner_id: { 
    type: DataTypes.STRING, 
    references: { model: 'users', key: 'id' } 
  },
  created_at: { type: DataTypes.BIGINT },
  deleted_at: { type: DataTypes.BIGINT },
  delete_after_days: { type: DataTypes.INTEGER, defaultValue: 30 },
  reference_count: { type: DataTypes.INTEGER, defaultValue: 1 },
  last_referenced_by: { type: DataTypes.STRING }
}, { 
  sequelize, 
  modelName: 'File',
  tableName: 'files'
});

class FileReference extends Model {}
FileReference.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  file_id: { 
    type: DataTypes.STRING, 
    references: { model: 'files', key: 'id' } 
  },
  message_id: { 
    type: DataTypes.STRING, 
    references: { model: 'messages', key: 'id' } 
  }
}, { 
  sequelize, 
  modelName: 'FileReference',
  tableName: 'file_references'
});

class UserStorageQuota extends Model {}
UserStorageQuota.init({
  id: { type: DataTypes.STRING, primaryKey: true }, // Добавлен primary key
  user_id: { 
    type: DataTypes.STRING, 
    references: { model: 'users', key: 'id' } 
  },
  storage_limit_bytes: { type: DataTypes.BIGINT },
  storage_used_bytes: { type: DataTypes.BIGINT, defaultValue: 0 }
}, { 
  sequelize, 
  modelName: 'UserStorageQuota',
  tableName: 'user_storage_quota'
});

class MessageRead extends Model {}
MessageRead.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  message_id: { 
    type: DataTypes.STRING, 
    references: { model: 'messages', key: 'id' } 
  },
  user_id: { 
    type: DataTypes.STRING, 
    references: { model: 'users', key: 'id' } 
  },
  read_at: { type: DataTypes.BIGINT }
}, { 
  sequelize, 
  modelName: 'MessageRead',
  tableName: 'message_reads'
});

class CrossoutResourcePrice extends Model {}
CrossoutResourcePrice.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  user_id: { 
    type: DataTypes.STRING, 
    references: { model: 'users', key: 'id' } 
  },
  resource_index: { type: DataTypes.INTEGER, allowNull: false }, // Индекс ресурса (0-5)
  value: { type: DataTypes.FLOAT, allowNull: false }, // Новое значение (цена за пакет или размер пакета)
  field_type: { type: DataTypes.STRING, allowNull: false }, // 'price' или 'pack_size'
  changed_at: { type: DataTypes.BIGINT, allowNull: false } // Время изменения
}, { 
  sequelize, 
  modelName: 'CrossoutResourcePrice',
  tableName: 'crossout_resource_prices'
});

// Модель для банов
class Ban extends Model {}
Ban.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  type: { type: DataTypes.STRING, allowNull: false }, // 'ip', 'device', 'user'
  value: { type: DataTypes.STRING, allowNull: false }, // IP, device_id или user_id
  reason: { type: DataTypes.STRING },
  created_at: { type: DataTypes.BIGINT, allowNull: false },
  expires_at: { type: DataTypes.BIGINT }, // null = бессрочно
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  sequelize,
  modelName: 'Ban',
  tableName: 'bans'
});

// Модель для белого списка
class Whitelist extends Model {}
Whitelist.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  type: { type: DataTypes.STRING, allowNull: false }, // 'ip', 'device'
  value: { type: DataTypes.STRING, allowNull: false }, // IP или device_id
  reason: { type: DataTypes.STRING },
  created_at: { type: DataTypes.BIGINT, allowNull: false },
  expires_at: { type: DataTypes.BIGINT } // null = бессрочно
}, {
  sequelize,
  modelName: 'Whitelist',
  tableName: 'whitelist'
});

// Связи
User.hasMany(File, { foreignKey: 'uploader_id', as: 'uploadedFiles' });
User.hasMany(File, { foreignKey: 'owner_id', as: 'ownedFiles' });
User.hasMany(Message, { foreignKey: 'sender_id', as: 'sentMessages' });
User.hasMany(CrossoutResourcePrice, { foreignKey: 'user_id', as: 'crossoutPrices' });
User.hasOne(UserStorageQuota, { foreignKey: 'user_id', as: 'quota' });

CrossoutResourcePrice.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Conversation.belongsToMany(User, { 
  through: ConversationParticipant, 
  foreignKey: 'conversation_id', 
  otherKey: 'participant_id', 
  as: 'participants' 
});

User.belongsToMany(Conversation, { 
  through: ConversationParticipant, 
  foreignKey: 'participant_id', 
  otherKey: 'conversation_id', 
  as: 'conversations' 
});

Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages' });
Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

File.hasMany(FileReference, { foreignKey: 'file_id', as: 'references' });
Message.hasMany(FileReference, { foreignKey: 'message_id', as: 'fileReferences' });
FileReference.belongsTo(File, { foreignKey: 'file_id', as: 'file' });
FileReference.belongsTo(Message, { foreignKey: 'message_id', as: 'message' });

// Сжатие/распаковка
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

// Инициализация и синхронизация
async function initializeDatabase() {
  try {
    // Вместо alter: true, используем force: false для создания таблиц
    await sequelize.sync({ force: false, alter: false });
    
    // Явно синхронизируем CrossoutResourcePrice, чтобы убедиться, что таблица существует
    await CrossoutResourcePrice.sync({ alter: false });
    
    console.log('Database synchronized successfully');
  } catch (error) {
    console.error('Database synchronization error:', error);
    throw error;
  }
}

// Экспортируем ORM и модели
module.exports = {
  sequelize,
  initializeDatabase,
  compressContent,
  decompressContent,
  User,
  LoginAttempt,
  Conversation,
  ConversationParticipant,
  Message,
  File,
  FileReference,
  UserStorageQuota,
  MessageRead,
  CrossoutResourcePrice,
  Ban,
  Whitelist,
  Op
};