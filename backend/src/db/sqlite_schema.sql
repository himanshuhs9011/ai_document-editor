-- The desktop app's own database: documents, sessions and chats stay on the user's PC.
-- Accounts, API keys and AI usage live on the online gateway (Postgres, built by Prisma); this mirrors only the
-- tables the laptop needs. Timestamps are UTC text with milliseconds, so messages keep their order.

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
