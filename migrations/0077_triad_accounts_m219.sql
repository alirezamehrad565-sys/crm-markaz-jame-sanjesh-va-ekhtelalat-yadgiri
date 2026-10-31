-- m219 — فعال‌سازی سه‌گانهٔ بالینی (تصمیم صریح کاربر): روان‌سنج · روان‌شناس بالینی · درمانگر اختلال یادگیری
-- doctrine m213: نقش جدید اضافه نمی‌شود — سه‌گانه با حساب‌های therapist بیان می‌شود.
-- حساب‌ها بی‌شناسه و نقش‌محورند (نه شخص واقعی)؛ رمز پیش‌فرض ۱۲۳۴ (همان hash عمومی seed-dev) — کاربر بعداً عوض می‌کند.
-- idempotent: INSERT OR IGNORE + UPDATE active=1 (اگر قبلاً غیرفعال شده بودند، دوباره فعال می‌شوند).
INSERT OR IGNORE INTO staff (id, email, full_name, role, active, phone, national_id, username, password_hash) VALUES
  ('00000000-0000-4000-8000-000000000201', 'psychometrist@center.local', 'روان‌سنج مرکز', 'therapist', 1, '09121110201', '3058167921', 'psychometrist', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('00000000-0000-4000-8000-000000000202', 'clinical-psychologist@center.local', 'روان‌شناس بالینی مرکز', 'therapist', 1, '09121110202', '0020644485', 'psychologist', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('00000000-0000-4000-8000-000000000203', 'ld-therapist@center.local', 'درمانگر اختلال یادگیری مرکز', 'therapist', 1, '09121110203', '8981863725', 'ld_therapist', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');

UPDATE staff SET active = 1
WHERE id IN (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000203'
);
