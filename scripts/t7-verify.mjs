/**
 * t7-verify.mjs — راستی‌آزمایی باندل زندهٔ تولید برای T7 (m150-b — فرم جامع معلم + انتخاب معلم)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * الگوی scripts/t2-verify.mjs (T2): import کامل باندل در Node خاموشِ بی‌صدا می‌شود
 * (shimهای unenv/workerd) — پس ناحیهٔ case-events با لنگرهای متنی از bundle.js بریده و
 * در vm با وابستگی‌های تزریقی اجرا می‌شود؛ یعنی کدی که تست می‌شود بایت‌به‌بایت کد تولید است.
 *
 * پوشش:
 *   ۱) قرارداد پکیج: battery-composite.json ≡ packageComponentsOf باندل (خانواده + معلم)
 *   ۲) پاریتی زیرمقیاس معلم×والد (snap/sdq از DB) + sld_read/sld_write/sld_calc هم‌نام سیگنال شرح‌حال v3
 *   ۳) گره‌خوردن معلم: sanitize/parse/withTeacherName خالص + رفتاری (issueTeacherFillLink → fill → «پاسخ معلم»)
 *   ۴) sendChecklistLink با معلم → قالب bot_teacher_package_link + لینک در پاسخ
 *   ۵) سیم‌کشی تولید: مسیرها/سرویس/قالب/رندرر/CRUD معلم + idempotency متنی مایگریشن 0062
 *
 * اجرا:  node scripts/t7-verify.mjs   (خروج: PASS/FAIL — exit 0 فقط با صفر شکست)
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUNDLE_PATH = path.join(ROOT, 'worker', 'bundle.js');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

const bundleSrc = fs.readFileSync(BUNDLE_PATH, 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ───────────── ۱) استخراج ناحیهٔ case-events از باندل (لنگر متنی، نه شماره خط) ─────────────

const REGION_START = 'var CASE_EVENT_CATEGORIES = ["session", "checklist", "note"];';
const REGION_END = '__name2(createCaseEventsService, "createCaseEventsService");';

function cutRegion(src) {
  const start = src.indexOf(REGION_START);
  const end = src.indexOf(REGION_END, start);
  if (start === -1 || end === -1) throw new Error('لنگر ناحیهٔ case-events در باندل پیدا نشد');
  return src.slice(start, end + REGION_END.length);
}
const region = cutRegion(bundleSrc);
check('ناحیهٔ case-events در باندل یکتاست',
  bundleSrc.split(REGION_START).length - 1 === 1 && bundleSrc.split(REGION_END).length - 1 === 1);

// ───────────── ۲) DB ماک + وابستگی‌های تزریقی (هم‌رفتار باندل) ─────────────

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
}

/** آداپتر DbClient — همان قرارداد createDb باندل (query/queryOne/execute/transaction) */
function makeDbClient(sqlite) {
  const run = (sql, params = []) => sqlite.prepare(sql).run(...params);
  const all = (sql, params = []) => sqlite.prepare(sql).all(...params);
  const base = {
    async query(sql, params = []) { return all(sql, params); },
    async queryOne(sql, params = []) { const rows = all(sql, params); return rows.length > 0 ? rows[0] : null; },
    async execute(sql, params = []) { return run(sql, params); },
    async batch(statements) { return statements; },
    async transaction(fn) {
      const collected = [];
      const tx = {
        query: base.query,
        queryOne: base.queryOne,
        execute: async (sql, params = []) => { collected.push([sql, params]); return { success: true, meta: {} }; }
      };
      const out = await fn(tx);
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const [sql, params] of collected) run(sql, params);
        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
      return out;
    }
  };
  return base;
}

const dbClient = makeDbClient(db);

const auditCalls = [];
const audit = {
  async log(entry) { auditCalls.push({ ...entry, tx: false }); },
  async logInTransaction(_tx, entry) { auditCalls.push({ ...entry, tx: true }); }
};

const logger = { child: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }) };

const enqueued = [];
const notify = {
  getChannel(name) { return name === 'internal' ? { name } : null; },
  async enqueue(input) { enqueued.push(input); return { duplicate: false }; },
  async dispatchPending() { return enqueued.length; }
};

