require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const selfsigned = require('selfsigned');

// Импорт Sequelize моделей
const {
  User,
  LoginAttempt,
  sequelize,
  Op,
  initializeDatabase
} = require('./database.cjs');

const messengerRoutes = require('./messenger-routes.cjs');
const MessengerWebSocketServer = require('./messenger-websocket.cjs');
const storageManager = require('./messenger-storage.cjs');

const app = express();
const PORT = process.env.PORT || 22869;
const isDev = process.env.NODE_ENV !== 'production';

// Функция для получения или создания самоподписанного сертификата
function getOrCreateCert() {
  const certDir = path.join(__dirname, 'certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  // Если сертификаты уже существуют, используем их
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('📁 Используем существующие сертификаты');
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8')
    };
  }

  // Пытаемся сгенерировать новый самоподписанный сертификат
  console.log('🔐 Генерируем самоподписанный сертификат...');
  try {
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = selfsigned.generate(attrs, { days: 365 });

    if (!pems || !pems.private || !pems.cert) {
      throw new Error('Не удалось сгенерировать сертификат: pems.private или pems.cert отсутствует');
    }

    // Создаём директорию, если её нет
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }

    // Сохраняем сертификаты для будущих запусков
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);

    console.log('✅ Сертификаты успешно сгенерированы и сохранены');
    return {
      key: pems.private,
      cert: pems.cert
    };
  } catch (err) {
    console.error('❌ Ошибка при генерации сертификата:', err.message);
    console.log('Пожалуйста, создайте сертификаты с помощью generate-certs.bat');
    process.exit(1);
  }
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:22869',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Лимитер для аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Слишком много попыток, повторите позже' }
});

app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/change-password', authLimiter);
app.use('/api/change-username', authLimiter);

// Логирование
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Инициализация базы данных
app.use(async (req, res, next) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Database initialization failed'
    });
  }
});

// Маршруты аутентификации
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Имя пользователя и пароль обязательны'
      });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Пользователь с таким именем уже существует'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuid();
    const now = Date.now();

    const user = await User.create({
      id: userId,
      username,
      password: hashedPassword,
      role: 'guest',
      status: 'offline',
      storage_used: 0,
      storage_quota: 10 * 1024 * 1024 * 1024,
      total_storage_used: 0,
      created_at: now,
      updated_at: now
    });

    const { UserStorageQuota } = require('./database.cjs');
    await UserStorageQuota.create({
      user_id: userId,
      storage_limit_bytes: 10 * 1024 * 1024 * 1024,
      storage_used_bytes: 0
    });

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      user: userResponse,
      message: 'Регистрация успешна'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при регистрации'
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Имя пользователя и пароль обязательны'
      });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      await LoginAttempt.create({
        id: uuid(),
        ip,
        type: 'failed',
        username,
        created_at: Date.now()
      }).catch(e => console.error('Failed to log login attempt:', e));
      return res.status(401).json({
        success: false,
        message: 'Неверное имя пользователя или пароль'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await LoginAttempt.create({
        id: uuid(),
        ip,
        type: 'failed',
        username,
        created_at: Date.now()
      }).catch(e => console.error('Failed to log login attempt:', e));
      return res.status(401).json({
        success: false,
        message: 'Неверное имя пользователя или пароль'
      });
    }

    await LoginAttempt.create({
      id: uuid(),
      ip,
      type: 'success',
      username,
      created_at: Date.now()
    }).catch(e => console.error('Failed to log login attempt:', e));

    await user.update({
      status: 'online',
      last_seen: Date.now(),
      updated_at: Date.now()
    });

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      success: true,
      user: userResponse,
      message: 'Вход выполнен успешно'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при входе'
    });
  }
});

