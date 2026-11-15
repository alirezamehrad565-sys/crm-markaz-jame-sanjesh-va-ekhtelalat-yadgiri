#!/usr/bin/env node
// دود واقعی مایگریشن 0114 روی node:sqlite (همان موتور هارنس تست) — قرار مأموریت SB بند ۱
// رفتار آزموده‌شده: درج→مُهر · به‌روزرسانی→مُهر · به‌روزرسانی دستی با مُهر→حفظ · درج سینکی با مُهر→حفظ ·
// حذف→تومب‌استون (تک‌pk و چندستونی) · INSERT OR REPLACE سینکی→بدون تومب‌استون و بدون recursive ·
// بذر cursor · اجرای دوبارهٔ کل فایل→خطای موردانتظر (ADD COLUMN شکل IF NOT EXISTS ندارد).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG = path.join(ROOT, 'migrations');
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let failed = 0;
function check(label, cond, extra = '') {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
}

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) db.exec(readFileSync(path.join(MIG, f), 'utf8'));
check('اعمال همهٔ مایگریشن‌ها', files.length >= 115, `${files.length} فایل`);

const SMOKE_ID = 'smoke-stu-1';
const stamp = () => db.prepare(`SELECT updated_at FROM students WHERE id = ?`).get(SMOKE_ID)?.updated_at;

// ① درج بدون مُهر → مُهر اکنون (فرم ISO میلی‌ثانیه)
db.prepare(`INSERT INTO schools (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'مدرسهٔ دود')`).run();
db.prepare(`INSERT INTO students (id, national_id, first_name, last_name, gender, grade, school_id, guardian_name, guardian_relation, guardian_phone)
            VALUES ('smoke-stu-1', '0912345678', 'دود', 'دودی', 'male', 'سوم', '10000000-0000-0000-0000-000000000001', 'ولی', 'father', '09121112233')`).run();
const s1 = stamp();
check('INSERT بدون updated_at → مُهر ISO-ms', ISO_MS.test(s1 ?? ''), s1);

// ② به‌روزرسانی بدون مُهر → مُهر تازه (نویسندهٔ دستی مُهر می‌گیرد)
sleepMs(2);
db.prepare(`UPDATE students SET guardian_phone = '09120000000' WHERE id = 'smoke-stu-1'`).run();
const s2 = stamp();
check('UPDATE بدون updated_at → مُهر تازه', ISO_MS.test(s2 ?? '') && s2 > s1, `${s1} → ${s2}`);

// ③ به‌روزرسانی با مُهر صریح → حفظ (مسیر سینک)
db.prepare(`UPDATE students SET guardian_phone = '09130000000', updated_at = '2026-05-01T10:00:00.000Z' WHERE id = 'smoke-stu-1'`).run();
const s3 = stamp();
check('UPDATE با updated_at صریح → حفظ مُهر', s3 === '2026-05-01T10:00:00.000Z', s3);

// ④ حذف → تومب‌استون با pk کانونی تک‌ستونی
db.prepare(`DELETE FROM students WHERE id = 'smoke-stu-1'`).run();
const tomb = db.prepare(`SELECT table_name, pk, deleted_at FROM _sync_deleted WHERE table_name = 'students' AND pk = 'smoke-stu-1'`).get();
check('DELETE → تومب‌استون students', Boolean(tomb) && ISO_MS.test(tomb.deleted_at ?? ''), JSON.stringify(tomb ?? {}));

// ⑤ حذف روی جدولِ دارای updated_at از ابتدا → تومب‌استون هم می‌گیرد
db.prepare(`INSERT INTO staff (id, email, full_name, role) VALUES ('smoke-staff-1', 'smoke-staff-1@test.local', 'دود کارمند', 'manager')`).run();
db.prepare(`INSERT INTO announcements (id, title, body, show_login, show_panel, active, created_by, created_at, updated_at)
            VALUES ('smoke-ann-1', 'ت', 'ب', 0, 1, 1, 'smoke-staff-1', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')`).run();
