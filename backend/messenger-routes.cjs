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

// Простые одноразовые/временные токены предпросмотра (in-memory)
const previewTokens = new Map(); // token -> { fileId, userId, expiresAt }
function generateToken() {
  return require('crypto').randomBytes(18).toString('base64url');
}

// Очистка просроченных токенов периодически
setInterval(() => {
  const now = Date.now();
  for (const [t, v] of previewTokens.entries()) {
    if (v.expiresAt <= now) previewTokens.delete(t);
  }
}, 60 * 1000);

// Middleware для проверки аутентификации
const authenticateUser = (req, res, next) => {
  const userId = req.headers['x-user-id'] || req.body?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Требуется аутентификация'
    });
  }

  // Ищем пользователя по id
  let user = Users.getById(userId);

  // Если пользователя нет — создадим запись для совместимости
  if (!user) {
    try {
      Users.create(userId, userId);
      user = Users.getById(userId);
      console.log(`Created messenger user for id=${userId}`);
    } catch (err) {
      user = Users.getById(userId);
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
      // Normalize original filename: multer/busboy may decode using latin1, convert to UTF-8
      const originalName = (() => {
        try {
          return Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        } catch (e) {
          return req.file.originalname || String(fileId);
        }
      })();

      const s3Key = await s3Service.uploadFile(
        fileId,
        req.file.path,
        originalName
      );

      // Сохраняем в БД (используем нормализованное имя)
      const fileRecord = FilesDB.create(
        fileId,
        originalName,
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

// Загрузка нескольких файлов в одном запросе
router.post('/upload-files',
  authenticateUser,
  checkStorageQuota,
  upload.array('files'),
  async (req, res) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'Файлы не загружены' });
      }

      const uploaded = [];
      const conversationId = req.body.conversationId;

      for (const f of req.files) {
        // Проверяем квоту
        const canAdd = storageManager.canAddFile(req.user.id, f.size);
        if (!canAdd.allowed) {
          // удаляем локальную копию и пропускаем
          try { fs.unlinkSync(f.path); } catch (e) {}
          continue;
        }

        const fileId = uuid();
          // Normalize filename for each uploaded file
          const originalName = (() => {
            try { return Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch (e) { return f.originalname || String(fileId); }
          })();
          const s3Key = await s3Service.uploadFile(fileId, f.path, originalName);

        const fileRecord = FilesDB.create(
          fileId,
          originalName,
          f.mimetype,
          f.size,
          s3Key,
          req.user.id
        );

        storageManager.addFileToQuota(req.user.id, f.size);

        try { fs.unlinkSync(f.path); } catch (e) {}

        uploaded.push(fileRecord);
      }

      res.json({ success: true, files: uploaded, storageInfo: storageManager.getStorageInfo(req.user.id) });
    } catch (error) {
      console.error('Ошибка множественной загрузки файлов:', error);
      if (req.files) {
        for (const f of req.files) {
          try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
        }
      }
      res.status(500).json({ success: false, message: error.message });
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
            if (participants.includes(req.user.id)) {
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
    // Указываем оба поля: `filename` (старые клиенты) и `filename*` (RFC 5987 для UTF-8)
    const fallbackName = (file.original_filename || file.id).replace(/"/g, '');
    const filenameStar = `UTF-8''${encodeURIComponent(fallbackName)}`;
    res.set('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=${filenameStar}`);
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
    console.log(`[/file/${fileId}] Found in DB:`, file ? 'YES' : 'NO');
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
            if (participants.includes(req.user.id)) {
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

// Создать короткоживущий токен предпросмотра для использования в <img>/<video>/<audio>
router.post('/preview-token/:fileId', authenticateUser, (req, res) => {
  try {
    const { fileId } = req.params;
    const file = FilesDB.getById(fileId);
    if (!file) return res.status(404).json({ success: false, message: 'Файл не найден' });

    // Проверяем, есть ли доступ к файлу (используем ту же логику, что и в /file/:fileId)
    let hasAccess = false;
    if (file.uploader_id === req.user.id) {
      hasAccess = true;
    } else {
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
            if (participants.includes(req.user.id)) { hasAccess = true; break; }
          }
        }
      }
    }

    if (!hasAccess) return res.status(403).json({ success: false, message: 'У вас нет доступа к этому файлу' });

    const token = generateToken();
    // Для медиа (audio/video) даём более длинный TTL, чтобы браузер мог поддерживать длительный стрим/seek
    const isMedia = (file.mime_type || '').startsWith('audio/') || (file.mime_type || '').startsWith('video/');
    const ttl = isMedia ? (60 * 60 * 1000) : (2 * 60 * 1000); // 1 час для медиа, 2 минуты для прочего
    previewTokens.set(token, { fileId, userId: req.user.id, expiresAt: Date.now() + ttl });

    res.json({ success: true, token, expiresInMs: ttl });
  } catch (err) {
    console.error('preview-token error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint для предпросмотра: проверяет токен и стримит файл (без авторизации по заголовку)
// Поддерживает Range-запросы для медиа
router.get('/preview/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const token = req.query.token;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });
    const record = previewTokens.get(token);
    if (!record || record.fileId !== fileId || record.expiresAt <= Date.now()) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    // Don't delete token immediately: allow multiple Range requests until TTL expires
    const file = FilesDB.getById(fileId);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const s3Url = s3Service.getS3Url(file.s3_key);

    // Forward Range header when present to support seeking
    const rangeHeader = req.headers.range;
    const fetchOptions = {};
    if (rangeHeader) fetchOptions.headers = { Range: rangeHeader };

    try {
      const response = await fetch(s3Url, fetchOptions);
      if (!response.ok) throw new Error(`S3 returned ${response.status}`);

      // Forward relevant headers (Content-Type, Content-Range, Accept-Ranges, Content-Length)
      const ct = response.headers.get('content-type');
      if (ct) res.set('Content-Type', ct);
      const cr = response.headers.get('content-range');
      if (cr) res.set('Content-Range', cr);
      const ar = response.headers.get('accept-ranges') || 'bytes';
      res.set('Accept-Ranges', ar);
      const cl = response.headers.get('content-length');
      if (cl) res.set('Content-Length', cl);

      res.status(response.status);
      response.body.pipe(res);
    } catch (fetchErr) {
      console.error('Preview fetch error:', fetchErr);
      // Fallback: use s3Service.downloadFile into temp file then send (no range support)
      const tempPath = path.join(uploadsDir, `temp-preview-${fileId}`);
      try {
        await s3Service.downloadFile(file.s3_key, tempPath);
        res.sendFile(tempPath, () => { fs.unlink(tempPath, () => {}); });
      } catch (dlErr) {
        console.error('Preview fallback error:', dlErr);
        res.status(500).json({ success: false, message: 'Не удалось получить предпросмотр' });
      }
    }
  } catch (err) {
    console.error('preview error', err);
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

// Удаление сообщения: если файлы не пересылали — удаляем файла полностью,
// если файл присутствует в других сообщениях — передаём владение тому, кто переслал
router.delete('/delete-message/:messageId', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Messages.getById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Сообщение не найдено' });

    // Разрешено удалять только отправителю
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Только отправитель может удалить сообщение' });
    }

    const fileIds = Array.isArray(message.file_ids) ? message.file_ids : [];

    for (const fid of fileIds) {
      // Узнаём текущее число ссылок
      const refs = db.prepare('SELECT COUNT(*) as c FROM file_references WHERE file_id = ?').get(fid);
      const count = refs ? (refs.c || 0) : 0;

      if (count <= 1) {
        // никто больше не ссылается — удаляем файл полностью
        const file = FilesDB.getById(fid);
        if (file) {
          try {
            await s3Service.deleteFile(file.s3_key);
          } catch (e) { console.error('Ошибка удаления s3 файла:', e); }
          FilesDB.permanentlyDelete(fid);
          // вычитаем размер из квоты текущего владельца
          try { storageManager.removeFileFromQuota(file.owner_id, file.size || 0); } catch (e) { console.error('quota adjust error', e); }
        }
      } else {
        // есть другие ссылки — передаём владение первому другому ссылочнику (переславшему)
        const other = db.prepare('SELECT message_id FROM file_references WHERE file_id = ? AND message_id != ? LIMIT 1').get(fid, messageId);
        if (other && other.message_id) {
          const msg = db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(other.message_id);
          if (msg && msg.sender_id) {
            // Передаём владение и скорректируем квоты: убираем у старого владельца и добавляем новому
            const file = FilesDB.getById(fid);
            const oldOwner = file ? file.owner_id : null;
            FilesDB.forwardOwnership(fid, msg.sender_id);
            try {
              if (oldOwner) storageManager.removeFileFromQuota(oldOwner, file.size || 0);
              storageManager.addFileToQuota(msg.sender_id, file.size || 0);
            } catch (e) { console.error('quota transfer error', e); }
          }
        }
      }

      // Удаляем ссылку из file_references для этого сообщения
      try { FilesDB.removeReference(fid, messageId); } catch (e) { /* ignore */ }
    }

    // Удаляем само сообщение (логическое удаление)
    Messages.delete(messageId);

    res.json({ success: true, message: 'Сообщение удалено', storageInfo: storageManager.getStorageInfo(req.user.id) });
  } catch (err) {
    console.error('delete-message error', err);
    res.status(500).json({ success: false, message: err.message });
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
    if (!participantIds.includes(req.user.id)) {
      participantIds.push(req.user.id);
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
    const conversations = Conversations.getUserConversations(req.user.id);

    // Обогащаем разговоры информацией о других участниках
    const enrichedConversations = conversations.map(conv => {
      // Защита: убедимся, что participantIds - это массив
      const participants = Array.isArray(conv.participantIds) ? conv.participantIds : [];
      const otherParticipants = participants.filter(pid => pid !== req.user.id);
      
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

// Release preview token (called when user stops viewing)
router.post('/preview-release/:token', authenticateUser, (req, res) => {
  try {
    const { token } = req.params;
    const rec = previewTokens.get(token);
    if (!rec) return res.status(404).json({ success: false, message: 'Token not found' });
    if (rec.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Not token owner' });

    previewTokens.delete(token);
    res.json({ success: true });
  } catch (err) {
    console.error('preview-release error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Upload avatar
router.post('/avatar/upload', 
  authenticateUser,
  upload.single('avatar'),
  handleMulterError,
  async (req, res) => {
    try {
      const userId = req.user.id; // UUID пользователя
      
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Файл не загружен' });
      }

      const file = req.file;
      const MAX_AVATAR_SIZE = 64 * 1024 * 1024; // 64MB

      if (file.size > MAX_AVATAR_SIZE) {
        fs.unlinkSync(file.path);
        return res.status(413).json({ 
          success: false, 
          message: `Размер аватарки не должен превышать ${MAX_AVATAR_SIZE / (1024 * 1024)}MB` 
        });
      }

      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
      if (!allowedMimes.includes(file.mimetype)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ 
          success: false, 
          message: 'Поддерживаются только PNG, JPEG, GIF или SVG' 
        });
      }

      const fileId = uuid();
      const s3Key = await s3Service.uploadFile(fileId, file.path, file.originalname);

      // Создаем запись о файле аватарки
      FilesDB.create(
        fileId,
        file.originalname,
        file.mimetype,
        file.size,
        s3Key,
        userId,
        userId
      );

      // Удаляем старую аватарку если существует
      if (req.user && req.user.avatar_file_id) {
        try {
          const oldFile = FilesDB.getById(req.user.avatar_file_id);
          if (oldFile) {
            await s3Service.deleteFile(oldFile.s3_key);
            FilesDB.delete(oldFile.id);
          }
        } catch (e) {
          console.error('Error deleting old avatar:', e);
        }
      }

      // Обновляем user с новой аватаркой
      Users.update(userId, { avatar_file_id: fileId });

      // Очищаем локальный файл
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }

      res.json({ 
        success: true, 
        message: 'Аватарка загружена успешно',
        file: {
          id: fileId,
          original_filename: file.originalname,
          mime_type: file.mimetype,
          size: file.size,
          s3_key: s3Key
        }
      });
    } catch (error) {
      console.error('Avatar upload error:', error);
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }
);

// Delete avatar
router.delete('/avatar', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = Users.getById(userId);

    if (!user || !user.avatar_file_id) {
      return res.status(404).json({ 
        success: false, 
        message: 'Аватарка не найдена' 
      });
    }

    const avatarFile = FilesDB.getById(user.avatar_file_id);
    if (avatarFile) {
      await s3Service.deleteFile(avatarFile.s3_key);
      FilesDB.delete(avatarFile.id);
    }

    Users.update(userId, { avatar_file_id: null });

    res.json({ 
      success: true, 
      message: 'Аватарка удалена' 
    });
  } catch (error) {
    console.error('Avatar delete error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get avatar
router.get('/avatar/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = Users.getById(userId);

    if (!user || !user.avatar_file_id) {
      return res.status(404).json({ 
        success: false, 
        message: 'Аватарка не найдена' 
      });
    }

    const avatarFile = FilesDB.getById(user.avatar_file_id);
    if (!avatarFile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Файл аватарки не найден' 
      });
    }

    const tempPath = path.join(uploadsDir, uuid() + path.extname(avatarFile.original_filename));
    await s3Service.downloadFile(avatarFile.s3_key, tempPath);

    res.setHeader('Content-Type', avatarFile.mime_type);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const stream = fs.createReadStream(tempPath);
    stream.on('end', () => {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {}
    });
    
    stream.pipe(res);
  } catch (error) {
    console.error('Avatar get error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