app.post('/api/change-username', async (req, res) => {
  try {
    const { id, newUsername } = req.body;
    if (!id || !newUsername) {
      return res.status(400).json({
        success: false,
        message: 'Требуется ID пользователя и новое имя'
      });
    }

    const existingUser = await User.findOne({
      where: {
        username: newUsername,
        id: { [Op.ne]: id }
      }
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Это имя пользователя уже занято'
      });
    }

    await User.update(
      { username: newUsername, updated_at: Date.now() },
      { where: { id } }
    );

    res.json({
      success: true,
      message: 'Имя пользователя изменено'
    });
  } catch (error) {
    console.error('Change username error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при изменении имени пользователя'
    });
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const { id, newPassword } = req.body;
    if (!id || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Требуется ID пользователя и новый пароль'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.update(
      { password: hashedPassword, updated_at: Date.now() },
      { where: { id } }
    );

    res.json({
      success: true,
      message: 'Пароль изменен'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при изменении пароля'
    });
  }
});

app.get('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// API маршруты мессенджера
app.use('/api/messenger', messengerRoutes);

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Внутренняя ошибка сервера'
  });
});

// Инициализация сервера
async function start() {
  try {
    await initializeDatabase();
    console.log('✅ База данных инициализирована');

    storageManager.startCleanupScheduler();
    console.log('✅ Планировщик очистки файлов запущен');

    const useHttps = process.env.USE_HTTPS === 'true';
    let server;

    if (useHttps) {
      const { key, cert } = getOrCreateCert();
      server = https.createServer({ key, cert }, app);
      console.log('🔒 Сервер работает через HTTPS');
    } else {
      server = http.createServer(app);
      console.log('🔓 Сервер работает через HTTP');
    }

    const messengerWs = new MessengerWebSocketServer(server);
    app.set('wsServer', messengerWs);
    console.log('✅ WebSocket сервер мессенджера инициализирован');

    if (isDev) {
      const { createServer: createViteServer } = require('vite');
      const viteServer = await createViteServer({
        root: path.resolve(__dirname, '..'),
        server: { middlewareMode: true },
        appType: 'spa'
      });
      
      console.log('📦 Vite сервер инициализирован');
      
      app.use(viteServer.middlewares);
      
      app.use('*', async (req, res) => {
        const path_url = req.path;
        if (/\.\w+$/.test(path_url)) {
          return res.status(404).end('Not found');
        }
        try {
          const htmlPath = path.resolve(__dirname, '../index.html');
          let html = fs.readFileSync(htmlPath, 'utf-8');
          html = await viteServer.transformIndexHtml(path_url, html);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        } catch (e) {
          viteServer.ssrFixStacktrace(e);
          res.status(500).end(`Error: ${e.message}`);
        }
      });
    } else {
      app.use(express.static(path.resolve(__dirname, '../dist')));
      app.use('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../dist', 'index.html'));
      });
    }
    
    app.get('/api/s3/:bucket/*', (req, res) => {
      try {
        const bucket = req.params.bucket;
        const key = req.params[0];
        const s3Base = process.env.S3_DATA_DIR || path.resolve(__dirname, '../data/s3');
        const filePath = path.join(s3Base, bucket, key);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ success: false, message: 'Not found' });
        }
        res.sendFile(filePath);
      } catch (err) {
        console.error('S3 proxy error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    server.listen(PORT, () => {
      const protocol = useHttps ? 'https' : 'http';
      const wsProtocol = useHttps ? 'wss' : 'ws';
      console.log(`\n${'='.repeat(50)}`);
      console.log(`✅ Сервер запущен на ${protocol}://localhost:${PORT}`);
      console.log(`${'='.repeat(50)}`);
      console.log(`📨 WebSocket: ${wsProtocol}://localhost:${PORT}/ws/messenger`);
      if (isDev) {
        console.log(`📝 Режим разработки (Vite middleware активен)`);
      } else {
        console.log(`🚀 Режим production`);
      }
      console.log(`${'='.repeat(50)}\n`);
    });
  } catch (error) {
    console.error('Ошибка при запуске сервера:', error);
    process.exit(1);
  }
}

start();