ALTER TABLE exercises ADD COLUMN co_created_by TEXT;

INSERT OR IGNORE INTO tags (id, name, category) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000301', 'فارسی', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000302', 'ریاضی', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000303', 'دیکته', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000304', 'روخوانی', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000305', 'درک مطلب', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000306', 'نوشتن', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000307', 'دقت و تمرکز', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000308', 'حافظهٔ فعال', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000309', 'هماهنگی حرکتی', 'custom'),
  ('aaaaaaaa-0000-4000-8000-000000000310', 'تنظیم رفتار', 'custom');
