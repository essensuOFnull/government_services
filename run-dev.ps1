$env:NODE_ENV = "development"
Set-Location "c:\Programming\government_services\backend"
Write-Host "🚀 Запуск приложения в режиме разработки..."
Write-Host "📍 Приложение доступно на http://localhost:22869"
node server.cjs
