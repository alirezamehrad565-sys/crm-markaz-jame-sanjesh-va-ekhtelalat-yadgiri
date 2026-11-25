/**
 * گیت ۱.۲۷.۷۹ (sdt156) — parity «نصب از صفر» با پروداکشن (بستن data-001 رجیستری ممیزی):
 * createTestDb دقیقاً همان مسیر نصب تازه است — replay لغویِ نام فایل‌ها روی SQLite واقعی
 * (هم‌الگوی ترتیب wrangler و scripts/engine/apply-migrations.mjs). این گیت قراردادهای
 * هم‌ارزی را پین می‌کند: ① جدول آشتی‌شدهٔ central_records پس از replay لغوی حاضر است
 * (مایگریشن 0124)، ② فهرست بحرانی جدول‌ها همه ساخته شده‌اند، ③ تنها شماره‌های تکراری همان
 * چهار مورد مستند MIGRATIONS.md است، ④ الگوی نام فایل رعایت شده است.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from '../test/harness';

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

describe('گیت parity نصب از صفر (data-001) — ۱.۲۷.۷۹', () => {
  const db = createTestDb(false); // بدون seed — فقط شِمای replay لغوی کامل

  it('① central_records پس از replay لغوی موجود است (آشتی 0124)', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='central_records'").get();
    expect(row).toBeDefined();
    const cols = (db.prepare('PRAGMA table_info(central_records)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toEqual([
      'id', 'dataset', 'name', 'payload', 'source', 'external_id', 'created_by', 'created_at', 'updated_at'
    ]);
  });

  it('①b ایندکس idx_audit_created_at پس از نصب از صفر حاضر است (مایگریشن 0125)', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_audit_created_at'").get();
    expect(row).toBeDefined();
  });

  it('② فهرست بحرانی جدول‌ها پس از نصب از صفر همه حاضرند', () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const names = new Set(rows.map((r) => r.name));
    const critical = [
      'students', 'staff', 'appointments', 'appointment_students', 'audit_log',
      'exercise_file_chunks', 'report_snapshots', 'case_event_types', 'bug_reports',
      'auth_sessions', 'forms', 'waitlist_referrals', 'sync_nodes', 'central_records'
    ];
    for (const t of critical) expect(names.has(t), `جدول بحرانی غایب: ${t}`).toBe(true);
  });

  it('③ تنها شماره‌های تکراری همان چهار مورد مستند MIGRATIONS.md است', () => {
    const counts = new Map<string, number>();
    for (const f of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
      const num = f.slice(0, 4);
      counts.set(num, (counts.get(num) ?? 0) + 1);
    }
    const dups = new Map([...counts].filter(([, n]) => n > 1));
    expect([...dups.keys()].sort()).toEqual(['0026', '0046', '0047', '0101']);
    expect(dups.get('0026')).toBe(2);
    expect(dups.get('0046')).toBe(2);
    expect(dups.get('0047')).toBe(3);
    expect(dups.get('0101')).toBe(2);
  });

  it('④ الگوی نام فایل NNNN_lowercase_snake_case.sql روی همهٔ فایل‌ها رعایت است', () => {
    for (const f of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
      expect(f).toMatch(/^[0-9]{4}_[a-z0-9_]+\.sql$/);
    }
  });
});
