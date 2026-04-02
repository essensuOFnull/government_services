#!/bin/bash

# Устанавливаем режим разработки
export NODE_ENV=development

# Переходим в папку, где находится этот скрипт
cd "$(dirname "$0")"

# Генерация сертификатов (если нужно)
./auxiliary_scripts/generate-certs.sh
if [ $? -ne 0 ]; then
    echo "Ошибка при генерации сертификатов. Запуск прерван."
    read -p "Нажмите Enter для выхода..."
    exit 1
fi

# Запуск сервера
node backend/server.cjs

# Пауза перед закрытием терминала (аналог pause в Windows)
read -p "Нажмите Enter для выхода..."