db.prepare(`DELETE FROM announcements WHERE id = 'smoke-ann-1'`).run();
const tomb2 = db.prepare(`SELECT pk FROM _sync_deleted WHERE table_name = 'announcements' AND pk = 'smoke-ann-1'`).get();
check('DELETE جدول دارای updated_at → تومب‌استون', Boolean(tomb2), JSON.stringify(tomb2 ?? {}));

// ⑥ تومب‌استون چندستونی با '|' — student_tags (pk: student_id+tag_id)
db.prepare(`INSERT INTO students (id, national_id, first_name, last_name, gender, school_id)
            VALUES ('smoke-stu-2', '0912345679', 'دود', 'دوم', 'male', '10000000-0000-0000-0000-000000000001')`).run();
const TAG = 'bbbbbbbb-0000-4000-8000-000000000001';
db.prepare(`INSERT INTO tags (id, name, category) VALUES (?, 'دود-تگ', 'custom')`).run(TAG);
db.prepare(`INSERT INTO student_tags (student_id, tag_id, created_at) VALUES ('smoke-stu-2', ?, '2026-05-01T00:00:00.000Z')`).run(TAG);
db.prepare(`DELETE FROM student_tags WHERE student_id = 'smoke-stu-2' AND tag_id = ?`).run(TAG);
const tomb3 = db.prepare(`SELECT pk FROM _sync_deleted WHERE table_name = 'student_tags'`).get();
check('DELETE چندستونی → pk کانونی با |', tomb3?.pk === `smoke-stu-2|${TAG}`, tomb3?.pk ?? '—');

// ⑦ INSERT OR REPLACE سینکی با همان مُهر → حفظ مُهر، بدون recursive_trigger و بدون تومب‌استون
sleepMs(2);
db.prepare(`INSERT OR REPLACE INTO tags (id, name, category, updated_at) VALUES (?, 'دود-تگ-۲', 'custom', '2026-05-02T10:00:00.000Z')`).run(TAG);
const tagRow = db.prepare(`SELECT name, updated_at FROM tags WHERE id = ?`).get(TAG);
const tagTombs = db.prepare(`SELECT COUNT(*) AS n FROM _sync_deleted WHERE table_name = 'tags'`).get()?.n;
check('INSERT OR REPLACE سینکی → مُهر حفظ و بدون recursive', tagRow?.updated_at === '2026-05-02T10:00:00.000Z' && Number(tagTombs) === 0, JSON.stringify(tagRow ?? {}));

// ⑧ بذر cursor اپوک در _sync_state
const seeds = db.prepare(`SELECT COUNT(*) AS n FROM _sync_state WHERE pull_cursor = ? AND push_cursor = ?`)
  .get('{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
check('بذر cursor اپوک برای همهٔ جداول دامنه', Number(seeds?.n) === 60, `${seeds?.n} ردیف`);

// ⑨ اجرای دوبارهٔ کل فایل 0114 → خطای موردانتظر (ADD COLUMN شکل IF NOT EXISTS ندارد)
let rerunErr = null;
try {
  db.exec(readFileSync(path.join(MIG, '0114_instance_sync.sql'), 'utf8'));
} catch (err) {
  rerunErr = err instanceof Error ? err.message : String(err);
}
check('اجرای دوبارهٔ 0114 → خطای duplicate column (یک‌بارمصرف)', Boolean(rerunErr) && /duplicate column name/i.test(rerunErr ?? ''), rerunErr ?? 'بدون خطا!');

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait کوتاه برای مُهر تازه‌تر */ }
}

if (failed > 0) {
  console.error(`✋ دود مایگریشن 0114 ناقص — ${failed} چک قرمز`);
  process.exit(1);
}
console.log('✓ دود مایگریشن 0114 سبز');
