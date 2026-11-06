// ساخت/حذف حساب QA موقت روی D1 ریموت — فقط برای راستی‌آزمایی فقط-خواندنی سه نما
// پسورد هرگز چاپ نمی‌شود؛ از env خوانده می‌شود. TAG همه‌جا: qa-ux12510
import { webcrypto as crypto } from 'node:crypto';

const ITER = 25_000;
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

export async function hashPassword(password) {
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

const mode = process.argv[2] ?? 'create'; // create | delete
const QA_ID = 'a1b2c3d4-0000-4000-8000-00000012510';
const QA_USER = 'qa-ux12510';

if (mode === 'delete') {
  console.log(`DELETE FROM audit_log WHERE actor_id='${QA_ID}'; DELETE FROM staff WHERE id='${QA_ID}' AND username='${QA_USER}';`);
  process.exit(0);
}

const pw = process.env.QA_PW;
if (!pw || pw.length < 12) { console.error('QA_PW env required (>=12 chars)'); process.exit(1); }
const h = await hashPassword(pw);
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
console.log(
  `DELETE FROM staff WHERE username='${QA_USER}'; ` +
  `INSERT INTO staff (id, email, full_name, role, active, created_at, notify_enabled, username, password_hash) VALUES ` +
  `('${QA_ID}', '${QA_USER}@qa.local', 'حساب QA — راستی‌آزمایی UI', 'manager', 1, '${now}', 0, '${QA_USER}', '${h}');`
);
