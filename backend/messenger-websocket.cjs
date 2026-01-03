const WebSocket = require('ws');
const { v4: uuid } = require('uuid');
const { Users, Messages, Conversations, db: messengerDb, loadSql } = require('./database.cjs');

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
    this.wss.on('connection', (ws, req) => {
      // Try headers first (used by tests), then fallback to query param provided by browser
      let userId = req.headers['x-user-id'];
      try {
        if (!userId && req.url) {
          const base = `http://${req.headers.host}`;
          const url = new URL(req.url, base);
          userId = url.searchParams.get('userId') || userId;
        }
      } catch (e) {
        // ignore parse errors
      }

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
      Users.updateStatus(userId, 'online');
      this.broadcastUserStatus(userId, 'online');

      console.log(`✅ Пользователь ${userId} подключен (всего: ${userConnections.get(userId).size})`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(userId, message, ws);
        } catch (error) {
          console.error('Ошибка парсинга сообщения:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        userConnections.get(userId).delete(ws);

        // Если нет больше активных соединений, устанавливаем offline
        if (userConnections.get(userId).size === 0) {
          Users.updateStatus(userId, 'offline');
          Users.updateLastSeen(userId);
          this.broadcastUserStatus(userId, 'offline');
          console.log(`❌ Пользователь ${userId} отключен`);
        }
      });

      ws.on('error', (error) => {
        console.error(`Ошибка WebSocket для ${userId}:`, error);
      });
    });
  }

  handleMessage(userId, message, ws) {
    const { type, data } = message;

    switch (type) {
      case 'forward_message':
        this.handleForwardMessage(userId, data);
        break;

      case 'send_message':
        this.handleSendMessage(userId, data, ws);
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
        this.handleMessageRead(userId, data);
        break;

      case 'get_user_status':
        this.handleGetUserStatus(userId, data, ws);
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
      // Получаем исходное сообщение
      const originalMessage = await Messages.getById(originalMessageId);
      if (!originalMessage) {
        throw new Error('Original message not found');
      }
      
      // Создаем новое сообщение в целевом чате
      const newMessageId = uuid();
      
      // Сохраняем пересланное сообщение в БД
      const forwardedMessage = await Messages.create(
        newMessageId,
        conversationId,
        userId,
        originalMessage.content,
        originalMessage.file_ids
      );
      
      // Обновляем последнее сообщение в разговоре
      Conversations.updateLastMessage(conversationId);
      
      // Получаем информацию об отправителе (кто переслал)
      const user = Users.getById(userId);
      const senderUsername = user?.username || userId;
      
      // Рассылаем новое сообщение всем участникам целевого чата
      this.broadcastToConversation(conversationId, {
        type: 'new_message',
        message: {
          id: forwardedMessage.id,
          conversation_id: forwardedMessage.conversation_id,
          sender_id: forwardedMessage.sender_id,
          sender_username: senderUsername,
          content: forwardedMessage.content,
          file_ids: forwardedMessage.file_ids,
          created_at: Date.now()
        }
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
      const message = await Messages.create(messageId, conversationId, userId, content, fileIds);

      // Получим username отправителя для отправки клиентам
      let senderUsername = userId;
      let sender = Users.getById(userId);
      if (sender && sender.username) {
        senderUsername = sender.username;
      }
      
      console.log(`[WebSocket] Message sender: userId="${userId}", username="${senderUsername}", user=${JSON.stringify(sender)}`);

      // Обновляем последнее сообщение в разговоре
      Conversations.updateLastMessage(conversationId);

      // Получаем участников разговора
      const conversation = messengerDb.prepare(loadSql('conversations/getById')).get(conversationId);

      const participants = JSON.parse(conversation.participant_ids);

      // Рассылаем сообщение всем участникам с правильным username и userId
      this.broadcastToConversation(conversationId, {
        type: 'new_message',
        message: {
          id: message.id,
          conversation_id: message.conversation_id,
          sender_id: message.sender_id,
          sender_username: senderUsername || userId,
          content: content,
          file_ids: message.file_ids,
          created_at: Date.now()
        }
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

    // Get user info to send along with typing indicator
    const user = Users.getByUserId(userId) || Users.getById(userId);
    const username = user?.username || userId;

    this.broadcastToConversation(conversationId, {
      type: 'user_typing',
      userId,
      username,
      conversationId
    });

    // Автоматически останавливаем печать через 3 секунды если нет обновления
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

  handleMessageRead(userId, data) {
    const { messageId, conversationId } = data;

    Messages.markAsRead(messageId, userId);

    this.broadcastToConversation(conversationId, {
      type: 'message_read',
      messageId,
      userId,
      readAt: new Date()
    });
  }

  handleGetUserStatus(userId, data, ws) {
    const { targetUserId } = data;
    const user = Users.getById(targetUserId);

    if (!user) {
      return ws.send(JSON.stringify({
        type: 'error',
        message: 'User not found'
      }));
    }

    // Вычисляем "был(а) {количество времени} назад"
    const lastSeen = new Date(user.last_seen);
    const timeDiffMs = Date.now() - lastSeen.getTime();
    const timeAgoText = this.formatTimeAgo(timeDiffMs);

    ws.send(JSON.stringify({
      type: 'user_status',
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        lastSeen: user.last_seen,
        timeAgoText: user.status === 'online' ? 'онлайн' : `был(а) ${timeAgoText} назад`
      }
    }));
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
  broadcastToConversation(conversationId, message) {
    const conversation = messengerDb.prepare(loadSql('conversations/getById')).get(conversationId);

    if (!conversation) return;

    const participants = JSON.parse(conversation.participant_ids);

    for (const participantId of participants) {
      this.broadcastToUser(participantId, message);
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

  // Получение информации о пользователях в разговоре
  getConversationUsersStatus(conversationId) {
    const conversation = messengerDb.prepare(loadSql('conversations/getById')).get(conversationId);

    if (!conversation) return [];

    const participants = JSON.parse(conversation.participant_ids);
    const statuses = [];

    for (const userId of participants) {
      const user = Users.getById(userId);
      const isOnline = userConnections.has(userId) && userConnections.get(userId).size > 0;

      statuses.push({
        id: user.id,
        username: user.username,
        status: isOnline ? 'online' : 'offline',
        lastSeen: user.last_seen
      });
    }

    return statuses;
  }
}

module.exports = MessengerWebSocketServer;
