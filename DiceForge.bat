@echo off
setlocal EnableExtensions

set "PORT=5000"
set "URL=http://127.0.0.1:%PORT%/"
set "APP_DIR=%~dp0app-v2"

cd /d "%APP_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js 22 ou plus recent est requis.
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo [INFO] Dice Forge V2 est deja lance sur %URL%
  start "" "%URL%"
  exit /b 0
)

if not exist "node_modules\" (
  echo [INFO] Installation locale des dependances...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERREUR] Installation impossible.
    pause
    exit /b 1
  )
)

echo [INFO] Compilation de Dice Forge V2...
call npm.cmd run build
if errorlevel 1 (
  echo [ERREUR] La compilation a echoue.
  pause
  exit /b 1
)

start "Dice Forge V2" /min /D "%APP_DIR%" cmd /c "npm.cmd start"
timeout /t 2 /nobreak >nul
start "" "%URL%"
echo [OK] Dice Forge V2 demarre sur %URL%
exit /b 0
