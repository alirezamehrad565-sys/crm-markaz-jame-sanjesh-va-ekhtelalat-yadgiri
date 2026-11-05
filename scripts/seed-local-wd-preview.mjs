// بذر دادهٔ نمایشی «روز کاری» — فقط محیط ایزولهٔ محلی (هرگز روی ریموت اجرا نشود)
// خروجی: SQL آمادهٔ اجرا با wrangler d1 execute DB --local --file
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

// — همان fnv1a در staff-hue.js برای کنترل رنگ هر درمانگر
function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
const hueOf = (id) => (fnv1a(id) % 8) + 1;

function findIdWithHue(hue, salt = '') {
  for (let i = 0; i < 5000; i += 1) {
    const id = `c0000000-0000-4000-8000-${String(i).padStart(12, '0')}${salt}`;
    if (hueOf(id) === hue) return id.slice(0, 36);
  }
  throw new Error('no id');
}

const TODAY = '2026-11-04'; // چهارشنبه — weekday = 4 (تاریخ جاری تهران در زمان تست)
const MGR_ID = 'b0000000-0000-4000-8000-0000000000c1';

const therapists = [
  { id: findIdWithHue(2), name: 'سارا محمدی', role: 'therapist', att: 'present', attNote: null, hours: [[480, 840]] },
  { id: findIdWithHue(5), name: 'نگار رستمی', role: 'therapist', att: 'late', attNote: 'تأخیر ترافیک صبحگاهی', hours: [[480, 840]] },
  { id: findIdWithHue(7), name: 'امیر کریمی', role: 'therapist', att: 'leave', attNote: 'مرخصی ساعتی تا ۱۰', hours: [[540, 780]] }
];

const students = [
  ['d0000000-0000-4000-8000-000000000001', 'زهرا', 'اکبری', '0912*001'],
  ['d0000000-0000-4000-8000-000000000002', 'علی', 'رضایی', '0912*002'],
  ['d0000000-0000-4000-8000-000000000003', 'محمد', 'حسینی', '0912*003'],
  ['d0000000-0000-4000-8000-000000000004', 'فاطمه', 'جوادی', '0912*004'],
  ['d0000000-0000-4000-8000-000000000005', 'مریم', 'صادقی', '0912*005'],
  ['d0000000-0000-4000-8000-000000000006', 'رضا', 'موسوی', '0912*006'],
  ['d0000000-0000-4000-8000-000000000007', 'امین', 'قاسمی', '0912*007'],
  ['d0000000-0000-4000-8000-000000000008', 'سارا', 'نادری', '0912*008']
].map(([id, f, l, ph]) => ({ id, name: `${f} ${l}`, phone: ph, guardian: `${f}‌ خانواده` }));

// زمان تهران → ISO UTC (تهران = UTC+3:30)
const iso = (h, m) => new Date(Date.UTC(2026, 10, 4, h - 3, m - 30)).toISOString().replace('.000Z', 'Z');

const appts = [
  // T1 — سارا محمدی (hue 2)
  { id: 'e0000000-0000-4000-8000-000000000001', staff: 0, start: [8, 0], dur: 45, ops: 'completed', stype: 'individual', note: 'جلسهٔ ۱۲ — وظایف خواندن دوحرفی',
    students: [ ['d0000000-0000-4000-8000-000000000001', 'present'] ] },
  { id: 'e0000000-0000-4000-8000-000000000002', staff: 0, start: [9, 0], dur: 60, ops: 'in_session', stype: 'group', note: null,
    students: [ ['d0000000-0000-4000-8000-000000000002', 'present'], ['d0000000-0000-4000-8000-000000000003', 'present'] ] },
  { id: 'e0000000-0000-4000-8000-000000000003', staff: 0, start: [10, 30], dur: 45, ops: null, stype: 'individual', note: null,
    students: [ ['d0000000-0000-4000-8000-000000000004', 'present'] ] },
  // T2 — نگار رستمی (hue 5)
  { id: 'e0000000-0000-4000-8000-000000000004', staff: 1, start: [8, 0], dur: 60, ops: 'checked_in', stype: 'family_ed', note: 'آموزش مادر — تقویت توجه شنیداری',
    students: [ ['d0000000-0000-4000-8000-000000000005', 'present'] ] },
  { id: 'e0000000-0000-4000-8000-000000000005', staff: 1, start: [9, 30], dur: 45, ops: null, stype: 'individual', note: null,
    students: [ ['d0000000-0000-4000-8000-000000000006', 'present'] ] },
  { id: 'e0000000-0000-4000-8000-000000000006', staff: 1, start: [11, 0], dur: 45, ops: 'no_show', stype: 'mental_ot', note: 'تماس گرفته شد — جلسهٔ جبرانی پیشنهاد شد',
    students: [ ['d0000000-0000-4000-8000-000000000007', 'absent'] ] },
  // T3 — امیر کریمی (hue 7)
  { id: 'e0000000-0000-4000-8000-000000000007', staff: 2, start: [9, 0], dur: 45, ops: 'delayed', stype: 'individual', note: null,
    students: [ ['d0000000-0000-4000-8000-000000000008', 'present'] ] },
  { id: 'e0000000-0000-4000-8000-000000000008', staff: 2, start: [10, 0], dur: 50, ops: null, stype: 'teacher_ed', note: 'کارگاه آموزگاران مدرسهٔ نمونه',
    students: [] },
  { id: 'e0000000-0000-4000-8000-000000000009', staff: 2, start: [12, 0], dur: 45, ops: null, stype: 'individual', note: null, cancelled: true,
    students: [ ['d0000000-0000-4000-8000-000000000004', 'cancelled'] ] }
];

