// scripts/engine/seed-demo.mjs — دیتای نمایشی موتور محلی (فاز ۲ خط rust — مخصوص میز)
//
// طراحی: docs/rust/design.md §۷ — مرکز «نمونه» + سه کاربر نقشی (مدیر/منشی/درمانگر)
// با رمز شناخته‌شدهٔ «۱۲۳۴» هش‌شده با همان PBKDF2 هستهٔ auth (src/core/auth/password.ts:
// ۲۵ هزار دور، SHA-256، نمک ۱۶ بایتی، ۲۵۶ بیت خروجی — قالب pbkdf2$iterations$salt$hash)
// + دادهٔ نمونهٔ حداقلی (یک مدرسه و دو مرجع). idempotent با INSERT OR IGNORE.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { REPO_ROOT, d1SqlitePath } from './engine-paths.mjs';

const DEMO_PASSWORD = '1234';
const PBKDF2_ITERATIONS = 25_000;
const SALT_BYTES = 16;
const DERIVED_BITS = 256;

/** عین hashPassword در src/core/auth/password.ts (بدون WebCrypto — همان قالب خروجی) */
function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  // pbkdf2Sync در نود طول خروجی را «بایت» می‌گیرد — ۲۵۶ بیت = ۳۲ بایت (همان DERIVED_BITS وب‌کریپتو)
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, DERIVED_BITS / 8, 'sha256');
  const b64 = (buf) => buf.toString('base64');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

const DEMO_USERS = [
  { id: '30000000-0000-4000-8000-000000000301', email: 'manager@demo.local', full_name: 'مدیر مرکز نمونه', role: 'manager', username: 'manager' },
  { id: '30000000-0000-4000-8000-000000000302', email: 'secretary@demo.local', full_name: 'منشی مرکز نمونه', role: 'secretary', username: 'secretary' },
  { id: '30000000-0000-4000-8000-000000000303', email: 'therapist@demo.local', full_name: 'درمانگر مرکز نمونه', role: 'therapist', username: 'therapist' },
];

export function seedDemo(dbPath) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  // مرکز «نمونه» — نام مرکز در settings (همان منبعی که اپ می‌خواند)
  db.prepare(`INSERT INTO settings (key, value) VALUES ('clinic_name', ?)
              ON CONFLICT(key) DO NOTHING`).run(JSON.stringify('مرکز نمونه'));
  // runtime-secret مشترک — اگر engine مقدار داده باشد همان می‌ماند؛ وگرنه همین‌جا تصادفی می‌شود
  db.prepare(`INSERT INTO settings (key, value) VALUES ('sys_auth_secret', ?)
              ON CONFLICT(key) DO NOTHING`).run(JSON.stringify(`demo-${randomBytes(24).toString('hex')}`));

  // سه کاربر نقشی — رمز «۱۲۳۴» با PBKDF2 هستهٔ auth
  const insertUser = db.prepare(`INSERT OR IGNORE INTO staff (id, email, full_name, role, active, username, password_hash)
    VALUES (?, ?, ?, ?, 1, ?, ?)`);
  let usersCreated = 0;
  for (const u of DEMO_USERS) {
    const r = insertUser.run(u.id, u.email, u.full_name, u.role, u.username, hashPassword(DEMO_PASSWORD));
    usersCreated += Number(r.changes);
  }
  // اگر کاربر قبلاً بوده، مطمئن شویم فعال است
  db.prepare(`UPDATE staff SET active = 1 WHERE id IN (${DEMO_USERS.map(() => '?').join(',')})`)
    .run(...DEMO_USERS.map((u) => u.id));

  // دادهٔ نمونهٔ حداقلی — یک مدرسه و دو مرجع (سازگار با اسکیمای migrations/0001)
  db.prepare(`INSERT OR IGNORE INTO schools (id, name, kind, active) VALUES (?, ?, 'school', 1)`)
    .run('40000000-0000-4000-8000-000000000401', 'دبستان نمونه');
  const insertStudent = db.prepare(`INSERT OR IGNORE INTO students
    (id, national_id, first_name, last_name, gender, grade, school_id, guardian_name, guardian_relation, guardian_phone, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  insertStudent.run('50000000-0000-4000-8000-000000000501', '5000010101', 'امیر', 'رضایی', 'male', 'سه', '40000000-0000-4000-8000-000000000401', 'حسین رضایی', 'پدر', '09121110501');
  insertStudent.run('50000000-0000-4000-8000-000000000502', '5000010102', 'سارا', 'محمدی', 'female', 'چهارم', '40000000-0000-4000-8000-000000000401', 'مریم محمدی', 'مادر', '09121110502');

  db.close();
  return { usersCreated };
}

// اجرای مستقیم: node scripts/engine/seed-demo.mjs --data-dir <مسیر>
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--data-dir');
  const dataDir = i >= 0 ? args[i + 1] : path.join(REPO_ROOT, 'engine-data');
  const result = seedDemo(d1SqlitePath(dataDir));
  console.log(`[engine] seed نمایشی: ${result.usersCreated} کاربر ساخته شد (manager/secretary/therapist — رمز ۱۲۳۴) — ${d1SqlitePath(dataDir)}`);
}
