# 🤖 AI Document Editor

An AI-powered document editor: a Word-style editor with an AI assistant that writes and edits documents, answers questions about uploaded files (RAG), and lets every user bring their own model API key.

![AI Document Editor Interface](app-screenshot.png)

---

## ⬇️ Download and install (Windows)

**Download:** go to the **[latest release](https://github.com/himanshuhs9011/ai_document-editor/releases/latest)**
and, under **Assets**, download one of:

| File | What it is |
|------|------------|
| `AI-Document-Editor-Setup-1.0.0.exe` | The installer (recommended): adds the app to the Start menu and the desktop |
| `AI-Document-Editor-1.0.0-portable.exe` | A single file that runs without installing (starts a little slower) |

You need Windows 10 or 11 (64-bit) and about 500 MB of free disk space. No other software is needed.

### Install

1. Double-click `AI-Document-Editor-Setup-1.0.0.exe`.
2. If Windows shows **"Windows protected your PC"**, click **More info** → **Run anyway**. (The app is not yet
   code-signed, so Windows doesn't recognise the publisher.)
3. Choose whether to install for just you or everyone on the PC, pick a folder if you like, and click **Install**.
4. Open **AI Document Editor** from the desktop shortcut or the Start menu.

### First start

1. Click **Create an account** and sign up. Your account is created **on this PC**: no internet needed, and nothing
   is sent anywhere.
2. Sign in, and start writing. Upload Word, PDF or text files with **File → Open a file**, and save as Word with
   **File → Download as Word**. Everything is saved automatically.

### Turn on AI

AI features (chat, `/` commands, Studio, deep read, autocomplete) use **your own API key**:

1. Get a key, for example a free one from **[Google AI Studio](https://aistudio.google.com/app/apikey)** (Gemini),
   or from OpenAI, Anthropic, Groq, Mistral, DeepSeek, OpenRouter, xAI or Together.
2. In the app, click the **key button** at the top (**AI & Plan**), choose your provider, check the model name,
   paste the key and click **Test & save key**.
3. That's it: AI now runs on your key. The key is stored encrypted on your PC and never leaves it except to talk to
   your provider. Free keys have per-minute limits; if you see "quota exceeded", wait a minute.

AI needs an internet connection; everything else works offline.

### Your data

- Everything (accounts, documents, chats, saved keys) is in **`%APPDATA%\AI Document Editor`** (paste that into the
  File Explorer address bar to open it).
- **Back up** by copying that whole folder while the app is closed. Restoring it on another PC brings your documents
  back; you may need to sign in and add your API key again there.
- **Uninstall** from Windows **Settings → Apps**. Your data folder is kept; delete it yourself to remove everything.

### If something goes wrong

- **"AI Document Editor couldn't start"**: click **Try again**. If it keeps happening, restart your PC. The details
  are in `%APPDATA%\AI Document Editor\logs\backend.log`.
- **AI says to add a key**: open **AI & Plan** and add one (see above).
- **Scanned PDFs import without text**: reading text from images (OCR) isn't included in the Windows app yet.

---

## ✨ Features

- 📝 **Word-style Home ribbon**: clipboard and Format Painter; fonts, sizes, grow/shrink, change case, sub/superscript, highlight and font color; bullets, numbering styles, indent, sort, line spacing, shading, paragraph marks; style gallery; Find & Replace; select sentence/paragraph; dictation; spell check
- 🤖 **AI chat that streams** its answers; questions are answered in the chat, edit requests come back as **suggested changes you accept or reject** paragraph by paragraph (unchanged text keeps its formatting; one undo reverts)
- ⚡ **Inline AI**: type `/` for AI commands (continue writing, improve, fix grammar, shorter/longer, formal, `/translate hindi`, `/table …`, `/ask …`) and quick blocks; optional **autocomplete** ghost text (Tab to accept)
- 🧭 **Studio**: pick a profession and its team of specialist agents writes the whole document. A lead editor plans it, specialists draft each section, reviewers check it, and flagged sections are revised. Professions: legal, medical, reports, research, news, articles and features, social media, film and TV, YouTube, reels and shorts, and courses (11 playbooks, 66 specialists and reviewers)
- 🔍 **Search across all your documents** (RAG on pgvector) with clickable cited sources; falls back to keyword ranking when no embedding model is reachable
- 📚 **Deep read** for long documents: instead of a few retrieved snippets, the model explores the whole text with code in a sandbox and hands pieces to helper models (recursive language model reading), for summaries, "list every…" questions and comparisons. The answer shows the code it ran
- 📄 **Upload** PDF (with OCR for scans), DOCX and TXT · 📤 **Export** to DOCX
- 🔑 **Bring your own key**: OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek, OpenRouter, xAI, Together, or any OpenAI-compatible API
- 💳 **Paywall**: editing is free; AI uses your own key, the free daily allowance, or Pro
- 👤 Accounts, per-user sessions, autosave, dark mode

---

## 🚀 Run locally (Windows)

You need **Python 3.10+**, **Node.js 18+**, **Docker Desktop**, and **[Ollama](https://ollama.ai/download)** for the free local model.

```bash
ollama pull gemma3:latest
ollama pull nomic-embed-text:latest
```

Then start everything (open **http://localhost:3000** and register an account):

```bash
docker compose up -d                          # Postgres (pgvector) + Redis
cd backend && npm install && npm run db:deploy   # build/migrate tables with Prisma
python main.py                                 # API on http://localhost:8000 (docs at /docs)
cd ../frontend && npm install && npm run dev   # app on http://localhost:3000
```

Coming from the old SQLite version? Copy your users, sessions and messages over once:

```bash
cd backend && python scripts/import_sqlite.py data/sessions.db
```

---

## 🖥️ Desktop app (Windows installer)

The Windows app keeps **documents, sessions and chats on the user's PC** (a database file in
`%APPDATA%\AI Document Editor`). It runs in one of two ways, set by `gatewayUrl` in `desktop/app.config.json`:

- **Standalone** (`gatewayUrl` empty, the default): no server at all. Accounts are created and signed in on the PC,
  and AI runs on each user's own API key (added in **AI & Plan**; Google Gemini has a free tier). The app makes its
  own sign-in/encryption key on first start and keeps it encrypted by Windows, so sign-ins and saved keys survive
  restarts. Accounts belong to that PC.
- **With the online gateway** (`gatewayUrl` set): accounts, plans and the free daily AI allowance live online; only
  sign-in and AI go there. Editing works offline.

```
Windows app (Electron)                                    Online (Cloud Run)
  window ──> local backend (APP_MODE=local, SQLite)  ──>   gateway (APP_MODE=gateway, Postgres)
             documents, sessions, chats, Studio,           accounts, plans, API keys, and one
             deep read, upload and export                  AI endpoint that checks and counts
                                                           every model call
```

The same backend code runs in four modes (`APP_MODE`): `server` (everything on one server, the web version),
`gateway` (online: accounts and AI only, no documents stored), `local` (inside the Windows app, using the gateway) and
`standalone` (inside the Windows app, no server).

Build the installer yourself (from the repo root):

1. Package the backend: create a clean environment with only `requirements.txt` plus `pyinstaller==6.22.3`, then
   `cd backend && python -m PyInstaller desktop_server.spec --noconfirm`
2. Build the web app for the desktop: `cd frontend && npm run build:desktop`
3. Leave `gatewayUrl` empty in `desktop/app.config.json` for the standalone app, or put the gateway's `https://`
   address there
4. `cd desktop && npm install && npm run dist` → the installer and a portable `.exe` appear in `desktop/release/`

Or let GitHub build it: push a tag like `v1.0.0` (set the repository variable `GATEWAY_URL` first for the gateway
version);
`.github/workflows/desktop.yml` runs the tests, builds all three pieces and attaches the installer to a GitHub Release.

How the app behaves:
- It starts the backend in the background on a fixed local port (remembered in the data folder, so the sign-in
  persists) and stops it when the app closes. Logs are in `%APPDATA%\AI Document Editor\logs`.
- The backend only answers this PC (`127.0.0.1`, host names checked); the window has no access to the computer, other
  sites open in the normal browser, and only the app may use the microphone and clipboard.
- Offline: documents open and save as usual. AI needs an internet connection (and, with the gateway, so does
  signing in).
- Scanned-PDF OCR needs Tesseract, which is not bundled; without it, scans import without text. Word export uses the
  built-in converter.
- The installer is unsigned, so Windows shows an "unknown publisher" warning until you add a code-signing certificate.
- `npm start` in `desktop/` runs the app from source (after steps 1–2). Set `APP_URL` to open a running web version
  instead. Run it from a normal terminal: VS Code's terminal sets `ELECTRON_RUN_AS_NODE`.

## 🌍 Deploying online

| Piece | Suggested service | Notes |
|-------|-------------------|-------|
| API (agents) | Google Cloud Run, Fly.io or Render | `backend/Dockerfile`; scales to zero when idle |
| Database | Neon (or Supabase) Postgres | `DATABASE_URL` = pooled string, `DIRECT_URL` = direct string (for migrations) |
| Redis | Upstash | rate limits and caches; optional |
| Frontend | Cloudflare Pages, Vercel or Netlify | `npm run build`, serve `frontend/dist` |

1. Build the API image from the repo root: `docker build -f backend/Dockerfile .`
2. Set the environment variables below as secrets on the API service.
3. Apply migrations from your machine or CI: `cd backend && DATABASE_URL=... npm run db:deploy`
4. Build the frontend with `VITE_API_URL=https://your-api.example.com` and set `CORS_ORIGINS` on the API to the frontend's URL.
5. Set `TRUSTED_PROXY_HOPS=1` on Cloud Run, Render or Fly so login rate limits see each visitor's real address.

---

## ⚙️ Configuration

Copy `backend/.env.example` to `backend/.env`. The important variables:

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | Signs login tokens. Generate with `python backend/scripts/generate_secret_key.py` |
| `ENCRYPTION_KEY` | Encrypts users' saved API keys (set it in production) |
| `DATABASE_URL` / `REDIS_URL` | Postgres and Redis connections |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY` | The server's own model (default: local Ollama) |
| `EMBEDDING_*` | Embedding model for document search |
| `FREE_AI_DAILY_LIMIT` / `PRO_AI_DAILY_LIMIT` | AI requests per day on the server model |
| `CORS_ORIGINS` | Frontend URLs allowed to call the API |
| `TRUSTED_PROXY_HOPS` | Proxies in front of the API (1 on Cloud Run, Render, Fly; 0 locally) |

Locally, `model-config.json` still sets the default Ollama model names.

### Paywall and API keys

- Editing, upload and export are free for everyone.
- AI requests run on the user's **own API key** when they've added one under **AI & Plan** (no limit), otherwise on the server model within the plan's daily limit (free: 10, Pro: 500 by default). Each report section counts as one request.
- Autocomplete fires while you type, so it needs the user's own key or Pro.
- Grant Pro by hand until a payment provider is connected: `python backend/scripts/set_plan.py user@example.com pro 30`

### Deep read (recursive reading)

Chat has two modes. **Quick** answers from the most relevant passages (RAG) plus the start of the document: one AI request.
**Deep read** (`backend/src/agents/rlm/`) gives the model the whole text as a variable in a sandbox. It writes code to look
around (`grep`, slices, `chunks`), sends pieces to helper models with `llm_query` / `llm_query_batch`, and replies with
`FINAL(answer)`. Texts under about 24,000 characters skip the loop and are read in one pass. Each model call after the first
counts as one AI request (at most 8 steps and 24 helper reads per question), free with the user's own key.

The sandbox (`sandbox.py`) never calls `exec` or `eval`: it parses the code, checks every node against an allow-list, and
interprets it itself. No imports, no `def`/`lambda`/`class`, no underscore names, methods only on plain strings, lists and
dicts; steps, value sizes, output, compute time (5 s per step) and helper calls are capped, and it yields to other requests
while it runs. `tests/test_rlm.py` tries the known escapes and resource attacks against it.

### Studio playbooks

Each profession is one file in `backend/src/agents/harness/playbooks/`: its document types, the questions its brief asks,
its specialists (each with a method), its reviewers (each with checks), its style and its safety rules. The harness in
`engine.py` runs any playbook the same way, so adding a profession means adding one file and listing it in
`playbooks/__init__.py`. A quick run costs one AI request per section plus the plan; "draft, review and revise" adds one per
reviewer and one per revised section.

### Tests

```bash
cd backend && python -m unittest discover -s tests -t .
```

They need no database or model server, and cover the security fixes (DOCX export cannot read server files or internal
URLs, upload size limits, custom provider URLs, the rate-limit client address), the harness's parsing and playbooks, and
the deep-read sandbox (escape attempts, resource limits) and reading loop.

### Database changes

Tables are defined in `backend/prisma/schema.prisma`. After editing it run `npm run db:migrate` in `backend/` to create a migration, and update the matching queries in `backend/src/db/`.

---

## 📁 Project structure

```
backend/
  main.py                 app startup and routes
  prisma/                 schema.prisma + migrations (tables are built by Prisma)
  src/
    config.py             settings from environment variables
    deps.py               login, per-request model choice, rate limits
    cache.py              Redis (or in-memory) cache and rate limiter
    db/                   one file of SQL queries per table (asyncpg)
    routes/               auth, chat, documents, sessions, keys, billing, health
    services/             chat pipeline (streaming), inline AI, LLM client, retrieval, citations, billing, keys
    services/documents/   parsing, OCR, upload ingest, DOCX export
    agents/harness/       the agent harness (engine, prompts, house style) and one playbook per profession
    agents/rlm/           deep read: the code sandbox, the recursive reading loop and its prompts
    agents/prompts.py     prompts for chat and inline AI
    text/                 markdown, placeholder, intent and safety helpers
  scripts/                import_sqlite, set_plan, generate_secret_key
  tests/                  unit tests (python -m unittest discover -s tests -t .)
frontend/src/
  components/ribbon/      the Home ribbon and Find & Replace
  components/             review panel, inline AI card, "/" menu, chat
  components/studio/      Studio: profession picker, brief, the crew line and review notes
  extensions/             TipTap extensions (paragraph format, search, "/" commands, autocomplete)
  editor/                 editor commands, AI change review, Format Painter, dictation
  services/http.ts        API calls with login and paywall handling
docker-compose.yml        local Postgres + Redis
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Database won't start | Start Docker Desktop, then run `docker compose up -d` again |
| AI says the service is unavailable | Run `ollama serve`, and `ollama pull gemma3:latest` |
| Document search finds nothing | Run `ollama pull nomic-embed-text:latest` |
| 402 / "used all AI requests" | Add your own API key under **AI & Plan**, or raise `FREE_AI_DAILY_LIMIT` |
| Port 3000/8000 in use | Change `server.port` in `frontend/vite.config.ts` / `PORT` in `backend/.env` |

---

## 🙏 Tech stack

React + TypeScript + Vite + TipTap · FastAPI + LangGraph · Postgres + pgvector (Prisma migrations, asyncpg) · Redis · Ollama or any OpenAI-compatible API · Tesseract OCR · pandoc
