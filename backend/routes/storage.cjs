const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const router = express.Router();
const { promisify } = require('util');
const mime = require('mime-types');

const stat = promisify(fs.stat);
const access = promisify(fs.access);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || './storage');
const HLS_CACHE_DIR = path.join(__dirname, '../hls_cache');

// Хранилища токенов
const previewTokens = new Map();   // token -> { fullPath, expiresAt }
const audioTokens = new Map();     // token -> { fullPath, expiresAt }
const hlsTokens = new Map();       // token -> { cacheKey, expiresAt }

// Очистка токенов каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of previewTokens.entries()) if (data.expiresAt <= now) previewTokens.delete(token);
  for (const [token, data] of audioTokens.entries()) if (data.expiresAt <= now) audioTokens.delete(token);
  for (const [token, data] of hlsTokens.entries()) if (data.expiresAt <= now) hlsTokens.delete(token);
}, 5 * 60 * 1000);

const authenticateUser = require('../messenger-routes.cjs'); // ваш мидлвар

function normalizePath(requestPath) {
  const requested = path.normalize(requestPath || '').replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(STORAGE_ROOT, requested);
  if (!fullPath.startsWith(STORAGE_ROOT)) throw new Error('Access denied');
  return fullPath;
}

// ---------- Существующие эндпоинты (list, download, preview-token, preview, preview-release) ----------
router.get('/list', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.query.path || '';
    const fullPath = normalizePath(relativePath);
    const stats = await stat(fullPath);
    if (!stats.isDirectory()) return res.status(400).json({ success: false, message: 'Not a directory' });
    const items = await readdir(fullPath);
    const result = await Promise.all(items.map(async (item) => {
      const itemPath = path.join(fullPath, item);
      const s = await stat(itemPath);
      return {
        name: item,
        type: s.isDirectory() ? 'directory' : 'file',
        size: s.size,
        modified: s.mtime,
        path: path.join(relativePath, item).replace(/\\/g, '/')
      };
    }));
    res.json({ success: true, items: result });
  } catch (err) {
    console.error('Storage list error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/download', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.query.path;
    if (!relativePath) return res.status(400).json({ success: false, message: 'Path required' });
    const fullPath = normalizePath(relativePath);
    const stats = await stat(fullPath);
    if (!stats.isFile()) return res.status(400).json({ success: false, message: 'Not a file' });
    res.download(fullPath, path.basename(fullPath));
  } catch (err) {
    console.error('Storage download error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/preview-token', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.body.path;
    if (!relativePath) return res.status(400).json({ success: false, message: 'Path required' });
    const fullPath = normalizePath(relativePath);
    const stats = await stat(fullPath);
    if (!stats.isFile()) return res.status(400).json({ success: false, message: 'Not a file' });
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + 2 * 60 * 1000;
    previewTokens.set(token, { fullPath, expiresAt });
    res.json({ success: true, token });
  } catch (err) {
    console.error('Preview token error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/preview', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });
    const data = previewTokens.get(token);
    if (!data || data.expiresAt <= Date.now()) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    const fullPath = data.fullPath;
    const stats = await stat(fullPath);
    const fileSize = stats.size;
    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
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
      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (err) {
    console.error('Preview error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/preview-release/:token', authenticateUser, (req, res) => {
  try {
    const { token } = req.params;
    const rec = previewTokens.get(token);
    if (!rec) return res.status(404).json({ success: false, message: 'Token not found' });
    previewTokens.delete(token);
    res.json({ success: true });
  } catch (err) {
    console.error('preview-release error', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- НОВЫЕ ЭНДПОИНТЫ ДЛЯ АУДИОДОРОЖЕК ----------
router.get('/audio-tracks', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.query.path;
    if (!relativePath) return res.status(400).json({ success: false, message: 'Path required' });
    const fullPath = normalizePath(relativePath);
    const stats = await stat(fullPath);
    if (!stats.isFile()) return res.status(400).json({ success: false, message: 'Not a file' });

    // Формируем путь к папке с аудио
    const dirname = path.dirname(fullPath);
    const basename = path.basename(fullPath, path.extname(fullPath));
    const audioDir = path.join(dirname, '.audio', basename);
    const jsonPath = path.join(audioDir, 'tracks.json');

    let tracksMeta = [];
    try {
      await access(jsonPath);
      const jsonData = await readFile(jsonPath, 'utf8');
      tracksMeta = JSON.parse(jsonData).tracks;
    } catch (err) {
      // Нет аудиодорожек
      return res.json({ success: true, tracks: [] });
    }

    // Для каждой дорожки создаём временный токен
    const resultTracks = [];
    for (const track of tracksMeta) {
      const trackFile = path.join(audioDir, track.file);
      // Проверяем, что файл существует
      try {
        await access(trackFile);
      } catch {
        continue; // пропускаем отсутствующие
      }
      const token = crypto.randomBytes(24).toString('base64url');
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 минут для воспроизведения
      audioTokens.set(token, { fullPath: trackFile, expiresAt });
      resultTracks.push({
        index: track.index,
        file: track.file,
        language: track.language,
        title: track.title,
        codec: track.codec,
        bitrate: track.bitrate,
        duration: track.duration,
        url: `/api/storage/audio-preview?token=${token}`
      });
    }

    res.json({ success: true, tracks: resultTracks });
  } catch (err) {
    console.error('Audio tracks error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/audio-preview', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });
    const data = audioTokens.get(token);
    if (!data || data.expiresAt <= Date.now()) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    const fullPath = data.fullPath;
    const stats = await stat(fullPath);
    const fileSize = stats.size;
    const mimeType = mime.lookup(fullPath) || 'audio/mp4';
    // Аудиофайлы обычно не range, но можно оставить поддержку
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
      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (err) {
    console.error('Audio preview error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- HLS-часть (оставляем, но в данном сценарии не используется) ----------
function getCacheKey(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(srcPath, destPath);
    else await copyFile(srcPath, destPath);
  }
}

async function findHlsNearby(filePath) {
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath, path.extname(filePath));
  const hlsDir = path.join(dir, '_hls', basename);
  try {
    await access(hlsDir);
    await access(path.join(hlsDir, 'playlist.m3u8'));
    return hlsDir;
  } catch { return null; }
}

async function prepareHlsCache(filePath, cacheKey) {
  const cacheDir = path.join(HLS_CACHE_DIR, cacheKey);
  try {
    await access(path.join(cacheDir, 'playlist.m3u8'));
    return true;
  } catch {
    const hlsDir = await findHlsNearby(filePath);
    if (!hlsDir) return false;
    await copyDir(hlsDir, cacheDir);
    return true;
  }
}

router.get('/hls-check', authenticateUser, async (req, res) => {
  try {
    const relativePath = req.query.path;
    if (!relativePath) return res.status(400).json({ success: false, message: 'Path required' });
    const fullPath = normalizePath(relativePath);
    const stats = await stat(fullPath);
    if (!stats.isFile()) return res.status(400).json({ success: false, message: 'Not a file' });
    const cacheKey = getCacheKey(fullPath);
    const isReady = await prepareHlsCache(fullPath, cacheKey);
    if (res.headersSent) return;
    if (isReady) {
      const hlsToken = crypto.randomBytes(24).toString('base64url');
      const expiresAt = Date.now() + 2 * 60 * 1000;
      hlsTokens.set(hlsToken, { cacheKey, expiresAt });
      res.json({ success: true, ready: true, hlsUrl: `/api/storage/hls-playlist/${hlsToken}/playlist.m3u8` });
    } else {
      res.json({ success: true, ready: false, message: 'HLS not found' });
    }
  } catch (err) {
    console.error('HLS check error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/hls-playlist/:token/*', async (req, res) => {
  try {
    const token = req.params.token;
    const tokenData = hlsTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    const { cacheKey } = tokenData;
    const filePath = req.params[0];
    const fullPath = path.join(HLS_CACHE_DIR, cacheKey, filePath);
    const realPath = path.resolve(fullPath);
    if (!realPath.startsWith(HLS_CACHE_DIR)) return res.status(403).json({ success: false, message: 'Forbidden' });
    res.sendFile(realPath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ success: false, message: 'File not found' });
    });
  } catch (err) {
    console.error('HLS serve error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;