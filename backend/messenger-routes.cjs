const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const express = require('express');
const { v4: uuid } = require('uuid');

const router = express.Router();

const https = require('https');
const httpsAgent = new https.Agent({
  rejectUnauthorized: false   // отключаем проверку для самоподписанного сертификата
});

// Импорт Sequelize моделей
const {
  User,
  Message,
  File,
  Conversation,
  ConversationParticipant,
  UserStorageQuota,
  FileReference,
  CrossoutResourcePrice,
  initializeDatabase,
  sequelize,
  Op,
  compressContent,
  decompressContent
} = require('./database.cjs');

const s3Service = require('./messenger-s3.cjs');
const storageManager = require('./messenger-storage.cjs');

const {
  upload,
  checkStorageQuota,
  validateMimeType,
  handleMulterError
} = require('./messenger-upload.cjs');

const uploadsDir = config.UPLOAD_DIR || path.join(__dirname, '../data/uploads');

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
const authenticateUser = async (req, res, next) => {
  const userId = req.headers['x-user-id'] || req.body?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Требуется аутентификация'
    });
  }

  try {
    // Ищем пользователя по id
    let user = await User.findByPk(userId);

    // Если пользователя нет — создадим запись для совместимости
    if (!user) {
      try {
        user = await User.create({
          id: userId,
          username: userId,
          role: 'guest',
          status: 'offline',
          created_at: Date.now(),
          updated_at: Date.now()
        });
        console.log(`Created messenger user for id=${userId}`);
      } catch (err) {
        console.error('Failed to create or find messenger user:', err);
        return res.status(500).json({ success: false, message: 'Ошибка создания пользователя' });
      }
    }

    req.user = user.toJSON();
    next();
  } catch (error) {
    console.error('Error in authenticateUser:', error);
    return res.status(500).json({ success: false, message: 'Ошибка аутентификации' });
  }
};

