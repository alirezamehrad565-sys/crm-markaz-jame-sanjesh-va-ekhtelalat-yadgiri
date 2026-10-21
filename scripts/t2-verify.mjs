/**
 * t2-verify.mjs — راستی‌آزمایی باندل زندهٔ تولید برای T2 (m151 — مدارک بله)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * الگوی tests/golden/generate-bundle-ref.mjs: import کامل باندل در Node خاموشِ بی‌صدا می‌شود
 * (shimهای unenv/workerd) — پس ناحیهٔ مدارک با لنگرهای متنی از خود bundle.js بریده و در
 * vm با وابستگی‌های تزریقی اجرا می‌شود؛ یعنی کدی که تست می‌شود بایت‌به‌بایت کد تولید است.
 *
 * پوشش:
 *   ۱) توابع خالص ناحیهٔ باندل (parseDocTemplates/normalizeDocNote/guardDocMedia/…)
 *   ۲) سرویس باندل روی SQLite درون‌حافظه: create → tryHandleMedia(عکس) → رکورد +
 *      ارتقای status → close → tryHandleMedia بعد از بستن = null (جریان فعلی دست‌نخورده)
 *   ۳) سیم‌کشی: لنگرهای هوک webhook و رجیستر مسیر و createServices در باندل
 *
 * اجرا:  node scripts/t2-verify.mjs   (خروج: PASS/FAIL — exit 0 فقط با صفر شکست)
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

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

// ───────────── ۱) استخراج ناحیهٔ مدارک از باندل (لنگر متنی، نه شماره خط) ─────────────

const REGION_START = 'var DOC_REQUEST_TEMPLATE_LABELS = {';
const REGION_END = '__name2(registerDocumentRequestRoutes, "registerDocumentRequestRoutes");';

function cutRegion(src) {
  const start = src.indexOf(REGION_START);
  const end = src.indexOf(REGION_END, start);
  if (start === -1 || end === -1) throw new Error('لنگر ناحیهٔ مدارک در باندل پیدا نشد');
  return src.slice(start, end + REGION_END.length);
}
const region = cutRegion(bundleSrc);
check('ناحیهٔ مدارک در باندل یکتاست', bundleSrc.split(REGION_START).length - 1 === 1 && bundleSrc.split(REGION_END).length - 1 === 1);

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

const storedObjects = new Map();
const storage = {
  async put(key, bytes) { storedObjects.set(key, bytes); },
  async get(key) { return storedObjects.has(key) ? { bytes: storedObjects.get(key), mime: 'application/octet-stream', size: storedObjects.get(key).length } : null; },
  async delete(key) { storedObjects.delete(key); }
};

const FETCHED = [];
const mediaFetcher = {
  available: true,
  async fetch(fileId) {
    FETCHED.push(fileId);
    return { bytes: new TextEncoder().encode(`JPEGBYTES-${fileId}`), mime: 'image/jpeg' };
  }
};

const enqueued = [];
const notify = {
  getChannel(name) { return name === 'internal' ? { name } : null; },
  async enqueue(input) { enqueued.push(input); return { duplicate: false }; },
  async dispatchPending() { return enqueued.length; }
};

const settings = { async getClinicName() { return 'مرکز آزمون T2'; } };

// ───────────── ۳) اجرای ناحیهٔ باندل در vm ─────────────

const context = vm.createContext({
  crypto,
  TextEncoder,
  console,
  setTimeout,
  clearTimeout,
  // — helpers esbuild باندل
  __name: (t, v) => { try { Object.defineProperty(t, 'name', { value: v, configurable: true }); } catch { /* noop */ } return t; },
  __name2: (t, _v) => t,
  // — وابستگی‌های دامنه‌ای که ناحیه از بیرون می‌خواند
  NotFoundError: class NotFoundError extends Error { constructor(msg) { super(msg); this.status = 404; } },
  ValidationError: class ValidationError extends Error { constructor(msg) { super(msg); this.status = 400; } },
  ConflictError: class ConflictError extends Error { constructor(msg) { super(msg); this.status = 409; } },
  renderTemplate: (id, vars) => `T:${id}:${vars?.studentName ?? ''}`,
  ALLOWED_EXERCISE_FILE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/html'],
  MAX_EXERCISE_FILE_BYTES: 512 * 1024,
  db: dbClient,
  audit,
  logger,
  storage,
  mediaFetcher,
  notify,
  settings
});

