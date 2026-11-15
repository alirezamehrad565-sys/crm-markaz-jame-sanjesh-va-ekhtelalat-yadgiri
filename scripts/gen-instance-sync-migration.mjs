#!/usr/bin/env node
// مولد deterministic مایگریشن 0114 «هستهٔ هم‌گامی دوسویه instance-sync» (فاز B — مأموریت SB2)
// سند طرح: docs/rust/server-cloud-update-design.md §۲-۴ · قرار مأموریت SB/SB2
// کار مولد:
//   ۱) اسکیمای نهایی را از migrations/*.sql (به‌ترتیب اعمال) بازمی‌سازد: CREATE + DROP + RENAME
//      تا فقط جداول «زنده» هدف قرار گیرند (سه جدول staff_attendance/bot_links/network_content
//      در 0046/0047/0099 بازسازی و از طریق *_new با RENAME برگشته‌اند — نام‌های _new در پایان زنده نیستند).
//   ۲) جداول دامنه را جدا می‌کند (استثناها با کلاس‌بندی مستند پایین فایل).
//   ۳) migrations/0114_instance_sync.sql را می‌سازد: سه جدول bookkeeping سینک + ADD COLUMN
//      updated_at برای جداول فاقد + پسافت + بذر cursor اپوک — بدون هیچ trigger و بدون تراکنش
//      دستی (سیاست D1-clean: گیت scripts/check-d1-compat.mjs ①/⑬ — بدنهٔ چنددستوری trigger با
//      جداکنندهٔ «;» در قطعه‌بندی POST /d1/query می‌شکند و D1 هر /query را batch اجرا می‌کند).
//   ۴) scripts/engine/local-triggers.sql را می‌سازد: همان ۳×N trigger فقط-میز (INSERT-stamp /
//      UPDATE-stamp / DELETE→تومب‌استون) برای موتور محلی node:sqlite — هرگز وارد migrations/ یا
//      schema.sql نمی‌شود؛ بوت موتور محلی (scripts/engine/engine.mjs) پس از مایگریشن‌ها اعمالش می‌کند.
//   ۵) وارسی خودکار پایان کار: با همان regexهای گیت، 0114 باید صفر بخورد (سبز ماندن گیت)؛
//      local-triggers.sql خارج از migrations/ است و مجاز — فقط شمار درست triggerها می‌سنجیم.
//   ۶) src/application/instance-sync/tables.ts را با SYNC_TABLES هم‌منبع تولید می‌کند.
// اجرای دوباره مولد باید بایت‌به‌بایت همان خروجی را بدهد (deterministic: مرتب‌سازی الفبایی، بدون تاریخ روز).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project/gh-rust';
const MIG = path.join(ROOT, 'migrations');
const BACKFILL_TS = '2026-11-15T00:00:00.000Z'; // ثابت مأموریت — پسافت جداول فاقد created_at
const EPOCH = '1970-01-01T00:00:00.000Z';
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"; // مُهر ISO با میلی‌ثانیه — هم‌فرمت مُهرهای سرویس

