#!/usr/bin/env node
// دود واقعی مایگریشن 0114 + triggerهای فقط-میز روی node:sqlite (همان موتور هارنس تست)
// قرار مأموریت SB2 — هفت بند:
//   ① مایگریشن‌ها (شامل 0114 بدون trigger) روی node:sqlite تازه بی‌خطا؛
//   ② صفر خوردن regexهای گیت check-d1-compat روی فایل 0114 (رشته‌ها دقیق — ①/⑬ گیت)؛
//   ③ اعمال local-triggers.sql بی‌خطا + دوبار (idempotent — IF NOT EXISTS؛ شمار trigger = ۱۸۰)؛
//   ④ رفتار مُهر با trigger: درج→مُهر خودکار · به‌روزرسانی→مُهر تازه · به‌روزرسانی با مُهر صریح→حفظ ·
//      حذف→تومب‌استون با pk کانونی (تک‌ستونی و چندستونی '|') · INSERT OR REPLACE سینکی→حفظ مُهر
//      و بدون recursive؛
//   ⑤ بدون اعمال trigger (رفتار ابر): به‌روزرسانی → مُهر دست‌نخورده و حذف → بدون تومب‌استون؛
//   ⑥ بذر cursor اپوک برای همهٔ جداول دامنه؛
//   ⑦ اجرای دوبارهٔ 0114 → خطای موردانتظر (ALTER TABLE شکل IF NOT EXISTS ندارد — جدول‌ها با
//      IF NOT EXISTS یک‌بارمصرف‌اند).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG = path.join(ROOT, 'migrations');
const TRIGGERS_FILE = path.join(ROOT, 'scripts', 'engine', 'local-triggers.sql');
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EPOCH_JSON = '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}';

let failed = 0;
function check(label, cond, extra = '') {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
}

const MIG_FILES = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
const MIG_0114 = readFileSync(path.join(MIG, '0114_instance_sync.sql'), 'utf8');

/** db تازه با همهٔ مایگریشن‌ها (trigger ندارد — سیاست D1-clean migrations/) */
function freshMigratedDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of MIG_FILES) db.exec(readFileSync(path.join(MIG, f), 'utf8'));
  return db;
}

// ─── ① مایگریشن‌ها روی db تازه بی‌خطا ───
const db1 = freshMigratedDb();
check('① مایگریشن‌ها (شامل 0114 بدون trigger) روی node:sqlite تازه بی‌خطا', MIG_FILES.length >= 115, `${MIG_FILES.length} فایل`);

// ─── ② گیت D1: صفر خوردن regexهای دقیق گیت روی فایل 0114 ───
console.log('ℹ بند ② — regexهای گیت scripts/check-d1-compat.mjs (قواعد ① و ⑬) روی migrations/0114:');
const GATE_REGEXES = [
  { re: /\bPRAGMA\b/i, label: 'PRAGMA' },
  { re: /\bBEGIN\s+(TRANSACTION|DEFERRED|IMMEDIATE|EXCLUSIVE)?\b/i, label: 'BEGIN' },
  { re: /\bCOMMIT\b/i, label: 'COMMIT' },
  { re: /\bCREATE\s+TRIGGER\b/i, label: 'CREATE TRIGGER' },
  { re: /\bATTACH\s+DATABASE\b/i, label: 'ATTACH DATABASE' },
  { re: /\bVACUUM\b/i, label: 'VACUUM' },
  { re: /\bREINDEX\b/i, label: 'REINDEX' }
];
for (const { re, label } of GATE_REGEXES) {
  check(`② صفر خوردن ${label} در 0114`, !re.test(MIG_0114));
}