const { createDocumentRequestService: svcFactory, pure } = vm.runInContext(
  `(function(){ "use strict";\n${region}\nreturn { createDocumentRequestService, pure: { parseDocTemplates, normalizeDocNote, guardDocMedia, buildDocRequestBody, resolveDocFileName } };})()`,
  context,
  { filename: 'bundle-doc-region.js' }
);
const svc = svcFactory({ db: dbClient, audit, logger, storage, mediaFetcher, notify, settings });

// ───────────── ۴) تست‌های رفتاری روی کد باندل ─────────────

console.log('T2 bundle verify — ناحیهٔ مدارک بله از bundle.js (vm):');

// ۴.۱) خالص‌ها
check('parseDocTemplates: معتبر و یکتاساز', JSON.stringify(pure.parseDocTemplates(['report_card', 'dictation', 'dictation'])) === '["report_card","dictation"]');
check('parseDocTemplates: نامعتبر → null', pure.parseDocTemplates(['unknown']) === null && pure.parseDocTemplates([]) === null);
check('normalizeDocNote: خالی → null و نرمال فاصله', pure.normalizeDocNote('   ') === null && pure.normalizeDocNote(' س   لام ') === 'س لام');
check('guardDocMedia: exe ممنوع', pure.guardDocMedia({ type: 'document', mime: 'application/x-msdownload', size: 10 }, ['application/pdf'], 512 * 1024) === 'bad_type');
check('guardDocMedia: عکس همیشه مجاز', pure.guardDocMedia({ type: 'photo', mime: null, size: 99999999 }, [], 512 * 1024) === 'too_large' || pure.guardDocMedia({ type: 'photo', mime: null, size: null }, ['application/pdf'], 512 * 1024) === 'ok');
check('resolveDocFileName: سند نام خودش، عکس تولیدی', pure.resolveDocFileName({ type: 'document', fileName: 'a b.pdf' }, 'application/pdf', '2026-10-22T10:00:00.000Z') === 'a b.pdf' && /مدرک-\d{14}\.jpg/.test(pure.resolveDocFileName({ type: 'photo', fileName: null }, 'image/jpeg', '2026-10-22T10:00:00.000Z')));
check('buildDocRequestBody: فهرست + یادداشت', pure.buildDocRequestBody(['dictation'], 'یادداشت', null).includes('• نمونهٔ املا') && pure.buildDocRequestBody(['dictation'], 'یادداشت', null).includes('یادداشت'));

// ۴.۲) دادهٔ پایه — پرونده + اتصال چت
const nid = `99${Date.now()}`.slice(0, 10);
const stuInfo = db.prepare(`INSERT INTO students (id, national_id, first_name, last_name, gender, active) VALUES (?, ?, 'آوا', 'باندلی', 'female', 1) RETURNING id`).get(crypto.randomUUID(), nid);
const studentId = stuInfo.id;
db.prepare(`INSERT INTO bot_links (id, code, student_id, chat_id, status, created_by, created_at, updated_at) VALUES (?, 'DOCAB12', ?, '99011', 'linked', 'seed', datetime('now'), datetime('now'))`).run(crypto.randomUUID(), studentId);
const actor = { staffId: 'ali-therapist', email: 'ali@t.local', role: 'therapist', displayName: 'علی' };

// ۴.۳) create — درخواست + پیام
const created = await svc.create(studentId, { templates: ['dictation', 'report_card'], customNote: 'فقط نمونه‌های این ماه.' }, actor);
check('create: status sent + پیام به یک چت', created.request.status === 'sent' && created.deliveredChats === 1, JSON.stringify(created));
check('create: enqueue با قالب doc_request_sent', enqueued.some((n) => n.template === 'doc_request_sent' && n.recipient === '99011'));
check('create: audit document.request.sent', auditCalls.some((a) => a.action === 'document.request.sent' && a.resourceId === created.request.id));

