-- مایگریشن اسکیما D1 — اسکیمای اولیه
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- migrations/0001_initial.sql
-- Initial schema for center-system MVP (scheduling discipline)
-- مطابق ARCHITECTURE.md بخش ۸.۲
-- ────────────────────────────────────────────────────────────

-- ───────────── staff ─────────────
CREATE TABLE IF NOT EXISTS staff (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('manager', 'therapist', 'secretary')),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────── schools ─────────────
CREATE TABLE IF NOT EXISTS schools (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'school' CHECK (kind IN ('school', 'kindergarten')),
  gender_type TEXT,
  phone       TEXT,
  address     TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- ───────────── students ─────────────
CREATE TABLE IF NOT EXISTS students (
  id                TEXT PRIMARY KEY,
  national_id       TEXT NOT NULL UNIQUE,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  birth_date        TEXT,
  gender            TEXT CHECK (gender IN ('male', 'female')),
  grade             TEXT,
  school_id         TEXT REFERENCES schools(id),
  guardian_name     TEXT,
  guardian_relation TEXT,
  guardian_phone    TEXT,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_last_name ON students(last_name);

-- ───────────── appointments ─────────────
CREATE TABLE IF NOT EXISTS appointments (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT NOT NULL REFERENCES staff(id),
  start_at    TEXT NOT NULL,             -- ISO UTC
  end_at      TEXT NOT NULL,             -- ISO UTC
  status      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  note        TEXT,
  version     INTEGER NOT NULL DEFAULT 1, -- optimistic concurrency (409)
  batch_id    TEXT,                       -- nullable — کپی هفته
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appointments_staff_time ON appointments(staff_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_appointments_batch ON appointments(batch_id);

-- ───────────── appointment_students ─────────────
CREATE TABLE IF NOT EXISTS appointment_students (
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  student_id     TEXT NOT NULL REFERENCES students(id),
  facet_id       TEXT,
  attendance     TEXT NOT NULL DEFAULT 'pending'
                 CHECK (attendance IN ('pending', 'present', 'absent', 'cancelled')),
  note           TEXT,
  PRIMARY KEY (appointment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_appt_students_student ON appointment_students(student_id);
CREATE INDEX IF NOT EXISTS idx_appt_students_attendance ON appointment_students(attendance);

-- ───────────── audit_log (append-only) ─────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL,
  action        TEXT NOT NULL,           -- e.g. 'appointment.create'
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  changes       TEXT,                    -- JSON: { field: { from, to } }
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);

-- ───────────── schema_migrations ─────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
