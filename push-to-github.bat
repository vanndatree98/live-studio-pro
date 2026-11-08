@echo off
title Push Live Studio PRO to GitHub
color 0B
cd /d "%~dp0"

echo =======================================================
echo    PUSH LIVE STUDIO PRO TO GITHUB (ស្វ័យប្រវត្តិ)
echo =======================================================
echo.

:: Detect Git binary
set "GIT_CMD=git"
where git >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
        set "PATH=C:\Program Files\Git\cmd;%PATH%"
    ) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
        set "GIT_CMD=C:\Program Files (x86)\Git\cmd\git.exe"
        set "PATH=C:\Program Files (x86)\Git\cmd;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" (
        set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
        set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
    ) else (
        echo [!] រកមិនឃើញ Git លើកុំព្យូទ័រនេះឡើយ!
        echo     សូមរង់ចាំបន្តិច ឬដំឡើង Git ពី https://git-scm.com
        pause
        exit /b 1
    )
)

echo [*] Git ត្រូវបានរកឃើញរួចរាល់!
echo.

:: Check Git User Config
"%GIT_CMD%" config user.name >nul 2>nul
if %errorlevel% neq 0 (
    echo [i] កំណត់ព័ត៌មាន Git User ជាមុនសិន៖
    set /p GIT_NAME="» បញ្ចូលឈ្មោះរបស់អ្នក (Your Name): "
    set /p GIT_EMAIL="» បញ្ចូល Email របស់អ្នក (Your Email): "
    "%GIT_CMD%" config --global user.name "%GIT_NAME%"
    "%GIT_CMD%" config --global user.email "%GIT_EMAIL%"
    echo [*] បានកំណត់ User Git រួចរាល់!
    echo.
)

:: Initialize repo if needed
if not exist ".git" (
    echo [*] កំពុងបង្កើត Git Repository (git init)...
    "%GIT_CMD%" init -b main
    echo.
) else (
    "%GIT_CMD%" branch -M main >nul 2>nul
)

:: Add files
echo [*] កំពុងរៀបចំឯកសារ (git add .)...
"%GIT_CMD%" add .

:: Commit
set COMMIT_MSG=Update Live Studio PRO
set /p USER_MSG="» បញ្ចូលចំណាំ Commit (ចុច Enter យកលំនាំដើម): "
if not "%USER_MSG%"=="" set "COMMIT_MSG=%USER_MSG%"

echo [*] កំពុង Commit: "%COMMIT_MSG%"...
"%GIT_CMD%" commit -m "%COMMIT_MSG%"
echo.

:: Check remote origin
"%GIT_CMD%" remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [i] មិនទាន់មាន GitHub Repository Remote នៅឡើយទេ។
    echo     សូមចូលទៅកាន់ https://github.com/new ដើម្បីបង្កើត Repo ថ្មីមួយ។
    echo.
    set /p REPO_URL="» បិទភ្ជាប់ (Paste) GitHub Repo URL (ឧ. https://github.com/user/live-studio.git): "
    if not "%REPO_URL%"=="" (
        "%GIT_CMD%" remote add origin %REPO_URL%
        echo [*] បានភ្ជាប់ទៅកាន់ Repo: %REPO_URL%
    ) else (
        echo [!] គ្មាន Repo URL ឡើយ។ មិនអាច Push បានទេ។
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%a in ('"%GIT_CMD%" remote get-url origin') do set CURRENT_REPO=%%a
    echo [*] Remote GitHub បច្ចុប្បន្ន៖ %CURRENT_REPO%
    echo     (ចុច Enter ដើម្បីបន្ត Push ទៅកាន់ Repo នេះ)
    set /p NEW_REPO="» ឬបញ្ចូល Repo URL ថ្មី (ទុកទទេបើមិនប្តូរ): "
    if not "%NEW_REPO%"=="" (
        "%GIT_CMD%" remote set-url origin %NEW_REPO%
        echo [*] បានប្តូរទៅកាន់៖ %NEW_REPO%
    )
)
echo.

:: Push to GitHub
echo =======================================================
echo [*] កំពុង Push ឡើងទៅ GitHub (git push -u origin main)...
echo =======================================================
echo.
"%GIT_CMD%" push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo  ✅ ជោគជ័យ! កម្មវិធីត្រូវបាន Push ទៅ GitHub រួចរាល់ហើយ!
    echo =======================================================
) else (
    echo.
    echo =======================================================
    echo  [!] Push មិនទាន់ជោគជ័យ។ ប្រសិនបើ GitHub ទាមទារ Login
    echo      សូមបញ្ចូល GitHub Username និង Personal Access Token (PAT)។
    echo =======================================================
)

echo.
pause
