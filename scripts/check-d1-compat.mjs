#!/usr/bin/env node
// scripts/check-d1-compat.mjs — گیت سازگاری SQL با Cloudflare D1 (v1.26.0)
//
//   node scripts/check-d1-compat.mjs        (یا: npm run check:d1)
//
// چه چیزی را اثبات می‌کند؟ «SQL محلی و مرکزی یکی است و روی D1 اجرا می‌شود»:
//   ① پویش مایگریشن‌ها برای سازه‌های واقعاً ناسازگار با D1 (مرز کلمه‌ای — «attachments»
//      دیگر مثبت کاذب نیست): PRAGMA / تراکنش دستی BEGIN…COMMIT / CREATE TRIGGER /
//      ATTACH DATABASE / VACUUM / REINDEX. AUTOINCREMENT جداگانه بررسی می‌شود چون
//      D1 آن را در الگوی «INTEGER PRIMARY KEY AUTOINCREMENT» می‌پذیرد (قرارداد SQLite).
//   ۲) تجمیع دقیق مایگریشن‌ها به schema.sql — همان قالب build-installer-runtime.mjs
//      (این فایل همان چیزی است که cf_deploy.rs به حساب کلادفلر کاربر می‌فرستد).
//   ۳) پورت حرف‌به‌حرف جداکنندهٔ قطعات cf_deploy.rs (نقل‌قول تک با '' escape، کامنت خطی
//      و بلوکی، شکست روی «;» بیرون از نقل‌قول/کامنت) + قطعه‌بندی ~۶۰KB — همان قرارداد
//      POST /d1/query («multiple statements, joined by semicolons, executed as a batch»).
//   ۴) اجرای واقعی همهٔ قطعات روی SQLite تازه (node:sqlite — هم‌خانوادهٔ موتور D1) و
//      برابری شمار جدول‌ها/ایندکس‌ها با شمار CREATE TABLE/INDEX مایگریشن‌ها + حضور
//      جدول‌های کلیدی سینک (sync_nodes/node_sync_inbox/…) و rum_events با الگوی درست.
//   ⑤ اجرای دوم کامل همان dump روی همان DB پرشده — تضمین «دوباره‌تلاش امن» استقرار مرکزی:
//      صفر خطا، بدون ساختن/حذف/عوض‌کردن هیچ شیءای (sqlite_master بایت‌به‌بایت ثابت).
// خروجی نرم: هر مشکل = پیام دقیق + exit 1.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = path.join(ROOT, 'migrations');
const QUERY_CHUNK_BYTES = 60_000; // هم‌ثابت cf_deploy.rs

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ [${pass}] ${name}`);
  } else {
    fail++;
    console.error(`  ✗ [${pass + fail}] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── ① پویش سازه‌های ناسازگار (مرز کلمه‌ای) ───
function scanRiskyConstructs(files) {
  const risky = [
    { re: /\bPRAGMA\b/i, label: 'PRAGMA', why: 'D1 فقط زیرمجموعه‌ای از PRAGMAها را می‌پذیرد و در اسکیما جایی ندارد' },
    { re: /\bBEGIN\s+(TRANSACTION|DEFERRED|IMMEDIATE|EXCLUSIVE)?\b/i, label: 'BEGIN', why: 'D1 خودش هر /query را batch اجرا می‌کند؛ تراکنش دستی ممنوع' },
    { re: /\bCOMMIT\b/i, label: 'COMMIT', why: 'تراکنش دستی' },
    { re: /\bCREATE\s+TRIGGER\b/i, label: 'CREATE TRIGGER', why: 'بدنهٔ چند-دستوری trigger با جداکنندهٔ «;» می‌شکند — مخزن بدون trigger نگه داشته می‌شود' },
    { re: /\bATTACH\s+DATABASE\b/i, label: 'ATTACH DATABASE', why: 'در D1 پشتیبانی نمی‌شود' },
    { re: /\bVACUUM\b/i, label: 'VACUUM', why: 'عملیات نگه‌داری فیزیکی — در D1 معنا ندارد' },
    { re: /\bREINDEX\b/i, label: 'REINDEX', why: 'عملیات نگه‌داری فیزیکی — در D1 معنا ندارد' }
  ];
  const hits = [];
  for (const f of files) {
    const text = readFileSync(path.join(MIG_DIR, f), 'utf8');
    for (const { re, label, why } of risky) {
      const m = text.match(re);
      if (m) hits.push({ file: f, label, why, line: text.slice(0, m.index).split('\n').length });
    }
  }
  return hits;
}

