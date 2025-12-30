# Government Services - Мессенджер

Полнофункциональная система коммуникации с поддержкой реального времени.

## Основные возможности 🎉

- 💬 **Мессенджер** с WebSocket для доставки сообщений в реальном времени
- 👥 **Статусы пользователей**: онлайн/офлайн, индикаторы печати и загрузки
- 📦 **Управление файлами**: загрузка, скачивание, удаление с объектным хранилищем S3
- 💾 **Сжатие данных**: текстовые сообщения сжимаются с zlib
- 📊 **Система квот**: разные лимиты для разных ролей пользователей
- 🧹 **Автоматическая очистка**: удаление файлов через 30 дней
- 🔐 **Безопасность**: валидация MIME-типов, проверка квот, аутентификация

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Запуск мессенджера (с S3rver)

**Windows:**
```bash
run-messenger.bat
```

**Linux/macOS:**
```bash
bash run-messenger.sh
```

### 3. Доступ

- **Web**: http://localhost:22869
- **WebSocket**: ws://localhost:22869/ws/messenger
- **S3 Storage**: http://localhost:4569

## Компоненты

### Backend

- **Express** сервер на Node.js
- **SQLite** для основной БД (сжатые сообщения)
- **WebSocket** для реального времени
- **S3** для хранения файлов
- **Multer** для загрузки файлов

### Frontend

- **React 19** компонент мессенджера
- Поддержка файлов и медиа
- Индикаторы статусов в реальном времени

## Структура файлов

```
backend/
├── messenger-db.cjs          # SQLite БД
├── messenger-websocket.cjs   # WebSocket сервер
├── messenger-upload.cjs      # Загрузка файлов
├── messenger-s3.cjs          # S3 хранилище
├── messenger-storage.cjs     # Менеджер квот
├── messenger-routes.cjs      # API маршруты

src/components/
├── Messenger.jsx             # React компонент
└── Messenger.css             # Стили
```

## Система квот

| Роль | Лимит |
|------|-------|
| Гость | 10 GB |
| Спонсор | ∞ |
| Член Подбредья | ∞ |

## API Документация

Полная документация: [MESSENGER.md](MESSENGER.md)

### Основные endpoints

- `GET /api/messenger/init-db` - инициализация БД
- `GET /api/messenger/storage-info` - информация о хранилище
- `POST /api/messenger/upload-file` - загрузка файла
- `GET /api/messenger/download-file/:fileId` - скачивание
- `POST /api/messenger/conversation/create` - создать разговор
- `GET /api/messenger/conversations` - список разговоров

## Тестирование

```bash
npm run messenger:test
```

## Примеры

Примеры curl запросов: [MESSENGER_API_EXAMPLES.sh](MESSENGER_API_EXAMPLES.sh)

## Документация

- [MESSENGER.md](MESSENGER.md) - Полная документация API и WebSocket
- [MESSENGER_IMPLEMENTATION.md](MESSENGER_IMPLEMENTATION.md) - Техническая реализация
- [.env.messenger](.env.messenger) - Переменные окружения

## Разработка

- **Dev режим**: `npm run dev` - запуск с Vite HMR
- **Production**: `npm run start:prod` - минифицированная сборка
- **Линтинг**: `npm run lint` - проверка кода

## Требования

- Node.js 16+
- npm или yarn
- Windows/Linux/macOS

## Лицензия

MIT

---

**Статус**: ✅ Полностью реализовано и протестировано