// ───────────── ۳) اجرای ناحیهٔ باندل در vm ─────────────

const require2 = createRequire(path.join(ROOT, 'package.json'));
const { z } = require2('zod');

class AppError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
class NotFoundError extends AppError { constructor(m) { super(m, 404); this.name = 'NotFoundError'; } }
class ValidationError extends AppError { constructor(m) { super(m, 400); this.name = 'ValidationError'; } }
class ConflictError extends AppError { constructor(m) { super(m, 409); this.name = 'ConflictError'; } }

const context = vm.createContext({
  crypto,
  console,
  setTimeout,
  clearTimeout,
  __name: (t, v) => { try { Object.defineProperty(t, 'name', { value: v, configurable: true }); } catch { /* noop */ } return t; },
  __name2: (t, _v) => t,
  // وابستگی‌های ماژولی که ناحیه از بیرون می‌خواند
  z,
  external_exports: z, // — esbuild: import * as external_exports from 'zod'
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError: class ForbiddenError extends AppError { constructor(m) { super(m, 403); this.name = 'ForbiddenError'; } },
  ALLOWED_FILE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/html'],
  MAX_FILE_BYTES: 512 * 1024,
  FOLLOWUP_DEFAULT_DUE_DAYS: 7
});

const { createCaseEventsService } = vm.runInContext(
  `(function(){ "use strict";\n${region}\nreturn { createCaseEventsService };})()`,
  context,
  { filename: 'bundle-case-events-region.js' }
);

const svc = createCaseEventsService({
  db: dbClient,
  audit,
  logger,
  publicBaseUrl: 'https://center.test.example.com'
});

// ───────────── ۴) قرارداد پکیج — battery-composite.json ≡ باندل ─────────────

console.log('T7 bundle verify — قرارداد پکیج (باندل vm):');
const composite = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/domain/clinical-engine/battery-composite.json'), 'utf8'));
const pkgOf = (key) => composite.find((t) => t.key === key)?.packageComponents ?? null;
const pure = { packageComponentsOf: null, sanitizeTeacherName: null, teacherBindingOfPayload: null, withTeacherName: null };
// توابع خالص از ناحیهٔ باندل (بازخوانی با eval محصور)
const pureGrab = vm.runInContext(
  `(function(){ "use strict";\n${region}\nreturn { packageComponentsOf, sanitizeTeacherName, teacherBindingOfPayload, withTeacherName };})()`,
  context,
  { filename: 'bundle-case-events-pure.js' }
);

check('پکیج معلم: باتری ≡ باندل ≡ قرارداد', JSON.stringify(pureGrab.packageComponentsOf('ce-comp-teacher-v2')) === JSON.stringify(['ce-snap-iv-t-v1', 'ce-sdq-t-v1', 'ce-sld-class-t-v1'])
  && JSON.stringify(pkgOf('ce-comp-teacher-v2')) === JSON.stringify(['ce-snap-iv-t-v1', 'ce-sdq-t-v1', 'ce-sld-class-t-v1']),
  JSON.stringify(pureGrab.packageComponentsOf('ce-comp-teacher-v2')));
check('پکیج خانواده (T5) پابرجا: باتری ≡ باندل', JSON.stringify(pureGrab.packageComponentsOf('ce-comp-family-v2')) === JSON.stringify(['ce-snap-iv-p-v1', 'ce-sdq-p-v1', 'ce-scared-p-v1', 'ce-id-adapt-v1'])
  && JSON.stringify(pkgOf('ce-comp-family-v2')) === JSON.stringify(['ce-snap-iv-p-v1', 'ce-sdq-p-v1', 'ce-scared-p-v1', 'ce-id-adapt-v1']));
check('تکی‌ها پکیج نیستند', pureGrab.packageComponentsOf('ce-snap-iv-t-v1') === null && pureGrab.packageComponentsOf('sdq-parent') === null && pureGrab.packageComponentsOf(null) === null);

