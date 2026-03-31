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
const { Console } = require('flowprompt');

const storageRouter = require('./routes/storage.cjs');

const MAX_ATTEMPTS = 10;
const BLOCK_TIME = 5 * 60 * 1000; // 5 минут
const attemptsStore = new Map();

// ---------- TUI (flowprompt) ----------
let tuiConsole = null;
const logBuffer = [];

// Сохраняем оригинальные методы console для фолбэка
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
};

function writeToTUI(...args) {
  const message = args.join(' ');
  if (tuiConsole) {
    tuiConsole.log(message);
  } else {
    logBuffer.push(message);
  }
}

// Переопределяем console для вывода в TUI или буфер
console.log = writeToTUI;
console.error = writeToTUI;
console.warn = writeToTUI;

// Функция для вывода накопленных логов после запуска TUI
function flushLogBuffer() {
  if (tuiConsole && logBuffer.length) {
    for (const msg of logBuffer) {
      tuiConsole.log(msg);
    }
    logBuffer.length = 0;
  }
}

function initTUI() {
  if (!process.stdin.isTTY) {
    originalConsole.log('⚠️  TUI не доступен (не интерактивный терминал).');
    return;
  }

  tuiConsole = new Console({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    encoding: 'utf8',
  });

  tuiConsole.log('✨ Интерактивная консоль сервера запущена. Введите help для справки.');

  // Обработка команд
  tuiConsole.on('line', (command) => {
    handleCommand(command);
    // Приглашение показывается автоматически
  });

  // Автодополнение
  const commandsList = [
    'help',
    'ban ip', 'ban user by', 'ban devices by', 'ban list',
    'unban ip', 'unban user by', 'unban devices by',
    'whitelist ip', 'whitelist devices by', 'whitelist list',
    'unwhitelist ip', 'unwhitelist devices by',
    'get user info by',
  ];

  tuiConsole.on('autocomplete', ({ line, pos, callback }) => {
    const lastSpace = line.lastIndexOf(' ', pos - 1);
    const wordStart = lastSpace + 1;
    const currentWord = line.slice(wordStart, pos);
    const hits = commandsList.filter(cmd => cmd.startsWith(currentWord));
    const completions = hits.map(hit => ({
      line: line.slice(0, wordStart) + hit + line.slice(pos),
      pos: wordStart + hit.length,
    }));
    callback(completions);
  });

  tuiConsole.on('SIGINT', () => {
    originalConsole.log('\nЗавершение работы сервера...');
    process.exit(0);
  });
}

// ---------- Команды ----------
function handleCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const mainCmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (mainCmd) {
    case 'help':
      showHelp();
      break;
    default:
      writeToTUI(`❓ Неизвестная команда "${mainCmd}". Введите "help" для списка команд.`);
      break;
  }
}

function showHelp() {
  writeToTUI('📚 Доступные команды:');
  writeToTUI('  help - показать эту справку');
  writeToTUI('  ban ip <ip> - заблокировать IP');
  writeToTUI('  ban user by username/id <username/id> - заблокировать пользователя');
  writeToTUI('  ban devices by username/id/ip <username/id/ip> - заблокировать устройства');
  writeToTUI('  ban list - показать список заблокированных');
  writeToTUI('  unban ip <ip> - разблокировать IP');
  writeToTUI('  unban user by username/id <username/id> - разблокировать пользователя');
  writeToTUI('  unban devices by username/id/ip <username/id/ip> - разблокировать устройства');
  writeToTUI('  whitelist ip <ip> - добавить IP в белый список');
  writeToTUI('  whitelist devices by username/id/ip <username/id/ip> - добавить устройства');
  writeToTUI('  whitelist list - показать белый список');
  writeToTUI('  unwhitelist ip <ip> - удалить IP из белого списка');
  writeToTUI('  unwhitelist devices by username/id/ip <username/id/ip> - удалить устройства');
  writeToTUI('  get user info by username/id <username/id> - получить информацию о пользователе');
}

// ---------- Остальной код сервера ----------
const GLOBAL_PASSWORD_HASH = process.env.GLOBAL_PASSWORD_HASH;
if (!GLOBAL_PASSWORD_HASH) {
  console.error('❌ GLOBAL_PASSWORD_HASH не задан в .env');
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  rl.question('Введите глобальный пароль (будет сгенерирован хеш) (для вставки из буфера обмена нажмите правую кнопку мыши): ', (password) => {
    rl.close();
    if (!password) {
      console.error('Пароль не может быть пустым. Завершение.');
      process.exit(1);
    }
    const hash = bcrypt.hashSync(password, 10);
    console.log(`\n✅ Хеш для .env:\nGLOBAL_PASSWORD_HASH=${hash}`);
    console.log('Добавьте эту строку в .env и перезапустите сервер.');
    process.exit(0);
  });
  return;
}

