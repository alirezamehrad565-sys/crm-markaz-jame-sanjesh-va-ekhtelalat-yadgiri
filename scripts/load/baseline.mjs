#!/usr/bin/env node
// baseline بار — runner اندازه‌گیری (ف۵ P1-9 «تست بار و ظرفیت»)
//
// چه می‌کند:
//   ۱. (پیش‌فرض) آماده‌باش سرور را poll می‌کند (GET /health تا ۱۵۰ثانیه)
//   ۲. k6 (سناریوهای scripts/load/k6/baseline.js) را روی ورکر محلی می‌دود
//   ۳. خروجی JSON خلاصهٔ k6 را به جدول فارسی + JSON فشرده تبدیل می‌کند
//   ۴. با پرچم --seed-only: بدون سرور، دادهٔ حجمی فقط-محلی (۸۰۰ دانش‌آموز / ۳٬۰۰۰ نوبتِ
//      ۷۵روزه) را با wrangler d1 execute --local (چانک‌شده) می‌ریزد — پیش از npm run dev و یک‌بار
//
// خروجی‌ها هرگز داخل مخزن نمی‌روند — همه در /tmp/load-baseline (پیش‌فرض).
// مصرف:
//   npm run load:baseline -- --seed-only        # یک‌بار، با سرور خاموش
//   npm run dev                                 # ترمینال دیگر
//   npm run load:baseline                       # اجرای بار + جدول اعداد
// پرچم‌ها:
//   --seed-only        فقط ریختن دادهٔ حجمی محلی (سرور لازم نیست — حتی باید خاموش باشد)
//   --base-url URL     پیش‌فرض http://127.0.0.1:8787
//   --out DIR          پیش‌فرض /tmp/load-baseline
//   --k6 PATH          مسیر باینری k6؛ وگرنه which k6 → /tmp/k6-dist/k6
//   --user/--pass      پیش‌فرض manager/1234 (دادهٔ توسعهٔ محلی — scripts/seed-dev.sql)
//   --quiet            بدون خروجی k6 زنده (فقط جدول نهایی)

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

// — پرچم‌ها —
const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const SEED_ONLY = argv.includes('--seed-only');
const BASE = argOf('--base-url') ?? 'http://127.0.0.1:8787';
const OUT_DIR = resolve(ROOT, argOf('--out') ?? '/tmp/load-baseline');
const USER = argOf('--user') ?? 'manager';
const PASS = argOf('--pass') ?? '1234';
const QUIET = argv.includes('--quiet');

// پنجرهٔ زمانی سناریوها (ثانیه) — هماهنگ با options.scenarios در scripts/load/k6/baseline.js
const SCENARIO_SECONDS = {
  health: 30,
  login: 30,
  dashboard_summary: 40,
  dashboard_today: 40,
  reports: 40,
  dashboard_summary_30d: 20,
};

const say = (...m) => console.log(...m);