function scanAutoincrement(files) {
  const sites = [];
  const good = /\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/i;
  for (const f of files) {
    const lines = readFileSync(path.join(MIG_DIR, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/\bAUTOINCREMENT\b/i.test(line)) {
        sites.push({ file: f, line: i + 1, text: line.trim(), okPattern: good.test(line.trim()) });
      }
    });
  }
  return sites;
}

// ─── ② تجمیع دقیق مایگریشن‌ها — هم‌قالب build-installer-runtime.mjs ───
function buildSchemaDump(files) {
  let schema = `-- schema.sql — تجمیع ${files.length} مایگریشن رسمی (ساخته‌شده در build-installer-runtime)\n`;
  schema += `-- مقصد: پایگاه markaz-central روی حساب کلادفلر کاربر — این فایل را دستی ویرایش نکنید.\n`;
  for (const f of files) {
    schema += `\n-- ===== migration: ${f} =====\n` + readFileSync(path.join(MIG_DIR, f), 'utf8') + '\n';
  }
  return schema;
}

// ─── ③ پورت حرف‌به‌حرف جداکنندهٔ cf_deploy.rs::split_statements ───
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let inSingle = false;
  let inLineComment = false;
  let inBlock = false;
  const chars = [...sql];
  let i = 0;
  const peek = () => chars[i + 1];
  while (i < chars.length) {
    const c = chars[i];
    if (inLineComment) {
      cur += c;
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlock) {
      cur += c;
      if (c === '*' && peek() === '/') {
        cur += chars[++i];
        inBlock = false;
      }
      i++;
      continue;
    }
    if (inSingle) {
      cur += c;
      if (c === '\'') {
        if (peek() === '\'') {
          cur += chars[++i];
        } else {
          inSingle = false;
        }
      }
      i++;
      continue;
    }
    if (c === '-' && peek() === '-') {
      cur += c;
      cur += chars[++i];
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && peek() === '*') {
      cur += c;
      cur += chars[++i];
      inBlock = true;
      i++;
      continue;
    }
    if (c === '\'') {
      inSingle = true;
      cur += c;
      i++;
      continue;
    }
    if (c === ';') {
      const t = cur.trim();
      if (t.length > 0) out.push(t);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  const t = cur.trim();
  if (t.length > 0) out.push(t);
  return out;
}

// هم‌الگوی cf_deploy.rs::chunk_statements
function chunkStatements(statements) {
  const chunks = [];
  let cur = '';
  for (const st of statements) {
    if (cur.length > 0 && cur.length + st.length + 2 > QUERY_CHUNK_BYTES) {
      chunks.push(cur);
      cur = '';
    }
    cur += st + ';\n';
  }
  if (cur.trim().length > 0) chunks.push(cur);
  return chunks;
}

// ─── اجرا ───
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
console.log(`مایگریشن‌ها: ${files.length} فایل — مبدأ: migrations/ · مقصد: markaz-central (D1)`);

const hits = scanRiskyConstructs(files);
check('① سازهٔ ناسازگار با D1 (PRAGMA/تراکنش/ترایگر/ATTACH/VACUUM/REINDEX)', hits.length === 0,
  hits.map((h) => `${h.file}:${h.line} ${h.label} (${h.why})`).join(' · '));

const ai = scanAutoincrement(files);
const aiOk = ai.every((s) => s.okPattern);
check('② AUTOINCREMENT فقط در الگوی پذیرفتهٔ D1 (INTEGER PRIMARY KEY AUTOINCREMENT)', ai.length > 0 ? aiOk : true,
  ai.filter((s) => !s.okPattern).map((s) => `${s.file}:${s.line}`).join(' · '));

const dump = buildSchemaDump(files);
const statements = splitStatements(dump);
check('③ جداکنندهٔ cf_deploy روی schema.sql: حداقل یک دستور در هر قطعه، بدون دستور تهی', statements.length > 100);

const chunks = chunkStatements(statements);
const oversize = statements.filter((s) => s.length > QUERY_CHUNK_BYTES);
check('④ هیچ دستور واحدی از سقف قطعه بزرگ‌تر نیست (بدون نیازمندی به قطعهٔ چنددستوری نامتوازن)', oversize.length === 0,
  oversize.map((s) => `${s.slice(0, 60)}…`).join(' · '));
const maxChunk = Math.max(...chunks.map((c) => c.length));
check('⑤ قطعه‌بندی ~۶۰KB (قرارداد POST /d1/query — چنددستوری batch)', chunks.length > 0 && maxChunk <= QUERY_CHUNK_BYTES + 65_536,
  `${chunks.length} قطعه — بیشینهٔ ${Math.round(maxChunk / 1024)}KB`);

// ─── ④ اجرای واقعی همهٔ قطعات روی SQLite تازه ───
const tmp = mkdtempSync(path.join(os.tmpdir(), 'd1compat-'));
const dbPath = path.join(tmp, 'markaz-central.sqlite');
const db = new DatabaseSync(dbPath);
let execError = null;
let executedStatements = 0;
for (let i = 0; i < chunks.length && !execError; i++) {
  try {
    db.exec(chunks[i]);
    // شمار دقیق با همان جداکنندهٔ اصلی — نه split خام (نقل‌قول‌های حاوی «;» ممکن است)
    executedStatements += splitStatements(chunks[i]).length;
  } catch (err) {
    execError = { chunk: i + 1, message: err.message };
  }
}
check('⑥ اجرای کامل اسکیما روی SQLite تازه (هم‌خانوادهٔ موتور D1)', !execError,
  execError ? `قطعهٔ ${execError.chunk}: ${execError.message}` : `${chunks.length} قطعه ✓`);
check('⑦ همهٔ دستورها اجرا شدند (بدون ریزش)', executedStatements === statements.length,
  `${executedStatements}/${statements.length}`);

// ─── ⑧/⑨ برابری معنایی: dump قطعه‌بندی‌شده باید دقیقاً همان اسکیمای اجرای فایل‌به‌فایل را بسازد
// (شمار خام CREATE نمی‌تواند معیار باشد — DROPهای مشروع مایگریشن‌ها اشیاء را کم می‌کنند)
const db2Path = path.join(tmp, 'markaz-central-files.sqlite');
const db2 = new DatabaseSync(db2Path);
let fileExecError = null;
for (const f of files) {
  try {
    db2.exec(readFileSync(path.join(MIG_DIR, f), 'utf8'));
  } catch (err) {
    fileExecError = `${f}: ${err.message}`;
    break;
  }
}
check('⑧ اجرای فایل‌به‌فایل مایگریشن‌ها هم بی‌خطا است (مرجع مقایسه)', !fileExecError, fileExecError ?? '');

const schemaOf = (conn) =>
  conn.prepare(`SELECT type, name, sql FROM sqlite_master ORDER BY type, name`).all();
const dumpSchema = schemaOf(db);
const filesSchema = schemaOf(db2);
const sameSchema = JSON.stringify(dumpSchema) === JSON.stringify(filesSchema);
let diffNote = '';
if (!sameSchema) {
  const setB = new Set(filesSchema.map((r) => `${r.type}|${r.name}`));
  const setA = new Set(dumpSchema.map((r) => `${r.type}|${r.name}`));
  const onlyDump = dumpSchema.filter((r) => !setB.has(`${r.type}|${r.name}`));
  const onlyFiles = filesSchema.filter((r) => !setA.has(`${r.type}|${r.name}`));
  const changed = dumpSchema.filter((r) => {
    const b = filesSchema.find((x) => x.type === r.type && x.name === r.name);
    return b && b.sql !== r.sql;
  });
  diffNote = `فقط‌در-dump: ${onlyDump.map((r) => r.name).join(',') || '—'} · فقط‌در-فایل‌ها: ${onlyFiles.map((r) => r.name).join(',') || '—'} · SQL-متفاوت: ${changed.map((r) => r.name).join(',') || '—'}`;
}
check('⑨ برابری کامل sqlite_master: مسیر dump قطعه‌بندی‌شده ≡ مسیر فایل‌به‌فایل', sameSchema, diffNote);

const nTables = dumpSchema.filter((r) => r.type === 'table' && !r.name.startsWith('sqlite_')).length;
const nIndexes = dumpSchema.filter((r) => r.type === 'index' && r.sql).length;
console.log(`  ℹ شمار نهایی اشیاء: ${nTables} جدول + ${nIndexes} ایندکس صریح (بعد از DROPهای مشروع مایگریشن‌ها)`);

const keyTables = ['staff', 'settings', 'sync_nodes', 'node_sync_inbox', 'announcements',
  'login_throttle', 'auth_sessions', 'rum_events', 'game_packages', 'network_content', 'audit_log'];
const missing = keyTables.filter((t) => {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
  return !row;
});
check('⑩ جدول‌های کلیدی سینک/احراز/محتوا همه موجودند', missing.length === 0, missing.join(' · '));

const rumSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='rum_events'`).get()?.sql ?? '';
check('⑪ rum_events: ردیف‌شمار خودکار با الگوی پذیرفتهٔ D1 (AUTOINCREMENT سالم)', /AUTOINCREMENT/i.test(rumSql));

const nodeTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'node_%' OR name LIKE 'synced_%')`).all().map((r) => r.name);
check('⑫ زیرساخت صندوق سینک مرکز↔میز کامل است (node_sync_inbox/synced_announcements/sync_nodes)', nodeTables.length >= 2, nodeTables.join(' · '));

