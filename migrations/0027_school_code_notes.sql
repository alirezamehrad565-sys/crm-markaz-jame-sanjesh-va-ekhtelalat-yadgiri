ALTER TABLE schools ADD COLUMN code TEXT;
ALTER TABLE schools ADD COLUMN notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_code_unique ON schools(code) WHERE code IS NOT NULL;
