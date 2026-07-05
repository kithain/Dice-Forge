@echo off
setlocal

set "PORT=8010"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 (
    echo Impossible d'arreter la vue OBS ^(PID %%P^).
  ) else (
    echo Vue OBS arretee ^(PID %%P^).
  )
)

if "%FOUND%"=="0" (
  echo Aucune vue OBS detectee sur le port %PORT%.
)

pause
