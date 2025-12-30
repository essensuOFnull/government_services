const express = require('express');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');

const {
  Users,
  Messages,
  Files: FilesDB,
  Conversations,
  initializeDatabase
} = require('./messenger-db.cjs');

const s3Service = require('./messenger-s3.cjs');
const storageManager = require('./messenger-storage.cjs');

const {
  upload,
  checkStorageQuota,
  validateMimeType,
  handleMulterError
} = require('./messenger-upload.cjs');

const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/uploads');

const router = express.Router();

// Middleware для проверки аутентификации
const authenticateUser = (req, res, next) => {
  const userId = req.headers['x-user-id'] || req.body?.userId;

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

  req.user = user;
  next();
};

// Инициализация БД
router.get('/init-db', (req, res) => {
  try {
    initializeDatabase();
    res.json({
      success: true,
      message: 'База данных инициализирована'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Получение информации о хранилище
router.get('/storage-info', authenticateUser, (req, res) => {
  try {
    const storageInfo = storageManager.getStorageInfo(req.user.id);
    res.json(storageInfo);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Загрузка файла
router.post('/upload-file', 
  authenticateUser,
  checkStorageQuota,
  upload.single('file'),
  validateMimeType,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Файл не загружен'
        });
      }

      const fileId = uuid();
      const { conversationId } = req.body;

      // Проверяем квоту
      const canAdd = storageManager.canAddFile(req.user.id, req.file.size);
      if (!canAdd.allowed) {
        fs.unlinkSync(req.file.path);
        return res.status(507).json({
          success: false,
          message: canAdd.reason
        });
      }

      // Загружаем в S3
      const s3Key = await s3Service.uploadFile(
        fileId,
        req.file.path,
        req.file.originalname
      );

      // Сохраняем в БД
      const fileRecord = FilesDB.create(
        fileId,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        s3Key,
        req.user.id
      );

      // Обновляем квоту
      storageManager.addFileToQuota(req.user.id, req.file.size);

      // Удаляем локальный файл
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        file: fileRecord,
        storageInfo: storageManager.getStorageInfo(req.user.id)
      });
    } catch (error) {
      console.error('Ошибка загрузки файла:', error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

router.use(handleMulterError);

// Скачивание файла
router.get('/download-file/:fileId', authenticateUser, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = FilesDB.getById(fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Файл не найден'
      });
    }

    // Загружаем из S3 в временный файл
    const tempPath = path.join(uploadsDir, `temp-${fileId}`);
    await s3Service.downloadFile(file.s3_key, tempPath);

    // Отправляем файл
    res.download(tempPath, file.original_filename, (err) => {
      if (err) console.error('Ошибка скачивания:', err);
      // Удаляем временный файл
      fs.unlink(tempPath, (err) => {
        if (err) console.error('Ошибка удаления временного файла:', err);
      });
    });
  } catch (error) {
    console.error('Ошибка при скачивании:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Удаление файла (логическое удаление, физическое через 30 дней)
router.delete('/delete-file/:fileId', authenticateUser, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = FilesDB.getById(fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Файл не найден'
      });
    }

    // Проверяем права доступа
    if (file.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'У вас нет прав на удаление этого файла'
      });
    }

    // Логическое удаление
    FilesDB.delete(fileId);

    // Вычитаем из квоты
    storageManager.removeFileFromQuota(req.user.id, file.size);

    res.json({
      success: true,
      message: 'Файл отмечен на удаление. Будет удален через 30 дней',
      storageInfo: storageManager.getStorageInfo(req.user.id)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Создание разговора
router.post('/conversation/create', authenticateUser, (req, res) => {
  try {
    const { participantIds } = req.body;

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Требуется список участников'
      });
    }

    // Добавляем текущего пользователя если его нет
    if (!participantIds.includes(req.user.id)) {
      participantIds.push(req.user.id);
    }

    const conversation = Conversations.getOrCreate(participantIds);

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Получение разговоров пользователя
router.get('/conversations', authenticateUser, (req, res) => {
  try {
    const conversations = Conversations.getUserConversations(req.user.id);

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Получение сообщений разговора
router.get('/conversation/:conversationId/messages', authenticateUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await Messages.getConversationMessages(
      conversationId,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      messages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Пересылка сообщения
router.post('/forward-message', authenticateUser, async (req, res) => {
  try {
    const { messageId, targetConversationId } = req.body;

    const originalMessage = await Messages.getById(messageId);
    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Оригинальное сообщение не найдено'
      });
    }

    // Создаем новое сообщение со ссылкой на оригинал
    const newMessage = await Messages.create(
      uuid(),
      targetConversationId,
      req.user.id,
      originalMessage.content,
      originalMessage.file_ids,
      messageId // forwarded_from
    );

    Conversations.updateLastMessage(targetConversationId);

    res.json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Удаление пересланного контента: изменение владельца
router.post('/file/update-owner', authenticateUser, async (req, res) => {
  try {
    const { fileId, newOwnerId } = req.body;

    const file = FilesDB.getById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Файл не найден'
      });
    }

    // Проверяем права (только текущий владелец может передать)
    if (file.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Только владелец может передать права'
      });
    }

    FilesDB.forwardOwnership(fileId, newOwnerId);

    res.json({
      success: true,
      message: 'Права на файл переданы',
      file: FilesDB.getById(fileId)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Получение файлов пользователя
router.get('/user-files', authenticateUser, (req, res) => {
  try {
    const files = FilesDB.getUserFiles(req.user.id);

    res.json({
      success: true,
      files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
