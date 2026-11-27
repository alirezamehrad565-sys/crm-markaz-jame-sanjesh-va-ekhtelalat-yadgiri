#!/usr/bin/env node
// scripts/sec-audit.mjs — ممیزی نشتی‌های امنیتی و خطاهای پنهان (۱.۲۷.۴۳)
//
// طراحی: ۱۲ خانوادهٔ الگو روی کل مخزن (بدون node_modules/dist/bundle) با سه‌گانه‌سازی:
//   [HIGH] قطعی/پرریسک — باید رفع شود
//   [MED]  مظنون — بازبینی دستی
//   [LOW]  اطلاعی
// خروجی: فهرست یافته‌ها با فایل:خط + خلاصه؛ کد خروج ۱ اگر HIGH داشته باشد.
//
// خانواده‌ها:
//  S1 رازِ هاردکد/جایگزین ثابت        S2 مقایسهٔ غیرهم‌زمان‌ایمن راز
//  S3 err.message در پاسخ HTTP        S4 توکن در URL (نشتی رفرر/لاگ)
//  S5 HTML رشته‌ای بدون esc           S6 JSON.parse ورودی نامعتبر بدون try
//  S7 console.* در ورکر               S8 لاگِ PII/راز (meta با phone/token/...)
//  S9 localStorage حساس در SPA        S10 فایل‌های ردیابی‌شدهٔ رازدار (git)
//  S11 تنظیمات ناامن دسکتاپ (Tauri)   S12 سقف نداشتن بدنهٔ POST عمومی
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
// فقط سورس محصول اسکن می‌شود؛ پوشه‌های همسایهٔ ریشه (مهارت‌های محیط، تحویل‌ها، ورودی‌ها،
// پوشه‌های سرگردان) کد اجرایی محصول نیستند — فیکسچر آزمایشی داخلشان «راز» ساختگی دارد.
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'target', 'installer', 'workerd', 'skills', 'download', 'upload', 'refs', 'gh-work']);

const findings = [];
const SELF = 'scripts/sec-audit.mjs'; // خود-دفع: اسکنر الگوهای خودش را گزارش نکند
const add = (sev, fam, file, line, note) => {
  findings.push({ sev, fam, file: path.relative(ROOT, file), line, note });
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      yield* walk(p);
    } else if (/\.(ts|js|mjs|json|toml|html|css|md|sh|yml|yaml)$/.test(name) && !/\.test\.ts$/.test(name)) {
      yield p;
    }
  }
}

const linesOf = (f) => readFileSync(f, 'utf8').split('\n');
const isWorkerSrc = (f) => /(^|\/)src\/.+\.ts$/.test(f) || f.endsWith('worker/entry.js');

