-- مایگریشن اسکیما D1 — غربالگری
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: ماژول سنجش روزانه — غربال نوآموزان بدو ورود به دبستان
-- * screening_entries: هر ردیف = یک نوآموز سنجشیِ یک روز مشخص.
-- اصل طراحی: بدون پروفایل — فقط «نام + روز + برچسب‌ها» با حداقل زمان ثبت.
-- * tags: آرایهٔ JSON از برچسب‌ها — ترکیبی از:
-- ۶ برچسب ثابت (ارجاع تخصصی بینایی/شنوایی/هوش/جسمی‌حرکتی، عدم همکاری،
-- نداشتن ثبت‌نام — فهرست در @domain/screening/types.ts) +
-- برچسب‌های آزاد «#» مثل نام کارمند سنجش‌گر یا مهدکودک مبدأ.
-- «عادی» = بدون برچسب. برچسب‌ها ماندگارند تا پیگیری بعدی بر حسب آن‌ها انجام شود.
-- * حذف Hard فقط با audit — جدول لاگ عملیاتی روزمره است (نه سند بالینی).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS screening_entries (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  day        TEXT NOT NULL,                    -- YYYY-MM-DD به وقت تهران
  tags       TEXT NOT NULL DEFAULT '[]',       -- آرایهٔ JSON رشته
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_screening_day       ON screening_entries(day);
CREATE INDEX IF NOT EXISTS idx_screening_created_by ON screening_entries(created_by);
