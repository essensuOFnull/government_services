#!/bin/bash

# Отключаем авто-завершение при ошибках (чтобы обработать вручную)
set +e

CERT_DIR="./backend/certs"
KEY_FILE="${CERT_DIR}/key.pem"
CERT_FILE="${CERT_DIR}/cert.pem"

# Создаём папку для сертификатов, если её нет
if [ ! -d "$CERT_DIR" ]; then
    mkdir -p "$CERT_DIR"
fi

# Если оба файла уже существуют – выходим
if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    echo "Сертификаты уже существуют: $KEY_FILE и $CERT_FILE"
    echo "Если вы хотите сгенерировать новые, удалите эти файлы вручную."
    exit 0
fi

echo "Генерация самоподписанного сертификата..."
echo
echo "Введите IP-адрес (или домен), по которому будет доступен сервер."
echo "Например, 192.168.1.10 или mypc.local. Если оставить пустым, будет использован localhost."
read -p "IP (или домен): " USER_IP

if [ -z "$USER_IP" ]; then
    USER_IP="localhost"
fi

# Создаём временный конфиг для openssl
OPENSSL_CONF=$(mktemp)

{
    echo "[req]"
    echo "distinguished_name = req_distinguished_name"
    echo "req_extensions = v3_req"
    echo
    echo "[req_distinguished_name]"
    echo
    echo "[v3_req]"
    echo "subjectAltName = DNS:localhost"
} > "$OPENSSL_CONF"

# Если пользователь ввёл не localhost – добавляем альтернативное имя
if [ "$USER_IP" != "localhost" ]; then
    # Проверяем, является ли введённая строка IP-адресом (простая проверка)
    if echo "$USER_IP" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        echo "subjectAltName = DNS:localhost, IP:$USER_IP" >> "$OPENSSL_CONF"
    else
        echo "subjectAltName = DNS:localhost, DNS:$USER_IP" >> "$OPENSSL_CONF"
    fi
fi

# Генерация сертификата
openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -subj "/CN=localhost" \
    -config "$OPENSSL_CONF" -extensions v3_req

if [ $? -ne 0 ]; then
    echo "Ошибка генерации сертификата."
    rm -f "$OPENSSL_CONF"
    exit 1
fi

# Удаляем временный конфиг
rm -f "$OPENSSL_CONF"

echo
echo "Сертификаты созданы:"
echo "  - $KEY_FILE"
echo "  - $CERT_FILE"
echo
echo "Теперь вы можете открыть сайт по адресам:"
echo "  https://localhost:22869"
if [ "$USER_IP" != "localhost" ]; then
    echo "  https://${USER_IP}:22869"
fi

exit 0