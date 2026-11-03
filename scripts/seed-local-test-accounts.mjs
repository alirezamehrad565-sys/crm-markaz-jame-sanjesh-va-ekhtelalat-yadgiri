// بذر حساب‌های تست محلی (فقط محیط ایزوله — هرگز روی دیتابیس ریموت اجرا نشود)
// خروجی: دو دستور INSERT برای wrangler d1 execute --local
import { webcrypto as crypto } from 'node:crypto';

const ITER = 25_000;
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER },
    key,
    256
  );
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

const accounts = [
  { id: 'b0000000-0000-4000-8000-0000000000c1', username: 'local-mgr2', fullName: 'مدیر تست محلی', role: 'manager' },
  { id: 'b0000000-0000-4000-8000-0000000000c2', username: 'local-ther2', fullName: 'درمانگر تست محلی', role: 'therapist' },
];

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const lines = [];
for (const a of accounts) {
  const h = await hashPassword('Local-Test-1405!x');
  lines.push(
    `DELETE FROM staff WHERE username='${a.username}'; INSERT INTO staff (id, email, full_name, role, active, created_at, notify_enabled, username, password_hash) VALUES ('${a.id}', '${a.username}@local.test', '${a.fullName}', '${a.role}', 1, '${now}', 0, '${a.username}', '${h}');`
  );
}
console.log(lines.join('\n'));
