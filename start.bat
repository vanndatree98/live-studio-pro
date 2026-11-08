@echo off
title YouTube Live Studio PRO
color 0A
cd /d "%~dp0"

echo =======================================================
echo     YOUTUBE LIVE STUDIO PRO
echo =======================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

echo [*] Starting Live Studio Server...
echo [*] Opening browser: http://localhost:3000
echo.

start "" http://localhost:3000

node server.js
if %errorlevel% neq 0 (
    echo.
    echo =======================================================
    echo [!] Server exited. Press any key to close.
    echo =======================================================
    pause
)
