@echo off
setlocal enabledelayedexpansion
set NODE_ENV=development
cd /d "%~dp0\backend"
echo.
echo ========================================
echo   DEVELOPMENT MODE - Vite Middleware
echo ========================================
echo.
echo Starting server on http://localhost:22869
echo Press Ctrl+C to stop the server
echo.
rem node server.js
node server.cjs
pause