// ─── ③ اعمال local-triggers.sql روی db دوم — یک‌بار و دوبار (idempotent) ───
const db2 = freshMigratedDb();
const TRIGGERS_SQL = readFileSync(TRIGGERS_FILE, 'utf8');
let applyErr = null;
try { db2.exec(TRIGGERS_SQL); } catch (e) { applyErr = e instanceof Error ? e.message : String(e); }
check('③ اعمال local-triggers.sql بی‌خطا', applyErr === null, applyErr ?? '');
let reapplyErr = null;
try { db2.exec(TRIGGERS_SQL); } catch (e) { reapplyErr = e instanceof Error ? e.message : String(e); }
check('③ اعمال دوبارهٔ local-triggers.sql بی‌خطا (idempotent)', reapplyErr === null, reapplyErr ?? '');
const trigCount = Number(db2.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'`).get()?.n);
check('③ شمار triggerها روی db دوم = ۱۸۰ (۶۰ جدول × ۳)', trigCount === 180, `${trigCount}`);

// ─── ④ رفتار مُهر/تومب‌استون با trigger ───
const SMOKE_ID = 'smoke-stu-1';
const stamp = () => db2.prepare(`SELECT updated_at FROM students WHERE id = ?`).get(SMOKE_ID)?.updated_at;
db2.prepare(`INSERT INTO schools (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'مدرسهٔ دود')`).run();

// ④-الف درج بدون مُهر → مُهر اکنون (فرم ISO میلی‌ثانیه)
db2.prepare(`INSERT INTO students (id, national_id, first_name, last_name, gender, grade, school_id, guardian_name, guardian_relation, guardian_phone)
            VALUES ('smoke-stu-1', '0912345678', 'دود', 'دودی', 'male', 'سوم', '10000000-0000-0000-0000-000000000001', 'ولی', 'father', '09121112233')`).run();
const s1 = stamp();
check('④ INSERT بدون updated_at → مُهر خودکار ISO-ms', ISO_MS.test(s1 ?? ''), s1);

// ④-ب به‌روزرسانی بدون مُهر → مُهر تازه (نویسندهٔ دستی مُهر می‌گیرد)
sleepMs(2);
db2.prepare(`UPDATE students SET guardian_phone = '09120000000' WHERE id = 'smoke-stu-1'`).run();
const s2 = stamp();
check('④ UPDATE بدون updated_at → مُهر تازه', ISO_MS.test(s2 ?? '') && s2 > s1, `${s1} → ${s2}`);

// ④-ج به‌روزرسانی با مُهر صریح → حفظ (مسیر سینک)
db2.prepare(`UPDATE students SET guardian_phone = '09130000000', updated_at = '2026-05-01T10:00:00.000Z' WHERE id = 'smoke-stu-1'`).run();
const s3 = stamp();
check('④ UPDATE با updated_at صریح → حفظ مُهر', s3 === '2026-05-01T10:00:00.000Z', s3);

// ④-د حذف → تومب‌استون با pk کانونی تک‌ستونی
db2.prepare(`DELETE FROM students WHERE id = 'smoke-stu-1'`).run();
const tomb = db2.prepare(`SELECT table_name, pk, deleted_at FROM _sync_deleted WHERE table_name = 'students' AND pk = 'smoke-stu-1'`).get();
check('④ DELETE → تومب‌استون students (pk تک‌ستونی)', Boolean(tomb) && ISO_MS.test(tomb.deleted_at ?? ''), JSON.stringify(tomb ?? {}));

// ④-ه حذف روی جدولِ دارای updated_at از ابتدا → تومب‌استون هم می‌گیرد
db2.prepare(`INSERT INTO staff (id, email, full_name, role) VALUES ('smoke-staff-1', 'smoke-staff-1@test.local', 'دود کارمند', 'manager')`).run();
db2.prepare(`INSERT INTO announcements (id, title, body, show_login, show_panel, active, created_by, created_at, updated_at)
            VALUES ('smoke-ann-1', 'ت', 'ب', 0, 1, 1, 'smoke-staff-1', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')`).run();
db2.prepare(`DELETE FROM announcements WHERE id = 'smoke-ann-1'`).run();
const tomb2 = db2.prepare(`SELECT pk FROM _sync_deleted WHERE table_name = 'announcements' AND pk = 'smoke-ann-1'`).get();
check('④ DELETE جدول دارای updated_at → تومب‌استون', Boolean(tomb2), JSON.stringify(tomb2 ?? {}));

// ④-و تومب‌استون چندستونی با '|' — student_tags (pk: student_id+tag_id)
db2.prepare(`INSERT INTO students (id, national_id, first_name, last_name, gender, school_id)
            VALUES ('smoke-stu-2', '0912345679', 'دود', 'دوم', 'male', '10000000-0000-0000-0000-000000000001')`).run();
const TAG = 'bbbbbbbb-0000-4000-8000-000000000001';
db2.prepare(`INSERT INTO tags (id, name, category) VALUES (?, 'دود-تگ', 'custom')`).run(TAG);
db2.prepare(`INSERT INTO student_tags (student_id, tag_id, created_at) VALUES ('smoke-stu-2', ?, '2026-05-01T00:00:00.000Z')`).run(TAG);
db2.prepare(`DELETE FROM student_tags WHERE student_id = 'smoke-stu-2' AND tag_id = ?`).run(TAG);
const tomb3 = db2.prepare(`SELECT pk FROM _sync_deleted WHERE table_name = 'student_tags'`).get();
check('④ DELETE چندستونی → pk کانونی با |', tomb3?.pk === `smoke-stu-2|${TAG}`, tomb3?.pk ?? '—');

// ④-ز INSERT OR REPLACE سینکی با همان مُهر → حفظ مُهر، بدون recursive_trigger و بدون تومب‌استون
sleepMs(2);
db2.prepare(`INSERT OR REPLACE INTO tags (id, name, category, updated_at) VALUES (?, 'دود-تگ-۲', 'custom', '2026-05-02T10:00:00.000Z')`).run(TAG);
const tagRow = db2.prepare(`SELECT name, updated_at FROM tags WHERE id = ?`).get(TAG);
const tagTombs = db2.prepare(`SELECT COUNT(*) AS n FROM _sync_deleted WHERE table_name = 'tags'`).get()?.n;
check('④ INSERT OR REPLACE سینکی → مُهر حفظ و بدون recursive', tagRow?.updated_at === '2026-05-02T10:00:00.000Z' && Number(tagTombs) === 0, JSON.stringify(tagRow ?? {}));

// ─── ⑤ بدون trigger (رفتار ابر): مُهر دست‌نخورده و بدون تومب‌استون ───
console.log('ℹ بند ⑤ — رفتار ابر (بدون اعمال local-triggers.sql): مُهر نویسنده دست‌نخورده می‌ماند — مُهر را سرویس‌ها خودشان می‌نویسند');
const db3 = freshMigratedDb();
db3.prepare(`INSERT INTO schools (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'مدرسهٔ دود ابری')`).run();
db3.prepare(`INSERT INTO students (id, national_id, first_name, last_name, gender, school_id, updated_at)
            VALUES ('smoke-cloud-1', '0912345680', 'ابری', 'بی‌تریگر', 'male', '10000000-0000-0000-0000-000000000001', '2026-05-01T00:00:00.000Z')`).run();
db3.prepare(`UPDATE students SET guardian_phone = '09150000000' WHERE id = 'smoke-cloud-1'`).run();
const cloudStamp = db3.prepare(`SELECT updated_at FROM students WHERE id = 'smoke-cloud-1'`).get()?.updated_at;
check('⑤ UPDATE بدون trigger → مُهر دست‌نخورده', cloudStamp === '2026-05-01T00:00:00.000Z', cloudStamp);
db3.prepare(`DELETE FROM students WHERE id = 'smoke-cloud-1'`).run();
const cloudTombs = db3.prepare(`SELECT COUNT(*) AS n FROM _sync_deleted WHERE table_name = 'students'`).get()?.n;
check('⑤ DELETE بدون trigger → بدون تومب‌استون', Number(cloudTombs) === 0, `${cloudTombs} ردیف`);

// ─── ⑥ بذر cursor اپوک ───
const seeds = db1.prepare(`SELECT COUNT(*) AS n FROM _sync_state WHERE pull_cursor = ? AND push_cursor = ?`)
  .get(EPOCH_JSON, EPOCH_JSON);
check('⑥ بذر cursor اپوک برای همهٔ جداول دامنه', Number(seeds?.n) === 60, `${seeds?.n} ردیف`);

// ─── ⑦ اجرای دوبارهٔ کل فایل 0114 → خطای موردانتظر ───
let rerunErr = null;
try {
  db1.exec(MIG_0114);
} catch (err) {
  rerunErr = err instanceof Error ? err.message : String(err);
}
check('⑦ اجرای دوبارهٔ 0114 → خطای duplicate column (جدول‌ها IF NOT EXISTS — یک‌بارمصرف)', Boolean(rerunErr) && /duplicate column name/i.test(rerunErr ?? ''), rerunErr ?? 'بدون خطا!');

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait کوتاه برای مُهر تازه‌تر */ }
}

if (failed > 0) {
  console.error(`✋ دود instance-sync ناقص — ${failed} چک قرمز`);
  process.exit(1);
}
console.log('✓ دود instance-sync سبز (۰۱۱۴ D1-clean + triggerهای فقط-میز)');
