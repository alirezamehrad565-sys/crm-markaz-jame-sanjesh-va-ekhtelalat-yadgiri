ALTER TABLE exercises ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE exercises ADD COLUMN team_created INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_exercises_visibility ON exercises(visibility);
