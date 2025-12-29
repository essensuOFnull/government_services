const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const auth = require('./auth-middleware');

const app = express();
const PORT = process.env.PORT || 22869;
const isDev = process.env.NODE_ENV !== 'production';

// Middleware безопасности — более мягкая политика в dev для работы Vite HMR
if (isDev) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // разрешаем соединения к Vite HMR websocket (порт будет в vite.config.js)
        connectSrc: ["'self'", "ws://localhost:24678", "ws://127.0.0.1:24678", "http://localhost:22869"]
      }
    }
  }));
} else {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"]
      }
    }
  }));
}

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:22869',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Общий лимитер для всех запросов
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100 // лимит запросов с одного IP
});
app.use('/api/', limiter);

// Логирование
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Маршруты аутентификации
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await auth.registerUser(username, password);
    
    res.status(201).json({
      success: true,
      user,
      message: 'Регистрация успешна'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    
    const user = await auth.authenticate(username, password, ip);
    
    // В реальном проекте здесь должна быть JWT токенизация
    res.json({
      success: true,
      user,
      message: 'Вход выполнен успешно'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/change-username', async (req, res) => {
  try {
    const { userId, newUsername } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Требуется ID пользователя'
      });
    }

    await auth.changeUsername(userId, newUsername);
    
    res.json({
      success: true,
      message: 'Имя пользователя изменено'
    });
  } catch (error) {
    console.error('Change username error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Требуется ID пользователя'
      });
    }

    await auth.changePassword(userId, newPassword);
    
    res.json({
      success: true,
      message: 'Пароль изменен'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await auth.getUserById(userId);
    
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

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Внутренняя ошибка сервера'
  });
});

// Инициализируем сервер
async function start() {
  try {
    if (isDev) {
      // В режиме разработки подключаем Vite middleware
      const { createServer: createViteServer } = require('vite');
      const viteServer = await createViteServer({
        root: path.resolve(__dirname, '..'),
        server: { middlewareMode: true },
        appType: 'spa'
      });
      
      console.log('📦 Vite сервер инициализирован');
      
      // Добавляем логирование ПЕРЕД Vite для отладки
      app.use((req, res, next) => {
        console.log(`⬜ До Vite middleware: ${req.method} ${req.path}`);
        next();
      });
      
      // Подключаем Vite middleware
      app.use(viteServer.middlewares);
      
      // Логирование ПОСЛЕ Vite
      app.use((req, res, next) => {
        console.log(`⬛ После Vite middleware: ${req.method} ${req.path}`);
        next();
      });
      
      // SPA fallback
      app.use('*', async (req, res) => {
        const path_url = req.path;
        console.log(`📍 Вошли в SPA fallback для: ${path_url}`);
        
        // Проверяем, не является ли это API запросом или статическим файлом
        
        // Пропускаем если это выглядит как файл (имеет расширение)
        if (/\.\w+$/.test(path_url)) {
          console.log(`⏭️  Пропуск файла: ${path_url}`);
          return res.status(404).end('Not found');
        }
        
        // Это маршрут приложения - отдаём index.html
        console.log(`🔄 SPA fallback для маршрута: ${path_url}`);
        
        try {
          const htmlPath = path.resolve(__dirname, '../index.html');
          console.log(`📄 Читаю index.html из: ${htmlPath}`);
          
          let html = fs.readFileSync(htmlPath, 'utf-8');
          html = await viteServer.transformIndexHtml(path_url, html);
          
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        } catch (e) {
          console.error('❌ Ошибка в SPA fallback:', e.message);
          viteServer.ssrFixStacktrace(e);
          res.status(500).end(`Error: ${e.message}`);
        }
      });
    } else {
      // В режиме production отдаём статические файлы
      app.use(express.static(path.resolve(__dirname, 'public')));
      
      // SPA fallback для всех остальных маршрутов
      app.use('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
      });
    }
    
    app.listen(PORT, () => {
      console.log(`Сервер запущен на http://localhost:${PORT}`);
      if (isDev) {
        console.log(`📝 Режим разработки (Vite middleware активен)`);
      } else {
        console.log(`🚀 Режим production (отдача статических файлов)`);
      }
    });
  } catch (error) {
    console.error('Ошибка при запуске сервера:', error);
    process.exit(1);
  }
}

start();