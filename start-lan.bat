@echo off
echo ========================================
echo AI Document Editor - LAN Access Mode
echo ========================================
echo.

REM Get local IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set LOCAL_IP=%%a
    goto :found
)
:found
set LOCAL_IP=%LOCAL_IP:~1%

echo Your Local IP Address: %LOCAL_IP%
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

REM Activate virtual environment
if exist ".venv" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
) else (
    echo Creating virtual environment...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
)

REM Check if Ollama is running
echo Checking Ollama status...
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo WARNING: Ollama is not running or not accessible
    echo Please start Ollama before using the app
    echo.
)

REM Check frontend dependencies
cd frontend
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)
cd ..

echo.
echo ========================================
echo STARTING APPLICATION FOR LAN ACCESS
echo ========================================
echo.
echo Share these URLs with others on your WiFi:
echo.
echo   Frontend: http://%LOCAL_IP%:3000
echo   Backend:  http://%LOCAL_IP%:8000
echo.
echo Or use locally:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo.
echo ========================================
echo.

REM Start backend in new window
start "Backend Server" cmd /k "cd /d c:\Users\hs901\Desktop\AI_Document_Editor_Export\backend && python main.py"

REM Wait for backend to start
timeout /t 5 /nobreak >nul

REM Start frontend in new window with host flag
start "Frontend Server" cmd /k "cd /d c:\Users\hs901\Desktop\AI_Document_Editor_Export\frontend && npm run dev -- --host"

echo.
echo ========================================
echo Both servers are starting in separate windows.
echo.
echo ACCESS URLS:
echo   Phone/Other devices: http://%LOCAL_IP%:3000
echo   This computer:       http://localhost:3000
echo ========================================
echo.
pause