// پاریتی زیرمقیاس معلم×والد — از DB (seed واقعی مایگریشن‌ها)
const subsOf = (key) => JSON.parse(db.prepare(`SELECT subscales FROM case_event_types WHERE key = ?`).get(key).subscales ?? '[]').map((s) => s.id);
check('SNAP-IV: زیرمقیاس معلم ≡ والد (ia/hi/odd)', JSON.stringify(subsOf('ce-snap-iv-t-v1')) === JSON.stringify(subsOf('ce-snap-iv-p-v1')));
check('SDQ: زیرمقیاس معلم ≡ والد (emo/cond/hyper/peer/pros)', JSON.stringify(subsOf('ce-sdq-t-v1')) === JSON.stringify(subsOf('ce-sdq-p-v1')));
check('ملاک‌های کلاسی: sld_read/sld_write/sld_calc', JSON.stringify(subsOf('ce-sld-class-t-v1')) === JSON.stringify(['sld_read', 'sld_write', 'sld_calc']));
check('کلیدهای sld_* هم‌نام سیگنال شرح‌حال v3 در موتور', ['anam.sld_read', 'anam.sld_write', 'anam.sld_calc'].every((k) => bundleSrc.includes(k)));

// ───────────── ۵) توابع خالص اتصال معلم ─────────────

check('sanitizeTeacherName: نرمال/رد کوتاه و بلند', pureGrab.sanitizeTeacherName('  سرکار   موسوی ') === 'سرکار موسوی'
  && pureGrab.sanitizeTeacherName('م') === null
  && pureGrab.sanitizeTeacherName('') === null
  && pureGrab.sanitizeTeacherName('x'.repeat(121)) === null);
check('teacherBindingOfPayload: خواندن امن از payload', JSON.stringify(pureGrab.teacherBindingOfPayload({ teacher_binding: { name: 'سرکار موسوی', teacherId: 't1' } })) === '{"name":"سرکار موسوی","teacherId":"t1"}'
  && pureGrab.teacherBindingOfPayload(null) === null
  && pureGrab.teacherBindingOfPayload({ teacher_binding: { name: 'x' } }) === null
  && pureGrab.teacherBindingOfPayload({ teacher_binding: 'garbage' }) === null);
const injected = pureGrab.withTeacherName({ a: { value: '1', label: 'x' } }, { name: 'جناب کاظمی' });
check('withTeacherName: تزریق «پاسخ معلم» با حفظ بقیه کلیدها', injected.a.value === '1' && injected.teacher_name.value === 'جناب کاظمی' && injected.teacher_name.label === 'پاسخ معلم');

// ───────────── ۶) رفتاری: صدور لینک معلم → پر کردن → «پاسخ معلم: X» ─────────────

console.log('T7 bundle verify — جریان پکیج معلم (vm):');
db.prepare(`INSERT INTO staff (id, email, full_name, role, active) VALUES ('ali-therapist', 'ali@t.local', 'علی', 'therapist', 1)`).run();
const stu = db.prepare(`INSERT INTO students (id, national_id, first_name, last_name, gender, active) VALUES (?, ?, 'آوا', 'باندلی', 'female', 1) RETURNING id`).get(crypto.randomUUID(), `9977${Date.now() % 100000}`.slice(0, 10));
const studentId = stu.id;
const actor = { staffId: 'ali-therapist', email: 'ali@t.local', role: 'therapist', displayName: 'علی' };
const typeByKey = (key) => db.prepare(`SELECT id FROM case_event_types WHERE key = ?`).get(key).id;
const fieldsOf = (key) => JSON.parse(db.prepare(`SELECT fields FROM case_event_types WHERE key = ?`).get(key).fields);

// CRUD معلم — از مسیر سرویس پرونده؟ (student_teachers مالکیت student-profile است — این‌جا فقط جدول)
db.prepare(`INSERT INTO student_teachers (id, student_id, name, class_label, contact) VALUES ('tw-1', ?, 'سرکار موسوی', 'چهارم ب', '09121112233')`).run(studentId);
db.prepare(`INSERT INTO student_teachers (id, student_id, name, class_label, contact) VALUES ('tw-2', ?, 'جناب کاظمی', 'هنر', NULL)`).run(studentId);

