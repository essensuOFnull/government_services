const fs = require('fs');
const path = require('path');

const BUCKET_NAME = process.env.S3_BUCKET || 'messenger-files';
const EMBED_S3 = process.env.EMBED_S3 === 'true' || true; // по умолчанию встроенный адаптер
const STORAGE_DIR = process.env.S3_DATA_DIR || path.resolve(__dirname, '../data/s3');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

class S3Service {
  // Ключ формируется как files/{fileId}/{filename}
  async uploadFile(fileId, filePath, filename) {
    try {
      // sanitize filename to avoid path separators or null bytes
      const safeFilename = String(filename).replace(/[\/\0]/g, '_');
      const destKey = `files/${fileId}/${safeFilename}`;

      if (EMBED_S3) {
        const destPath = path.join(STORAGE_DIR, BUCKET_NAME, destKey);
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(filePath, destPath);
        console.log(`✅ (embedded) Файл сохранён: ${destPath}`);
        return destKey;
      }

      throw new Error('Remote S3 not configured');
    } catch (error) {
      console.error('Ошибка загрузки в S3 adapter:', error);
      throw error;
    }
  }

  async downloadFile(s3Key, outputPath) {
    try {
      if (EMBED_S3) {
        const srcPath = path.join(STORAGE_DIR, BUCKET_NAME, s3Key);
        if (!fs.existsSync(srcPath)) throw new Error('Object not found');

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.copyFileSync(srcPath, outputPath);
        console.log(`✅ (embedded) Файл скопирован в: ${outputPath}`);
        return outputPath;
      }

      throw new Error('Remote S3 not configured');
    } catch (error) {
      console.error('Ошибка загрузки из S3 adapter:', error);
      throw error;
    }
  }

  async deleteFile(s3Key) {
    try {
      if (EMBED_S3) {
        const p = path.join(STORAGE_DIR, BUCKET_NAME, s3Key);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        console.log(`✅ (embedded) Файл удалён: ${p}`);
        return;
      }
      throw new Error('Remote S3 not configured');
    } catch (error) {
      console.error('Ошибка удаления из S3 adapter:', error);
      throw error;
    }
  }

  async fileExists(s3Key) {
    if (EMBED_S3) {
      const p = path.join(STORAGE_DIR, BUCKET_NAME, s3Key);
      return fs.existsSync(p);
    }
    return false;
  }

  getMimeType(filename) {
    const mime = require('mime-types');
    return mime.lookup(filename) || 'application/octet-stream';
  }

  getS3Url(s3Key) {
    // Встроенный путь через API
    // используем encodeURI чтобы сохранить слэши, но корректно закодировать UTF-8 символы (кириллица и пр.)
    return `/api/s3/${BUCKET_NAME}/${encodeURI(s3Key)}`;
  }
}

module.exports = new S3Service();