const esc = (s) => String(s).replace(/'/g, "''");
const lines = [];
lines.push('PRAGMA foreign_keys=OFF;');
lines.push(`DELETE FROM appointment_students WHERE appointment_id LIKE 'e0000000-0000-4000-8000-%';`);
lines.push(`DELETE FROM appointments WHERE id LIKE 'e0000000-0000-4000-8000-%';`);
lines.push(`DELETE FROM working_hours WHERE staff_id LIKE 'c0000000-0000-4000-8000-%';`);
lines.push(`DELETE FROM staff_attendance WHERE staff_id LIKE 'c0000000-0000-4000-8000-%';`);
lines.push(`DELETE FROM students WHERE id LIKE 'd0000000-0000-4000-8000-%';`);
lines.push(`DELETE FROM day_notes WHERE created_by='${MGR_ID}';`);
lines.push(`DELETE FROM staff WHERE id LIKE 'c0000000-0000-4000-8000-%';`);

const pwd = await hashPassword('Local-Test-1405!x');
lines.push(`DELETE FROM staff WHERE id='${MGR_ID}';`);
lines.push(`INSERT INTO staff (id, email, full_name, role, active, created_at, notify_enabled, username, password_hash) VALUES ('${MGR_ID}', 'local-mgr2@local.test', 'مدیر تست محلی', 'manager', 1, datetime('now'), 0, 'local-mgr2', '${pwd}');`);

for (const t of therapists) {
  lines.push(`INSERT INTO staff (id, email, full_name, role, active, created_at, notify_enabled, phone) VALUES ('${t.id}', '${esc(t.name).replace(/ /g, '.')}@local.test', '${esc(t.name)}', '${t.role}', 1, datetime('now'), 0, '0912*${t.id.slice(-3)}');`);
  for (const [s, e] of t.hours) {
    lines.push(`INSERT INTO working_hours (id, staff_id, weekday, start_minute, end_minute) VALUES ('wh-${t.id.slice(-4)}-${s}', '${t.id}', 4, ${s}, ${e});`);
  }
  lines.push(`INSERT INTO staff_attendance (id, staff_id, date, status, note, created_at, updated_at) VALUES ('sa-${t.id.slice(-4)}', '${t.id}', '${TODAY}', '${t.att}', ${t.attNote ? `'${esc(t.attNote)}'` : 'NULL'}, datetime('now'), datetime('now'));`);
}

for (const [i, s] of students.entries()) {
  lines.push(`INSERT INTO students (id, national_id, first_name, last_name, birth_date, gender, grade, guardian_name, guardian_relation, guardian_phone, active, created_at, case_status, pathway) VALUES ('${s.id}', '00${(i + 1).toString().padStart(8, '0')}', '${esc(s.name.split(' ')[0])}', '${esc(s.name.split(' ')[1])}', '2015-06-15', '${i % 2 ? 'female' : 'male'}', 'دوم', 'ولیّ ${esc(s.name.split(' ')[1])}', 'پدر', '${s.phone}', 1, datetime('now'), 'active', 'learning');`);
}

for (const a of appts) {
  const t = therapists[a.staff];
  const start = iso(a.start[0], a.start[1]);
  const end = new Date(Date.parse(start) + a.dur * 60000).toISOString().replace('.000Z', 'Z');
  lines.push(`INSERT INTO appointments (id, staff_id, start_at, end_at, status, note, version, created_by, created_at, updated_at, ops_status, session_type) VALUES ('${a.id}', '${t.id}', '${start}', '${end}', '${a.cancelled ? 'cancelled' : 'scheduled'}', ${a.note ? `'${esc(a.note)}'` : 'NULL'}, 1, '${MGR_ID}', datetime('now'), datetime('now'), ${a.ops ? `'${a.ops}'` : 'NULL'}, '${a.stype}');`);
  for (const [sid, att] of a.students) {
    lines.push(`INSERT INTO appointment_students (appointment_id, student_id, attendance) VALUES ('${a.id}', '${sid}', '${att}');`);
  }
}

lines.push(`INSERT INTO day_notes (id, date, body, created_by, created_at, kind) VALUES ('dn-1', '${TODAY}', 'جلسهٔ اولی‌ها با تأخیر شروع شد؛ اتاق ۲ تا ساعت ۱۰ آزاد است.', '${MGR_ID}', datetime('now'), 'human');`);
lines.push(`INSERT INTO day_notes (id, date, body, created_by, created_at, kind) VALUES ('dn-2', '${TODAY}', 'سه جلسهٔ ارزیابی امروز ثبت شد — پایین بودن تعداد غیبت‌ها نسبت به هفتهٔ قبل.', '${MGR_ID}', datetime('now'), 'system');`);

lines.push('PRAGMA foreign_keys=ON;');
lines.push(`SELECT 'staff', COUNT(*) FROM staff WHERE id LIKE 'c0000000%';
SELECT 'appts', COUNT(*) FROM appointments WHERE id LIKE 'e0000000%';
SELECT 'students', COUNT(*) FROM students WHERE id LIKE 'd0000000%';`);

const fs = await import('node:fs');
fs.writeFileSync('/tmp/wd-seed.sql', lines.join('\n') + '\n');
console.log('wrote /tmp/wd-seed.sql —', lines.length, 'statements');
console.log('therapist hues:', therapists.map((t) => `${t.name}→hue-${hueOf(t.id)}`).join(', '));
