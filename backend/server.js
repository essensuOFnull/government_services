const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const auth = require('./auth-middleware');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware безопасности
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
}));

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

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});