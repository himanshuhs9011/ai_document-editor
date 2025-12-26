@echo off
REM Ollama installation script for Windows

echo Installing Ollama for Windows...

REM Check if Ollama is already installed
ollama --version >nul 2>&1
if not errorlevel 1 (
    echo Ollama is already installed.
    exit /b 0
)

REM Try to download and install Ollama
echo Downloading Ollama installer...
powershell -Command "& {Invoke-WebRequest -Uri 'https://ollama.ai/download/ollama-windows-amd64.exe' -OutFile 'ollama-installer.exe'}" >nul 2>&1

if not exist "ollama-installer.exe" (
    echo WARNING: Failed to download Ollama installer automatically.
    echo.
    echo Please install Ollama manually:
    echo 1. Go to: https://ollama.ai/download
    echo 2. Download the Windows installer
    echo 3. Run the installer
    echo 4. Restart this script
    echo.
    pause
    exit /b 1
)

REM Install Ollama silently
echo Installing Ollama...
start /wait ollama-installer.exe /S

REM Wait for installation to complete
timeout /t 5 /nobreak >nul

REM Clean up installer
if exist "ollama-installer.exe" del ollama-installer.exe

REM Verify installation
ollama --version >nul 2>&1
if errorlevel 1 (
    echo WARNING: Ollama installation may have failed.
    echo Please restart your command prompt and try again.
    echo If the issue persists, install Ollama manually from: https://ollama.ai/download
    exit /b 1
)

echo ✅ Ollama installed successfully!

REM Add Ollama to PATH (if not already added)
setx PATH "%PATH%;%USERPROFILE%\AppData\Local\Programs\Ollama" /M

echo ✅ Ollama installed successfully!
echo Please restart your command prompt or rerun the setup script.

pause
