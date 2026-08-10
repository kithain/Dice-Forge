@echo off
setlocal

set "PORT=5000"
set "URL=http://127.0.0.1:%PORT%/"
set "APP_DIR=%~dp0Roll20\Webtracker"
set "LOCAL_PYTHON=%APP_DIR%\.venv\Scripts\python.exe"

cd /d "%~dp0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo [INFO] Dice Forge est deja lance sur %URL%
  start "" "%URL%"
  exit /b 0
)

if exist "%LOCAL_PYTHON%" (
  start "Dice Forge" /min /D "%APP_DIR%" "%LOCAL_PYTHON%" run.py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
  start "Dice Forge" /min /D "%APP_DIR%" python run.py
  ) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
      start "Dice Forge" /min /D "%APP_DIR%" py -3 run.py
    ) else (
      echo [ERREUR] Python est introuvable. Installe Python ou ajoute-le au PATH.
      pause
      exit /b 1
    )
  )
)

echo [INFO] Demarrage du cockpit Dice Forge sur %URL%
echo [INFO] Le premier lancement peut installer les dependances Python manquantes.
exit /b 0
