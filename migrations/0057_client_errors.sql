CREATE TABLE IF NOT EXISTS client_errors (
  id          TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  message     TEXT NOT NULL,
  source      TEXT,
  line_no     INTEGER,
  col_no      INTEGER,
  stack       TEXT,
  url         TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_client_errors_time ON client_errors(occurred_at);
