@echo off
setlocal

set "PORT=8000"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 (
    echo Impossible d'arreter le serveur Dice Forge ^(PID %%P^).
  ) else (
    echo Serveur Dice Forge arrete ^(PID %%P^).
  )
)

if "%FOUND%"=="0" (
  echo Aucun serveur Dice Forge detecte sur le port %PORT%.
)

pause
