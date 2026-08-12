@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PORT=5000"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 (
    echo [ERREUR] Impossible d'arreter Dice Forge V2 ^(PID %%P^).
  ) else (
    echo [OK] Dice Forge V2 arrete ^(PID %%P^).
  )
)

if "!FOUND!"=="0" echo [INFO] Dice Forge V2 n'est pas lance.
pause
