ALTER TABLE staff ADD COLUMN phone TEXT;
ALTER TABLE staff ADD COLUMN national_id TEXT;
ALTER TABLE staff ADD COLUMN username TEXT;
ALTER TABLE staff ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username
  ON staff(username) WHERE username IS NOT NULL AND TRIM(username) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_national_id
  ON staff(national_id) WHERE national_id IS NOT NULL AND TRIM(national_id) != '';

UPDATE staff
   SET username = lower(substr(replace(email, '@', '.'), 1, 20))
 WHERE username IS NULL OR TRIM(username) = '';

UPDATE staff
   SET password_hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
 WHERE password_hash IS NULL OR TRIM(password_hash) = '';