async function checkGlobalPassword(plainPassword) {
  if (!plainPassword) return false;
  try {
    return await bcrypt.compare(plainPassword, GLOBAL_PASSWORD_HASH);
  } catch (err) {
    console.error('Ошибка сравнения глобального пароля:', err);
    return false;
  }
}

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

function getOrCreateCert() {
  const certDir = path.join(__dirname, 'certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('📁 Используем существующие сертификаты');
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8')
    };
  }

  console.log('🔐 Генерируем самоподписанный сертификат...');
  try {
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = selfsigned.generate(attrs, { days: 365 });

    if (!pems || !pems.private || !pems.cert) {
      throw new Error('Не удалось сгенерировать сертификат: pems.private или pems.cert отсутствует');
    }

    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }

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

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:22869',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use(async (req, res, next) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

app.post('/api/verify-global-password', async (req, res) => {
  const { globalPassword } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  const record = attemptsStore.get(clientIp) || { attempts: 0, blockedUntil: null };

  if (record.blockedUntil && Date.now() < record.blockedUntil) {
    return res.status(403).json({
      success: false,
      message: 'Слишком много попыток. Попробуйте позже.',
      blockedUntil: record.blockedUntil,
      attemptsLeft: 0,
    });
  }

  const isValid = await checkGlobalPassword(globalPassword);

  if (isValid) {
    attemptsStore.delete(clientIp);
    return res.json({ success: true });
  } else {
    record.attempts += 1;
    let blockedUntil = null;
    let attemptsLeft = MAX_ATTEMPTS - record.attempts;

    if (record.attempts >= MAX_ATTEMPTS) {
      blockedUntil = Date.now() + BLOCK_TIME;
      attemptsLeft = 0;
      record.blockedUntil = blockedUntil;
    }

    attemptsStore.set(clientIp, record);
    return res.status(401).json({
      success: false,
      message: 'Неверный глобальный пароль',
      attemptsLeft,
      blockedUntil,
    });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, globalPassword } = req.body;
    if (!await checkGlobalPassword(globalPassword)) {
      return res.status(403).json({ success: false, message: 'Неверный глобальный пароль' });
    }

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Имя пользователя и пароль обязательны' });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Пользователь с таким именем уже существует' });
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

    res.status(201).json({ success: true, user: userResponse, message: 'Регистрация успешна' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Ошибка при регистрации' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password, globalPassword } = req.body;
    if (!await checkGlobalPassword(globalPassword)) {
      return res.status(403).json({ success: false, message: 'Неверный глобальный пароль' });
    }
    const ip = req.ip || req.connection.remoteAddress;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Имя пользователя и пароль обязательны' });
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
      return res.status(401).json({ success: false, message: 'Неверное имя пользователя или пароль' });
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
      return res.status(401).json({ success: false, message: 'Неверное имя пользователя или пароль' });
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

    res.json({ success: true, user: userResponse, message: 'Вход выполнен успешно' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Ошибка при входе' });
  }
});

app.post('/api/change-username', async (req, res) => {
  try {
    const { id, newUsername } = req.body;
    if (!id || !newUsername) {
      return res.status(400).json({ success: false, message: 'Требуется ID пользователя и новое имя' });
    }

    const existingUser = await User.findOne({
      where: {
        username: newUsername,
        id: { [Op.ne]: id }
      }
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Это имя пользователя уже занято' });
    }

    await User.update(
      { username: newUsername, updated_at: Date.now() },
      { where: { id } }
    );

    res.json({ success: true, message: 'Имя пользователя изменено' });
  } catch (error) {
    console.error('Change username error:', error);
    res.status(500).json({ success: false, message: 'Ошибка при изменении имени пользователя' });
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const { id, newPassword } = req.body;
    if (!id || !newPassword) {
      return res.status(400).json({ success: false, message: 'Требуется ID пользователя и новый пароль' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.update(
      { password: hashedPassword, updated_at: Date.now() },
      { where: { id } }
    );

    res.json({ success: true, message: 'Пароль изменен' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Ошибка при изменении пароля' });
  }
});

app.get('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

app.use('/api/messenger', messengerRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
});

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

    // Запускаем TUI после того, как сервер начал слушать
    initTUI();
    flushLogBuffer();
  } catch (error) {
    console.error('Ошибка при запуске сервера:', error);
    process.exit(1);
  }
}

app.use('/api/storage', storageRouter);

start();