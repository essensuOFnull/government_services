@echo off
setlocal enabledelayedexpansion
set NODE_ENV=development
cd /d "%~dp0"
echo.
echo ========================================
echo      Government Services - Dev Mode
echo ========================================
echo.
echo Starting server on http://localhost:22869
echo Press Ctrl+C to stop the server
echo.
node backend/server.cjs
pause
