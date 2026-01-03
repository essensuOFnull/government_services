const multer = require('multer');
const mime = require('mime-types');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { Storage, Files, Users } = require('./database.cjs');

const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/uploads');

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

// Фильтр: принимаем любые типы файлов — валидация MIME пусть будет логической (UI/preview),
// но мы не отклоняем загрузку на этапе multipart, чтобы сохранять любые файлы.
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

// Функция проверки квоты хранилища
const checkStorageQuota = (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Требуется аутентификация'
    });
  }

  const user = Users.getById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Пользователь не найден'
    });
  }

  const quota = Storage.getQuota(userId);
  const userFiles = Files.getUserFiles(userId);
  const usedStorage = userFiles.reduce((sum, file) => sum + file.size, 0);

  // Получаем свободное место на сервере (упрощенная версия)
  const serverFreeSpace = getServerFreeSpace();

  // Минимум 10GB должно быть на сервере
  if (serverFreeSpace < 10 * 1024 * 1024 * 1024) {
    return res.status(507).json({
      success: false,
      message: 'На сервере осталось меньше места, чем вам положено',
      serverFreeSpace,
      userLimit: quota?.storage_limit_bytes,
      userUsed: usedStorage
    });
  }

  req.storageInfo = {
    quota,
    usedStorage,
    serverFreeSpace
  };

  next();
};

// Функция получения свободного места на диске (для Windows)
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
    return 0;
  }
};

// Функция для вычисления лимита на размер файла
const getFileSizeLimit = (userId) => {
  try {
    // Get user quota info
    const userQuota = require('./database.cjs').Storage.getQuota(userId);
    const userLimit = userQuota?.storage_limit_bytes ?? (10 * 1024 * 1024 * 1024); // Default 10GB
    const userUsed = userQuota?.storage_used_bytes ?? 0;
    const userAvailable = userLimit - userUsed;

    // Get server free space
    const serverFree = getServerFreeSpace();

    // Use the minimum of what's available
    const maxAllowed = Math.min(userAvailable, serverFree);
    
    // Ensure a reasonable minimum (1MB minimum)
    return Math.max(maxAllowed, 1024 * 1024);
  } catch (e) {
    console.warn('Error calculating file size limit:', e);
    // Default to 10GB if there's an error
    return 10 * 1024 * 1024 * 1024;
  }
};

// Multer middleware с динамическим лимитом размера
const createUploadMiddleware = () => {
  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024 * 1024, // 10GB upper limit per file (actual limit checked in route)
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

// Валидация MIME-типа (не блокирует загрузку): помечаем в запросе, пригодно для логики предпросмотра
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
  getFileSizeLimit,
  ALLOWED_MIME_TYPES
};
