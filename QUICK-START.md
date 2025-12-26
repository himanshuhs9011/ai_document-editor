# AI Document Editor - Portable Deployment Package

## Quick Setup on New PC:

1. Copy this entire folder to the new PC
2. Install Python 3.9+ from: https://python.org/downloads
3. Install Node.js 16+ from: https://nodejs.org  
4. Run: start-app.bat
5. Wait for setup to complete (first run takes longer)
6. Open: http://localhost:3000

## Requirements:
- Windows 10/11
- 8GB RAM (16GB recommended)
- 5GB free space
- Internet connection (for initial setup only)

## Features:
- Complete offline operation after setup
- Local AI document processing
- PDF viewer and editor
- Session history
- Export to PDF/DOCX
- Smart environment management (preserves dependencies)
- Configurable AI models via model-config.json

## Advanced Usage:

### Changing AI Models:
1. Run: `change-model.bat` - Interactive model selector
2. Or edit `model-config.json` manually
3. Restart the application

### Environment Management:
- `start-app.bat` - Smart startup (preserves existing environment)
- `clean-environment.bat` - Force clean setup (removes all dependencies)

### Available Models:
- gemma3:latest (default) - Fast and efficient
- qwen2.5:32b - Large model for complex tasks
- llama3.2:latest - Balanced performance
- codellama:latest - Code-specialized
- mistral:latest - Good instruction following

## Troubleshooting:
- If Python/Node not found: Install from official websites
- If dependencies fail: Check internet connection
- If ports in use: Change ports in backend/main.py
- If "Failed to fetch" error: Wait 30 seconds for backend to start fully
- If chat shows errors: Run test-api.bat to check backend status
- For support: Check logs/ directory

## Testing:
- Run `test-api.bat` to verify backend is working
- Check http://localhost:8000/api/health for API status
- Frontend errors usually mean backend isn't ready yet

## Files Included:
- start-app.bat - Smart one-click startup script (force clean)
- clean-environment.bat - Force clean setup (deprecated - now default)
- change-model.bat - Interactive model changer
- test-api.bat - Quick API testing script
- setup_ollama_model.py - Intelligent model management
- model-config.json - AI model configuration
- requirements.txt - Complete Python dependencies (pip freeze)
- backend/ - Python FastAPI server
- frontend/ - React web interface  
- install-ollama.bat - AI service installer

This package contains everything needed to run the AI Document Editor.
Environment is recreated fresh on every run with exact working versions.
