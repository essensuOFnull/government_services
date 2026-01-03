const express = require('express');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');

const {
  Users,
  Messages,
  Files: FilesDB,
  Conversations,
  initializeDatabase,
  db
} = require('./database.cjs');

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

  // Ищем пользователя по userId (который уже должен существовать с момента регистрации)
  let user = Users.getByUserId(userId);

  // Если пользователя нет — создадим минимальную запись для совместимости
  if (!user) {
    try {
      Users.create(userId, userId);
      user = Users.getByUserId(userId);
      console.log(`Created messenger user for userId=${userId}`);
    } catch (err) {
      // Если не удалось создать (например, пользователь уже существует),
      // попробуем получить его ещё раз
      user = Users.getByUserId(userId);
      if (!user) {
        console.error('Failed to create or find messenger user:', err);
        return res.status(500).json({ success: false, message: 'Ошибка создания пользователя' });
      }
    }
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
    console.error('Error in /storage-info:', error);
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

    // Проверяем доступ к файлу
    // Доступ имеют: отправитель файла или участники разговора, где находится файл
    let hasAccess = false;

    // Проверка 1: пользователь отправил файл
    if (file.uploader_id === req.user.id) {
      hasAccess = true;
    } else {
      // Проверка 2: пользователь участник разговора с этим файлом
      // Найдём все сообщения с этим файлом
      const messagesWithFile = db.prepare(
        `SELECT DISTINCT m.conversation_id 
         FROM messages m 
         JOIN file_references fr ON m.id = fr.message_id 
         WHERE fr.file_id = ?`
      ).all(fileId);

      if (messagesWithFile.length > 0) {
        // Проверим, участник ли пользователь хотя бы одного из этих разговоров
        for (const msg of messagesWithFile) {
          const conversation = Conversations.getOrCreate([]);
          const convData = db.prepare('SELECT participant_ids FROM conversations WHERE id = ?').get(msg.conversation_id);
          if (convData) {
            const participants = JSON.parse(convData.participant_ids);
            if (participants.includes(req.user.userId)) {
              hasAccess = true;
              break;
            }
          }
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'У вас нет доступа к этому файлу'
      });
    }

    // Получаем S3 URL напрямую
    const s3Url = s3Service.getS3Url(file.s3_key);

    // Перенаправляем на S3 с правильным именем файла
    res.set('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    res.set('Content-Type', file.mime_type || 'application/octet-stream');
    
    // Используем S3 URL для скачивания
    try {
      const response = await fetch(s3Url);
      if (!response.ok) {
        throw new Error(`S3 returned ${response.status}`);
      }
      response.body.pipe(res);
    } catch (fetchErr) {
      console.error('Ошибка скачивания из S3:', fetchErr);
      // Fallback: попробуем загрузить из S3 в временный файл
      const tempPath = path.join(uploadsDir, `temp-${fileId}`);
      try {
        await s3Service.downloadFile(file.s3_key, tempPath);
        res.download(tempPath, file.original_filename, (err) => {
          if (err) console.error('Ошибка скачивания:', err);
          fs.unlink(tempPath, (unlinkErr) => {
            if (unlinkErr) console.error('Ошибка удаления временного файла:', unlinkErr);
          });
        });
      } catch (dlErr) {
        console.error('Ошибка при загрузке файла:', dlErr);
        res.status(500).json({
          success: false,
          message: 'Не удалось загрузить файл'
        });
      }
    }
  } catch (error) {
    console.error('Ошибка при скачивании:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Получение метаданных файла
router.get('/file/:fileId', authenticateUser, (req, res) => {
  try {
    const { fileId } = req.params;
    const file = FilesDB.getById(fileId);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    // Проверяем доступ к файлу
    let hasAccess = false;

    // Проверка 1: пользователь отправил файл
    if (file.uploader_id === req.user.id) {
      hasAccess = true;
    } else {
      // Проверка 2: пользователь участник разговора с этим файлом
      const messagesWithFile = db.prepare(
        `SELECT DISTINCT m.conversation_id 
         FROM messages m 
         JOIN file_references fr ON m.id = fr.message_id 
         WHERE fr.file_id = ?`
      ).all(fileId);

      if (messagesWithFile.length > 0) {
        for (const msg of messagesWithFile) {
          const convData = db.prepare('SELECT participant_ids FROM conversations WHERE id = ?').get(msg.conversation_id);
          if (convData) {
            const participants = JSON.parse(convData.participant_ids);
            if (participants.includes(req.user.userId)) {
              hasAccess = true;
              break;
            }
          }
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'У вас нет доступа к этому файлу'
      });
    }

    // Формируем защищённый URL для просмотра/скачивания через наш маршрут
    const s3Url = `/api/messenger/download-file/${fileId}`;

    res.json({ success: true, file: Object.assign({}, file, { s3Url }) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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

    // Добавляем текущего пользователя если его нет (используем userId, а не id)
    if (!participantIds.includes(req.user.userId)) {
      participantIds.push(req.user.userId);
    }

    const conversation = Conversations.getOrCreate(participantIds);

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error in /conversation/create:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Получение разговоров пользователя
router.get('/conversations', authenticateUser, (req, res) => {
  try {
    const conversations = Conversations.getUserConversations(req.user.userId);

    // Обогащаем разговоры информацией о других участниках
    const enrichedConversations = conversations.map(conv => {
      // Защита: убедимся, что participantIds - это массив
      const participants = Array.isArray(conv.participantIds) ? conv.participantIds : [];
      const otherParticipants = participants.filter(pid => pid !== req.user.userId);
      
      let title = 'Избранное';
      if (otherParticipants.length > 0) {
        // Для одного участника - берем его userId, для нескольких - "Группа"
        if (otherParticipants.length === 1) {
          title = otherParticipants[0];
        } else {
          title = `Группа (${otherParticipants.length + 1})`;
        }
      }
      return {
        ...conv,
        title,
        otherParticipants
      };
    });

    res.json({
      success: true,
      conversations: enrichedConversations
    });
  } catch (error) {
    console.error('Error in /conversations:', error);
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
