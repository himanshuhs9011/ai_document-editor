@echo off
echo ========================================
echo AI Document Editor - Portable Version
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

REM Check if virtual environment exists, create if not
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

REM Activate virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate.bat

REM Install/update requirements
echo Installing requirements...
pip install -r requirements.txt

REM Check if Ollama is running
echo Checking Ollama status...
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo WARNING: Ollama is not running or not accessible
    echo Please start Ollama before using the app
    echo You can install Ollama from: https://ollama.ai/download
    echo.
)

REM Check and install frontend dependencies
echo Checking frontend dependencies...
cd frontend
if not exist "node_modules" (
    echo Installing frontend dependencies... This may take a few minutes...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies
        echo Please ensure Node.js and npm are installed
        cd ..
        pause
        exit /b 1
    )
) else (
    echo Frontend dependencies already installed
)
cd ..

REM Start the application
echo.
echo Starting AI Document Editor...
echo Backend will be available at: http://localhost:8000
echo Frontend will be available at: http://localhost:3000
echo.
echo Press Ctrl+C to stop the application
echo.

REM Start backend
cd backend
start "Backend Server" python main.py

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend
cd ../frontend
start "Frontend Dev Server" npm run dev

echo.
echo Application started successfully!
echo Close this window to stop all services
pause