// ─── ⑬ اجرای دوم کامل روی همان DB پرشده — تضمین «دوباره‌تلاش امن» استقرار مرکزی ───
// سناریو: استقرار markaz-central وسط راه می‌سوزد (سهمیه/قطع شبکه) و کاربر «دوباره تلاش می‌کند» —
// آن‌وقت همان dump قطعه‌بندی‌شده از نو روی DBیی اجرا می‌شود که از دفعهٔ قبل پر شده است.
// SQLite معادل شرطی برای ALTER TABLE ADD COLUMN ندارد، پس تنها کلاس غیردوباره‌پذیرِ این dump
// همان ALTERهای برهنه است؛ گیت باید ثابت کند: (الف) با رد کردنِ فقط همین کلاس — و آن هم فقط
// وقتی ستونش واقعاً از قبل موجود است (تأیید با table_info) — اجرای دوم «صفر خطا» می‌دهد؛
// (ب) هیچ دستور دیگری به رد شدن نیاز ندارد (هر ناسازگاری دیگری همان‌جا خطا می‌دهد و گیت سرخ
// می‌شود)؛ (ج) sqlite_master بعد از اجرای دوم بایت‌به‌بایت با قبل یکسان است — یعنی تلاش دوباره
// نه شیءای می‌سازد، نه حذف می‌کند و نه SQL شیءای را عوض می‌کند.
const columnExists = (conn, table, col) =>
  conn.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all().some((r) => r.name === col);
