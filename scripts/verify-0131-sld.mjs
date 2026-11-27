#!/usr/bin/env node
/**
 * scripts/verify-0131-sld.mjs — راستی‌آزمایی مایگریشن 0131_sld_specialization.sql روی SQLite محلی.
 *
 * سناریو A (پروداکسی تولید): 001..0130 + staff + replay 0043/0129 + کارت‌های بانکِ تولید با عنوان‌های
 *   واقعی exercises.json (بدون شناسهٔ ساختگی — id تصادفی می‌سازیم تا لینکِ «حل‌شده در لحظهٔ اجرا» اثبات شود)
 *   + 0131 → انتظار: هر ۱۹ لینک هدف پر شود (دو لینک لفظی seed + ۱۷ لینک عنوانی).
 * سناریو B (DB بدون کارت‌های تولید): همان بدون کارت‌های ساختگی → انتظار: فقط دو لینک لفظی seed پر شود؛
 *   بقیه linkId:null بمانند و JSON معتبر بماند.
 * سپس: بایگانی‌ها (۵ قالب + ۴ کارت + ۶ فرم)، یادداشت بایگانی، اجرای دوبارهٔ 0131 (Idempotency).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = join(ROOT, 'migrations');
const M131 = '0131_sld_specialization.sql';

function buildDb(withProdCards) {
  const db = new DatabaseSync(join(mkdtempSync(join(tmpdir(), 'sld-verify-')), 'v.db'));
  for (const f of readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort().filter((f) => f !== M131)) {
    db.exec(readFileSync(join(MIG_DIR, f), 'utf8'));
  }
  db.exec(`INSERT INTO staff (id, email, full_name, role) VALUES ('staff-verify', 'verify@local', 'راستی‌آزمایی 0131', 'manager')`);
  for (const f of ['0043_exercise_seed.sql', '0129_system_exercise_cards.sql']) {
    db.exec(readFileSync(join(MIG_DIR, f), 'utf8'));
  }
  if (withProdCards) {
    // ردیف‌های بانک تولید (exercises.json) با عنوان دقیق — شناسه‌شان در خروجی نیست؛ UUID تصادفی واقعی‌نما
    const titles = [
      ['شمارش برعکس', 'worksheet'], ['بازی حافظه اشکال', 'game'], ['بازی حافظه شنیداری', 'game'],
      ['حافظه فعال', 'instruction'], ['حافظه فعال', 'worksheet'], ['تقویت حافظه دیداری', 'worksheet'],
      ['تقویت حافظه دیداری', 'worksheet'], ['تقویت حافظه دیداری', 'worksheet'],
      ['تمرینات فراستیگ ( درک دیداری فضایی)', 'worksheet'], ['تمرینات ماز', 'worksheet'],
      ['پروتکل پیش نیاز مهارت نوشتن', 'instruction'], ['تقویت هماهنگی دو نیمکره', 'worksheet'],
      ['تقویت تمیز دیداری', 'worksheet'], ['پروتکل پیش نیازهای مهارت ریاضی', 'instruction'],
      ['پروتکل پیش نیاز های مهارت ریاضی ۲', 'instruction']
    ];
    const st = db.prepare(`INSERT INTO exercises (id, title, format, published, created_by) VALUES (?, ?, ?, 1, 'staff-verify')`);
    for (const [t, f] of titles) st.run(randomUUID(), t, f);
  }
  return db;
}

const ACTIVE_6 = ['sys-sld-reading', 'sys-sld-writing', 'sys-sld-math', 'sys-wm-primary', 'sys-writing-g12', 'sys-math-g1'];
const ARCHIVED_5 = ['sys-adhd-preschool', 'sys-adhd-primary', 'sys-anxiety-emotion', 'sys-speech-delay', 'sys-attention-g123'];
const ARCHIVED_CARDS = ['113', '114', '115', '212'];
const ARCHIVED_FORMS = ['ce-asd-criteria-v1', 'ce-odd-criteria-v1', 'ce-scared-p-v1', 'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1', 'ce-dcdq-v1'];
// آیتم‌های هدف لینک 0131: [key, sessionIdx, itemIdx]
// (sys-sld-math S3 i1 «مسئلهٔ کلامی چهارگام» از 0128 از قبل 206 دارد — هدف 0131 نیست)
const LINK_TARGETS = [
  ['sys-sld-reading', 4, 1],
  ['sys-wm-primary', 0, 1], ['sys-wm-primary', 1, 0], ['sys-wm-primary', 1, 1], ['sys-wm-primary', 1, 2],
  ['sys-wm-primary', 2, 0], ['sys-wm-primary', 3, 0], ['sys-wm-primary', 3, 2],
  ['sys-writing-g12', 1, 0], ['sys-writing-g12', 1, 1], ['sys-writing-g12', 1, 3],
  ['sys-writing-g12', 2, 0], ['sys-writing-g12', 2, 3], ['sys-writing-g12', 3, 1],
  ['sys-math-g1', 2, 0], ['sys-math-g1', 2, 2], ['sys-math-g1', 3, 0], ['sys-math-g1', 3, 2]
];
const BASE_LINKS = 50; // لینک‌های از قبل موجود در 0128/0130
const SEED_LINKS = 1;  // فقط 103 — تکلیف «خواندن دوبارهٔ یک‌خطی در خانه» (sys-sld-reading S4 i1)

let fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fail++;
}

const m131 = readFileSync(join(MIG_DIR, M131), 'utf8');
const sessionsOf = (db, key) => JSON.parse(db.prepare(`SELECT sessions_json j FROM pathway_templates WHERE key = ?`).get(key).j);

for (const scenario of [['A (با کارت‌های تولید)', true], ['B (بدون کارت‌های تولید)', false]]) {
  const [label, withCards] = scenario;
  console.log(`\n─── سناریو ${label} ───`);
  const db = buildDb(withCards);
  db.exec(m131);

  const rows = db.prepare(`SELECT key, active, description FROM pathway_templates WHERE key LIKE 'sys-%' ORDER BY key`).all();
  check(`${label}: ۱۱ قالب سیستمی`, rows.length === 11, String(rows.length));
  check(`${label}: ۶ قالب فعال`, rows.filter((r) => ACTIVE_6.includes(r.key) && r.active === 1).length === 6);
  for (const k of ARCHIVED_5) {
    const r = rows.find((r) => r.key === k);
    check(`${label}: ${k} بایگانی+یادداشت`, r && r.active === 0 && r.description.includes('[بایگانی 0131'));
  }
  check(`${label}: ۴ کارت اتیسم published=0`,
    db.prepare(`SELECT COUNT(*) n FROM exercises WHERE id IN ('cccccccc-8200-4000-8000-000000000113','cccccccc-8200-4000-8000-000000000114','cccccccc-8200-4000-8000-000000000115','cccccccc-8200-4000-8000-000000000212') AND published = 0`).get().n === 4);
  check(`${label}: کارت‌های توجه/حافظه/بازی منتشر می‌مانند`,
    db.prepare(`SELECT COUNT(*) n FROM exercises WHERE id IN ('cccccccc-8200-4000-8000-000000000110','cccccccc-8200-4000-8000-000000000112','cccccccc-8200-4000-8000-000000000131','cccccccc-8200-4000-8000-000000000211') AND published = 1`).get().n === 4);
  check(`${label}: ۶ فرم بایگانی`,
    db.prepare(`SELECT COUNT(*) n FROM case_event_types WHERE key IN (${ARCHIVED_FORMS.map((k) => `'${k}'`).join(',')}) AND active = 0`).get().n === 6);
  check(`${label}: فرم‌های نگه‌داشته فعال`,
    db.prepare(`SELECT COUNT(*) n FROM case_event_types WHERE key IN ('ce-sdq-p-v1','ce-sdq-t-v1','ce-sld-read-v1','ce-sld-wri-v1','ce-sld-calc-v1','ce-probe-read-v1','ce-probe-write-v1','ce-probe-calc-v1','ce-speech-criteria-v1','ce-anamnesis-v3') AND active = 1`).get().n === 10);

  // شکل JSON (0051) + لینک‌ها
  let jsonOk = true, linked = 0;
  for (const r of rows) {
    let sessions;
    try { sessions = JSON.parse(db.prepare(`SELECT sessions_json j FROM pathway_templates WHERE key = ?`).get(r.key).j); }
    catch { jsonOk = false; continue; }
    for (const s of sessions) for (const it of s.items ?? []) {
      if (it.linkId === null || it.linkId === undefined) continue;
      linked++;
      if (!db.prepare(`SELECT COUNT(*) n FROM exercises WHERE id = ?`).get(it.linkId).n) jsonOk = false;
    }
  }
  check(`${label}: JSON همهٔ قالب‌ها معتبر و لینک‌ها به کارت موجود`, jsonOk);
  if (withCards) check(`${label}: ۱۸ آیتم هدف لینک گرفت (۱ لفظی + ۱۷ عنوانی)`, linked === BASE_LINKS + SEED_LINKS + 17, `links=${linked}`);
  else {
    check(`${label}: فقط ۱ لینک seed تازه + بقیه null`, linked === BASE_LINKS + SEED_LINKS, `links=${linked}`);
    check(`${label}: آیتم‌های عنوانی null ماندند`,
      LINK_TARGETS.filter(([k]) => k !== 'sys-sld-reading')
        .every(([k, si, ii]) => sessionsOf(db, k)[si].items[ii].linkId === null));
    check(`${label}: لینک لفظی seed 103`,
      sessionsOf(db, 'sys-sld-reading')[4].items[1].linkId === 'cccccccc-8200-4000-8000-000000000103');
  }
  if (withCards) {
    check(`${label}: لینک لفظی seed 103`,
      sessionsOf(db, 'sys-sld-reading')[4].items[1].linkId === 'cccccccc-8200-4000-8000-000000000103');
    check(`${label}: مسئلهٔ کلامی چهارگام از 0128 همچنان 206`,
      sessionsOf(db, 'sys-sld-math')[3].items[1].linkId === 'cccccccc-8200-4000-8000-000000000206');
    check(`${label}: آیتم‌های عنوانی به UUID کارت واقعی رسیدند`,
      LINK_TARGETS.filter(([k]) => k === 'sys-wm-primary' || k === 'sys-writing-g12' || k === 'sys-math-g1')
        .every(([k, si, ii]) => { const v = sessionsOf(db, k)[si].items[ii].linkId; return v && !v.startsWith('cccccccc-8200-4000-8000-0000000001'); }));
    check(`${label}: حافظهٔ فعال کانونی = ردیف instruction`,
      (() => { const v = sessionsOf(db, 'sys-wm-primary')[3].items[0].linkId; return v && db.prepare(`SELECT format f FROM exercises WHERE id = ?`).get(v).f === 'instruction'; })());
    check(`${label}: تقویت حافظه دیداری = ردیف کانونی (آخرین created_at)`,
      (() => { const v = sessionsOf(db, 'sys-wm-primary')[1].items[1].linkId; const r = db.prepare(`SELECT created_at c FROM exercises WHERE id = ?`).get(v); return r && db.prepare(`SELECT MAX(created_at) m FROM exercises WHERE title = 'تقویت حافظه دیداری'`).get().m === r.c; })());
  }

  // هیچ قالب فعال کلید بایگانی‌شده‌ای را صدا نمی‌زند
  const activeRows = rows.filter((r) => ACTIVE_6.includes(r.key));
  const badRefs = [];
  for (const r of activeRows) {
    const hay = [r.steps, db.prepare(`SELECT sessions_json j FROM pathway_templates WHERE key = ?`).get(r.key).j].join(' ');
    for (const tok of hay.match(/ce-[a-z0-9-]+/g) ?? []) {
      if (ARCHIVED_FORMS.includes(tok)) badRefs.push(`${r.key}:${tok}`);
    }
  }
  check(`${label}: قالب‌های فعال به فرم بایگانی ارجاع ندارند`, badRefs.length === 0, badRefs.join(', '));

  // Idempotency — اجرای دوبارهٔ 0131: شمار فعال/یادداشت/لینک‌ها عیناً ثابت
  const before = db.prepare(`SELECT key, active, description, sessions_json FROM pathway_templates WHERE key LIKE 'sys-%' ORDER BY key`).all();
  db.exec(m131);
  const after = db.prepare(`SELECT key, active, description, sessions_json FROM pathway_templates WHERE key LIKE 'sys-%' ORDER BY key`).all();
  check(`${label}: اجرای دوباره — قالب‌ها و JSON بایت‌به‌بایت ثابت`,
    JSON.stringify(before) === JSON.stringify(after));
}

console.log(fail === 0 ? '\n✓ راستی‌آزمایی 0131 سبز' : `\n✗ ${fail} ادعا قرمز`);
process.exit(fail === 0 ? 0 : 1);
