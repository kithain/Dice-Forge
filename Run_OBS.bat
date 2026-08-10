@echo off
setlocal

set "ROOM=%~1"
set "URL=http://127.0.0.1:5000/overlays/rolls"
if not "%ROOM%"=="" set "URL=%URL%?room=%ROOM%"

call "%~dp0DiceForge.bat"
timeout /t 2 /nobreak >nul
start "" "%URL%"
