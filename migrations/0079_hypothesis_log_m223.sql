-- m223 — لج فرضیه: نوع رویداد سیستمی برای اسنپ‌شاتِ هر محاسبهٔ موتور بالینی.
-- فقط نشاندنِ نوع جدید؛ بدون تغییر اسکیما (معیار پذیرش مایلستون).
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8230-4000-8000-000000000001',
  'ce-hypothesis-log-v1',
  'لج فرضیهٔ بالینی (خودکار)',
  'note',
  '🧭',
  0,
  '[]',
  NULL,
  '["سیستمی","موتور بالینی"]',
  'family',
  1,
  'seed-m223',
  NULL,
  1
);
