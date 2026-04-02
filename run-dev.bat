@echo off
set NODE_ENV=development
cd /d "%~dp0"

:: Генерация сертификатов (если нужно)
call ./auxiliary_scripts/generate-certs.bat
if %errorlevel% neq 0 (
    echo Ошибка при генерации сертификатов. Запуск прерван.
    pause
    exit /b 1
)

node backend/server.cjs
pause