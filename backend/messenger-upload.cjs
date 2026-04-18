const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const multer = require('multer');
const mime = require('mime-types');
const { v4: uuid } = require('uuid');

// Импорт Sequelize моделей
const {
  User,
  File,
  UserStorageQuota
} = require('./database.cjs');

const uploadsDir = config.UPLOAD_DIR || path.join(__dirname, '../data/uploads');

// Создаем директорию для загрузок если её нет
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Список разрешенных MIME-типов
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm'
];

// Конфигурация multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const fileId = uuid();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  }
});

// Фильтр
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

// Функция проверки квоты хранилища
const checkStorageQuota = async (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Требуется аутентификация'
    });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Получаем или создаем квоту
    let quota = await UserStorageQuota.findOne({ where: { user_id: userId } });
    if (!quota) {
      let storage_limit_bytes = null;
      if (user.role === 'guest') {
        storage_limit_bytes = 10 * 1024 * 1024 * 1024;
      }
      quota = await UserStorageQuota.create({
        user_id: userId,
        storage_limit_bytes,
        storage_used_bytes: 0
      });
    }

    // Получаем файлы пользователя
    const userFiles = await File.findAll({
      where: { 
        owner_id: userId,
        deleted_at: null 
      }
    });
    
    const usedStorage = userFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    // Получаем свободное место на сервере
    const serverFreeSpace = getServerFreeSpace();

    // Минимум 10GB должно быть на сервере
    if (serverFreeSpace < 10 * 1024 * 1024 * 1024) {
      return res.status(507).json({
        success: false,
        message: 'На сервере осталось меньше места, чем вам положено',
        serverFreeSpace,
        userLimit: quota.storage_limit_bytes,
        userUsed: usedStorage
      });
    }

    req.storageInfo = {
      quota: quota.toJSON(),
      usedStorage,
      serverFreeSpace
    };

    next();
  } catch (error) {
    console.error('Error in checkStorageQuota:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка проверки квоты хранилища'
    });
  }
};

// Функция получения свободного места на диске
const getServerFreeSpace = () => {
  try {
    const execSync = require('child_process').execSync;
    let cmd;

    if (process.platform === 'win32') {
      cmd = `powershell -Command "(Get-Volume).SizeRemaining | Measure-Object -Sum | Select-Object -ExpandProperty Sum"`;
    } else {
      cmd = `df / | tail -1 | awk '{print $4 * 1024}'`;
    }

    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    return parseInt(result) || 0;
  } catch (error) {
    console.error('Ошибка получения свободного места:', error);
    
    // Fallback для Windows
    try {
      if (process.platform === 'win32') {
        const execSync = require('child_process').execSync;
        const result = execSync(
          'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace',
          { encoding: 'utf-8' }
        ).trim();
        const lines = result.split('\n');
        if (lines.length > 1) {
          return parseInt(lines[1].trim()) || 0;
        }
      }
    } catch (e) {}
    
    return 0;
  }
};

// Multer middleware
const createUploadMiddleware = () => {
  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024 * 1024, // 10GB upper limit per file
      fieldSize: 10 * 1024 * 1024 * 1024 // 10GB limit per field
    }
  });
};

const upload = createUploadMiddleware();

// Middleware для обработки ошибок multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'Файл слишком большой'
      });
    }
  }

  if (err.message && err.message.includes('MIME тип')) {
    return res.status(415).json({
      success: false,
      message: err.message
    });
  }

  next(err);
};

// Валидация MIME-типа
const validateMimeType = (req, res, next) => {
  if (!req.file) return next();
  try {
    const mimeType = req.file.mimetype;
    req.file._mimeAllowed = ALLOWED_MIME_TYPES.includes(mimeType);
  } catch (e) {
    req.file._mimeAllowed = false;
  }
  next();
};

module.exports = {
  upload,
  checkStorageQuota,
  validateMimeType,
  handleMulterError,
  getServerFreeSpace,
  ALLOWED_MIME_TYPES
};