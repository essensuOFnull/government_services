const WebSocket = require('ws');
const { v4: uuid } = require('uuid');

// Импорт Sequelize моделей
const {
  User,
  Message,
  Conversation,
  ConversationParticipant,
  sequelize,
  Op,
  compressContent,
  decompressContent,
  CrossoutResourcePrice
} = require('./database.cjs');

// Хранилище активных соединений пользователей
const userConnections = new Map();
const userTypingStatus = new Map();
const userUploadingStatus = new Map();

class MessengerWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws/messenger' });
    this.setupConnections();
  }

  setupConnections() {
    this.wss.on('connection', async (ws, req) => {
      let userId = req.headers['x-user-id'];
      try {
        if (!userId && req.url) {
          const base = `http://${req.headers.host}`;
          const url = new URL(req.url, base);
          userId = url.searchParams.get('userId') || userId;
        }
      } catch (e) {}

      if (!userId) {
        ws.close(1008, 'User ID required');
        return;
      }

      // Регистрируем соединение
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId).add(ws);

      // Обновляем статус пользователя
      await User.update(
        { status: 'online', last_seen: Date.now() },
        { where: { id: userId } }
      );
      this.broadcastUserStatus(userId, 'online');

      console.log(`✅ Пользователь ${userId} подключен (всего: ${userConnections.get(userId).size})`);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data);
          await this.handleMessage(userId, message, ws);
        } catch (error) {
          console.error('Ошибка парсинга сообщения:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', async () => {
        userConnections.get(userId).delete(ws);

        // Если нет больше активных соединений, устанавливаем offline
        if (userConnections.get(userId).size === 0) {
          await User.update(
            { status: 'offline', last_seen: Date.now() },
            { where: { id: userId } }
          );
          this.broadcastUserStatus(userId, 'offline');
          console.log(`❌ Пользователь ${userId} отключен`);
        }
      });

      ws.on('error', (error) => {
        console.error(`Ошибка WebSocket для ${userId}:`, error);
      });
    });
  }

  async handleMessage(userId, message, ws) {
    const { type, data } = message;

    switch (type) {
      case 'forward_message':
        await this.handleForwardMessage(userId, data);
        break;

      case 'send_message':
        await this.handleSendMessage(userId, data, ws);
        break;

      case 'typing_start':
        this.handleTypingStart(userId, data);
        break;

      case 'typing_stop':
        this.handleTypingStop(userId, data);
        break;

      case 'upload_start':
        this.handleUploadStart(userId, data);
        break;

      case 'upload_complete':
        this.handleUploadComplete(userId, data);
        break;

      case 'file_transfer_start':
        this.handleFileTransferStart(userId, data);
        break;

      case 'file_transfer_complete':
        this.handleFileTransferComplete(userId, data);
        break;

      case 'message_read':
        await this.handleMessageRead(userId, data);
        break;

      case 'get_user_status':
        await this.handleGetUserStatus(userId, data, ws);
        break;

      case 'crossout_price_update':
        await this.handleCrossoutPriceUpdate(userId, data);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        console.warn(`Unknown message type: ${type}`);
    }
  }

  async handleForwardMessage(userId, data) {
    const { conversationId, originalMessageId } = data;
    
    try {
      const originalMessage = await Message.findByPk(originalMessageId);
      if (!originalMessage) {
        throw new Error('Original message not found');
      }
      
      const newMessageId = uuid();
      
      const forwardedMessage = await Message.create({
        id: newMessageId,
        conversation_id: conversationId,
        sender_id: userId,
        content_compressed: originalMessage.content_compressed,
        file_ids: originalMessage.file_ids,
        created_at: Date.now(),
        forwarded_from: originalMessageId
      });
      
      await Conversation.update(
        { last_message_at: Date.now() },
        { where: { id: conversationId } }
      );
      
      const user = await User.findByPk(userId);
      const senderUsername = user?.username || userId;
      
      const messageData = {
        id: forwardedMessage.id,
        conversation_id: forwardedMessage.conversation_id,
        sender_id: forwardedMessage.sender_id,
        sender_username: senderUsername,
        content: await decompressContent(forwardedMessage.content_compressed),
        file_ids: JSON.parse(forwardedMessage.file_ids || '[]'),
        created_at: forwardedMessage.created_at
      };
      
      this.broadcastToConversation(conversationId, {
        type: 'forward_message',
        message: messageData
      });
      
      console.log(`✅ Сообщение ${originalMessageId} переслано в чат ${conversationId}`);
      
    } catch (error) {
      console.error('Ошибка пересылки сообщения:', error);
    }
  }

  async handleSendMessage(userId, data, ws) {
    const { conversationId, content, fileIds = [] } = data;
    const messageId = uuid();

    try {
      const compressedContent = await compressContent(content);
      const message = await Message.create({
        id: messageId,
        conversation_id: conversationId,
        sender_id: userId,
        content_compressed: compressedContent,
        file_ids: JSON.stringify(fileIds),
        created_at: Date.now()
      });

      const sender = await User.findByPk(userId);
      const senderUsername = sender?.username || userId;
      
      console.log(`[WebSocket] Message sender: userId="${userId}", username="${senderUsername}"`);

      await Conversation.update(
        { last_message_at: Date.now() },
        { where: { id: conversationId } }
      );

      const messageData = {
        id: message.id,
        conversation_id: message.conversation_id,
        sender_id: message.sender_id,
        sender_username: senderUsername,
        content: content,
        file_ids: fileIds,
        created_at: message.created_at
      };

      await this.broadcastToConversation(conversationId, {
        type: 'new_message',
        message: messageData
      });
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to send message'
      }));
    }
  }

  handleTypingStart(userId, data) {
    const { conversationId } = data;
    const typingId = uuid();

    if (!userTypingStatus.has(conversationId)) {
      userTypingStatus.set(conversationId, new Map());
    }
    userTypingStatus.get(conversationId).set(userId, {
      id: typingId,
      startTime: Date.now()
    });

    this.broadcastToConversation(conversationId, {
      type: 'user_typing',
      userId,
      conversationId
    });

    setTimeout(() => {
      const typing = userTypingStatus.get(conversationId)?.get(userId);
      if (typing && typing.id === typingId) {
        this.handleTypingStop(userId, { conversationId });
      }
    }, 3000);
  }

  handleTypingStop(userId, data) {
    const { conversationId } = data;

    userTypingStatus.get(conversationId)?.delete(userId);

    this.broadcastToConversation(conversationId, {
      type: 'user_stopped_typing',
      userId,
      conversationId
    });
  }

  handleUploadStart(userId, data) {
    const { conversationId, filename, fileSize } = data;

    if (!userUploadingStatus.has(userId)) {
      userUploadingStatus.set(userId, new Map());
    }

    userUploadingStatus.get(userId).set(filename, {
      startTime: Date.now(),
      totalSize: fileSize
    });

    this.broadcastToConversation(conversationId, {
      type: 'user_uploading_file',
      userId,
      filename,
      conversationId
    });
  }

  handleUploadComplete(userId, data) {
    const { conversationId, filename } = data;

    userUploadingStatus.get(userId)?.delete(filename);

    this.broadcastToConversation(conversationId, {
      type: 'user_upload_complete',
      userId,
      filename,
      conversationId
    });
  }

  handleFileTransferStart(userId, data) {
    const { recipientId, filename, fileSize } = data;

    this.broadcastToUser(recipientId, {
      type: 'file_transfer_incoming',
      senderId: userId,
      filename,
      fileSize
    });

    this.broadcastToUser(userId, {
      type: 'file_transfer_sending',
      recipientId,
      filename,
      fileSize
    });
  }

  handleFileTransferComplete(userId, data) {
    const { recipientId, filename, fileId } = data;

    this.broadcastToUser(recipientId, {
      type: 'file_received',
      senderId: userId,
      filename,
      fileId
    });

    this.broadcastToUser(userId, {
      type: 'file_sent',
      recipientId,
      filename,
      fileId
    });
  }

  async handleMessageRead(userId, data) {
    const { messageId, conversationId } = data;

    // В Sequelize нужно создать запись в таблице message_reads
    // Для простоты пока пропустим, так как нет модели MessageRead в текущем коде
    // Можно добавить позже

    this.broadcastToConversation(conversationId, {
      type: 'message_read',
      messageId,
      userId,
      readAt: Date.now()
    });
  }

  async handleGetUserStatus(userId, data, ws) {
    const { targetUserId } = data;
    const user = await User.findByPk(targetUserId);

    if (!user) {
      return ws.send(JSON.stringify({
        type: 'error',
        message: 'User not found'
      }));
    }

    const lastSeen = new Date(user.last_seen);
    const timeDiffMs = Date.now() - lastSeen.getTime();
    const timeAgoText = this.formatTimeAgo(timeDiffMs);

    const isOnline = userConnections.has(targetUserId) && 
                     userConnections.get(targetUserId).size > 0;

    ws.send(JSON.stringify({
      type: 'user_status',
      user: {
        id: user.id,
        username: user.username,
        status: isOnline ? 'online' : 'offline',
        lastSeen: user.last_seen,
        timeAgoText: isOnline ? 'онлайн' : `был(а) ${timeAgoText} назад`
      }
    }));
  }

  async handleCrossoutPriceUpdate(userId, data) {
    const { resourceIndex, fieldType, value } = data;

    try {
      const user = await User.findByPk(userId);
      if (!user) return;

      // Сохраняем в БД
      await CrossoutResourcePrice.create({
        id: require('uuid').v4(),
        user_id: userId,
        resource_index: resourceIndex,
        field_type: fieldType,
        value: parseFloat(value),
        changed_at: Date.now()
      });

      // Broadcast to all connected users
      this.broadcastToAllConnected({
        type: 'crossout_price_updated',
        resourceIndex,
        fieldType,
        value: parseFloat(value),
        userId,
        username: user.username,
        changedAt: Date.now()
      });

      console.log(`✅ Crossout price updated: resource=${resourceIndex}, field=${fieldType}, value=${value}, user=${user.username}`);

    } catch (error) {
      console.error('Error handling crossout price update:', error);
    }
  }

  formatTimeAgo(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds} сек`;
    if (minutes < 60) return `${minutes} мин`;
    if (hours < 24) return `${hours} ч`;
    if (days < 7) return `${days} д`;

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks} нед`;

    const months = Math.floor(days / 30);
    return `${months} мес`;
  }

  // Отправка сообщения всем пользователям в разговоре
  async broadcastToConversation(conversationId, message) {
    try {
      const conversation = await Conversation.findByPk(conversationId, {
        include: [{
          model: User,
          as: 'participants',
          attributes: ['id']
        }]
      });

      if (!conversation) return;

      const participants = conversation.participants.map(p => p.id);

      for (const participantId of participants) {
        this.broadcastToUser(participantId, message);
      }
    } catch (error) {
      console.error('Error broadcasting to conversation:', error);
    }
  }

  // Отправка сообщения конкретному пользователю
  broadcastToUser(userId, message) {
    const connections = userConnections.get(userId);

    if (connections) {
      const messageData = JSON.stringify(message);
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageData);
        }
      }
    }
  }

  // Отправка сообщения всем подключенным пользователям
  broadcastToAllConnected(message) {
    const messageData = JSON.stringify(message);
    for (const [userId, connections] of userConnections) {
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageData);
        }
      }
    }
  }

  // Отправка статуса пользователя (онлайн/офлайн)
  broadcastUserStatus(userId, status) {
    const connections = this.wss.clients;

    const statusMessage = JSON.stringify({
      type: 'user_status_changed',
      userId,
      status,
      timestamp: Date.now()
    });

    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(statusMessage);
      }
    }
  }

  // Отправить обновление Crossout цены всем подключенным пользователям
  broadcastCrossoutUpdate(data) {
    const connections = this.wss.clients;

    const message = JSON.stringify({
      type: 'crossout_price_updated',
      ...data
    });

    console.log('Broadcasting crossout update to', connections.size, 'clients:', message);

    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Получение информации о пользователях в разговоре
  async getConversationUsersStatus(conversationId) {
    try {
      const conversation = await Conversation.findByPk(conversationId, {
        include: [{
          model: User,
          as: 'participants',
          attributes: ['id', 'username', 'last_seen']
        }]
      });

      if (!conversation) return [];

      const statuses = [];

      for (const user of conversation.participants) {
        const isOnline = userConnections.has(user.id) && 
                         userConnections.get(user.id).size > 0;

        statuses.push({
          id: user.id,
          username: user.username,
          status: isOnline ? 'online' : 'offline',
          lastSeen: user.last_seen
        });
      }

      return statuses;
    } catch (error) {
      console.error('Error getting conversation users status:', error);
      return [];
    }
  }
}

module.exports = MessengerWebSocketServer;