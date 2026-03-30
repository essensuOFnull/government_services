@echo off
setlocal enabledelayedexpansion
set NODE_ENV=development
cd /d "%~dp0"

echo.
echo ========================================
echo      Government Services - Dev Mode
echo ========================================
echo.

:: Генерация сертификатов (если нужно)
call ./auxiliary_scripts/generate-certs.bat
if %errorlevel% neq 0 (
    echo Ошибка при генерации сертификатов. Запуск прерван.
    pause
    exit /b 1
)

echo Starting server on https://localhost:22869
echo Press Ctrl+C to stop the server
echo.
node backend/server.cjs
pause