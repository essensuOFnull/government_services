const express = require('express');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const crypto = require('crypto');

const router = express.Router();

// Вспомогательные функции
const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || './storage');
const previewTokens = new Map(); // token -> { filePath, expiresAt }

// Middleware для проверки аутентификации (импортируйте из вашего основного файла)
// Предполагается, что authenticateUser уже определён и доступен.
const authenticateUser = require('../messenger-routes.cjs'); // Подставьте правильный путь

// Очистка токенов каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of previewTokens.entries()) {
    if (data.expiresAt <= now) previewTokens.delete(token);
  }
}, 5 * 60 * 1000);

// Нормализация пути относительно корня хранилища
function normalizePath(requestPath) {
  const requested = path.normalize(requestPath || '').replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(STORAGE_ROOT, requested);
  if (!fullPath.startsWith(STORAGE_ROOT)) {
    throw new Error('Access denied');
  }
  return fullPath;
}

// Получение списка файлов и папок
router.get('/list', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.query.path || '';
    const fullPath = normalizePath(relativePath);

    const stat = await promisify(fs.stat)(fullPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, message: 'Not a directory' });
    }

    const items = await promisify(fs.readdir)(fullPath);
    const result = await Promise.all(items.map(async (item) => {
      const itemPath = path.join(fullPath, item);
      const stats = await promisify(fs.stat)(itemPath);
      return {
        name: item,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime,
        path: path.join(relativePath, item).replace(/\\/g, '/')
      };
    }));

    res.json({ success: true, items: result });
  } catch (err) {
    console.error('Storage list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Скачивание файла
router.get('/download', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.query.path;
    if (!relativePath) {
      return res.status(400).json({ success: false, message: 'Path required' });
    }
    const fullPath = normalizePath(relativePath);
    const stat = await promisify(fs.stat)(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, message: 'Not a file' });
    }

    res.download(fullPath, path.basename(fullPath));
  } catch (err) {
    console.error('Storage download error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Получение токена для предпросмотра (аналогично мессенджеру)
router.post('/preview-token', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.body.path;
    if (!relativePath) {
      return res.status(400).json({ success: false, message: 'Path required' });
    }
    const fullPath = normalizePath(relativePath);
    const stat = await promisify(fs.stat)(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, message: 'Not a file' });
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + 2 * 60 * 1000; // 2 минуты
    previewTokens.set(token, { fullPath, expiresAt });
    res.json({ success: true, token });
  } catch (err) {
    console.error('Preview token error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Предпросмотр файла по токену
router.get('/preview', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const data = previewTokens.get(token);
    if (!data || data.expiresAt <= Date.now()) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }

    const fullPath = data.fullPath;
    const stat = await promisify(fs.stat)(fullPath);
    const fileSize = stat.size;
    const mimeType = require('mime-types').lookup(fullPath) || 'application/octet-stream';

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const readStream = fs.createReadStream(fullPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });
      readStream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      const readStream = fs.createReadStream(fullPath);
      readStream.pipe(res);
    }
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;