// رویداد لنگر پکیج معلم + صدور لینک برای معلم اول
const anchor1 = await svc.createEvent({ eventTypeId: typeByKey('ce-comp-teacher-v2'), studentId, values: {} }, actor);
check('createEvent: لنگر پکیج pending_family با توکن', anchor1.status === 'pending_family' && Boolean(anchor1.fillExpiresAt));
const issued1 = await svc.issueTeacherFillLink(anchor1.id, { teacherName: 'سرکار موسوی', teacherId: 'tw-1' }, actor);
check('issueTeacherFillLink: لینک امن + نام معلم', issued1.teacherName === 'سرکار موسوی' && issued1.link.includes(`/public/case-events/${anchor1.id}/fill?token=`), JSON.stringify(issued1));
check('issueTeacherFillLink: audit teacher_link_issued', auditCalls.some((a) => a.action === 'case_event.teacher_link_issued' && a.resourceId === anchor1.id));
check('issueTeacherFillLink: اتصال در payload لنگر', JSON.parse(db.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(anchor1.id).payload).teacher_binding.name === 'سرکار موسوی');

// صدور بدون نام → ۴۰۰
let badIssue = null;
try { await svc.issueTeacherFillLink(anchor1.id, { teacherName: '  ' }, actor); } catch (e) { badIssue = e; }
check('issueTeacherFillLink: نام خالی → ValidationError فارسی', badIssue !== null && badIssue.status === 400 && /نام معلم/.test(badIssue.message));

// پر کردن معلم دوم روی رویداد مستقل خودش
const anchor2 = await svc.createEvent({ eventTypeId: typeByKey('ce-comp-teacher-v2'), studentId, values: {} }, actor);
const issued2 = await svc.issueTeacherFillLink(anchor2.id, { teacherName: 'جناب کاظمی', teacherId: 'tw-2' }, actor);
check('چند معلم = چند لینک مستقل', issued2.link !== issued1.link && issued2.link.includes(`/public/case-events/${anchor2.id}/fill?token=`));

function buildAnswers() {
  const answers = {};
  for (const k of ['ce-snap-iv-t-v1', 'ce-sdq-t-v1', 'ce-sld-class-t-v1']) {
    for (const f of fieldsOf(k)) answers[f.key] = 0;
  }
  answers['obs_role'] = 'معلم کلاس';
  answers['obs_period'] = 'بیش از یک سال';
  return answers;
}
const filled2 = await svc.fillByFamily(anchor2.id, { values: buildAnswers(), sourceChatId: null, viaWeb: true }, { staffId: 'bale-bot', email: 'b@x', role: 'manager', displayName: 'فرم' });
check('fillByFamily: لنگر → completed', filled2.status === 'completed');
const anchor2Row = db.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(anchor2.id);
const anchor2Payload = JSON.parse(anchor2Row.payload);
check('رویداد زمینه: «پاسخ معلم: جناب کاظمی»', anchor2Payload.teacher_name?.value === 'جناب کاظمی' && anchor2Payload.teacher_name?.label === 'پاسخ معلم', JSON.stringify(anchor2Payload.teacher_name));
const compRows = db.prepare(
  `SELECT t.key AS k, e.payload, e.analysis FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id
    WHERE e.student_id = ? AND e.status = 'completed' AND e.id != ? AND e.id != ?`
).all(studentId, anchor1.id, anchor2.id);
check('سه رویداد مستقل کامپوننت ساخته شد', compRows.length === 3, JSON.stringify(compRows.map((r) => r.k)));
const byKey = Object.fromEntries(compRows.map((r) => [r.k, r]));
check('هر کامپوننت «پاسخ معلم» خودش را دارد', ['ce-snap-iv-t-v1', 'ce-sdq-t-v1', 'ce-sld-class-t-v1'].every((k) => JSON.parse(byKey[k].payload).teacher_name?.value === 'جناب کاظمی'));
const sldAnalysis = JSON.parse(byKey['ce-sld-class-t-v1'].analysis);
check('تحلیل v2 ملاک‌های کلاسی: زیرمقیاس‌های sld_* با باند خودشان', JSON.stringify(sldAnalysis.subscaleScores.map((s) => s.id)) === '["sld_read","sld_write","sld_calc"]' && sldAnalysis.subscaleScores.every((s) => s.score === 0 && s.max === 8));
check('submit دوباره → ۴۰۹ (تک‌مصرف)', await (async () => {
  try { await svc.fillByFamily(anchor2.id, { values: buildAnswers(), sourceChatId: null, viaWeb: true }, actor); return false; }
  catch (e) { return e.status === 409; }
})());