function resolveK6() {
  const explicit = argOf('--k6');
  if (explicit && existsSync(explicit)) return explicit;
  if (explicit) throw new Error(`k6 پیدا نشد در مسیر داده‌شده: ${explicit}`);
  const which = spawnSync('which', ['k6'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  for (const p of ['/tmp/k6-dist/k6']) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    'باینری k6 پیدا نشد. نصب: tarball استاتیک از https://github.com/grafana/k6/releases ' +
      '(مثلاً k6-v1.4.0-linux-amd64.tar.gz) را در /tmp باز کنید یا مسیر را با --k6 بدهید.'
  );
}

// ─────────────── ① دادهٔ حجمی فقط-محلی ───────────────
// deterministic (شناسه‌های ثابت + INSERT OR IGNORE) → اجرای دوباره idempotent است.
// این داده فقط داخل D1 محلی می‌نشیند (SQL در /tmp نوشته و اجرا می‌شود؛ هیچ فایلی در مخزن
// ساخته نمی‌شود) — هدف: اینکه خوانش‌های سنگین (خلاصهٔ دوره/گزارش) با حجم واقع‌گرایانه
// (نه دیتابیس تقریباً خالی seed-dev) اندازه‌گیری شوند.
const SEED = {
  students: 800,
  perDay: 40,
  daysBack: 60,
  daysFwd: 14,
  staff: [
    '00000000-0000-0000-0000-000000000001', // manager
    '00000000-0000-0000-0000-000000000002', // ali
    '00000000-0000-0000-0000-000000000003', // maryam
    '00000000-0000-0000-0000-000000000004', // secretary
  ],
  schools: [
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
  ],
};

function uid(prefix, n) {
  // UUID شکل‌درست (نسخه/واریانت متعارف) با شمارهٔ ترتیبی در آخرین ۱۲ رقم
  return `${prefix}0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function buildSeedSql() {
  const names = ['آرمان', 'بردیا', 'پارسا', 'ترانه', 'ثنا', 'جوان', 'چاوش', 'حورا', 'خاطره', 'دلآرا'];
  const fams = ['اکبری', 'بابایی', 'پناهی', 'تجلی', 'جعفری', 'چراغعلی', 'حسینی', 'خسروی', 'دادگر', 'رستمی'];
  const grades = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'];
  const stmts = [];

  const sRows = [];
  for (let i = 1; i <= SEED.students; i++) {
    const nid = String(1000000000 + i * 7).padStart(10, '0'); // فقط-محلی؛ اعتبارسنجی کد ملی فقط در مسیر API است
    sRows.push(
      `('${uid('b', i)}', '${nid}', '${names[i % names.length]}', '${fams[i % fams.length]}${i}', '20${String(10 + (i % 15)).padStart(2, '0')}-0${(i % 9) + 1}-1${i % 10}', '${i % 2 === 0 ? 'male' : 'female'}', '${grades[i % grades.length]}', '${SEED.schools[i % SEED.schools.length]}', 'ولی ${i}', 'father', '0912${String(1000000 + i).slice(-7)}')`
    );
  }
  for (let j = 0; j < sRows.length; j += 300) {
    stmts.push(
      'INSERT OR IGNORE INTO students (id, national_id, first_name, last_name, birth_date, gender, grade, school_id, guardian_name, guardian_relation, guardian_phone) VALUES\n  ' +
        sRows.slice(j, j + 300).join(',\n  ') +
        ';'
    );
  }

  const aRows = [];
  const lRows = [];
  const nowMs = Date.now();
  let n = 1;
  for (let d = -SEED.daysBack; d <= SEED.daysFwd; d++) {
    for (let k = 0; k < SEED.perDay; k++) {
      const startMs = nowMs + d * 86400_000 + (6 * 3600 + k * 12 * 60) * 1000; // ۰۶:۰۰UTC به بعد — اسلات‌های ۱۲دقیقه‌ای
      const endMs = startMs + 45 * 60_000;
      const staff = SEED.staff[(k + Math.abs(d)) % SEED.staff.length];
      const status = n % 12 === 0 ? 'cancelled' : 'scheduled';
      aRows.push(
        `('${uid('a', n)}', '${staff}', '${new Date(startMs).toISOString()}', '${new Date(endMs).toISOString()}', '${status}', NULL, 1, NULL, '${SEED.staff[0]}', '${new Date(startMs - 86400_000).toISOString()}', '${new Date(startMs - 86400_000).toISOString()}')`
      );
      const st1 = ((n * 7 + 3) % SEED.students) + 1;
      const att1 = startMs < nowMs ? (n % 10 < 7 ? 'present' : 'absent') : 'pending';
      lRows.push(`('${uid('a', n)}', '${uid('b', st1)}', NULL, '${att1}', NULL)`);
      if (n % 5 === 0) {
        const st2 = ((n * 7 + 101) % SEED.students) + 1;
        const att2 = startMs < nowMs ? (n % 10 < 6 ? 'present' : 'absent') : 'pending';
        lRows.push(`('${uid('a', n)}', '${uid('b', st2)}', NULL, '${att2}', NULL)`);
      }
      n++;
    }
  }
  for (let j = 0; j < aRows.length; j += 300) {
    stmts.push(
      'INSERT OR IGNORE INTO appointments (id, staff_id, start_at, end_at, status, note, version, batch_id, created_by, created_at, updated_at) VALUES\n  ' +
        aRows.slice(j, j + 300).join(',\n  ') +
        ';'
    );
  }
  for (let j = 0; j < lRows.length; j += 300) {
    stmts.push(
      'INSERT OR IGNORE INTO appointment_students (appointment_id, student_id, facet_id, attendance, note) VALUES\n  ' +
        lRows.slice(j, j + 300).join(',\n  ') +
        ';'
    );
  }
  return { stmts, appointments: aRows.length, links: lRows.length };
}

function seedOnly() {
  const { stmts, appointments, links } = buildSeedSql();
  mkdirSync(OUT_DIR, { recursive: true });
  say(`— دادهٔ حجمی فقط-محلی: ${SEED.students} دانش‌آموز · ${appointments} نوبت (${SEED.daysBack}+${SEED.daysFwd + 1} روز × ${SEED.perDay}) · ${links} سطر نوبت‌ـ‌دانش‌آموز`);
  say(`— فایل‌های SQL در ${OUT_DIR} (خارج از مخزن)`);
  // اندازهٔ فایل تجربی: یک فراخوان با کل SQL (~۱.۳MB) در workerd محلی کرش segfault می‌دهد؛
  // چانک‌های ~۵۵KB (۳۰۰ سطر) سبک می‌روند — پس هر دستور یک فراخوان wrangler جدا می‌شود.
  stmts.forEach((sql, i) => {
    const sqlPath = resolve(OUT_DIR, `seed-load-${String(i + 1).padStart(2, '0')}.sql`);
    writeFileSync(sqlPath, sql);
    const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'center-system-db', '--local', `--file=${sqlPath}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      say(`✋ چانک ${i + 1}/${stmts.length} ناموفق (${sqlPath})${r.stderr ? ' — ' + r.stderr.split('\n').slice(-3).join(' ') : ''}`);
      say('  (آیا سرور wrangler dev روشن است؟ seeding فقط با سرور خاموش انجام می‌شود)');
      process.exit(r.status ?? 1);
    }
    say(`  ✓ چانک ${i + 1}/${stmts.length}`);
  });
  say('✓ دادهٔ حجمی محلی ریخته شد — حالا npm run dev و سپس npm run load:baseline');
}