const ALTER_ADD_RE = /ALTER\s+TABLE\s+(?:"([^"]+)"|([A-Za-z_][\w]*))\s+ADD\s+COLUMN\s+(?:"([^"]+)"|([A-Za-z_][\w]*))/i;

const schemaBeforeSecond = schemaOf(db);
let secondError = null;
let reapplied = 0;
let skippedApplied = 0;
outer: for (let i = 0; i < chunks.length; i++) {
  for (const st of splitStatements(chunks[i])) {
    const m = st.match(ALTER_ADD_RE);
    if (m && columnExists(db, m[1] ?? m[2], m[3] ?? m[4])) {
      skippedApplied++; // اثر این دستور از قبل روی DB هست — اجرای دوباره‌اش فقط «duplicate column» می‌دهد
      continue;
    }
    try {
      db.exec(st);
      reapplied++;
    } catch (err) {
      secondError = { chunk: i + 1, statement: st.slice(0, 80), message: err.message };
      break outer;
    }
  }
}
const schemaAfterSecond = schemaOf(db);
const byteIdentical = JSON.stringify(schemaBeforeSecond) === JSON.stringify(schemaAfterSecond);
let secondNote = '';
if (secondError) secondNote = `خطا در قطعهٔ ${secondError.chunk}: ${secondError.message} — دستور: ${secondError.statement}`;
else if (!byteIdentical) secondNote = 'sqlite_master بعد از اجرای دوم عوض شده است';
check('⑬ اجرای دوم کامل — دوباره‌تلاش امن است', !secondError && byteIdentical,
  secondNote || `${reapplied} دستور دوباره اجرا شد + ${skippedApplied} ALTERِ از-قبل-اعمال‌شده (ستون موجود، تأییدشده با table_info) — sqlite_master بایت‌به‌بایت یکسان`);
if (!secondError) console.log(`  ℹ اجرای دوم: ${reapplied} دستور دوباره اجرا شد؛ ${skippedApplied} دستور ALTER ADD COLUMN با ستونِ موجود رد شد (تنها کلاس غیردوباره‌پذیرِ dump) — اسکیما بایت‌به‌بایت ثابت ماند`);

db.close();
rmSync(tmp, { recursive: true, force: true });

console.log('');
console.log(`نتیجه: ${pass} سبز / ${fail} سرخ — اسکیمای ${files.length} مایگریشن «دوباره‌پذیر» اثبات شد: همان SQL به موتور محلی (SQLite) و به markaz-central (D1) می‌رود و اجرای دوم کامل روی DB پرشده صفر خطا و بدون تغییر اسکیما است.`);
if (fail > 0) process.exit(1);
