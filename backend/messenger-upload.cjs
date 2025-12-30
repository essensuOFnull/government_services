const multer = require('multer');
const mime = require('mime-types');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { Storage, Files, Users } = require('./messenger-db.cjs');

const uploadsDir = path.join(__dirname, '../data/uploads');

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

// Фильтр для валидации MIME-типов
const fileFilter = (req, file, cb) => {
  const mimeType = file.mimetype;

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return cb(new Error(`MIME тип ${mimeType} не разрешен`), false);
  }

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

// Multer middleware с лимитом размера (можно убрать если не нужно ограничение на файл)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 0 // Без ограничения на размер файла
  }
});

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

// Валидация MIME-типа перед сохранением
const validateMimeType = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const mimeType = req.file.mimetype;

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    // Удаляем загруженный файл
    fs.unlinkSync(req.file.path);
    return res.status(415).json({
      success: false,
      message: `MIME тип ${mimeType} не разрешен`
    });
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
