/**
 * گیت پویش دائمی سازنده‌های IN-list — بدهی ف۶ ⑧ طرح ارتقا (۱.۲۵.۷۲)
 *
 * کلاس باگ (کشف baseline بار ف۵): سازندهٔ IN با placeholders بی‌کران روی دادهٔ واقعی
 * سقف سخت «۱۰۰ پارامتر بایند D1» را می‌شکند و ۵۰۰ «too many SQL variables» می‌دهد.
 *
 * قرارداد از این پس:
 *   ① هر سازندهٔ IN باید از دروازهٔ @core/db/in-chunks (تکه‌بندی ۹۰تایی + گارد IN خالی) بگذرد —
 *      چنین جاهایی `.map(() => '?')` ندارند (inPlaceholders می‌سازد) و خودبه‌خود از این گیت می‌گذرند.
 *   ② تنها استثناها (همان سطر یا تا دو سطر بعد نشان «IN-bounded:» دارند):
 *        • آرایهٔ محدود به ساخت (ثابت ماژول / ستون‌های pragma / slice صریح / صدا زنندهٔ تکه‌کننده)؛
 *        • ردیف‌های دفتر بدهی پایین — باقی‌ماندهٔ تبدیل، فقط-کاهش‌پذیر و با دلیل ثبت‌شده.
 *   ③ دفتر بدهی فقط می‌تواند کوچک شود؛ افزودن سازندهٔ IN تازهٔ بی‌درگاه این گیت را قرمز می‌کند.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { IN_PARAM_CHUNK, inParamChunks, inPlaceholders } from '../core/db/in-chunks';

const SRC = join(__dirname, '..');

/** ردیف‌های ددهیِ باقی‌مانده (ف۶ دنباله) — هر تبدیل باید از این فهرست حذف و شمارش کم شود. */
const REMAINING_DEBT: Record<string, { count: number; reason: string }> = {
  'domain/exercise-bank/service.ts': {
    count: 15,
    reason: 'عملیات انبوه بانک تمرین‌ها (tag/attach/publish روی شناسه‌های بانک) — تبدیل یکدست در چرخهٔ بعدی ف۶ (۱۹ سایتمانده از پویش ۱.۲۵.۷۲)'
  },
  'domain/student-profile/service.ts': {
    count: 1,
    reason: 'getClassesForStudents — نیازمند حلقهٔ تکه در صدا زننده (ف۶ دنباله)'
  },
  'domain/student-profile/repository.ts': {
    count: 2,
    reason: 'سازنده‌های {sql,params} (tags/assessmentCounts) — تکه‌بندی باید در حلقهٔ صدا زننده باشد، نه در شکل SQL (درس ثبت‌شدهٔ ف۵) — بازآرایی در ف۶ دنباله'
  },
  'core/notify/repository.ts': {
    count: 1,
    reason: 'سازندهٔ {sql,params} ترجیحات اعلان — همان کلاس سازنده‌های student-profile (ف۶ دنباله)'
  }
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === 'board-ui') continue;
      out.push(...walk(p));
    } else if (name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

interface Site { rel: string; line: number }

function scanSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    if (rel === 'core/db/in-chunks.ts') continue; // دروازهٔ خودش
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/\.map\(\(\)\s*=>\s*'\?'\)/.test(line)) sites.push({ rel, line: i + 1 });
    });
  }
  return sites;
}

describe('گیت پویش IN-list — هر سازندهٔ IN یا تکه‌بندی‌شده است یا مستند/بدهیِ ثبت‌شده', () => {
  const sites = scanSites();
  const marked = (s: Site, all: string[]): boolean => {
    /* نشان همان سطر یا تا سه سطر بعد (کامنت باید روی سطر JS باشد، نه داخل template literal) */
    return all.slice(s.line - 1, s.line + 3).some((l) => l.includes('IN-bounded'));
  };

  test('۱ — هر سازندهٔ IN بدون نشان باید دقیقاً یکی از ردیف‌های بدهی ثبت‌شده باشد', () => {
    const byFile: Record<string, number> = {};
    for (const s of sites) if (!marked(s, readFileSync(join(SRC, s.rel), 'utf8').split('\n'))) {
      byFile[s.rel] = (byFile[s.rel] ?? 0) + 1;
    }
    const debtFiles = Object.keys(REMAINING_DEBT);
    expect(Object.keys(byFile).sort()).toEqual(debtFiles.sort());
    for (const [f, spec] of Object.entries(REMAINING_DEBT)) {
      expect(byFile[f] ?? 0, `بدهی ${f} فقط-کاهش‌پذیر است — تبدیل شد؟ ردیف را از دفتر حذف کنید`).toBe(spec.count);
    }
  });

  test('۲ — دروازهٔ تکه‌بندی قرارداد ۹۰تایی را حفظ کند (زیر سقف سخت ۱۰۰ D1)', () => {
    expect(IN_PARAM_CHUNK).toBeLessThan(100);
    expect(inParamChunks([1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(inParamChunks(Array.from({ length: 185 }, (_, i) => i)).map((c) => c.length)).toEqual([90, 90, 5]);
    expect(inParamChunks([])).toEqual([]); // گارد IN خالی
    expect(inPlaceholders(3)).toBe('?, ?, ?');
  });

  test('۳ — نقاط محدودِ مستند نشان «IN-bounded» دارند و شمارشان پایدار است', () => {
    const allLines = new Map<string, string[]>();
    for (const s of sites) allLines.set(s.rel, readFileSync(join(SRC, s.rel), 'utf8').split('\n'));
    const markedSites = sites.filter((s) => marked(s, allLines.get(s.rel)!));
    /* ۱۵ نقطهٔ ثابتِ مستند: statuses بازی‌ها، keys باتری بالینی، کلیدهای نظرسنجی خانواده (center-kpi ×۳ و case-events ×۳)،
       slice صریح case-events، دو pragma بکاپ، statuses دنبال‌وی special-needs، reports تکه‌شدهٔ ف۵،
       repo نوبت‌ها تکه‌شدهٔ ف۵، بستهٔ push با LIMIT ثابت، وضعیت setup نمایشی سه‌شناسه (v1.26.0) */
    expect(markedSites.length).toBe(16);
  });
});
