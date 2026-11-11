#!/usr/bin/env node
/**
 * drill بازیابی ماهانه (ف۴ طرح ارتقا — P1-7): اعتبارسنجی کاملِ فایل پشتیبان gh-backup v1
 * بدونِ هیچ دست‌زدنی به پایگاه داده — «بکاپِ تست‌نشده = بکاپِ نیست» (طرح §۶-۶).
 *
 * بررسی‌ها: قالب/نسخهٔ پاکت · برابری row_count اعلام‌شده با ردیف‌های واقعی · checksum پایدار
 * هر جدول (JSON قطعی با کلیدهای مرتب + SHA-256) · هم‌خوانی اسکیما (فهرست جدول‌های فایل ↔
 * CREATE TABLEهای مایگریشن‌ها) · ثبت RTO واقعی (ساعت‌دیواری).
 *
 * اجرا: node scripts/restore-drill.mjs --file <backup.json> [--report docs/reports/...]
 * خروجی ۰ فقط با PASS — هر FAIL خروجی ۱ می‌دهد (گزارش فارسی در docs/reports/ می‌نشیند).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MIGRATIONS_DIR = join(ROOT, 'migrations');
const DEFAULT_REPORT_DIR = join(ROOT, 'docs', 'reports');

const BACKUP_FORMAT = 'gh-backup'; // هم‌قرارداد src/application/backup/service.ts
const BACKUP_FORMAT_VERSION = 1;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// جدول‌های سیستمی که هیچ مایگریشن مخزن نمی‌سازد ولی در خروجی واقعی می‌آیند
const SYSTEM_TABLES = new Set(['schema_migrations', 'd1_migrations']);

/* ─── CLI ─── */
const args = process.argv.slice(2);
function argOf(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const fileArg = argOf('--file');
let reportArg = argOf('--report');
const noteArg = argOf('--note'); // یادداشت اختیاری منشأ فایل (مثلاً «خروجی زندهٔ پروداکشن»)

if (!fileArg) {
  console.error('استفاده: node scripts/restore-drill.mjs --file <backup.json> [--report docs/reports/...] [--note «منشأ»]');
  process.exit(1);
}

/* ─── ابزار ─── */

/** JSON قطعی (کلیدهای مرتب، بازگشتی) — مبنای checksum پایدار */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function faNum(n) {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** فهرست CREATE TABLEهای همهٔ مایگریشن‌ها — مرجع اسکیما */
function migrationTableNames() {
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?/gi;
  // نام‌های گذرای الگوی «CREATE X_new … ALTER TABLE X_new RENAME TO Y» — در اسکیمای زنده هرگز وجود ندارند
  const renameRe = /ALTER\s+TABLE\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?\s+RENAME\s+TO/gi;
  const names = new Set();
  const renamedAway = new Set();
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    for (const m of sql.matchAll(createRe)) names.add(m[1]);
    for (const m of sql.matchAll(renameRe)) renamedAway.add(m[1]);
  }
  for (const r of renamedAway) names.delete(r);
  return names;
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

/* ─── اجرا ─── */
const t0 = Date.now();
const problems = [];
const warnings = [];
const checks = []; // { name, state: 'PASS'|'WARN'|'FAIL', detail }

function record(name, state, detail) {
  checks.push({ name, state, detail });
  if (state === 'FAIL') problems.push(`${name}: ${detail}`);
  if (state === 'WARN') warnings.push(`${name}: ${detail}`);
}

// ۱) بارگذاری و JSON
let envelope = null;
let parsed = null;
try {
  const raw = readFileSync(fileArg, 'utf8');
  parsed = JSON.parse(raw);
} catch (err) {
  record('بارگذاری فایل', 'FAIL', `فایل JSON معتبر نیست — ${err.message}`);
}
const fileSize = (() => { try { return statSync(fileArg).size; } catch { return 0; } })();

// هم پاکت مستقیم و هم پوشش { backup: {...} } می‌پذیریم (هم‌الگوی POST /api/backup/inspect)
if (parsed) {
  envelope = parsed.backup !== undefined ? parsed.backup : parsed;
}

// ۲) قالب و نسخه
if (envelope) {
  if (envelope.format !== BACKUP_FORMAT) {
    record('قالب فایل', 'FAIL', `format = «${String(envelope.format)}» است؛ «${BACKUP_FORMAT}» انتظار می‌رود — این فایل پشتیبان سامانه نیست`);
  } else {
    record('قالب فایل', 'PASS', `format = ${BACKUP_FORMAT}`);
  }
  if (envelope.format_version !== BACKUP_FORMAT_VERSION) {
    record('نسخهٔ قالب', 'FAIL', `format_version = ${String(envelope.format_version)}؛ پشتیبانی‌شده = ${BACKUP_FORMAT_VERSION}`);
  } else {
    record('نسخهٔ قالب', 'PASS', `format_version = ${BACKUP_FORMAT_VERSION}`);
  }
}

// ۳) ساختار جدول‌ها
const tableNames = [];
if (envelope) {
  const tables = envelope.tables;
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    record('بخش جداول', 'FAIL', '«tables» غایب است یا شیء نیست');
  } else {
    let structOk = true;
    for (const name of Object.keys(tables)) {
      if (!IDENT_RE.test(name)) {
        record(`نام جدول «${name}»`, 'FAIL', 'نام جدول الگوی شناسهٔ امن را رد می‌کند');
        structOk = false;
        continue;
      }
      const t = tables[name];
      if (!t || typeof t !== 'object' || !Array.isArray(t.rows)) {
        record(`ساختار جدول «${name}»`, 'FAIL', '«rows» غایب است یا آرایه نیست');
        structOk = false;
        continue;
      }
      if (t.row_count !== undefined && Number(t.row_count) !== t.rows.length) {
        record(`شمارش جدول «${name}»`, 'FAIL', `row_count اعلام‌شده = ${faNum(t.row_count)} ولی ${faNum(t.rows.length)} ردیف واقعی هست`);
        structOk = false;
        continue;
      }
      tableNames.push(name);
    }
    if (structOk) {
      record('ساختار و شمارش جدول‌ها', 'PASS', `${faNum(tableNames.length)} جدول — همهٔ row_countها با ردیف‌ها برابرند`);
    }
  }
}

// ۴) checksum پایدار هر جدول
const tableRows = [];
if (envelope && envelope.tables) {
  for (const name of tableNames) {
    const rows = envelope.tables[name].rows ?? [];
    const sum = sha256(stableStringify(rows));
    tableRows.push({ name, rows: rows.length, declared: envelope.tables[name].row_count ?? null, checksum: sum.slice(0, 16) + '…' });
  }
  const allSum = sha256(stableStringify(envelope));
  tableRows.push({ name: '(کل پاکت)', rows: tableRows.reduce((s, t) => s + t.rows, 0), declared: null, checksum: allSum.slice(0, 16) + '…' });
  record('checksum پایدار', tableRows.length > 0 ? 'PASS' : 'FAIL',
    `${faNum(tableRows.length)} checksum SHA-256 روی JSON قطعی (کلیدهای مرتب) — قابل بازتولید برای مقایسهٔ ماه‌به‌ماه`);
}

// ۵) هم‌خوانی اسکیما با مایگریشن‌ها
let schemaOk = true;
if (envelope && tableNames.length > 0) {
  const migrationNames = migrationTableNames();
  const excluded = Array.isArray(envelope.excluded_tables) ? envelope.excluded_tables : [];
  const unknown = tableNames.filter((t) => !migrationNames.has(t) && !SYSTEM_TABLES.has(t));
  const missing = [...migrationNames].filter((t) => !tableNames.includes(t) && !excluded.includes(t));
  if (unknown.length > 0) {
    schemaOk = false;
    record('هم‌خوانی اسکیما', 'FAIL', `این جدول‌ها در فایل‌های مایگریشن تعریف نشده‌اند (رانش اسکیما): ${unknown.join('، ')}`);
  }
  if (missing.length > 0) {
    record('پوشش جدول‌های مایگریشن', 'WARN', `این جدول‌های اسکیمای فعلی در فایل نیستند (نه در excluded_tables) — فایل از نسخهٔ کهنه‌تری است: ${missing.join('، ')}`);
  }
  if (schemaOk && missing.length === 0) {
    record('هم‌خوانی اسکیما', 'PASS', `فهرست جدول‌های فایل دقیقاً با ${faNum(migrationNames.size)} CREATE TABLE مایگریشن‌ها هم‌خوان است`);
  } else if (schemaOk) {
    record('هم‌خوانی اسکیما', 'PASS', `همهٔ جدول‌های فایل در مایگریشن‌ها تعریف شده‌اند (${faNum(missing.length)} جدول کهنه‌تر غایب — هشدار بالا)`);
  }
}

const rtoMs = Date.now() - t0;
const pass = problems.length === 0;
const stamp = pass ? 'PASS' : 'FAIL';

/* ─── گزارش فارسی ─── */
let reportPath = reportArg
  ? resolve(reportArg.startsWith('/') ? reportArg : join(ROOT, reportArg))
  : join(DEFAULT_REPORT_DIR, `restore-drill-${utcToday()}.md`);

const md = [];
md.push(`# گزارش drill بازیابی — ${utcToday()}`);
md.push('');
md.push(`**مُهر بازیابی‌پذیری: ${pass ? '✅ PASS' : '❌ FAIL'}**`);
md.push('');
md.push('| سنجه | مقدار |');
md.push('|---|---|');
md.push(`| فایل پشتیبان | \`${fileArg}\` |`);
md.push(`| حجم فایل | ${faNum((fileSize / 1024).toFixed(1))} کیلوبایت |`);
md.push(`| نسخهٔ سامانه در پاکت | ${envelope?.app_version ?? '—'} |`);
md.push(`| زمان گرفتن پشتیبان | ${envelope?.created_at ?? '—'} |`);
md.push(`| همراه فایل‌های پیوستی | ${envelope?.include_files === true ? 'بله' : 'خیر'} |`);
md.push(`| جدول‌های مستثنا | ${Array.isArray(envelope?.excluded_tables) && envelope.excluded_tables.length > 0 ? envelope.excluded_tables.join('، ') : '—'} |`);
md.push(`| تعداد جدول‌ها | ${faNum(tableNames.length)} |`);
md.push(`| مجموع ردیف‌ها | ${faNum(tableRows.reduce((s, t) => s + (t.name === '(کل پاکت)' ? 0 : t.rows), 0))} |`);
md.push(`| RTO اعتبارسنجی (ساعت‌دیواری) | ${faNum(rtoMs)} میلی‌ثانیه |`);
md.push(`| منشأ فایل | ${noteArg ?? 'ثبت‌نشده — با --note ثبت شود'} |`);
md.push('');
md.push('## جدول بررسی‌ها');
md.push('');
md.push('| بررسی | نتیجه | جزئیات |');
md.push('|---|---|---|');
for (const c of checks) {
  const icon = c.state === 'PASS' ? '✅' : c.state === 'WARN' ? '⚠️' : '❌';
  md.push(`| ${c.name} | ${icon} ${c.state} | ${c.detail} |`);
}
md.push('');
md.push('## جدول‌ها و checksumها');
md.push('');
md.push('| جدول | ردیف‌های واقعی | row_count اعلام‌شده | checksum (SHA-256، ۱۶ نویسهٔ اول) |');
md.push('|---|---|---|---|');
for (const t of tableRows) {
  md.push(`| ${t.name} | ${faNum(t.rows)} | ${t.declared === null ? '—' : faNum(t.declared)} | \`${t.checksum}\` |`);
}
md.push('');
md.push('## هشدارها');
md.push('');
if (warnings.length === 0) md.push('— بدون هشدار —');
for (const w of warnings) md.push(`- ⚠️ ${w}`);
md.push('');
md.push('## شکست‌ها');
md.push('');
if (problems.length === 0) md.push('— بدون شکست —');
for (const p of problems) md.push(`- ❌ ${p}`);
md.push('');
md.push('---');
md.push('');
md.push('این گزارش خودکارِ `scripts/restore-drill.mjs` است — drill ماهانه طبق runbook `docs/restore-drill.md` (طرح ارتقا §۶-۶ و P1-7).');
md.push('checksum هر ماه با ماه پیش مقایسه شود: پایداری کاملِ checksum با رشد صفر یعنی دادهٔ همان جدول تغییر نکرده است.');
md.push('');

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, md.join('\n'), 'utf8');

/* ─── خلاصهٔ کنسول ─── */
console.log('═'.repeat(64));
console.log(' drill بازیابی — مُهر بازیابی‌پذیری:', pass ? '✅ PASS' : '❌ FAIL');
console.log('═'.repeat(64));
console.log(` فایل: ${fileArg} (${(fileSize / 1024).toFixed(1)} KB)`);
console.log(` جدول‌ها: ${tableNames.length} · مجموع ردیف‌ها: ${tableRows.reduce((s, t) => s + (t.name === '(کل پاکت)' ? 0 : t.rows), 0)}`);
console.log(` RTO اعتبارسنجی: ${rtoMs} میلی‌ثانیه`);
for (const c of checks) console.log(`  [${c.state}] ${c.name} — ${c.detail}`);
for (const w of warnings) console.log(`  ⚠️ ${w}`);
for (const p of problems) console.log(`  ❌ ${p}`);
console.log(` گزارش: ${reportPath}`);
console.log('═'.repeat(64));

process.exit(pass ? 0 : 1);
