@echo off
setlocal enabledelayedexpansion

set CERT_DIR=..\backend\certs
set KEY_FILE=%CERT_DIR%\key.pem
set CERT_FILE=%CERT_DIR%\cert.pem

if not exist %CERT_DIR% mkdir %CERT_DIR%

if exist %KEY_FILE% if exist %CERT_FILE% (
    echo Сертификаты уже существуют: %KEY_FILE% и %CERT_FILE%
    echo Если вы хотите сгенерировать новые, удалите эти файлы вручную.
    exit /b 0
)

echo Генерация самоподписанного сертификата...
echo.
echo Введите IP-адрес (или домен), по которому будет доступен сервер.
echo Например, 192.168.1.10 или mypc.local. Если оставить пустым, будет использован localhost.
set /p USER_IP="IP (или домен): "

if "%USER_IP%"=="" (
    set USER_IP=localhost
)

:: Создание временного файла конфигурации для openssl
set OPENSSL_CONF=%TEMP%\openssl.cnf
echo [req] > %OPENSSL_CONF%
echo distinguished_name = req_distinguished_name >> %OPENSSL_CONF%
echo req_extensions = v3_req >> %OPENSSL_CONF%
echo [req_distinguished_name] >> %OPENSSL_CONF%
echo [v3_req] >> %OPENSSL_CONF%
echo subjectAltName = DNS:localhost >> %OPENSSL_CONF%

:: Если пользователь ввёл не localhost, добавляем IP в SAN
if not "%USER_IP%"=="localhost" (
    :: Проверяем, является ли введённое значение IP-адресом (простая проверка)
    echo %USER_IP% | findstr /r "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
    if %errorlevel% equ 0 (
        echo subjectAltName = DNS:localhost, IP:%USER_IP% >> %OPENSSL_CONF%
    ) else (
        echo subjectAltName = DNS:localhost, DNS:%USER_IP% >> %OPENSSL_CONF%
    )
)

:: Генерация сертификата
openssl req -x509 -newkey rsa:2048 -nodes -keyout %KEY_FILE% -out %CERT_FILE% -days 365 -subj "/CN=localhost" -config %OPENSSL_CONF% -extensions v3_req

if %errorlevel% neq 0 (
    echo Ошибка генерации сертификата.
    exit /b 1
)

:: Удаление временного конфига
del %OPENSSL_CONF% 2>nul

echo.
echo Сертификаты созданы:
echo   - %KEY_FILE%
echo   - %CERT_FILE%
echo.
echo Теперь вы можете открыть сайт по адресам:
echo   https://localhost:22869
if not "%USER_IP%"=="localhost" (
    echo   https://%USER_IP%:22869
)