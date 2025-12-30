const schedule = require('node-schedule');
const { Files, Storage, Users } = require('./messenger-db.cjs');
const s3Service = require('./messenger-s3.cjs');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '../data/uploads');

class StorageManager {
  constructor() {
    this.cleanupInterval = null;
  }

  // Запуск очистки старых файлов (каждый день в 2:00 утра)
  startCleanupScheduler() {
    this.cleanupInterval = schedule.scheduleJob('0 2 * * *', async () => {
      console.log('🧹 Начинается очистка устаревших файлов...');
      await this.cleanupExpiredFiles();
    });

    console.log('📅 Планировщик очистки инициализирован');
  }

  // Очистка файлов, удаленных 30+ дней назад
  async cleanupExpiredFiles() {
    try {
      const expiredFiles = Files.getExpiredFiles(30);

      for (const file of expiredFiles) {
        try {
          // Удаляем из S3
          await s3Service.deleteFile(file.s3_key);

          // Удаляем локальный временный файл если существует
          const localPath = path.join(uploadsDir, file.id + path.extname(file.original_filename));
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }

          // Удаляем из БД
          Files.permanentlyDelete(file.id);

          // Вычитаем размер из квоты пользователя
          Storage.removeFromUsedStorage(file.owner_id, file.size);

          console.log(`🗑️  Удален файл: ${file.id} (${file.original_filename})`);
        } catch (error) {
          console.error(`❌ Ошибка удаления файла ${file.id}:`, error);
        }
      }

      console.log(`✅ Очистка завершена. Удалено файлов: ${expiredFiles.length}`);
    } catch (error) {
      console.error('❌ Ошибка при очистке файлов:', error);
    }
  }

  // Проверка квоты пользователя
  checkUserQuota(userId) {
    const user = Users.getById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    const quota = Storage.getQuota(userId);
    const userFiles = Files.getUserFiles(userId);
    const usedStorage = userFiles.reduce((sum, file) => sum + file.size, 0);

    // Определяем лимит в зависимости от роли
    let limit = null; // null = без ограничений
    if (user.role === 'guest') {
      limit = 10 * 1024 * 1024 * 1024; // 10GB
    }

    return {
      userId,
      role: user.role,
      limitBytes: limit,
      usedBytes: usedStorage,
      availableBytes: limit ? limit - usedStorage : null,
      isLimitExceeded: limit ? usedStorage >= limit : false,
      percentageUsed: limit ? Math.round((usedStorage / limit) * 100) : null
    };
  }

  // Получение информации о хранилище для фронтенда
  getStorageInfo(userId) {
    const quotaInfo = this.checkUserQuota(userId);
    const serverFreeSpace = this.getServerFreeSpace();

    const MIN_SERVER_SPACE = 10 * 1024 * 1024 * 1024; // 10GB

    if (serverFreeSpace < MIN_SERVER_SPACE) {
      return {
        success: true,
        message: `На сервере осталось меньше места, чем вам положено, а именно ${this.formatBytes(serverFreeSpace)} общих байт`,
        quota: quotaInfo,
        serverStatus: {
          freeSpace: serverFreeSpace,
          isLowSpace: true
        }
      };
    }

    const limitText = quotaInfo.limitBytes 
      ? `доступно ${this.formatBytes(quotaInfo.availableBytes)} из ${this.formatBytes(quotaInfo.limitBytes)}`
      : 'без ограничений (спонсор/член Подбредья)';

    return {
      success: true,
      message: limitText,
      quota: quotaInfo,
      serverStatus: {
        freeSpace: serverFreeSpace,
        isLowSpace: false
      }
    };
  }

  // Проверка перед добавлением файла
  canAddFile(userId, fileSize) {
    const quotaInfo = this.checkUserQuota(userId);
    const serverFreeSpace = this.getServerFreeSpace();

    const MIN_SERVER_SPACE = 10 * 1024 * 1024 * 1024; // 10GB

    // Проверка свободного места на сервере
    if (serverFreeSpace < MIN_SERVER_SPACE) {
      return {
        allowed: false,
        reason: 'На сервере недостаточно свободного места'
      };
    }

    // Проверка лимита пользователя
    if (quotaInfo.limitBytes) {
      const newTotal = quotaInfo.usedBytes + fileSize;
      if (newTotal > quotaInfo.limitBytes) {
        return {
          allowed: false,
          reason: `Превышена квота хранилища. Максимально: ${this.formatBytes(quotaInfo.limitBytes)}, сейчас используется: ${this.formatBytes(quotaInfo.usedBytes)}`
        };
      }
    }

    return {
      allowed: true
    };
  }

  // Добавление размера к квоте пользователя
  addFileToQuota(userId, fileSize) {
    Storage.addToUsedStorage(userId, fileSize);
  }

  // Удаление размера из квоты пользователя
  removeFileFromQuota(userId, fileSize) {
    Storage.removeFromUsedStorage(userId, fileSize);
  }

  // Пересчет всей квоты пользователя
  recalculateUserQuota(userId) {
    const userFiles = Files.getUserFiles(userId);
    const totalSize = userFiles.reduce((sum, file) => sum + file.size, 0);

    Storage.updateQuota(userId, totalSize);
    return totalSize;
  }

  // Функция получения свободного места на диске
  getServerFreeSpace() {
    try {
      const execSync = require('child_process').execSync;
      let cmd;

      if (process.platform === 'win32') {
        // Для Windows: получаем свободное место на диске D: (или можно указать другой диск)
        cmd = `powershell -NoProfile -Command "[System.IO.DriveInfo]::GetDrives() | Where-Object {$_.Name -eq 'C:\\\\'} | Select-Object -ExpandProperty AvailableFreeSpace"`;
      } else {
        // Для Linux/Mac
        cmd = `df / | tail -1 | awk '{print $4 * 1024}'`;
      }

      const result = execSync(cmd, { encoding: 'utf-8' }).trim();
      const freeSpace = parseInt(result) || 0;
      return freeSpace;
    } catch (error) {
      console.error('Ошибка получения свободного места на диске:', error);
      return 0;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  stop() {
    if (this.cleanupInterval) {
      this.cleanupInterval.cancel();
      console.log('⏹️  Планировщик очистки остановлен');
    }
  }
}

module.exports = new StorageManager();
