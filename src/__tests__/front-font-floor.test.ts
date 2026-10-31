/**
 * گیت کف ۱۲px متن فارسی (فاز ۳ ممیزی کیفیت UI — S1-04/S2-14/S2-20/S3-04/S3-12/S4-14/S4-15/
 * S8-01/S8-09/S8-10/S8-20/S10-10/S11-12/S11-13/S11-18 و هم‌خانواده‌ها)
 * قرارداد -F2: متن فارسی زیر ۱۲px ممنوع؛ استثنا فقط ارقام خالص، نمادها و برچسب لاتین.
 * اسکن استاتیکی روی CSS و JS فرانت؛ هر موضع زیر کف باید در ALLOW با دلیل ثبت شده باشد.
 * الگو: front-view-identifiers.test.ts () و front-contrast.test.ts ().
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ASSETS = join(__dirname, '../../public/assets');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      /* dist باندلِ تولیدشده است؛ منبعش همین‌جا گیت می‌شود (و minify کلیدهای ALLOW را نمی‌سازد) */
      if (name === 'dist') continue;
      out.push(...walk(p));
    } else if (name.endsWith('.css') || name.endsWith('.js')) out.push(p);
  }
  return out;
}

type Hit = { file: string; line: number; decl: string; size: number };

function scanFile(path: string): Hit[] {
  const rel = relative(ASSETS, path);
  const hits: Hit[] = [];
  readFileSync(path, 'utf8').split('\n').forEach((text, i) => {
    const line = text.replace(/\s+$/, '');
    for (const m of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      hits.push({ file: rel, line: i + 1, decl: line.trim(), size: Number(m[1]) });
    }
    for (const m of line.matchAll(/fontSize:\s*['"](\d+(?:\.\d+)?)px['"]/g)) {
      hits.push({ file: rel, line: i + 1, decl: line.trim(), size: Number(m[1]) });
    }
  });
  return hits;
}

const FILES = walk(ASSETS).sort();
const HITS = FILES.flatMap(scanFile);

/** استثناهای ثبت‌شده — کلید: «فایل :: اعلان» — هر ورودی باید واقعاً در کد باشد وگرنه تست قرمز می‌شود */
const ALLOW: Record<string, Record<string, string>> = {
  'css/base.css': {
    'font-size: 10px;': '.side-search kbd — کلید میان‌بر لاتین (Ctrl و…)',
  },
  'css/views.css': {
    '.tl-strip__label { font-size: 10px; color: var(--text-3); }': 'رقم فارسی ساعت نوار زمان داشبورد — استثنای رقم ',
    'display: grid; place-items: center; font-size: 11px; font-weight: 700;': 'help-toc__n — رقم شمارهٔ فهرست در دایرهٔ ۲۰px',
    'display: grid; place-items: center; font-size: 11.5px; font-weight: 700;': 'help-points__n — رقم شماره در دایرهٔ ۲۲px',
    'font-size: 10px; font-weight: 700;': 'wd-appt__savatar — حرف اول نام، aria-hidden تزئینی در دایرهٔ ۲۰px',
    '.wd-cal__more { font-size: 10px; color: var(--text-3); line-height: 1; font-weight: 700; } /* F2: ۸٫۵ → کف رقم ۱۰ */': 'رقم شمارندهٔ «+N» تقویم روز کاری — کف رقم ',
    '.ot-domain-chip__pend { top: 4px; inset-inline-end: 6px; font-size: 10px; background: var(--primary); color: var(--on-primary, #fff); border-radius: 999px; padding: 0 5px; line-height: 16px; }': 'رقم شمارندهٔ در انتظار چیپ دامنهٔ OT',
    'position: absolute; top: 3px; inset-inline-start: 6px; font-size: 10px; line-height: 14px; /* F2: ۹ → کف نماد ۱۰ */': 'نماد «●» نشان درخت کارت — کف نماد ',
    ".rehab-fx-guide > summary::after, .science-guide > summary::after { content: '▾'; font-size: 10px; color: var(--text-3, var(--text-2)); }": 'نماد فلش ▾ جمع‌شونده — استثنای نماد ',
    /* سه ورودی chart__tick/chart__axis/chart__threshold-label حذف شد: فونت‌ها به var(--fs-2xs) رسیدند (C2/C16) */
  },
  'js/views/progress-report.js': {
    'w.document.write(`<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(v.headline)}</title><style>@page{size:A4;margin:18mm}body{font-family:Vazirmatn,Tahoma,sans-serif;line-height:1.9;color:#1c1c1c;max-width:174mm;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:15px;margin-top:22px}p{margin:8px 0;text-align:justify}ul{padding-inline-start:22px}li{margin:6px 0;text-align:justify}.meta{color:#555;font-size:12px;border-bottom:1px solid #ddd;padding-bottom:10px}.brand{font-size:11px;color:#777;margin-top:26px;border-top:1px solid #ddd;padding-top:8px}</style></head><body>${body}<div class="brand">سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام — ${esc(formatJalaliNumeric(today))}</div></body></html>`);': 'برند پاورقیِ خروجی چاپ A4 — بلاک چاپ (استثنای شناختهٔ )؛ ۱۱px روی کاغذ معادل ~۸٫۳pt ریز است اما متن اصلی چاپ ۱۲px+ دارد',
  },
};

const allowKey = (h: Hit) => `${h.file} :: ${h.decl}`;

function allowReasons(h: Hit): string | null {
  const table = ALLOW[h.file];
  if (!table) return null;
  return table[h.decl] ?? null;
}

describe('گیت کف ۱۲px متن فارسی (فاز ۳ ممیزی کیفیت UI)', () => {
  it('هیچ font-size زیر ۱۲px خارج از فهرست استثنا وجود ندارد', () => {
    const violations = HITS.filter((h) => h.size < 12 && !allowReasons(h));
    expect(
      violations.map((h) => `${h.file}:${h.line} (${h.size}px) → ${h.decl.slice(0, 90)}`)
    ).toEqual([]);
  });

  it('همهٔ اندازه‌های استثنا بین ۱۰ و ۱۲px هستند (نه موضعِ تازه‌ساختهٔ زیر ۱۰)', () => {
    const offenders = HITS.filter((h) => h.size < 12).filter((h) => h.size < 10 || h.size >= 12);
    expect(offenders.map((h) => `${h.file}:${h.line} (${h.size}px)`)).toEqual([]);
  });

  it('هر استثنای ثبت‌شده هنوز در کد هست (فهرست کهنه نشود)', () => {
    const live = new Set(HITS.filter((h) => h.size < 12).map(allowKey));
    const stale: string[] = [];
    for (const [file, table] of Object.entries(ALLOW)) {
      for (const [decl] of Object.entries(table)) {
        if (!live.has(`${file} :: ${decl}`)) stale.push(`${file} :: ${decl.slice(0, 60)}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('توکن کف --fs-2xs همان 0.75rem (۱۲px) مانده است', () => {
    const tokens = readFileSync(join(ASSETS, 'css/base.css'), 'utf8') /* فاز D: ادغام tokens در base */;
    expect(tokens).toMatch(/--fs-2xs:\s*0\.75rem/);
  });

  it('S1-10 — کلاس مردهٔ hero-score__value حذف و --fs-display به هیروی واقعی وصل شده', () => {
    const views = readFileSync(join(ASSETS, 'css/views.css'), 'utf8');
    expect(views).not.toMatch(/\.hero-score__value\s*[,{]/);
    expect(views).toMatch(/\.ring-center b\s*\{[^}]*var\(--fs-display\)/);
    const tokens = readFileSync(join(ASSETS, 'css/base.css'), 'utf8') /* فاز D: ادغام tokens در base */;
    expect(tokens).toMatch(/--fs-display:\s*1\.625rem/);
  });
});
