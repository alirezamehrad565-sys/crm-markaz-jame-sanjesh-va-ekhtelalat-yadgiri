ALTER TABLE appointments ADD COLUMN ops_status TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_ops_status ON appointments(ops_status);

ALTER TABLE day_notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'human';