// تک معلم (sdq-t) با اتصال → «پاسخ معلم» در payload تک هم
const single1 = await svc.createEvent({ eventTypeId: typeByKey('ce-sdq-t-v1'), studentId, values: {} }, actor);
await svc.issueTeacherFillLink(single1.id, { teacherName: 'جناب کاظمی' }, actor);
const singleAnswers = Object.fromEntries(fieldsOf('ce-sdq-t-v1').map((f) => [f.key, 0]));
await svc.fillByFamily(single1.id, { values: singleAnswers, sourceChatId: null, viaWeb: true }, actor);
check('تکی معلم با اتصال: payload «پاسخ معلم» دارد', JSON.parse(db.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(single1.id).payload).teacher_name?.value === 'جناب کاظمی');

// تک بدون اتصال → بدون «پاسخ معلم» (رفتار قدیمی پابرجا)
const single2 = await svc.createEvent({ eventTypeId: typeByKey('ce-snap-iv-t-v1'), studentId, values: {} }, actor);
const snapAnswers = Object.fromEntries(fieldsOf('ce-snap-iv-t-v1').map((f) => [f.key, 1]));
await svc.fillByFamily(single2.id, { values: snapAnswers, sourceChatId: null, viaWeb: true }, actor);
const single2Payload = JSON.parse(db.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(single2.id).payload);
check('تکی بدون اتصال: payload بدون «پاسخ معلم» (رفتار قدیمی)', single2Payload.teacher_name === undefined && JSON.parse(db.prepare(`SELECT analysis FROM case_events WHERE id = ?`).get(single2.id).analysis).score === 26);

// ───────────── ۷) ارسال بله با اتصال معلم → قالب معلم‌محور ─────────────

db.prepare(`INSERT INTO schools (id, name, kind, active) VALUES ('10000000-0000-0000-0000-000000000001', 'مدرسهٔ آزمون T7', 'school', 1)`).run();
db.prepare(`INSERT INTO classes (id, school_id, name, teacher_name, teacher_phone, active) VALUES ('c-t7v', '10000000-0000-0000-0000-000000000001', 'پنجم ت', 'سرکار موسوی', '09120000009', 1)`).run();
db.prepare(`UPDATE students SET class_id = 'c-t7v' WHERE id = ?`).run(studentId);
db.prepare(`INSERT INTO class_bot_links (id, code, class_id, chat_id, status, created_by, created_at, updated_at) VALUES ('cbl-t7v', 'T7VMCLS1', 'c-t7v', '9161', 'linked', 'seed', datetime('now'), datetime('now'))`).run();
const sentInputs = [];
svc.setSendObserver(async (input) => { sentInputs.push(input); return input.chats.length; });
const anchor3 = await svc.createEvent({ eventTypeId: typeByKey('ce-comp-teacher-v2'), studentId, values: {} }, actor);
const sendOut = await svc.sendChecklistLink(anchor3.id, { audience: 'teacher', teacherName: 'سرکار موسوی', teacherId: 'tw-1' }, actor);
check('sendChecklistLink: ارسال به چت کلاس', sendOut.sent >= 1 && sendOut.targets.includes('9161'), JSON.stringify(sendOut));
check('sendChecklistLink: قالب bot_teacher_package_link + teacherName + لینک', sentInputs.some((i) => i.template === 'bot_teacher_package_link' && i.vars.teacherName === 'سرکار موسوی' && typeof i.vars.extra === 'string' && i.vars.extra.includes('https://')));
check('sendChecklistLink: لینک در پاسخ برای کپی', typeof sendOut.link === 'string' && sendOut.link.includes(`/public/case-events/${anchor3.id}/fill?token=`));
check('sendChecklistLink: اتصال معلم ثبت شد', JSON.parse(db.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(anchor3.id).payload).teacher_binding.name === 'سرکار موسوی');
check('sendChecklistLink: audit link_sent با teacherName', auditCalls.some((a) => a.action === 'case_event.link_sent' && a.changes?.teacherName?.to === 'سرکار موسوی'));