// Вспомогательная функция: получить всех участников общих чатов с указанным пользователем
async function getConversationParticipants(userId) {
  const participants = await sequelize.query(
    `SELECT DISTINCT cp2.participant_id
     FROM conversations_participants cp1
     JOIN conversations_participants cp2 ON cp1.conversation_id = cp2.conversation_id
     WHERE cp1.participant_id = :userId`,
    { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
  );
  return participants.map(p => p.participant_id);
}

// Вспомогательная функция: уведомить всех участников чатов об обновлении аватарки
async function notifyAvatarUpdate(userId, wsServer) {
  if (!wsServer) {
    console.log('notifyAvatarUpdate: wsServer not available');
    return;
  }
  try {
    const participantIds = await getConversationParticipants(userId);
    const uniqueIds = [...new Set([userId, ...participantIds])];
    console.log(`notifyAvatarUpdate: sending to ${uniqueIds.length} users:`, uniqueIds);
    for (const id of uniqueIds) {
      wsServer.broadcastToUser(id, {
        type: 'avatar_updated',
        userId: userId
      });
    }
  } catch (err) {
    console.error('Failed to notify avatar update:', err);
  }
}

// Поиск пользователя по username
router.get('/find-user', authenticateUser, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ success: false, message: 'Не указан username' });
    }
    
    const user = await User.findOne({
      where: { username: username.trim() }
    });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }
    
    res.json({ success: true, ...user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Инициализация БД
router.get('/init-db', async (req, res) => {
  try {
    await initializeDatabase();
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
router.get('/storage-info', authenticateUser, async (req, res) => {
  try {
    const storageInfo = await storageManager.getStorageInfo(req.user.id);
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
      const canAdd = await storageManager.canAddFile(req.user.id, req.file.size);
      if (!canAdd.allowed) {
        fs.unlinkSync(req.file.path);
        return res.status(507).json({
          success: false,
          message: canAdd.reason
        });
      }

      // Загружаем в S3
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

      // Сохраняем в БД
      const fileRecord = await File.create({
        id: fileId,
        original_filename: originalName,
        mime_type: req.file.mimetype,
        size: req.file.size,
        s3_key: s3Key,
        uploader_id: req.user.id,
        owner_id: req.user.id,
        created_at: Date.now(),
        reference_count: 1
      });

      // Обновляем квоту
      await storageManager.addFileToQuota(req.user.id, req.file.size);

      // Удаляем локальный файл
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        file: fileRecord.toJSON(),
        storageInfo: await storageManager.getStorageInfo(req.user.id)
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
        const canAdd = await storageManager.canAddFile(req.user.id, f.size);
        if (!canAdd.allowed) {
          try { fs.unlinkSync(f.path); } catch (e) {}
          continue;
        }

        const fileId = uuid();
        const originalName = (() => {
          try { return Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch (e) { return f.originalname || String(fileId); }
        })();
        const s3Key = await s3Service.uploadFile(fileId, f.path, originalName);

        const fileRecord = await File.create({
          id: fileId,
          original_filename: originalName,
          mime_type: f.mimetype,
          size: f.size,
          s3_key: s3Key,
          uploader_id: req.user.id,
          owner_id: req.user.id,
          created_at: Date.now(),
          reference_count: 1
        });

        await storageManager.addFileToQuota(req.user.id, f.size);

        try { fs.unlinkSync(f.path); } catch (e) {}

        uploaded.push(fileRecord.toJSON());
      }

      res.json({ 
        success: true, 
        files: uploaded, 
        storageInfo: await storageManager.getStorageInfo(req.user.id) 
      });
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
    const file = await File.findByPk(fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Файл не найден'
      });
    }

    // Проверка доступа
    let hasAccess = false;
    if (file.uploader_id === req.user.id) {
      hasAccess = true;
    } else {
      const messagesWithFile = await sequelize.query(
        `SELECT DISTINCT m.conversation_id 
         FROM messages m 
         JOIN file_references fr ON m.id = fr.message_id 
         WHERE fr.file_id = ?`,
        { replacements: [fileId], type: sequelize.QueryTypes.SELECT }
      );
      if (messagesWithFile.length > 0) {
        for (const msg of messagesWithFile) {
          const conversation = await Conversation.findByPk(msg.conversation_id, {
            include: [{
              model: User,
              as: 'participants',
              where: { id: req.user.id }
            }]
          });
          if (conversation) {
            hasAccess = true;
            break;
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

    // Скачиваем во временный файл
    const tempPath = path.join(uploadsDir, `temp-${fileId}`);
    await s3Service.downloadFile(file.s3_key, tempPath);

    // Отдаём файл на скачивание
    res.download(tempPath, file.original_filename, (err) => {
      if (err) console.error('Ошибка скачивания:', err);
      fs.unlink(tempPath, (unlinkErr) => {
        if (unlinkErr) console.error('Ошибка удаления временного файла:', unlinkErr);
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

// Получение метаданных файла
router.get('/file/:fileId', authenticateUser, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findByPk(fileId);
    console.log(`[/file/${fileId}] Found in DB:`, file ? 'YES' : 'NO');
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    // Проверяем доступ к файлу
    let hasAccess = false;

    if (file.uploader_id === req.user.id) {
      hasAccess = true;
    } else {
      const messagesWithFile = await sequelize.query(
        `SELECT DISTINCT m.conversation_id 
         FROM messages m 
         JOIN file_references fr ON m.id = fr.message_id 
         WHERE fr.file_id = ?`,
        { replacements: [fileId], type: sequelize.QueryTypes.SELECT }
      );

      if (messagesWithFile.length > 0) {
        for (const msg of messagesWithFile) {
          const conversation = await Conversation.findByPk(msg.conversation_id, {
            include: [{
              model: User,
              as: 'participants',
              where: { id: req.user.id }
            }]
          });
          if (conversation) {
            hasAccess = true;
            break;
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

    const fileData = file.toJSON();
    fileData.s3Url = s3Url;
    
    res.json({ success: true, file: fileData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Создать короткоживущий токен предпросмотра
router.post('/preview-token/:fileId', authenticateUser, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findByPk(fileId);
    if (!file) return res.status(404).json({ success: false, message: 'Файл не найден' });

    // Проверяем доступ к файлу
    let hasAccess = false;
    if (file.uploader_id === req.user.id) {
      hasAccess = true;
    } else {
      const messagesWithFile = await sequelize.query(
        `SELECT DISTINCT m.conversation_id 
         FROM messages m 
         JOIN file_references fr ON m.id = fr.message_id 
         WHERE fr.file_id = ?`,
        { replacements: [fileId], type: sequelize.QueryTypes.SELECT }
      );
      if (messagesWithFile.length > 0) {
        for (const msg of messagesWithFile) {
          const conversation = await Conversation.findByPk(msg.conversation_id, {
            include: [{
              model: User,
              as: 'participants',
              where: { id: req.user.id }
            }]
          });
          if (conversation) { hasAccess = true; break; }
        }
      }
    }

    if (!hasAccess) return res.status(403).json({ success: false, message: 'У вас нет доступа к этому файлу' });

    const token = generateToken();
    const isMedia = (file.mime_type || '').startsWith('audio/') || (file.mime_type || '').startsWith('video/');
    const ttl = isMedia ? (60 * 60 * 1000) : (2 * 60 * 1000);
    previewTokens.set(token, { fileId, userId: req.user.id, expiresAt: Date.now() + ttl });

    res.json({ success: true, token, expiresInMs: ttl });
  } catch (err) {
    console.error('preview-token error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint для предпросмотра
router.get('/preview/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const token = req.query.token;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const record = previewTokens.get(token);
    if (!record || record.fileId !== fileId || record.expiresAt <= Date.now()) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }

    const file = await File.findByPk(fileId);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const tempPath = path.join(uploadsDir, `temp-preview-${fileId}`);
    await s3Service.downloadFile(file.s3_key, tempPath);

    const range = req.headers.range;
    const stat = fs.statSync(tempPath);
    const fileSize = stat.size;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const readStream = fs.createReadStream(tempPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': file.mime_type,
      });

      readStream.pipe(res);
      readStream.on('end', () => {
        fs.unlink(tempPath, (err) => {
          if (err) console.error('Ошибка удаления временного файла:', err);
        });
      });
    } else {
      // ✅ Добавляем Content-Length для прогресса
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Accept-Ranges', 'bytes');
      const readStream = fs.createReadStream(tempPath);
      readStream.pipe(res);
      readStream.on('end', () => {
        fs.unlink(tempPath, (err) => {
          if (err) console.error('Ошибка удаления временного файла:', err);
        });
      });
    }
  } catch (err) {
    console.error('preview error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Удаление файла
router.delete('/delete-file/:fileId', authenticateUser, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findByPk(fileId);

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
    await file.update({ deleted_at: Date.now() });

    // Вычитаем из квоты
    await storageManager.removeFileFromQuota(req.user.id, file.size);

    res.json({
      success: true,
      message: 'Файл отмечен на удаление. Будет удален через 30 дней',
      storageInfo: await storageManager.getStorageInfo(req.user.id)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Удаление сообщения (физическое)
router.delete('/delete-message/:messageId', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Сообщение не найдено' });
    }

    // Разрешено удалять только отправителю
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Только отправитель может удалить сообщение' });
    }

    const conversationId = message.conversation_id;
    const fileIds = message.file_ids ? JSON.parse(message.file_ids) : [];

    // Обработка файлов, связанных с сообщением
    for (const fid of fileIds) {
      const refCount = await FileReference.count({ where: { file_id: fid } });

      if (refCount <= 1) {
        const file = await File.findByPk(fid);
        if (file) {
          try {
            await s3Service.deleteFile(file.s3_key);
          } catch (e) { console.error('Ошибка удаления s3 файла:', e); }
          await file.destroy();
          try {
            await storageManager.removeFileFromQuota(file.owner_id, file.size || 0);
            const wsServer = req.app.get('wsServer');
            if (wsServer) {
              const newStorageInfo = await storageManager.getStorageInfo(file.owner_id);
              wsServer.broadcastToUser(file.owner_id, {
                type: 'storage_info_updated',
                storageInfo: newStorageInfo
              });
            }
          } catch (e) { console.error('quota adjust error', e); }
        }
      } else {
        const otherRef = await FileReference.findOne({
          where: { file_id: fid, message_id: { [Op.ne]: message.id } }
        });
        if (otherRef) {
          const otherMessage = await Message.findByPk(otherRef.message_id);
          if (otherMessage) {
            const file = await File.findByPk(fid);
            const oldOwner = file ? file.owner_id : null;
            const newOwner = otherMessage.sender_id; // объявляем newOwner
            await file.update({ owner_id: newOwner });
            try {
              if (oldOwner) await storageManager.removeFileFromQuota(oldOwner, file.size || 0);
              await storageManager.addFileToQuota(newOwner, file.size || 0);
              const wsServer = req.app.get('wsServer');
              if (wsServer) {
                if (oldOwner) {
                  const oldInfo = await storageManager.getStorageInfo(oldOwner);
                  wsServer.broadcastToUser(oldOwner, {
                    type: 'storage_info_updated',
                    storageInfo: oldInfo
                  });
                }
                const newInfo = await storageManager.getStorageInfo(newOwner);
                wsServer.broadcastToUser(newOwner, {
                  type: 'storage_info_updated',
                  storageInfo: newInfo
                });
              }
            } catch (e) { console.error('quota transfer error', e); }
          }
        }
      }
      await FileReference.destroy({ where: { file_id: fid, message_id: message.id } });
    }

    // Удаляем само сообщение (физически)
    await message.destroy();

    // Если удалённое сообщение было последним в разговоре, обновляем last_message_at
    const lastMessage = await Message.findOne({
      where: { conversation_id: conversationId },
      order: [['created_at', 'DESC']]
    });
    await Conversation.update(
      { last_message_at: lastMessage ? lastMessage.created_at : null },
      { where: { id: conversationId } }
    );

    // Отправляем уведомление через WebSocket всем участникам разговора
    const wsServer = req.app.get('wsServer');
    if (wsServer) {
      wsServer.broadcastToConversation(conversationId, {
        type: 'message_deleted',
        messageId: messageId,
        conversationId: conversationId
      });
    }

    res.json({
      success: true,
      message: 'Сообщение удалено',
      storageInfo: await storageManager.getStorageInfo(req.user.id)
    });
  } catch (err) {
    console.error('delete-message error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Создание разговора
router.post('/conversation/create', authenticateUser, async (req, res) => {
  try {
    const { participantIds, forceNew } = req.body;

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

    // Сортируем ID для уникальности
    const sortedIds = [...participantIds].sort();

    let conversation = null;

    // Если не принудительное создание, проверяем существующий диалог
    if (!forceNew) {
      // ... существующая логика поиска ...
      const existingConversations = await Conversation.findAll({
        include: [{
          model: User,
          as: 'participants',
          where: { id: sortedIds }
        }]
      });

      conversation = existingConversations.find(conv =>
        conv.participants.length === sortedIds.length
      );
    }

    if (!conversation) {
      // Создаём новый разговор
      conversation = await Conversation.create({
        id: uuid(),
        created_at: Date.now(),
        last_message_at: null
      });

      // Добавляем участников
      for (const participantId of sortedIds) {
        await ConversationParticipant.create({
          conversation_id: conversation.id,
          participant_id: participantId
        });
      }

      // --- НОВЫЙ КОД: уведомляем всех участников ---
      const wsServer = req.app.get('wsServer');
      if (wsServer && typeof wsServer.broadcastToUser === 'function') {
        // Собираем данные, аналогичные тем, что возвращает GET /conversations
        const participantIds = sortedIds;
        const otherParticipants = participantIds.filter(pid => pid !== req.user.id);
        let title = 'Избранное';
        if (otherParticipants.length > 0) {
          if (otherParticipants.length === 1) {
            const user = await User.findByPk(otherParticipants[0]);
            title = user ? user.username : otherParticipants[0];
          } else {
            title = `Группа (${otherParticipants.length + 1})`;
          }
        }

        const conversationData = {
          id: conversation.id,
          created_at: conversation.created_at,
          last_message_at: conversation.last_message_at,
          participantIds,
          title,
          otherParticipants
        };

        // Отправляем всем участникам, кроме инициатора
        for (const pid of participantIds) {
          if (pid !== req.user.id) {
            wsServer.broadcastToUser(pid, {
              type: 'new_conversation',
              conversation: conversationData
            });
          }
        }
      }
    }

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        created_at: conversation.created_at,
        last_message_at: conversation.last_message_at,
        participantIds: sortedIds
      }
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
router.get('/conversations', authenticateUser, async (req, res) => {
  try {
    const conversationParticipants = await ConversationParticipant.findAll({
      where: { participant_id: req.user.id }
    });
    
    const conversationIds = conversationParticipants.map(cp => cp.conversation_id);
    
    const conversations = await Conversation.findAll({
      where: { id: conversationIds },
      order: [['last_message_at', 'DESC']]
    });

    // Обогащаем разговоры информацией об участниках
    const enrichedConversations = [];
    
    for (const conv of conversations) {
      const participants = await ConversationParticipant.findAll({
        where: { conversation_id: conv.id }
      });
      
      const participantIds = participants.map(p => p.participant_id);
      const otherParticipants = participantIds.filter(pid => pid !== req.user.id);
      
      let title = 'Избранное';
      if (otherParticipants.length > 0) {
        if (otherParticipants.length === 1) {
          const user = await User.findByPk(otherParticipants[0]);
          title = user ? user.username : otherParticipants[0];
        } else {
          title = `Группа (${otherParticipants.length + 1})`;
        }
      }
      
      enrichedConversations.push({
        id: conv.id,
        created_at: conv.created_at,
        last_message_at: conv.last_message_at,
        participantIds,
        title,
        otherParticipants
      });
    }

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

    const messages = await Message.findAll({
      where: { conversation_id: conversationId },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Обрабатываем сообщения
    const processedMessages = [];
    for (const msg of messages) {
      const messageData = msg.toJSON();
      
      if (messageData.content_compressed) {
        messageData.content = await decompressContent(messageData.content_compressed);
        delete messageData.content_compressed;
      }
      
      if (messageData.file_ids) {
        messageData.file_ids = JSON.parse(messageData.file_ids);
      }
      
      // Получаем информацию об отправителе
      if (messageData.sender_id) {
        const sender = await User.findByPk(messageData.sender_id);
        if (sender) {
          messageData.sender_username = sender.username;
        }
      }
      
      processedMessages.push(messageData);
    }

    res.json({
      success: true,
      messages: processedMessages.reverse()
    });
  } catch (error) {
    console.error('Error in /conversation/:conversationId/messages:', error);
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

    const originalMessage = await Message.findByPk(messageId);
    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Оригинальное сообщение не найдено'
      });
    }

    // Создаем новое сообщение
    const newMessage = await Message.create({
      id: uuid(),
      conversation_id: targetConversationId,
      sender_id: req.user.id,
      content_compressed: originalMessage.content_compressed,
      file_ids: originalMessage.file_ids,
      created_at: Date.now(),
      forwarded_from: messageId
    });
    // Создаём ссылки на файлы
    const fileIds = originalMessage.file_ids ? JSON.parse(originalMessage.file_ids) : [];
    if (fileIds.length > 0) {
      for (const fileId of fileIds) {
        const file = await File.findByPk(fileId);
        if (file && !file.deleted_at) {
          await FileReference.create({
            id: uuid(),
            file_id: fileId,
            message_id: newMessage.id
          });
          await file.update({ reference_count: (file.reference_count || 0) + 1 });
        }
      }
    }
    // Обновляем последнее сообщение в разговоре
    await Conversation.update(
      { last_message_at: Date.now() },
      { where: { id: targetConversationId } }
    );

    // Получаем WebSocket сервер
    const wsServer = req.app.get('wsServer');
    if (wsServer && typeof wsServer.broadcastToConversation === 'function') {
      let senderUsername = req.user.username || req.user.id;
      wsServer.broadcastToConversation(targetConversationId, {
        type: 'new_message',
        message: {
          id: newMessage.id,
          conversation_id: newMessage.conversation_id,
          sender_id: newMessage.sender_id,
          sender_username: senderUsername,
          content: await decompressContent(newMessage.content_compressed),
          file_ids: JSON.parse(newMessage.file_ids || '[]'),
          created_at: newMessage.created_at
        }
      });
    }
    
    res.json({
      success: true,
      message: newMessage.toJSON()
    });
  } catch (error) {
    console.error('Error in /forward-message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Изменение владельца файла
router.post('/file/update-owner', authenticateUser, async (req, res) => {
  try {
    const { fileId, newOwnerId } = req.body;

    const file = await File.findByPk(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Файл не найден'
      });
    }

    // Проверяем права
    if (file.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Только владелец может передать права'
      });
    }

    // Сохраняем старый владелец для обновления квот
    const oldOwnerId = file.owner_id;
    
    // Обновляем владельца
    await file.update({ owner_id: newOwnerId });
    
    // Обновляем квоты
    await storageManager.removeFileFromQuota(oldOwnerId, file.size);
    await storageManager.addFileToQuota(newOwnerId, file.size);

    res.json({
      success: true,
      message: 'Права на файл переданы',
      file: file.toJSON()
    });
  } catch (error) {
    console.error('Error in /file/update-owner:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Получение файлов пользователя
router.get('/user-files', authenticateUser, async (req, res) => {
  try {
    const files = await File.findAll({
      where: { 
        owner_id: req.user.id,
        deleted_at: null
      }
    });

    res.json({
      success: true,
      files: files.map(f => f.toJSON())
    });
  } catch (error) {
    console.error('Error in /user-files:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Release preview token
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
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Файл не загружен' });
      }

      const file = req.file;
      const MAX_AVATAR_SIZE = 64 * 1024 * 1024;

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
      await File.create({
        id: fileId,
        original_filename: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
        s3_key: s3Key,
        uploader_id: userId,
        owner_id: userId,
        created_at: Date.now(),
        reference_count: 1
      });

      // Удаляем старую аватарку если существует
      if (req.user && req.user.avatar_file_id) {
        try {
          const oldFile = await File.findByPk(req.user.avatar_file_id);
          if (oldFile) {
            await s3Service.deleteFile(oldFile.s3_key);
            await oldFile.destroy();
          }
        } catch (e) {
          console.error('Error deleting old avatar:', e);
        }
      }

      // Обновляем user с новой аватаркой
      await User.update({ avatar_file_id: fileId }, { where: { id: userId } });

      // Очищаем локальный файл
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }

      // Уведомляем участников чатов
      console.log('Avatar upload/delete for user', userId);
      const wsServer = req.app.get('wsServer');
      console.log('wsServer exists?', !!wsServer);
      await notifyAvatarUpdate(userId, wsServer);
      console.log('notifyAvatarUpdate called');

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
    const user = await User.findByPk(userId);

    if (!user || !user.avatar_file_id) {
      return res.status(404).json({ 
        success: false, 
        message: 'Аватарка не найдена' 
      });
    }

    const avatarFile = await File.findByPk(user.avatar_file_id);
    if (avatarFile) {
      await s3Service.deleteFile(avatarFile.s3_key);
      await avatarFile.destroy();
    }

    await User.update({ avatar_file_id: null }, { where: { id: userId } });

    // Уведомляем участников чатов
    const wsServer = req.app.get('wsServer');
    await notifyAvatarUpdate(userId, wsServer);

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
    const user = await User.findByPk(userId);

    if (!user || !user.avatar_file_id) {
      return res.status(404).json({ 
        success: false, 
        message: 'Аватарка не найдена' 
      });
    }

    const avatarFile = await File.findByPk(user.avatar_file_id);
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

// Save Crossout Resource Price
router.post('/crossout/save-price', authenticateUser, async (req, res) => {
  try {
    const { resourceIndex, fieldType, value } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (typeof resourceIndex !== 'number' || resourceIndex < 0 || resourceIndex > 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Неверный индекс ресурса' 
      });
    }

    if (!['price', 'pack_size'].includes(fieldType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Неверный тип поля' 
      });
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Неверное значение' 
      });
    }

    // Создаем запись в БД
    const record = await CrossoutResourcePrice.create({
      id: uuid(),
      user_id: userId,
      resource_index: resourceIndex,
      field_type: fieldType,
      value: numValue,
      changed_at: Date.now()
    });

    // Отправляем обновление через WebSocket всем подключенным пользователям
    const wsServer = req.app.get('wsServer');
    if (wsServer) {
      wsServer.broadcastCrossoutUpdate({
        resourceIndex,
        fieldType,
        value: numValue,
        username,
        changedAt: record.changed_at
      });
    } else {
      console.warn('WebSocket server not available');
    }

    res.json({ 
      success: true, 
      data: record.toJSON()
    });
  } catch (error) {
    console.error('Error saving crossout price:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get Crossout Resource Prices History
router.get('/crossout/prices-history', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const resourceIndex = req.query.resourceIndex ? parseInt(req.query.resourceIndex) : null;
    const fieldType = req.query.fieldType || null;

    const whereClause = { user_id: userId };
    if (resourceIndex !== null) {
      whereClause.resource_index = resourceIndex;
    }
    if (fieldType) {
      whereClause.field_type = fieldType;
    }

    const records = await CrossoutResourcePrice.findAll({
      where: whereClause,
      order: [['changed_at', 'DESC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username'],
        required: false
      }]
    });

    res.json({ 
      success: true, 
      data: records 
    });
  } catch (error) {
    console.error('Error fetching crossout prices history:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get Latest Crossout Resource Prices
router.get('/crossout/latest-prices', async (req, res) => {
  try {
    const prices = [];

    // Для каждого ресурса и типа поля получаем последнее изменение
    for (let i = 0; i < 6; i++) {
      for (const fieldType of ['price', 'pack_size']) {
        const record = await CrossoutResourcePrice.findOne({
          where: {
            resource_index: i,
            field_type: fieldType
          },
          order: [['changed_at', 'DESC']],
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username'],
            required: false
          }]
        });

        if (record) {
          prices.push({
            resourceIndex: i,
            fieldType: fieldType,
            value: record.value,
            userId: record.user_id,
            username: record.user ? record.user.username : 'Unknown',
            changedAt: record.changed_at
          });
        }
      }
    }

    res.json({ 
      success: true, 
      data: prices 
    });
  } catch (error) {
    console.error('Error fetching latest crossout prices:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get Latest Prices for Specific Resources
router.post('/crossout/get-latest-prices', async (req, res) => {
  try {
    const { resources } = req.body;

    if (!Array.isArray(resources)) {
      return res.status(400).json({ 
        success: false, 
        message: 'resources должен быть массивом' 
      });
    }

    const prices = {};

    for (const resource of resources) {
      const priceRecord = await CrossoutResourcePrice.findOne({
        where: {
          resource_index: resource,
          field_type: 'price'
        },
        order: [['changed_at', 'DESC']],
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username'],
          required: false
        }]
      });

      const packSizeRecord = await CrossoutResourcePrice.findOne({
        where: {
          resource_index: resource,
          field_type: 'pack_size'
        },
        order: [['changed_at', 'DESC']],
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username'],
          required: false
        }]
      });

      prices[resource] = {
        price: priceRecord ? {
          value: priceRecord.value,
          userId: priceRecord.user_id,
          username: priceRecord.user ? priceRecord.user.username : 'Unknown',
          changedAt: priceRecord.changed_at
        } : null,
        packSize: packSizeRecord ? {
          value: packSizeRecord.value,
          userId: packSizeRecord.user_id,
          username: packSizeRecord.user ? packSizeRecord.user.username : 'Unknown',
          changedAt: packSizeRecord.changed_at
        } : null
      };
    }

    res.json({ 
      success: true, 
      data: prices 
    });
  } catch (error) {
    console.error('Error fetching specific crossout prices:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Очистка чата: удаление всех сообщений текущего пользователя в указанном разговоре
router.delete('/clear-chat', authenticateUser, async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;

    // Находим все сообщения текущего пользователя в этом разговоре
    const messages = await Message.findAll({
      where: {
        conversation_id: conversationId,
        sender_id: userId
      }
    });

    const wsServer = req.app.get('wsServer');

    // Обрабатываем каждое сообщение (аналогично delete-message)
    for (const message of messages) {
      const fileIds = message.file_ids ? JSON.parse(message.file_ids) : [];

      for (const fid of fileIds) {
        const refCount = await FileReference.count({ where: { file_id: fid } });

        if (refCount <= 1) {
          const file = await File.findByPk(fid);
          if (file) {
            try {
              await s3Service.deleteFile(file.s3_key);
            } catch (e) { console.error('Ошибка удаления s3 файла:', e); }
            await file.destroy();
            try {
              await storageManager.removeFileFromQuota(file.owner_id, file.size || 0);
              // Отправляем обновление квоты владельцу (у кого уменьшилась)
              if (wsServer) {
                const newStorageInfo = await storageManager.getStorageInfo(file.owner_id);
                wsServer.broadcastToUser(file.owner_id, {
                  type: 'storage_info_updated',
                  storageInfo: newStorageInfo
                });
              }
            } catch (e) { console.error('quota adjust error', e); }
          }
        } else {
          const otherRef = await FileReference.findOne({
            where: { file_id: fid, message_id: { [Op.ne]: message.id } }
          });
          if (otherRef) {
            const otherMessage = await Message.findByPk(otherRef.message_id);
            if (otherMessage) {
              const file = await File.findByPk(fid);
              const oldOwner = file ? file.owner_id : null;
              const newOwner = otherMessage.sender_id;
              await file.update({ owner_id: newOwner });
              try {
                if (oldOwner) await storageManager.removeFileFromQuota(oldOwner, file.size || 0);
                await storageManager.addFileToQuota(newOwner, file.size || 0);
                // Отправляем обновления квот обоим пользователям
                if (wsServer) {
                  if (oldOwner) {
                    const oldInfo = await storageManager.getStorageInfo(oldOwner);
                    wsServer.broadcastToUser(oldOwner, {
                      type: 'storage_info_updated',
                      storageInfo: oldInfo
                    });
                  }
                  const newInfo = await storageManager.getStorageInfo(newOwner);
                  wsServer.broadcastToUser(newOwner, {
                    type: 'storage_info_updated',
                    storageInfo: newInfo
                  });
                }
              } catch (e) { console.error('quota transfer error', e); }
            }
          }
        }
        await FileReference.destroy({ where: { file_id: fid, message_id: message.id } });
      }
      await message.destroy();
    }

    // Удаляем пользователя из участников чата
    await ConversationParticipant.destroy({
      where: {
        conversation_id: conversationId,
        participant_id: userId
      }
    });

    // Проверяем, остались ли участники
    const remainingParticipants = await ConversationParticipant.count({
      where: { conversation_id: conversationId }
    });

    let conversationDeleted = false;
    if (remainingParticipants === 0) {
      // Нет участников — удаляем разговор
      await Conversation.destroy({ where: { id: conversationId } });
      conversationDeleted = true;
    } else {
      // Обновляем last_message_at, если остались сообщения от других
      const lastMessage = await Message.findOne({
        where: { conversation_id: conversationId },
        order: [['created_at', 'DESC']]
      });
      await Conversation.update(
        { last_message_at: lastMessage ? lastMessage.created_at : null },
        { where: { id: conversationId } }
      );
    }

    // Уведомляем всех участников (кроме текущего) о том, что пользователь вышел
    // и его сообщения удалены. Текущему пользователю отправляем событие для очистки интерфейса.
    if (wsServer) {
      // Получаем список участников (без текущего)
      const participants = await ConversationParticipant.findAll({
        where: { conversation_id: conversationId },
        attributes: ['participant_id']
      });
      const otherParticipantIds = participants.map(p => p.participant_id);

      // Уведомляем остальных участников, что пользователь покинул чат и его сообщения удалены
      for (const pid of otherParticipantIds) {
        wsServer.broadcastToUser(pid, {
          type: 'user_left_chat',
          conversationId: conversationId,
          userId: userId,
          username: req.user.username
        });
      }

      // Если чат удалён полностью, уведомляем всех участников (они уже получили user_left_chat, но могут не знать о полном удалении)
      if (conversationDeleted) {
        // Удаляем чат у всех (включая текущего) — это уже не нужно, так как участников нет, но на всякий случай
        for (const pid of participants.map(p => p.participant_id)) {
          wsServer.broadcastToUser(pid, {
            type: 'conversation_deleted',
            conversationId: conversationId
          });
        }
      } else {
        // Текущему пользователю отправляем событие очистки чата
        wsServer.broadcastToUser(userId, {
          type: 'chat_cleared_for_me',
          conversationId: conversationId
        });
      }
    }

    res.json({
      success: true,
      message: 'Чат очищен',
      conversationDeleted
    });
  } catch (error) {
    console.error('Error clearing chat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;