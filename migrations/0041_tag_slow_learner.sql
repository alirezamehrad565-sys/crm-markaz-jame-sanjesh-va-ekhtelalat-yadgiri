-- مایگریشن اسکیما D1 — برچسب کندیادگیری
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- migrations/0041_tag_slow_learner.sql
-- — برچسب «دیرآموز» (Slow Learner) — نهمین برچسب دستهٔ نوع اختلال
-- به دستور کاربر: در برچسب‌ها/نیاز ویژه جا مانده بود.
-- هم‌تراز SPECIAL_NEED_TYPES.slow_learner (constants.ts) — اعتبارسنجی Zod خودکار.
-- idempotent (INSERT OR IGNORE) — الگوی 0006_tags.sql
-- ────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO tags (id, name, category) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000009', 'دیرآموز', 'disorder');