// ───────────── ۸) سیم‌کشی تولید + idempotency متنی مایگریشن ─────────────

console.log('T7 bundle verify — سیم‌کشی تولید:');
check('مسیر POST /api/case-events/:id/teacher-link در createApp', bundleSrc.includes('app.post("/api/case-events/:id/teacher-link", requireRole("manager", "secretary", "therapist")'));
check('سرویس issueTeacherFillLink در باندل', bundleSrc.includes('async issueTeacherFillLink(eventId, input, actor)'));
check('/send teacher_name/teacher_id می‌پذیرد', bundleSrc.includes('teacherName: body?.teacher_name ?? null, teacherId: body?.teacher_id ?? null'));
check('قالب bot_teacher_package_link در renderTemplate', bundleSrc.includes('case "bot_teacher_package_link":'));
check('سوییچ قالب بر اساس اتصال معلم', bundleSrc.includes('const template = teacher ? "bot_teacher_package_link" : "bot_checklist_link"'));
check('تزریق «پاسخ معلم» در fillPackageFlow باندل', bundleSrc.includes('const teacher = teacherBindingOfPayload(parseJson(row.payload, null));') && bundleSrc.includes('withTeacherName(buildEventPayload(anchorType.fields, values, true), teacher)'));
check('سربرگ «فرم شما — X» در هر دو رندرر (پکیج + تکی)', (bundleSrc.match(/model\.teacherLabel \? `<div class="who">\$\{esc\(model\.teacherLabel\)\}<\/div>`/g) ?? []).length === 2);
check('teacherBindingOfPayload در مسیر GET فرم عمومی', bundleSrc.includes('const teacherName = teacherBindingOfPayload(event.payload)?.name ?? null;'));
check('CRUD معلم‌ها در سرویس پروندهٔ باندل', bundleSrc.includes('async listStudentTeachers(studentId)') && bundleSrc.includes('INSERT INTO student_teachers (id, student_id, name, class_label, contact)'));
check('مسیرهای /api/students/:id/teachers در createApp', bundleSrc.includes('app.get("/api/students/:id/teachers"') && bundleSrc.includes('app.post("/api/students/:id/teachers"') && bundleSrc.includes('app.delete("/api/students/:id/teachers/:teacherId"'));

const mig = fs.readFileSync(path.join(ROOT, 'migrations/0062_student_teachers.sql'), 'utf8');
check('مایگریشن 0062: جدول و اندیس idempotent', mig.includes('CREATE TABLE IF NOT EXISTS student_teachers') && mig.includes('CREATE INDEX IF NOT EXISTS idx_student_teachers_student'));
check('مایگریشن 0062: seed یکتا با WHERE NOT EXISTS', mig.includes('NOT EXISTS (') && mig.includes('INSERT INTO student_teachers'));
check('مایگریشن 0062: seed نوع‌ها با INSERT OR IGNORE', (mig.match(/INSERT OR IGNORE INTO case_event_types/g) ?? []).length === 2 && mig.includes("'ce-sld-class-t-v1'") && mig.includes("'ce-comp-teacher-v2'"));
check('مایگریشن 0062: تخریبی نیست (DROP/DELETE/ALTER ندارد)', !/DROP\s+(TABLE|COLUMN)|ALTER TABLE|DELETE FROM/i.test(mig));

// ───────────── ۹) UI ماژول‌ها (فایل تولید) ─────────────

const cejs = fs.readFileSync(path.join(ROOT, 'public/assets/js/case-events.js'), 'utf8');
const spjs = fs.readFileSync(path.join(ROOT, 'public/assets/js/views/student-profile.js'), 'utf8');
check('case-events.js: پکیج معلم در کتابخانهٔ ارسال + انتخاب معلم + مسیر teacher-link', cejs.includes("s.type.key === 'ce-comp-teacher-v2'") && cejs.includes('/teacher-link') && cejs.includes('teacher_pick'));
check('student-profile.js: کارت «معلم‌ها» + افزودن/حذف', spjs.includes('renderTeachersCard') && spjs.includes('/teachers'));

console.log(`\nنتیجه: ${pass} گذر / ${fail} شکست`);
process.exit(fail === 0 ? 0 : 1);