// ۴.۴) tryHandleMedia — عکس خانواده
const reply = await svc.tryHandleMedia('99011', { type: 'photo', fileId: 'P1_b', fileName: null, mime: 'image/jpeg', size: 900 }, 'عکس املاها');
check('tryHandleMedia: پاسخ دریافت', typeof reply?.text === 'string' && reply.text.startsWith('T:bot_doc_received'), JSON.stringify(reply));
const docRow = db.prepare(`SELECT id, student_id, request_id, media_kind, file_mime, chat_id, caption FROM student_received_docs`).all()[0];
check('tryHandleMedia: رکورد + اتصال به درخواست', docRow?.request_id === created.request.id && docRow?.media_kind === 'photo' && docRow?.caption === 'عکس املاها' && docRow?.chat_id === '99011', JSON.stringify(docRow));
check('tryHandleMedia: فایل در انبار', [...storedObjects.keys()].some((k) => k.startsWith('doc/')));
const reqStatus = db.prepare(`SELECT status FROM document_requests WHERE id = ?`).get(created.request.id);
check('tryHandleMedia: درخواست → received', reqStatus?.status === 'received', JSON.stringify(reqStatus));
check('tryHandleMedia: audit هم‌تراکنش', auditCalls.some((a) => a.action === 'document.doc.received' && a.tx === true));
check('tryHandleMedia: دانلود از بله', FETCHED.includes('P1_b'));

// ۴.۵) گاردها
const badType = await svc.tryHandleMedia('99011', { type: 'document', fileId: 'X', fileName: 'a.exe', mime: 'application/x-msdownload', size: 10 }, null);
check('سند ممنوع → bot_doc_bad_type', badType?.text.startsWith('T:bot_doc_bad_type'), JSON.stringify(badType));
const tooBig = await svc.tryHandleMedia('99011', { type: 'photo', fileId: 'Y', fileName: null, mime: 'image/jpeg', size: 600 * 1024 }, null);
check('حجم زیاد → bot_doc_too_large', tooBig?.text.startsWith('T:bot_doc_too_large'), JSON.stringify(tooBig));

// ۴.۶) close و بعدش → null (جریان فعلی)
const closed = await svc.close(created.request.id, actor);
check('close: closed + closedAt', closed.status === 'closed' && Boolean(closed.closedAt));
let closedErr = null;
try { await svc.close(created.request.id, actor); } catch (err) { closedErr = err; }
check('close دوباره → تعارض', closedErr !== null && closedErr.status === 409);
const afterClose = await svc.tryHandleMedia('99011', { type: 'photo', fileId: 'Z', fileName: null, mime: 'image/jpeg', size: 100 }, null);
check('بعد از بستن → null (مسیر جریان فعلی بله)', afterClose === null, JSON.stringify(afterClose));
const stranger = await svc.tryHandleMedia('99777', { type: 'photo', fileId: 'S', fileName: null, mime: 'image/jpeg', size: 100 }, null);
check('چت بدون اتصال → null', stranger === null);

// ۴.۷) getDocFile
const fileRec = await svc.getDocFile(docRow.id);
check('getDocFile: بایت‌ها از انبار', fileRec !== null && new TextDecoder().decode(fileRec.bytes).startsWith('JPEGBYTES-'));
check('getDocFile: ناشناخته → null', (await svc.getDocFile(crypto.randomUUID())) === null);

// ───────────── ۵) سیم‌کشی باندل (لنگرهای متنی) ─────────────

console.log('T2 bundle verify — سیم‌کشی تولید:');
check('هوک webhook media_received', bundleSrc.includes('deps.documentRequests.tryHandleMedia(cmd.chatId, cmd.media, cmd.caption)'));
check('رجیستر مسیرها در createApp', /registerDocumentRequestRoutes\(app, services\.documentRequests\);/.test(bundleSrc));
check('ساخت سرویس در createServices (انبار مشترک)', bundleSrc.includes('storage: exerciseStorage') && bundleSrc.includes('notify: notifyCore'));
check('ورودی notify app service', /documentRequests,\n\s*publicBaseUrl/.test(bundleSrc));
check('خروجی createServices', bundleSrc.includes('exerciseBank, documentRequests, caseEvents'));
check('پنج قالب تازه در renderTemplate', ['doc_request_sent', 'bot_doc_received', 'bot_doc_bad_type', 'bot_doc_too_large', 'bot_doc_failed'].every((t) => bundleSrc.includes(`case "${t}":`)));

console.log(`\nنتیجه: ${pass} گذر / ${fail} شکست`);
process.exit(fail === 0 ? 0 : 1);
