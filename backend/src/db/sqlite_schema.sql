-- The desktop app's own database (mirrors backend/prisma/schema.prisma without the vector index).
-- Standalone mode keeps everything here: accounts, API keys (encrypted), usage, documents, sessions and chats.
-- With an online gateway, accounts live there instead and the account tables simply stay empty.
-- Timestamps are UTC text with milliseconds, so messages keep their order.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  username        TEXT NOT NULL UNIQUE,
  full_name       TEXT,
  password_hash   TEXT NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  plan            TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  base_url      TEXT,
  encrypted_key TEXT NOT NULL,
  key_hint      TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  filename     TEXT NOT NULL,
  file_type    TEXT NOT NULL,
  page_count   INTEGER NOT NULL DEFAULT 1,
  text         TEXT NOT NULL DEFAULT '',
  html         TEXT,
  metadata     TEXT NOT NULL DEFAULT '{}',
  indexed_hash TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  document_id TEXT REFERENCES documents (id) ON DELETE SET NULL,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX IF NOT EXISTS messages_session_created_idx ON messages (session_id, created_at);
