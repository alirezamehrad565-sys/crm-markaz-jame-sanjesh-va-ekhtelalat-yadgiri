#!/usr/bin/env node
/**
 * scripts/sld-backup.mjs — پیش‌ثبت (before-state) هر ردیفی که مایگریشن 0131_sld_specialization.sql لمس می‌کند.
 *
 * مایگریشن 0131 سه بایگانی نرم + لینک‌سازی انجام می‌دهد. این اسکریپت «قبل» آن ردیف‌ها را SELECT می‌کند و
 * به download/evidence/sld-specialization-backup.json می‌نویسد — خواندنی برای بازگشت (reverse) دستی.
 *
 * اجرا (دو حالت):
 *   node scripts/sld-backup.mjs --prod    ← روی تولید با wrangler (پیش از اجرای 0131 روی تولید):
 *        پیش‌نیاز: CLOUDFLARE_API_TOKEN و CLOUDFLARE_ACCOUNT_ID در محیط (الگوی scripts/d1-inventory.py).
 *        هر کوئری SELECT-only است و اجرای مایگریشن کاری ندارد.
 *   node scripts/sld-backup.mjs --local   ← روی SQLite ساخته‌شده از migrations/*.sql به‌جز خود 0131
 *        (قبلِ seed — همان چیزی که تولید پس از اعمال 001..0130 دارد).
 *
 * خروجی: { generated_at, source, pathway_templates[11], exercises[4], case_event_types[6] }
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'download', 'evidence', 'sld-specialization-backup.json');
const MIG_DIR = join(ROOT, 'migrations');
const GH_WORK = join(ROOT, 'gh-work');
const D1_DB = 'center-system-db';

const TEMPLATE_KEYS = [
  'sys-adhd-preschool', 'sys-adhd-primary', 'sys-anxiety-emotion', 'sys-speech-delay', 'sys-attention-g123',
  'sys-sld-reading', 'sys-sld-writing', 'sys-sld-math', 'sys-wm-primary', 'sys-writing-g12', 'sys-math-g1'
];
const CARD_IDS = [
  'cccccccc-8200-4000-8000-000000000113',
  'cccccccc-8200-4000-8000-000000000114',
  'cccccccc-8200-4000-8000-000000000115',
  'cccccccc-8200-4000-8000-000000000212'
];
const FORM_KEYS = [
  'ce-asd-criteria-v1', 'ce-odd-criteria-v1', 'ce-scared-p-v1',
  'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1', 'ce-dcdq-v1'
];

const SQL_TEMPLATES = `SELECT id, key, title, description, protocol, target_key, steps, sessions_json, is_system, active, created_by, updated_at
FROM pathway_templates WHERE key IN (${TEMPLATE_KEYS.map((k) => `'${k}'`).join(', ')}) ORDER BY key`;
const SQL_CARDS = `SELECT id, title, format, published, deleted_at, updated_at
FROM exercises WHERE id IN (${CARD_IDS.map((k) => `'${k}'`).join(', ')}) ORDER BY id`;
const SQL_FORMS = `SELECT id, key, title, category, audience, family_fillable, active, deleted_at, updated_at
FROM case_event_types WHERE key IN (${FORM_KEYS.map((k) => `'${k}'`).join(', ')}) ORDER BY key`;

function queryProd(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', D1_DB, '--remote', '--json', '--command', sql],
    { cwd: GH_WORK, encoding: 'utf8', timeout: 120_000, env: process.env, shell: process.platform === 'win32' }
  );
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? (parsed[0]?.results ?? []) : (parsed.results ?? []);
}

function buildLocalDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sld-backup-'));
  const db = new DatabaseSync(join(dir, 'backup.db'));
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => f !== '0131_sld_specialization.sql'); // قبلِ خود 0131
  for (const f of files) db.exec(readFileSync(join(MIG_DIR, f), 'utf8'));
  // کارت‌های 0043/0129 در تولید با staff موجود seed شده‌اند؛ در محلی، staff پس از مایگریشن‌ها ساخته می‌شود —
  // آینهٔ الگوی هارنس (src/test/harness.ts و e2e-system-content-bundle.test.ts): staff + replay idempotent.
  db.exec(`INSERT OR IGNORE INTO staff (id, email, full_name, role) VALUES ('staff-backup-seed', 'backup@local', 'پیش‌ثبت 0131', 'manager')`);
  for (const f of ['0043_exercise_seed.sql', '0129_system_exercise_cards.sql']) {
    db.exec(readFileSync(join(MIG_DIR, f), 'utf8'));
  }
  return { db, applied: files.length };
}

const mode = process.argv.includes('--prod') ? 'prod' : process.argv.includes('--local') ? 'local' : null;
if (!mode) {
  console.error('استفاده: node scripts/sld-backup.mjs --prod | --local');
  process.exit(2);
}

let source, templates, cards, forms;
if (mode === 'prod') {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('✗ CLOUDFLARE_API_TOKEN در محیط نیست — حالت --prod از اسکریپت d1-inventory.py الگو می‌گیرد.');
    process.exit(1);
  }
  source = `prod-d1:${D1_DB}`;
  templates = queryProd(SQL_TEMPLATES);
  cards = queryProd(SQL_CARDS);
  forms = queryProd(SQL_FORMS);
} else {
  const { db, applied } = buildLocalDb();
  source = `local-seed:${applied} migrations (001..0130، بدون 0131)`;
  templates = db.prepare(SQL_TEMPLATES).all();
  cards = db.prepare(SQL_CARDS).all();
  forms = db.prepare(SQL_FORMS).all();
}

const payload = {
  generated_at: new Date().toISOString(),
  purpose: 'before-state of every row touched by migrations/0131_sld_specialization.sql — بازگشت نرم با مقادیر همین فایل',
  source,
  pathway_templates: templates,
  exercises: cards,
  case_event_types: forms
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`✓ قبلِ 0131 ثبت شد (${mode}) — ${templates.length} قالب · ${cards.length} کارت · ${forms.length} فرم`);
console.log(`  → ${OUT}`);
if (templates.length !== 11 || cards.length !== 4 || forms.length !== 6) {
  console.error('✗ شمار ردیف‌ها با انتظار 0131 (11/4/6) نمی‌خواند — قبل از مایگریشن بررسی شود.');
  process.exit(1);
}
