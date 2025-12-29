# Запуск приложения

## Режим разработки (dev)

Приложение теперь работает на **одном сервере** с интегрированным Vite middleware!

### На Windows (cmd)
```bash
c:\Programming\government_services\run-dev.bat
```

### Или вручную
```bash
cd c:\Programming\government_services\backend
set NODE_ENV=development
node server.js
```

Приложение будет доступно на **`http://localhost:22869`**

### Особенности режима разработки
- ✅ Одна папка `node_modules` (в backend)
- ✅ Один порт (22869)
- ✅ Vite HMR (горячая перезагрузка) работает автоматически
- ✅ API и фронтенд на одном сервере

---

## Режим продакшена (production)

### Собрать фронтенд и запустить сервер
```bash
cd c:\Programming\government_services
npm run build:prod
```

Или отдельно:
```bash
# 1. Собрать фронтенд
npm run build

# 2. Запустить сервер в prod режиме
npm run start:prod
```

В prod режиме:
- Express отдаёт статические файлы из `backend/public`
- Нет Vite middleware (экономия ресурсов)
- Один порт, один сервер

---

## Структура проекта

```
backend/
  ├── server.js          (Express + Vite middleware в dev, статические файлы в prod)
  ├── package.json       (зависимости backend + vite + nodemon)
  ├── node_modules/      (единая папка для всех зависимостей)
  └── public/            (собранный фронтенд для prod)

src/                      (React компоненты)
├── main.jsx
├── components/
├── utils/
└── ...

vite.config.js           (build.outDir → ../backend/public)
package.json             (root scripts)
```

---

## npm скрипты

### Корень проекта
```bash
npm run dev           # запуск в режиме разработки
npm run build         # сборка фронтенда в backend/public
npm run build:prod    # сборка + запуск в prod режиме
npm run start:prod    # запуск в prod без сборки
npm run lint          # линтинг кода
npm run preview       # preview prod билда
```

### Backend (опционально)
```bash
cd backend
npm run dev           # запуск в dev режиме
npm run dev:watch    # запуск с автоперезагрузкой (nodemon)
npm start            # запуск в prod режиме
```

---

## Советы

- **HMR не работает?** Убедитесь, что запустили в режиме разработки (`NODE_ENV=development`)
- **Первый запуск медленнее** — Vite компилирует модули при первом запросе
- **Для Windows** используйте батники в папке `start/` или `run-dev.bat` в корне
- **Для Linux/Mac** установите `cross-env` и используйте скрипты с префиксом переменной окружения

---

✅ Готово! Приложение полностью объединено на одном сервере.
