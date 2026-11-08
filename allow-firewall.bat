@echo off
title Allow Windows Firewall for Live Studio Port 3000
color 0B
echo =================================================================
echo   [FIREWALL CONFIG] Open Port 3000 on Windows Firewall
echo   Allow other computers and phones on Wi-Fi to open Live Studio
echo =================================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Administrator permission required!
    echo     Please Right-Click "allow-firewall.bat" and choose:
    echo     "Run as administrator"
    echo.
    echo [!] Som Right-Click leu file nih heuy reus "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo [*] Adding inbound rule to Windows Defender Firewall (Port 3000 TCP)...
netsh advfirewall firewall delete rule name="Live Studio Port 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Live Studio Port 3000" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo [OK] SUCCESS! Port 3000 is now allowed on Windows Firewall!
    echo [OK] Baek Port 3000 ban chorkchey! Devices on Wi-Fi can now connect.
) else (
    echo.
    echo [!] Failed to update Firewall rule. Please check Admin permissions.
)
echo.
pause
