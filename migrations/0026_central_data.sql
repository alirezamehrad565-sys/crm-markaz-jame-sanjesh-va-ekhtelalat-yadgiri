CREATE TABLE IF NOT EXISTS central_records (
  id          TEXT PRIMARY KEY,
  dataset     TEXT NOT NULL,
  name        TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  source      TEXT,
  external_id TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dataset, external_id)
);
CREATE INDEX IF NOT EXISTS idx_central_records_dataset ON central_records(dataset, name);
CREATE INDEX IF NOT EXISTS idx_central_records_updated ON central_records(updated_at);