// ─────────────── ② آماده‌باش سرور ───────────────
async function waitForServer(baseUrl, budgetMs = 150_000) {
  const deadline = Date.now() + budgetMs;
  say(`— انتظار آماده‌باش ${baseUrl}/health ...`);
  while (Date.now() < deadline) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const res = await fetch(`${baseUrl}/health`, { signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) {
        const body = await res.json();
        if (body?.ok === true) {
          say(`✓ سرور آماده است (نسخهٔ ${body.version ?? '?'})`);
          return body;
        }
      }
    } catch {
      // هنوز بالا نیامده — دوباره
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('سرور در ۱۵۰ثانیه آماده نشد — آیا npm run dev روشن است؟');
}

// ─────────────── ③ اجرای k6 + ④ جدول ───────────────
function humanRow(name, m) {
  if (!m) return `| ${name} | — |`;
  const p = (v) => (v == null ? '—' : `${Math.round(v)}ms`);
  const f = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
  return `| ${name} | ${m.reqs} | ${m.rps.toFixed(1)} | ${p(m.p50)} | ${p(m.p95)} | ${p(m.p99)} | ${f(m.failRate)} | ${m.checkFails} |`;
}

async function runLoad() {
  const k6 = resolveK6();
  say(`— k6: ${k6}`);
  await waitForServer(BASE);

  mkdirSync(OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const exportPath = resolve(OUT_DIR, `summary-${ts}.json`);

  const r = spawnSync(
    k6,
    ['run', '--summary-export', exportPath, ...(QUIET ? ['--quiet'] : []), resolve(HERE, 'k6', 'baseline.js')],
    { cwd: ROOT, env: { ...process.env, BASE_URL: BASE, LOAD_USER: USER, LOAD_PASS: PASS }, stdio: 'inherit' }
  );

  if (!existsSync(exportPath)) {
    say('✋ خروجی JSON خلاصهٔ k6 ساخته نشد — خروجی زندهٔ بالا را ببینید.');
    process.exit(r.status ?? 1);
  }

  const raw = JSON.parse(readFileSync(exportPath, 'utf8'));
  const scenarios = ['health', 'login', 'dashboard_summary', 'dashboard_today', 'reports', 'dashboard_summary_30d'];
  // rps واقعیِ هر سناریو = شمار درخواست‌ها ÷ پنجرهٔ زمانی سناریو (SCENARIO_SECONDS بالا؛
  // k6 «rate» را بر کل زمان اجرا می‌دهد که برای سناریوهای پشت‌سرهم رقیق‌شده است).
  // k6 v1.x: زیرمتریک‌ها با دو-نقطه نام‌گذاری می‌شوند ({scenario:X}) و مقادیر بدون wrapper
  // «values» مستقیم روی آبژه متریک‌اند. معنای http_req_failed هم در خروجی JSON معکوس‌نماست:
  // value = نرخ خطا (0=همه موفق)؛ passes = شمار خطاها، fails = شمار موفقیت‌ها (اثبات تجربی
  // با رانِ ۴۰۱شدهٔ نخستین: passes=320 یعنی همان ۳۲۰ خطای 401). برای ماتریس checks برعکس:
  // passes/fails معنای عادی دارند (passes = چک‌های موفق).
  const pick = (metric, scen) => raw.metrics?.[`${metric}{scenario:${scen}}`] ?? null;
  const out = { generated_at: new Date().toISOString(), base_url: BASE, k6_exit_code: r.status, scenarios: {} };

  say('\n───────── baseline بار (ورکر محلی — نه لبه) ─────────');
  say('| سناریو | درخواست‌ها | rps | p50 | p95 | p99 | نرخ خطا | چک‌ناموفق |');
  say('|---|---|---|---|---|---|---|---|');
  for (const s of scenarios) {
    const dur = pick('http_req_duration', s);
    const reqs = pick('http_reqs', s);
    const failed = pick('http_req_failed', s);
    const checks = pick('checks', s);
    if (!dur && !reqs) continue;
    const m = {
      reqs: reqs?.count ?? 0,
      rps: reqs?.count ? reqs.count / (SCENARIO_SECONDS[s] || 1) : 0,
      avg: dur?.avg ?? null,
      p50: dur?.['p(50)'] ?? null,
      p95: dur?.['p(95)'] ?? null,
      p99: dur?.['p(99)'] ?? null,
      max: dur?.max ?? null,
      failRate: failed?.value ?? null,
      fails: failed?.passes ?? null,
      checkFails: checks?.fails ?? null,
    };
    out.scenarios[s] = m;
    say(humanRow(s, m));
  }
  say('─────────────────────────────────────────────────────');

  const canonical = resolve(OUT_DIR, `baseline-${ts}.json`);
  writeFileSync(canonical, JSON.stringify(out, null, 2) + '\n');
  say(`— JSON خام: ${exportPath}`);
  say(`— JSON فشردهٔ مرجع: ${canonical}`);
  say('— یادآوری: این اعداد برای مقایسهٔ رگرسیونی نسخه‌ها روی همین ماشین است؛ تأخیر لبهٔ کلادفلر را اندازه نمی‌گیرد.');
  if (r.status !== 0) say(`⚠ k6 با کد ${r.status} خارج شد (آستانه‌های نرمِ سناریوها یا خطای اجرا) — اعداد بالا را با احتیاط بخوانید.`);
}

if (SEED_ONLY) {
  seedOnly();
} else {
  runLoad().catch((err) => {
    say(`✋ ${err.message}`);
    process.exit(1);
  });
}
