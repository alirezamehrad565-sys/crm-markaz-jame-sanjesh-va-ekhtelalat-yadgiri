-- مایگریشن اسکیما D1 — ساعات کاری
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- migrations/0003_working_hours.sql
--: weekly working hours per staff member (بازه‌های کاری)
-- weekday convention (Iranian week): 0 = Saturday (شنبه) … 6 = Friday (جمعه)
-- start_minute/end_minute: minutes since midnight, Tehran local time (+03:30)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS working_hours (
  id           TEXT PRIMARY KEY,
  staff_id     TEXT NOT NULL REFERENCES staff(id),
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute   INTEGER NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_working_hours_staff ON working_hours(staff_id, weekday, start_minute);
