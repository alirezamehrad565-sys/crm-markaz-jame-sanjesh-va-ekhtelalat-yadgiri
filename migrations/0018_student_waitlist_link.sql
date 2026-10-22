ALTER TABLE waitlist ADD COLUMN student_id TEXT REFERENCES students(id);
CREATE INDEX IF NOT EXISTS idx_waitlist_student_link ON waitlist(student_id);
