#!/usr/bin/env node
/**
 * تست همبستگی دادهٔ CP ↔ نود (سامانه مرکز سنجش) — قرارداد m1.5
 *
 * مقایسهٔ ردیف‌به‌ردیف جدول `announcements` در دو پایگاه D1:
 *   • CP (کنترل‌پلین):  همهٔ اعلان‌ها — مرجع اصلی
 *   • نود (center-system): فقط ردیف‌های با پیشوند `cp-` — رونوشت pull یک‌طرفه
 *
 * قواعد قضاوت:
 *   PASS  — هر ردیف CP روی نود هست و همهٔ فیلدها یکسان است؛ نود ردیف اضافه ندارد.
 *   WARN  — ردیف `cp-` روی نود هست ولی منبعش از CP حذف فیزیکی شده
 *           (بایگانی پس از پاک‌سازی — طبق قرارداد حذف فیزیکی منتشر نمی‌شود؛ مشکل نیست،
 *           فقط برای شفافیت عملیاتی گزارش می‌شود).
 *   FAIL  — اختلاف فیلد در ردیف‌های مشترک، یا ردیف CP که روی نود نیست.
 *
 * اجرا:  node scripts/cp-correlation-test.mjs
 * پیش‌نیاز: توکن حساب Cloudflare در متغیر CLOUDFLARE_API_TOKEN و wrangler در node_modules
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(REPO_ROOT, 'node_modules', '.bin', 'wrangler');
const CP_DB = process.env.CP_D1_NAME ?? 'control-plane-db';
const NODE_DB = process.env.NODE_D1_NAME ?? 'center-system-db';

const SEL = `SELECT id, title, body, show_login, show_panel, active, created_at, updated_at
             FROM announcements`;

function d1Rows(dbName, sql) {
  const out = execFileSync(WRANGLER, ['d1', 'execute', dbName, '--remote', '--json', '--command', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    env: { ...process.env }
  });
  const parsed = JSON.parse(out);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const ok = arr.find((r) => r.success);
  if (!ok) throw new Error(`d1 query failed on ${dbName}`);
  return ok.results ?? [];
}

const norm = (v) => (v === null || v === undefined ? '' : String(v));
const FIELDS = ['title', 'body', 'show_login', 'show_panel', 'active', 'created_at', 'updated_at'];

const cpRows = d1Rows(CP_DB, SEL).map((r) => ({ ...r, _side: 'cp' }));
const nodeRows = d1Rows(NODE_DB, `${SEL} WHERE id LIKE 'cp-%'`).map((r) => ({ ...r, _side: 'node' }));

const cpById = new Map(cpRows.map((r) => [r.id, r]));
const nodeById = new Map(nodeRows.map((r) => [r.id, r]));

let fails = 0;
let warns = 0;

console.log('═══ تست همبستگی CP ↔ نود — اعلان‌های شبکه‌ای (cp-%) ═══');
console.log(`CP (${CP_DB}): ${cpRows.length} اعلان | نود (${NODE_DB}): ${nodeRows.length} ردیف cp-\n`);

for (const row of cpRows) {
  const twin = nodeById.get(row.id);
  if (!twin) {
    fails++;
    console.log(`✘ ${row.id} «${row.title}» — روی نود نیست (سینک نگرفته؟)`);
    continue;
  }
  const diffs = FIELDS.filter((f) => norm(row[f]) !== norm(twin[f]));
  if (diffs.length === 0) {
    console.log(`✔ ${row.id} «${row.title}» — همهٔ ۷ فیلد یکسان (active=${row.active})`);
  } else {
    fails++;
    for (const f of diffs) {
      console.log(`✘ ${row.id} فیلد ${f}: CP=${norm(row[f]).slice(0, 60)} | نود=${norm(twin[f]).slice(0, 60)}`);
    }
  }
}

for (const row of nodeRows) {
  if (!cpById.has(row.id)) {
    warns++;
    console.log(`⚠ ${row.id} «${row.title}» — منبعش از CP حذف فیزیکی شده؛ رونوشت بایگانی روی نود مانده (per contract)`);
  }
}

console.log(`\nنتیجه: ${fails === 0 ? 'PASS' : 'FAIL'} — ${cpRows.length} مرجع، ${nodeRows.length} رونوشت، ${warns} هشدار، ${fails} ناسازگاری`);
process.exit(fails === 0 ? 0 : 1);