// ─── کلاس‌بندی استثناها (مأموریت SB بند ۲ — هر گروه یک کامنت فارسی در خروجی) ───
const EXCLUDED = {
  'audit_log': 'ممیزی سیستم — فقط-افزودنی و ویژهٔ هر نصب؛ همگام‌شدنی نیست',
  'case_audits': 'ردیف ممیزی رویداد بالینی — trace همان نمونه؛ همگام‌شدنی نیست',
  'auth_sessions': 'نشست‌های احراز سمت‌سرور (0111) — ویژهٔ هر نمونه؛ هرگز سینک نمی‌شود',
  'api_keys': 'کلیدهای API کارمندان — راز؛ همگام‌شدنی نیست',
  'login_throttle': 'گات تلاش ورود (0047) — وضعیت امنیتی لحظه‌ای هر نمونه',
  'game_preview_tokens': 'توکن پیش‌نمایش فقط-پرسنلی (0095) — راز کوتاه‌عمر',
  'settings': 'تنظیمات هر نصب شامل رازها (sys_auth_secret و…) — هرگز بین نمونه‌ها نمی‌رود',
  'game_sessions': 'سطرهای جلسهٔ بازی — دادهٔ خام تله‌متری چانک‌بلند؛ خارج از قرارداد هستهٔ هم‌گامی',
  'notifications': 'لاگ اعلان‌های ارسالی — صف ارسال همان نمونه؛ همگام‌شدنی نیست',
  'client_errors': 'تله‌متری خطای مرورگر (0057) — فقط همان نمونه',
  'rum_events': 'تله‌متری کارایی (0086) — فقط همان نمونه',
  'assessment_files': 'پیوست باینری سنجش — فایل‌ها همگام نمی‌شوند (فقط ردیف‌های دامنه)',
  'case_event_files': 'پیوست باینری رویداد پرونده — فایل‌ها همگام نمی‌شوند',
  'clearbook_attachments': 'پیوست باینری کلربوک — فایل‌ها همگام نمی‌شوند',
  'docs_files': 'پیوست باینری نمون‌برگ — فایل‌ها همگام نمی‌شوند',
  'exercise_attachments': 'پیوست باینری تمرین — فایل‌ها همگام نمی‌شوند',
  'exercise_file_chunks': 'تکه‌های باینری ذخیرهٔ D1/R2 — حمل blob ممنوع در هم‌گامی',
  'exercise_files': 'فرادادهٔ فایل تمرین — خانوادهٔ پیوست باینری؛ همگام نمی‌شود',
  'finance_invoice_files': 'پیوست باینری صورتحساب — فایل‌ها همگام نمی‌شوند',
  'knowledge_attachments': 'پیوست باینری کتابخانه — فایل‌ها همگام نمی‌شوند',
  'student_received_docs': 'رسید تحویل سند به دانش‌آموز — خانوادهٔ پیوست/اسناد؛ همگام نمی‌شود',
  'sync_nodes': 'رجیستری نودهای سینک rust-f4 — bookkeeping قرارداد CP؛ جدا از instance-sync',
  'node_push_events': 'idempotency push نود (0109) — bookkeeping قرارداد CP',
  'node_sync_inbox': 'صندوق ورودی سینک میز (0110) — bookkeeping قرارداد CP',
  'synced_announcements': 'نگاشت اطلاعیه‌های سینک‌شده (0112) — bookkeeping قرارداد CP',
  'quota_usage': 'شمارش سهمیهٔ روزانهٔ مرکز (0113) — bookkeeping زیرساخت',
  'table_growth_snapshots': 'اسنپ‌شات رشد جدول‌ها (0107) — bookkeeping بهداشت داده',
  'schema_migrations': 'رهگیری مایگریشن‌ها (0001) — زیرساخت خود SQLite/D1',
  'central_records': 'دیتاست‌های پشتیبان مرکزی (0026 — با مرتب‌سازی لغوی فایل‌ها پس از ساخت drop می‌شود) — bookkeeping پشتیبان‌گیری',
  'bot_links': 'سیم‌کشی بات تلگرام — chat_id ویژهٔ هر نصب؛ همگام‌شدنی نیست',
  'bot_menu_state': 'وضعیت منوی بات بر chat_id — ویژهٔ هر نصب',
  'class_bot_links': 'پیوند بات کلاس — ویژهٔ هر نصب',
  'staff_bot_links': 'پیوند بات کارمند — ویژهٔ هر نصب'
};

