@echo off
setlocal

echo ========================================
echo Lancement de Dice-Forge + Webtracker
echo ========================================
echo.

cd /d "%~dp0"

:: Vérifier si Dice-Forge est déjà en cours (port 8000)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do (
  echo [INFO] Dice-Forge est deja lance sur http://127.0.0.1:8000/
  goto :launch_webtracker
)

:: Lancer Dice-Forge (port 8000)
echo [INFO] Lancement de Dice-Forge sur le port 8000...
where python >nul 2>nul
if %errorlevel%==0 (
  start "Dice Forge Server" /min python -m http.server 8000 --bind 127.0.0.1
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    start "Dice Forge Server" /min py -3 -m http.server 8000 --bind 127.0.0.1
  ) else (
    echo [ERREUR] Python est introuvable. Installe Python ou ajoute-le au PATH.
    pause
    exit /b 1
  )
)

timeout /t 2 /nobreak >nul
echo [OK] Dice-Forge lance sur http://127.0.0.1:8000/

:launch_webtracker
:: Vérifier si Webtracker est déjà en cours (port 5000)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
  echo [INFO] Webtracker est deja lance sur http://127.0.0.1:5000/
  goto :open_browsers
)

:: Lancer Webtracker (port 5000)
echo [INFO] Lancement de Webtracker sur le port 5000...
cd /d "%~dp0Roll20\Webtracker"
start "Webtracker Server" /min run.py

timeout /t 3 /nobreak >nul
echo [OK] Webtracker lance sur http://127.0.0.1:5000/

:open_browsers
echo.
echo [INFO] Ouverture des navigateurs...
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8000/"
start "" "http://127.0.0.1:5000/"

echo.
echo ========================================
echo Applications lancees avec succes !
echo - Dice-Forge: http://127.0.0.1:8000/
echo - Webtracker: http://127.0.0.1:5000/
echo - Battle Map: http://127.0.0.1:5000/battlemap
echo - Vue OBS: http://127.0.0.1:5000/obs
echo ========================================
echo.
