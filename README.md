# 🤖 AI Document Editor

A powerful offline AI-powered document editor with chat integration, built with React, FastAPI, and local LLM support via Ollama.

![AI Document Editor Interface](app-screenshot.png)

---

## ✨ Features

- 📄 **Document Upload** - Support for PDF, DOCX, TXT files
- 🤖 **AI Chat Assistant** - Interactive AI for document editing & creation
- 📝 **Rich Text Editor** - Full-featured document editing
- 🔍 **Semantic Search** - Find relevant content using embeddings
- 💾 **Session Management** - Auto-save and restore conversations
- 📤 **Export** - Download as PDF or DOCX
- 🌙 **Dark Mode** - Beautiful dark/light themes
- 🔒 **100% Offline** - All AI processing happens locally

---

## 🚀 Quick Start

### 1️⃣ Install Ollama

Download and install Ollama from: https://ollama.ai/download

### 2️⃣ Pull the AI Models

```bash
# Chat model
ollama pull gemma3:latest

# Embedding model (for semantic search)
ollama pull nomic-embed-text:latest
```

### 3️⃣ Start the Application

**Windows - Choose one:**

| Script | Use Case |
|--------|----------|
| `start-portable.bat` | 🖥️ **Local only** - Access from this computer |
| `start-lan.bat` | 📱 **LAN access** - Share with phone/other devices on WiFi |

```bash
# For local use only
start-portable.bat

# For LAN/WiFi access  
start-lan.bat
```

### 4️⃣ Open in Browser

- **App**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs

**Default Login:**
- Email: `admin@localhost`
- Password: `admin123`

---

## 📜 Startup Scripts Explained

### `start-portable.bat` - Local Mode
- ✅ Creates virtual environment (`.venv`) if missing
- ✅ Installs Python dependencies from `requirements.txt`
- ✅ Installs frontend dependencies (`npm install`)
- ✅ Starts backend on `localhost:8000`
- ✅ Starts frontend on `localhost:3000`
- ✅ Checks if Ollama is running
- 🔒 **Access**: Only from this computer

### `start-lan.bat` - LAN/WiFi Access Mode
- ✅ All features of portable mode, **PLUS:**
- ✅ Detects your local IP address automatically
- ✅ Starts frontend with `--host` flag (exposes to network)
- 📱 **Access**: From any device on the same WiFi network
- 🔗 **Share URL**: `http://YOUR_IP:3000`

**Example LAN Access:**
```
Your Local IP Address: 192.168.1.100

Share these URLs with others on your WiFi:
  Phone/Tablet: http://192.168.1.100:3000
  This computer: http://localhost:3000
```

---

## 🧠 Model Configuration

All AI model settings are in **`model-config.json`**:

```json
{
  "model_name": "gemma3:latest",
  "embedding_model": "nomic-embed-text:latest",
  "model_settings": {
    "temperature": 0.5,
    "num_predict": 2048,
    "timeout": 300,
    "base_url": "http://localhost:11434"
  }
}
```

### Changing Models

1. Edit `model-config.json`
2. Change `model_name` (chat) or `embedding_model` (search)
3. Pull the new model: `ollama pull <model-name>`
4. Restart the backend

**Recommended Chat Models:**

| Model | Size | Best For |
|-------|------|----------|
| `gemma3:latest` | ~5GB | General use (default) |
| `llama3.2:latest` | ~2GB | Fast responses |
| `qwen2.5:32b` | ~20GB | Complex reasoning |
| `codellama:latest` | ~4GB | Programming tasks |

**Recommended Embedding Models:**

| Model | Dimensions | Best For |
|-------|------------|----------|
| `nomic-embed-text:latest` | 768 | High quality (default) |
| `mxbai-embed-large:latest` | 1024 | Large embeddings |
| `all-minilm:latest` | 384 | Fast, lightweight |

---

## 📁 Project Structure

```
AI_Document_Editor/
├── backend/               # FastAPI server
│   ├── main.py           # Entry point
│   ├── src/              # Source code
│   │   ├── services/     # LLM, Vector, Document services
│   │   ├── routes/       # API endpoints
│   │   └── core/         # Configuration (model defaults here)
│   └── data/             # User data (ignored by git)
├── frontend/              # React app
│   ├── src/              # Components & pages
│   └── package.json
├── start-portable.bat     # 🖥️ Start for local use
├── start-lan.bat          # 📱 Start for LAN/WiFi access
├── model-config.json      # ⭐ AI model settings
└── .env.example           # Environment template
```

---

## ⚙️ Environment Setup

1. Copy the example environment file:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Generate a new secret key:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

3. Update `backend/.env` with your new secret key

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Ollama not running" | Run `ollama serve` in a terminal |
| Model not found | Run `ollama pull gemma3:latest` |
| Embedding model not found | Run `ollama pull nomic-embed-text:latest` |
| Port 3000 in use | Change port in `frontend/vite.config.ts` |
| Port 8000 in use | Change port in `backend/main.py` |
| Can't access from phone | Use `start-lan.bat` instead of `start-portable.bat` |

---

## 📄 License

Open source - feel free to use and modify!

---

## 🙏 Tech Stack

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Python FastAPI + LangChain
- **Chat AI**: Ollama (`gemma3:latest`)
- **Embeddings**: Ollama (`nomic-embed-text:latest`)
- **Vector DB**: ChromaDB
- **OCR**: Tesseract + PaddleOCR