// ─── پارس مایگریشن‌ها به‌ترتیب اعمال (همان مرتب‌سازی لغوی هارنس تست) ───
function stripComments(sql) {
  return sql
    .replace(/--[^\n]*/g, '') // کامنت خطی
    .replace(/\/\*[\s\S]*?\*\//g, ''); // کامنت بلوکی
}

function extractCreateTables(sql) {
  const out = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([A-Za-z_0-9]+)["'`]?\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = m[1];
    const start = sql.indexOf('(', m.index);
    let depth = 0, end = -1, inStr = null;
    for (let i = start; i < sql.length; i++) {
      const ch = sql[i];
      if (inStr) { if (ch === inStr) inStr = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    out.push({ name, body: sql.slice(start + 1, end) });
    re.lastIndex = end;
  }
  return out;
}

function parseTable(body) {
  const parts = [];
  let depth = 0, inStr = null, cur = '';
  for (const ch of body) {
    if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  const columns = [];
  let tablePk = null;
  for (const p of parts) {
    const head = p.replace(/^\s+/, '');
    if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|CONSTRAINT)\b/i.test(head)) {
      const pk = head.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pk) tablePk = pk[1].split(',').map((s) => s.replace(/["'`\s]/g, '').trim()).filter(Boolean);
      continue;
    }
    const name = head.split(/[\s("]+/)[0].replace(/["'`]/g, '');
    columns.push({
      name,
      isPk: /\bPRIMARY\s+KEY\b/i.test(head),
      hasUpdated: name.toLowerCase() === 'updated_at',
      hasCreated: name.toLowerCase() === 'created_at'
    });
  }
  const colPk = columns.filter((c) => c.isPk).map((c) => c.name);
  return { columns, pk: colPk.length ? colPk : tablePk };
}

const live = new Map(); // نام → {pk, columns} — فقط جداولی که در پایان زنده‌اند
for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = stripComments(readFileSync(path.join(MIG, f), 'utf8'));
  for (const t of extractCreateTables(sql)) live.set(t.name, parseTable(t.body));
  for (const d of sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`]?([A-Za-z_0-9]+)["'`]?/gi)) live.delete(d[1]);
  for (const r of sql.matchAll(/ALTER\s+TABLE\s+["'`]?([A-Za-z_0-9]+)["'`]?\s+RENAME\s+TO\s+["'`]?([A-Za-z_0-9]+)["'`]?/gi)) {
    const renamed = live.get(r[1]);
    if (!renamed) throw new Error(`RENAME جدول ناموجود: ${r[1]} (${f})`);
    live.delete(r[1]);
    live.set(r[2], renamed);
  }
}

// ─── جداول دامنه = زنده − استثنا − سه جدول bookkeeping خود سینک ───
const syncTables = [...live.keys()]
  .filter((n) => !EXCLUDED[n] && !n.startsWith('_sync_')) // _sync_* = زیرساخت خود این مایگریشن؛ دامنه نیستند
  .sort()
  .map((name) => {
    const meta = live.get(name);
    if (!meta || !meta.pk || meta.pk.length === 0) throw new Error(`PK یافت نشد: ${name}`);
    return { name, pk: meta.pk, hasUpdatedAt: meta.columns.some((c) => c.hasUpdated), hasCreatedAt: meta.columns.some((c) => c.hasCreated) };
  });

const excludedLive = Object.keys(EXCLUDED).filter((n) => live.has(n)).sort();
console.log(`جداول زنده: ${live.size} · دامنه (همگام): ${syncTables.length} · مستثنی (زنده): ${excludedLive.length}`);
console.log('دامنه:', syncTables.map((t) => t.name).join(', '));
console.log('فاقد updated_at:', syncTables.filter((t) => !t.hasUpdatedAt).map((t) => t.name).join(', '));

// ─── تولید SQL مایگریشن 0114 — بدون trigger و بدون تراکنش دستی (سیاست D1-clean) ───
const num = '0114';
const out = [];
out.push(`-- ${num} — فاز B: هستهٔ هم‌گامی دوسویه instance-sync (docs/rust/server-cloud-update-design.md §۲-۴)
-- قرار مأموریت SB2 (D1-clean): مایگریشن فقط-افزودنی با سه جزء — بدون هیچ trigger و بدون تراکنش
-- دستی (قاعدهٔ مخزن: گیت scripts/check-d1-compat.mjs ①/⑬ — D1 هر /query را batch اجرا می‌کند و
-- بدنهٔ چنددستوری trigger با جداکنندهٔ «;» در قطعه‌بندی همان‌جا می‌شکند):
--   ① سه جدول bookkeeping سینک: _sync_deleted (تومب‌استون حذف‌ها با pk کانونی '|') · _sync_conflicts
--      (دفتر داوری — «هیچ ردیفی بی‌سروصدا نمی‌افتد»: هر رقابت بازنده با payload کامل ثبت می‌شود) ·
--      _sync_state (cursor هر جدول به‌ازای هر نمونه؛ pull_cursor/push_cursor = JSON {rows, deleted}).
--   ② ستون updated_at برای جداول دامنهٔ فاقد + پسافت COALESCE(created_at, '${BACKFILL_TS}').
--   ③ بذر cursor اپوک برای همهٔ جداول دامنه (پیش‌فرض نقطهٔ شروع pull/push هر نمونه؛ فهرست دامنه =
--      خروجی همین مولد — هم‌منبع با SYNC_TABLES در src/application/instance-sync/tables.ts).
-- انحراف مستند از §۲-۴ (SB2): triggerهای مُهر/تومب‌استون (۶۰ جدول × ۳) از مایگریشن خارج شدند —
-- ابر بدون trigger کار می‌کند: سرویس‌ها مُهر را خودشان در SQL می‌نویسند (updated_at = datetime('now')
-- و حذف نرم = deleted_at + updated_at — الگوی src/domain/finance/service.ts)؛ حذف نرمِ دارای
-- deleted_at خودش از pull بیرون می‌آید و helper تومب‌استون فقط برای DELETEهای سخت است.
-- نسخهٔ فقط-میزِ همان triggerها در scripts/engine/local-triggers.sql است؛ بوت موتور محلی
-- (scripts/engine/engine.mjs) پس از مایگریشن‌ها آن را best-effort اعمال می‌کند — باندل ورکر و
-- استقرار ابری (schema.sql/cf_deploy که فقط migrations/ را می‌بلعد) هرگز آن را نمی‌بینند.
-- دود رفتاری هر دو حالت (با و بدون trigger): scripts/smoke-instance-sync.mjs.
-- قاعدهٔ داوری (تصمیم کارفرما ۱۴۰۴/۰۸/۲۴): first-write-wins با داور زمانی — پیاده‌سازی در
-- src/application/instance-sync/winner.ts؛ این مایگریشن فقط زیرساخت bookkeeping است.
-- فقط-افزودنی (additive-only)؛ بدون CHECK (الگوی D7)؛ باز-اجرای کل فایل در ALTER TABLE متوقف
-- می‌شود (SQLite شکل IF NOT EXISTS برای ADD COLUMN ندارد) — دود آن در scripts/smoke-instance-sync.mjs.
-- مُهرها ISO با میلی‌ثانیه (strftime %f + Z) تا مقایسهٔ رشته‌ای = مقایسهٔ زمانی باشد.

CREATE TABLE IF NOT EXISTS _sync_deleted (
  table_name TEXT NOT NULL,             -- جدول دامنهٔ مبدأ
  pk         TEXT NOT NULL,             -- pk کانونی: مقادیر pk (چندستونی با '|')
  deleted_at TEXT NOT NULL,             -- مُهر حذف — مبنای داوری تومب‌استون↔ردیف
  device_id  TEXT,                      -- نمونهٔ حذف‌کننده (NULL = خود این نمونه با helper/حذف نرم)
  PRIMARY KEY (table_name, pk)
);

CREATE TABLE IF NOT EXISTS _sync_conflicts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name         TEXT NOT NULL,
  pk                 TEXT NOT NULL,
  winner_side        TEXT NOT NULL,     -- local | remote | tombstone | row
  winner_updated_at  TEXT,
  loser_updated_at   TEXT,
  resolved_at        TEXT NOT NULL,     -- مُهر لحظهٔ داوری سمت گیرنده
  detail             TEXT,              -- JSON زمینهٔ داوری (rule و دلیل)
  loser_payload      TEXT,              -- JSON کامل ردیف بازنده (سقف ۶۴KB با نشان برش در سرویس)
  device_id          TEXT               -- نمونهٔ فرستندهٔ payload
);

CREATE TABLE IF NOT EXISTS _sync_state (
  table_name  TEXT PRIMARY KEY,
  pull_cursor TEXT NOT NULL,            -- JSON {rows, deleted} — آخرین مُهرِ تحویل‌شده به نمونهٔ همتا
  push_cursor TEXT NOT NULL             -- JSON {rows, deleted} — آخرین مُهرِ فرستاده‌شده از این نمونه
);
`);

let alters = 0;
for (const t of syncTables) {
  if (t.hasUpdatedAt) continue;
  alters++;
  out.push(`ALTER TABLE ${t.name} ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه`);
  if (t.hasCreatedAt) {
    out.push(`UPDATE ${t.name} SET updated_at = COALESCE(created_at, '${BACKFILL_TS}') WHERE updated_at IS NULL;`);
  } else {
    out.push(`UPDATE ${t.name} SET updated_at = '${BACKFILL_TS}' WHERE updated_at IS NULL; -- جدول created_at ندارد`);
  }
}
out.push('');

// بذر cursor اپوک برای همهٔ جداول همگام
const epochJson = `{"rows":"${EPOCH}","deleted":"${EPOCH}"}`;
out.push('-- بذر cursor اپوک برای همهٔ جداول دامنه (پیش‌فرض نقطهٔ شروع pull/push هر نمونه)');
for (const t of syncTables) {
  out.push(`INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('${t.name}', '${epochJson}', '${epochJson}');`);
}
const migText = out.join('\n') + '\n';

// ─── وارسی خودکار با همان regexهای گیت (قرارداد SB2 بند ۱ — پیش از نوشتن فایل) ───
const GATE_D1 = [
  { re: /\bPRAGMA\b/i, label: 'PRAGMA' },
  { re: /\bBEGIN\s+(TRANSACTION|DEFERRED|IMMEDIATE|EXCLUSIVE)?\b/i, label: 'BEGIN' },
  { re: /\bCOMMIT\b/i, label: 'COMMIT' },
  { re: /\bCREATE\s+TRIGGER\b/i, label: 'CREATE TRIGGER' },
  { re: /\bATTACH\s+DATABASE\b/i, label: 'ATTACH DATABASE' },
  { re: /\bVACUUM\b/i, label: 'VACUUM' },
  { re: /\bREINDEX\b/i, label: 'REINDEX' }
];
const migHits = GATE_D1.filter((g) => g.re.test(migText));
if (migHits.length > 0) {
  throw new Error(`0114 با گیت D1 ناسازگار ماند: ${migHits.map((g) => g.label).join(', ')}`);
}
console.log('✓ وارسی گیت: migrations/0114 روی هر ۷ regex گیت check-d1-compat صفر خورد (بند ① و ⑬ سبز)');

// ─── تولید local-triggers.sql — همان ۳×N trigger، فقط برای موتور محلی node:sqlite ───
// ⚠ در trigger پس از DELETE فقط OLD در دسترس است (NEW تعریف نشده) — pk از OLD خوانده می‌شود.
const trig = [];
trig.push(`-- local-triggers.sql — triggerهای فقط-میز هم‌گامی instance-sync (فاز B — مأموریت SB2)
-- فقط-میز؛ D1 این فایل را هرگز نمی‌بیند — گیت check-d1-compat آن را نمی‌سنجد چون خارج از migrations/ است؛
-- سیاست بدون-trigger فقط برای مایگریشن‌ها/ابر است.
-- مولد: scripts/gen-instance-sync-migration.mjs (هم‌منبع با migrations/0114 و SYNC_TABLES در
-- src/application/instance-sync/tables.ts) — هرگز دستی ویرایش نشود؛ بازتولید = اجرای دوبارهٔ مولد.
-- اعمال: بوت موتور محلی (scripts/engine/engine.mjs) پس از پایان مایگریشن‌ها روی همان db محلی —
-- idempotent (همهٔ triggerها IF NOT EXISTS دارند؛ اجرای دوباره بی‌خطا)؛ شکست اعمال بوت را نمی‌کشد:
-- فقط هشدار فارسی و ادامهٔ بوت (بدون trigger هم هم‌گامی کار می‌کند — مُهر را سرویس‌ها خودشان
-- می‌نویسند؛ این‌جا فقط مُهر خودکار و تومب‌استون خودکار حذف از دست می‌رود).
-- مسیر فقط node-side است: باندل ورکر و استقرار ابری این فایل را import/exec نمی‌کنند و تولید
-- schema.sql/cf_deploy فقط migrations/ را می‌بلعد (local-triggers.sql در scripts/engine/ است).
-- سه trigger برای هر جدول دامنه (${syncTables.length} جدول → ${syncTables.length * 3} trigger):
--   INSERT  WHEN NEW.updated_at IS NULL → مُهر اکنون (نویسندهٔ سینک که مُهر می‌آورد دست‌نخورده)؛
--   UPDATE  WHEN NEW.updated_at IS OLD.updated_at → مُهر اکنون (نویسندهٔ دستیِ بدون مُهر مُهر می‌گیرد؛
--           نویسنده‌ای که updated_at را صریح می‌فرستد — یعنی مسیر سینک — حفظ می‌شود)؛
--   DELETE  → تومب‌استون در _sync_deleted با pk کانونی '|'.
`);
for (const t of syncTables) {
  const pkExpr = t.pk.map((c) => `CAST(OLD.${c} AS TEXT)`).join(` || '|' || `);
  trig.push(`CREATE TRIGGER IF NOT EXISTS trg_is_${t.name}_ins AFTER INSERT ON ${t.name}
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE ${t.name} SET updated_at = ${NOW_SQL} WHERE rowid = NEW.rowid;
END;`);
  trig.push(`CREATE TRIGGER IF NOT EXISTS trg_is_${t.name}_upd AFTER UPDATE ON ${t.name}
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ${t.name} SET updated_at = ${NOW_SQL} WHERE rowid = NEW.rowid;
END;`);
  trig.push(`CREATE TRIGGER IF NOT EXISTS trg_is_${t.name}_del AFTER DELETE ON ${t.name}
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('${t.name}', ${pkExpr}, ${NOW_SQL}, NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;`);
  trig.push('');
}
const trigText = trig.join('\n') + '\n';

// وارسی فایل دوم — خارج از migrations/ است و مجاز به خوردن regexهای گیت؛ فقط شمار درست triggerها
const trigCount = (trigText.match(/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS/gi) ?? []).length;
if (trigCount !== syncTables.length * 3) {
  throw new Error(`local-triggers.sql ناقص شد: ${trigCount} از ${syncTables.length * 3} trigger`);
}
console.log(`✓ وارسی local-triggers.sql: ${trigCount} trigger با IF NOT EXISTS (خارج migrations/ — مجاز به خوردن regexهای گیت)`);

const sqlFile = `migrations/${num}_instance_sync.sql`;
writeFileSync(path.join(ROOT, sqlFile), migText, 'utf8');
const trigFile = 'scripts/engine/local-triggers.sql';
writeFileSync(path.join(ROOT, trigFile), trigText, 'utf8');
console.log(`✓ ${sqlFile} — ALTER: ${alters} · trigger: ۰ (D1-clean) · seed: ${syncTables.length}`);
console.log(`✓ ${trigFile} — trigger: ${trigCount} (فقط-میز؛ هرگز وارد migrations/ یا schema.sql نمی‌شود)`);

// ─── تولید tables.ts هم‌منبع ───
const metaLines = syncTables.map((t) => `  { table: '${t.name}', pk: [${t.pk.map((p) => `'${p}'`).join(', ')}], hasUpdatedAt: ${t.hasUpdatedAt} }`);
const excludedComment = excludedLive.map((n) => `//   · ${n} — ${EXCLUDED[n]}`).join('\n');

const tablesTs = `// فهرست جداول هم‌گامی instance-sync — تولیدشدهٔ deterministic با scripts/gen-instance-sync-migration.mjs
// منبع حقیقت: migrations/ پس از 0114 (اسکیمای زنده پس از CREATE/DROP/RENAME). برای افزودن جدول
// دامنه، مایگریشنش را بسازید و مولد را دوباره اجرا کنید — هرگز این فایل را دستی ویرایش نکنید.
// قرارداد: docs/rust/server-cloud-update-design.md §۲-۴ (فهرست جداول هم‌گامی = کانفیگ صریح
// جدول + PK + ستون updated_at).
//
// استثناها (جداول زندهٔ غیر-دامنه با دلیل):
${excludedComment}

export interface SyncTableMeta {
  /** نام جدول دامنه (هم‌نما در هر دو سو — هر دو سو هم‌شِما هستند) */
  table: string;
  /** ستون‌های کلید اصلی به‌ترتیب تعریف — مبنا PK کانونی('|'-جمع‌شده) */
  pk: string[];
  /** آیا updated_at از مایگریشن‌های قبل موجود بوده (true) یا با 0114 افزوده شده (false) */
  hasUpdatedAt: boolean;
}

/** جداول دامنهٔ مشمول هم‌گامی دوسویه — ${syncTables.length} جدول */
export const SYNC_TABLES: readonly SyncTableMeta[] = [
${metaLines.join(',\n')}
];

const SYNC_TABLE_MAP: ReadonlyMap<string, SyncTableMeta> = new Map(SYNC_TABLES.map((t) => [t.table, t]));

/** جدول خارج از قرارداد هم‌گامی؟ (مرز امنیتی push — نام از بدنهٔ درخواست نمی‌آید مگر با این گیت) */
export function isSyncTable(table: string): boolean {
  return SYNC_TABLE_MAP.has(table);
}

export function syncTableMeta(table: string): SyncTableMeta | undefined {
  return SYNC_TABLE_MAP.get(table);
}

/** pk کانونی ردیف: مقادیر pk به رشته (NULL→'') با '|' — همان قالب تومب‌استون در _sync_deleted */
export function syncPkValueOfRow(row: Record<string, unknown>, pk: string[]): string {
  return pk.map((k) => (row[k] === null || row[k] === undefined ? '' : String(row[k]))).join('|');
}

/** وارون syncPkValueOfRow: شکستن pk کانونی به اجزا (به‌ترتیب ستون‌های pk) */
export function syncPkValueSplit(value: string, pk: string[]): string[] {
  const parts = value.split('|');
  if (parts.length !== pk.length) return [];
  return parts;
}

/** cursor اپوک — بذر 0114 در _sync_state؛ شکل JSON دو-محوره (ردیف/تومب‌استون جدا) */
export const SYNC_EPOCH = '${epochJson}';

export const EPOCH_STAMP = '${EPOCH}';
`;
mkdirSync(path.join(ROOT, 'src/application/instance-sync'), { recursive: true });
writeFileSync(path.join(ROOT, 'src/application/instance-sync/tables.ts'), tablesTs, 'utf8');
console.log('✓ src/application/instance-sync/tables.ts');
