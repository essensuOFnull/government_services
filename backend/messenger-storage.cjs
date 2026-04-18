const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const schedule = require('node-schedule');

// Импорт Sequelize моделей
const {
  User,
  File,
  UserStorageQuota,
  Op,
  sequelize
} = require('./database.cjs');

const s3Service = require('./messenger-s3.cjs');

const uploadsDir = config.UPLOAD_DIR || path.join(__dirname, '../data/uploads');

class StorageManager {
  constructor() {
    this.cleanupInterval = null;
  }

  // Запуск очистки старых файлов
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
      const expiredDate = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const expiredFiles = await File.findAll({
        where: {
          deleted_at: { [Op.ne]: null },
          [Op.lt]: expiredDate
        }
      });

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
          await file.destroy();

          // Вычитаем размер из квоты пользователя
          await this.removeFileFromQuota(file.owner_id, file.size);

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
  async checkUserQuota(userId) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    // Получаем или создаем квоту
    let quota = await UserStorageQuota.findOne({ where: { user_id: userId } });
    if (!quota) {
      let storage_limit_bytes = null;
      if (user.role === 'guest') {
        storage_limit_bytes = 10 * 1024 * 1024 * 1024; // 10GB
      }
      quota = await UserStorageQuota.create({
        user_id: userId,
        storage_limit_bytes,
        storage_used_bytes: 0
      });
    }

    // Получаем файлы пользователя
    const userFiles = await File.findAll({
      where: { 
        owner_id: userId,
        deleted_at: null 
      }
    });

    const usedStorage = userFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    // Обновляем usedStorage если нужно
    if (quota.storage_used_bytes !== usedStorage) {
      quota.storage_used_bytes = usedStorage;
      await quota.save();
    }

    let limit = quota.storage_limit_bytes;

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
  async getStorageInfo(userId) {
    const quotaInfo = await this.checkUserQuota(userId);
    const serverFreeSpace = this.getServerFreeSpace();

    const MIN_SERVER_SPACE = 10 * 1024 * 1024 * 1024;

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
  async canAddFile(userId, fileSize) {
    const quotaInfo = await this.checkUserQuota(userId);
    const serverFreeSpace = this.getServerFreeSpace();

    const MIN_SERVER_SPACE = 10 * 1024 * 1024 * 1024;

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
  async addFileToQuota(userId, fileSize) {
    const quota = await UserStorageQuota.findOne({ where: { user_id: userId } });
    if (quota) {
      quota.storage_used_bytes = (quota.storage_used_bytes || 0) + fileSize;
      await quota.save();
    }
  }

  // Удаление размера из квоты пользователя
  async removeFileFromQuota(userId, fileSize) {
    const quota = await UserStorageQuota.findOne({ where: { user_id: userId } });
    if (quota) {
      quota.storage_used_bytes = Math.max(0, (quota.storage_used_bytes || 0) - fileSize);
      await quota.save();
    }
  }

  // Пересчет всей квоты пользователя
  async recalculateUserQuota(userId) {
    const userFiles = await File.findAll({
      where: { 
        owner_id: userId,
        deleted_at: null 
      }
    });
    const totalSize = userFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    let quota = await UserStorageQuota.findOne({ where: { user_id: userId } });
    if (quota) {
      quota.storage_used_bytes = totalSize;
      await quota.save();
    } else {
      quota = await UserStorageQuota.create({
        user_id: userId,
        storage_used_bytes: totalSize
      });
    }
    return totalSize;
  }

  // Функция получения свободного места на диске
  getServerFreeSpace() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Проверяем директорию загрузок
      const checkPath = uploadsDir || __dirname;
      
      try {
        const stats = fs.statfsSync ? fs.statfsSync(checkPath) : null;
        if (stats) {
          const freeSpace = stats.bavail * stats.bsize;
          return freeSpace;
        }
      } catch (e) {}
      
      // Для Windows или если statfsSync не доступен
      if (process.platform === 'win32') {
        try {
          const execSync = require('child_process').execSync;
          const result = execSync(
            'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace',
            { encoding: 'utf-8' }
          ).trim();
          const lines = result.split('\n');
          if (lines.length > 1) {
            return parseInt(lines[1].trim()) || 100 * 1024 * 1024 * 1024;
          }
        } catch (e) {}
      }
      
      // Fallback
      return 100 * 1024 * 1024 * 1024;
    } catch (error) {
      console.error('Ошибка получения свободного места на диске:', error);
      return 100 * 1024 * 1024 * 1024;
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