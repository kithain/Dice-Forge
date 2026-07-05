@echo off
setlocal

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%/"

cd /d "%~dp0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo Dice Forge est deja lance sur %URL%
  start "" "%URL%"
  exit /b 0
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "Dice Forge Server" /min python -m http.server %PORT% --bind 127.0.0.1
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    start "Dice Forge Server" /min py -3 -m http.server %PORT% --bind 127.0.0.1
  ) else (
    echo Python est introuvable. Installe Python ou ajoute-le au PATH.
    pause
    exit /b 1
  )
)

timeout /t 1 /nobreak >nul
echo Dice Forge lance sur %URL%
start "" "%URL%"
