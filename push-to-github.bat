@echo off
title Push Live Studio PRO to GitHub (vanndatree98)
color 0B
cd /d "%~dp0"

echo =======================================================
echo    PUSH LIVE STUDIO PRO TO GITHUB
echo    Repository: vanndatree98/live-studio-pro
echo =======================================================
echo.

:: Detect Git binary
set "GIT_CMD=git"
where git >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Users\PS\AppData\Local\Programs\Git\cmd\git.exe" (
        set "GIT_CMD=C:\Users\PS\AppData\Local\Programs\Git\cmd\git.exe"
        set "PATH=C:\Users\PS\AppData\Local\Programs\Git\cmd;%PATH%"
    ) else if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
        set "PATH=C:\Program Files\Git\cmd;%PATH%"
    ) else (
        echo [!] រកមិនឃើញ Git លើកុំព្យូទ័រនេះឡើយ!
        pause
        exit /b 1
    )
)

echo [*] Git ត្រូវបានរកឃើញរួចរាល់!
echo.

:: Ensure branch is main
"%GIT_CMD%" branch -M main >nul 2>nul

:: Set remote URL
"%GIT_CMD%" remote set-url origin https://github.com/vanndatree98/live-studio-pro.git >nul 2>nul
if %errorlevel% neq 0 (
    "%GIT_CMD%" remote add origin https://github.com/vanndatree98/live-studio-pro.git
)

:: Configure user info
"%GIT_CMD%" config user.name "vanndatree98"
"%GIT_CMD%" config user.email "vanndatree98@users.noreply.github.com"
"%GIT_CMD%" config credential.helper manager

:: Stage all files
echo [*] កំពុងរៀបចំឯកសារ (git add .)...
"%GIT_CMD%" add .

:: Commit
"%GIT_CMD%" commit -m "Update Live Studio PRO - Auto-Connect, Quality Selector & Full Features" >nul 2>nul

echo.
echo =======================================================
echo [*] កំពុងរុញកូដទៅកាន់ GitHub (git push -u origin main)...
echo     (ប្រសិនបើមានផ្ទាំង Browser លេចឡើង សូមចុច Sign in)
echo =======================================================
echo.

"%GIT_CMD%" push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo  ✅ ជោគជ័យ! កម្មវិធីត្រូវបាន Push ទៅ GitHub រួចរាល់ហើយ!
    echo     URL: https://github.com/vanndatree98/live-studio-pro
    echo =======================================================
) else (
    echo.
    echo =======================================================
    echo  [!] ប្រសិនបើ Push មិនទាន់ចេញ៖
    echo      - សូមពិនិត្យផ្ទាំង Browser Login ឬបញ្ចូល Token
    echo      - ឬប្រសិនបើ Repository លើ GitHub មាន README រួចហើយ
    echo        សូមចុចគ្រាប់ចុចណាមួយដើម្បី Force Push
    echo =======================================================
    echo.
    set /p FORCE_CHOICE="» តើអ្នកចង់ Force Push ដែរឬទេ? (Y/N): "
    if /i "%FORCE_CHOICE%"=="Y" (
        echo [*] កំពុង Force Push (git push -u origin main --force)...
        "%GIT_CMD%" push -u origin main --force
    )
)

echo.
pause