for (const f of walk(ROOT)) {
  const lines = linesOf(f);
  lines.forEach((line, i) => {
    const n = i + 1;
    const rel = f;
    if (f.endsWith(SELF)) return;
    if (/__SEC_ACCEPT__/.test(line)) return; /* الگوی پذیرفته‌شدهٔ طراحی با مستندسازی در محل */

    /* S1 — راز جایگزین ثابت و راز هاردکد واقعی‌نما (اسناد مارک‌داون: ذکر تاریخچه‌ای، نه کد اجرایی) */
    if (/insecure-dev-secret|change-me|CHANGEME|fixme-secret|default-secret|my-secret|secret123/.test(line) && !/^\s*(\/\/|\*|#)/.test(line) && !f.endsWith('.md')) {
      add('HIGH', 'S1', rel, n, 'راز جایگزین ثابت در کد اجرایی');
    }
    if (/(api[_-]?key|token|secret|password|passwd|bearer)\s*[:=]\s*['"][A-Za-z0-9+/_-]{24,}['"]/.test(line) && !/process\.env|env\.|EXAMPLE|example|placeholder|dummy|sample/i.test(line)) {
      add('MED', 'S1', rel, n, 'رشتهٔ رازمانند هاردکد');
    }

    /* S2 — مقایسهٔ راز با === یا !== */
    if (/\b(secret|webhookSecret|apiToken|apiKey|password)\w*\s*={2,3}\s*/.test(line) && /===|!==/.test(line) && !/length/.test(line) && isWorkerSrc(f) && !/test|__tests__/.test(f)) {
      add('MED', 'S2', rel, n, 'مقایسهٔ راز با === — باید هم‌زمان‌ایمن باشد');
    }

    /* S3 — err.message در پاسخ HTTP (json({... error ...})) */
    if (/error:\s*(err|e|error)\s*instanceof\s*Error\s*\?\s*(err|e|error)\.message/.test(line) && /\/(routes|index|api-routing)\//.test(f)) {
      add('MED', 'S3', rel, n, 'پیام خطای داخلی در ساختار پاسخ — بررسی این که به کلاینت بی‌احراز می‌رسد یا نه');
    }

    /* S4 — توکن در URL (اسناد و باندل‌های مینیفای‌شدهٔ تولیدی در این خانواده بی‌معناست) */
    if (/[?&](token|access_token|secret|sig)=/.test(line) && !/noindex|gate|test/.test(line) && !/\.md$/.test(f) && !/worker\/bundle\.js$|resources\/engine\/bundles\//.test(f)) {
      add('MED', 'S4', rel, n, 'توکن در کوئری‌استرینگ — نشتی رفرر/لاگ');
    }

    /* S5 — عبارت درج‌شده در HTML که تابع امن نمی‌خواند (esc/esc2/fa/stepNo/…) */
    if (isWorkerSrc(f) && /\.innerHTML\s*[+]?=|insertAdjacentHTML/.test(line) && !/esc\(|escapeHtml|esc2\(/.test(line)) {
      const exprs = line.match(/\$\{([^}]*)\}|'\s*\+\s*([A-Za-z_][\w.]*)\s*\+|\+\s*([A-Za-z_][\w.]*)\s*\+\s*'/g) ?? [];
      const unsafe = exprs.filter((e) => !/esc\w*\(|fa\w*\(|stepNo|String\(|Number\(|encodeURIComponent|JSON\.stringify|Math\.|===|\?\?|'\+'|\+\s*'|'\s*\+/.test(e));
      if (unsafe.length > 0) {
        add('LOW', 'S5', rel, n, `عبارت درج‌شده در HTML برای بازبینی دستی: ${unsafe.slice(0, 2).join(' | ').slice(0, 90)}`);
      }
    }

    /* S6 — JSON.parse بیرون try (فقط در مسیر worker — خطا خام) */
    if (isWorkerSrc(f) && /JSON\.parse\(/.test(line) && !/__tests__|schema|migration|package\.json|tsconfig/.test(f) && !/__SEC_ACCEPT__/.test(line)) {
      const ctx = lines.slice(Math.max(0, i - 6), i + 6).join('\n');
      if (!/try|catch|safeJson|parseJson|__SAFE__/.test(ctx)) {
        add('LOW', 'S6', rel, n, 'JSON.parse بدون try در پنجرهٔ ±۶ خط — بررسی ورودی نامعتبر');
      }
    }

    /* S7 — console در ورکر (باید فقط logger باشد) */
    if (isWorkerSrc(f) && /console\.(log|error|warn|debug|info)/.test(line) && !/logger\.ts|test\/harness\.ts/.test(f)) {
      add('LOW', 'S7', rel, n, 'console.* در سورس ورکر — به logger مسیر داده شود');
    }

    /* S8 — متادیتای لاگ با دادهٔ حساس */
    if (isWorkerSrc(f) && /(logger|audit|pushHumanEvent|writeAuditRow)\w*\.\w*\(\s*['"][^'"]+['"]\s*,\s*\{/.test(line)) {
      const ctx = lines.slice(i, Math.min(lines.length, i + 4)).join('\n');
      if (/(national_id|nationalId|guardian_phone|password|secret|access_token|\btoken\s*:|file_id\s*:)/.test(ctx)) {
        add('MED', 'S8', rel, n, 'متادیتای لاگ/audit شامل شناسهٔ حساس (PII/راز)');
      }
    }

    /* S9 — localStorage حساس در SPA */
    if (/public\/assets\/js\//.test(f) && /localStorage\.setItem\(['"][^'"]*(token|secret|pass|national|phone)/i.test(line)) {
      add('MED', 'S9', rel, n, 'ذخیرهٔ دادهٔ حساس در localStorage');
    }

    /* S12 — بدنهٔ POST عمومی بدون سقف حجم */
    if (isWorkerSrc(f) && /await\s+(req|request)\.json\(\)/.test(line) && /public|referral|preview|webhook|bug-report/.test(f)) {
      const ctx = lines.slice(Math.max(0, i - 8), i + 2).join('\n');
      if (!/(CONTENT_LENGTH|content-length|MAX_.*BYTES|MAX_.*SIZE|contentLength|byteLimit|sizeLimit|LIMIT)/.test(ctx)) {
        add('MED', 'S12', rel, n, 'خواندن JSON عمومی بدون سقف حجم در ±۸ خط');
      }
    }
  });
}

/* S10 — فایل‌های ردیابی‌شدهٔ رازدار */
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const t of tracked) {
    /* ۱.۲۷.۷۷ — فایل‌های .example به‌صورت قراردادی بی‌رازند (نمونهٔ فلگ‌ها؛ خود قانون .env پایین همین استثنا را دارد) */
    if (/\.(sqlite|db|pem|key|p12|pfx|kdbx)$/.test(t) || /(^|\/)(\.dev\.vars|auth-secret|secrets?\.|credentials)(?!\.example)/.test(t)) {
      add('HIGH', 'S10', path.join(ROOT, t), 0, 'فایل رازدار/دیتابیسی ردیابی‌شده در گیت');
    }
    if (/\.env/.test(t) && !/\.example/.test(t)) {
      add('HIGH', 'S10', path.join(ROOT, t), 0, 'فایل .env ردیابی‌شده');
    }
  }
} catch (e) {
  add('LOW', 'S10', 'git', 0, `git ls-files ناموفق: ${e.message}`);
}

/* S11 — تنظیمات ناامن Tauri */
const tauriConf = path.join(ROOT, 'desktop/src-tauri/tauri.conf.json');
if (existsSync(tauriConf)) {
  const s = readFileSync(tauriConf, 'utf8');
  if (/nodeIntegration['"]?\s*:\s*true/.test(s)) add('HIGH', 'S11', tauriConf, 0, 'nodeIntegration فعال');
  if (/contextIsolation['"]?\s*:\s*false/.test(s)) add('HIGH', 'S11', tauriConf, 0, 'contextIsolation خاموش');
}

/* S12b — سقف‌های صریح موجود (برای گزارش سبز) */
const caps = [];
for (const f of walk(ROOT)) {
  if (!isWorkerSrc(f)) continue;
  const s = readFileSync(f, 'utf8');
  if (/(MAX_.*(BYTES|SIZE|LENGTH)|contentLength\s*[<>]|byteLimit)/.test(s)) caps.push(path.relative(ROOT, f));
}

const sevRank = { HIGH: 0, MED: 1, LOW: 2 };
findings.sort((a, b) => sevRank[a.sev] - sevRank[b.sev] || a.fam.localeCompare(b.fam) || a.file.localeCompare(b.file));

console.log('─── گزارش ممیزی نشتی (۱.۲۷.۴۳) ───');
console.log(`فایل‌های اسکن‌شده: ${[...new Set(findings.map((x) => x.file))].length + caps.length}+ · یافته‌ها: ${findings.length}`);
for (const f of findings) console.log(`[${f.sev}] ${f.fam} ${f.file}:${f.line} — ${f.note}`);
console.log(`سقف حجم صریح در: ${caps.length} فایل → ${caps.slice(0, 6).join(', ')}${caps.length > 6 ? ' …' : ''}`);

const high = findings.filter((f) => f.sev === 'HIGH').length;
console.log(`جمع: HIGH=${high} MED=${findings.filter((f) => f.sev === 'MED').length} LOW=${findings.filter((f) => f.sev === 'LOW').length}`);
process.exit(high > 0 ? 1 : 0);
