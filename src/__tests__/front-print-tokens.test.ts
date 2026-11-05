/**
 * گیت ۱.۲۵.۰۵ — توکن‌های چاپ (views.css @media print) باید آینهٔ مقدارهای تم روشنِ base.css باشند.
 * زمینه: بلاک چاپ ~۶۰ توکن روشن را برای تحمیل کاغذ سفید روی تم تاریک بازتعریف می‌کند؛ این کپی
 * قبلاً بی‌گیت بود و همان‌طور که پالت‌های مُرده در فال‌بک‌ها fossil می‌ساختند، اینجا هم هر
 * بازکالیبرهٔ برند در base.css می‌توانست از چاپ بگذرد. از این پس: هر واگرایی باید در ALLOW
 * با دلیل ثبت شود (الگو: front-font-floor.test.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = readFileSync(join(__dirname, '../../public/assets/css/base.css'), 'utf8');
const VIEWS = readFileSync(join(__dirname, '../../public/assets/css/views.css'), 'utf8');

/* استخراج scope-آگاه: base.css چند لایهٔ متناوب روشن/تاریک دارد؛ مقدار معتبر «تم روشن»
   هر توکن = آخرین تعریفش داخل قواعد سطح-بالای :rootِ غیرتاریک (نه صرفاً اولین تعریف فایل). */
function topLevelRootTokens(css: string): Map<string, string> {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, ''); /* حذف کامنت‌ها */
  const map = new Map<string, string>();
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) break;
    const selector = src.slice(i, open).trim();
    /* پیدا کردن } متناظر با توازن آکولاد */
    let depth = 1, j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    const isRoot = /(^|,)\s*:root(\s*,|$)/.test(selector) || selector === ':root' || selector.startsWith(':root,') || selector === ":root[data-theme='light']" || selector.startsWith(":root[data-theme='light'],");
    const isDark = selector.includes('dark');
    if ((isRoot && !isDark) || selector.startsWith('@media')) {
      /* داخل قواعد :root روشن توکن‌ها را بگیر؛ @media (مثل prefers-reduced-motion) هم سطح-بالاست اما
         توکن‌های چاپ/حرکت آن را عمداً نادیده می‌گیریم — بلاک چاپِ گیت‌شونده در views.css است */
      if (!selector.startsWith('@media')) {
        for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
          map.set(m[1], m[2].trim());
        }
      }
    }
    i = j;
  }
  return map;
}

const lightTokens = topLevelRootTokens(BASE);

/* بلاک @media print { :root, :root[data-theme='dark'] { ... } } در views.css */
const printBlockMatch = VIEWS.match(/@media print\s*\{\s*:root,\s*:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\*,/);
if (!printBlockMatch) {
  throw new Error('بلاک توکن‌های چاپ در views.css پیدا نشد — گیت نمی‌تواند بنویسد (سرنخ: «@media print» + «:root[data-theme=dark]»)');
}

const printTokens = new Map<string, string>();
for (const m of printBlockMatch[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  printTokens.set(m[1], m[2].trim());
}

/* استثناهای ثبت‌شده: مقدار چاپ عمداً با تم روشن فرق دارد */
const ALLOW = new Map<string, string>([
  ['--shadow-1', 'چاپ سایه ندارد — flattening عمدی است'],
  ['--shadow-2', 'چاپ سایه ندارد — flattening عمدی است'],
  ['--shadow-3', 'چاپ سایه ندارد — flattening عمدی است'],
  ['--shadow-4', 'چاپ سایه ندارد — flattening عمدی است'],
  ['--shadow-sidebar', 'چاپ سایه ندارد — flattening عمدی است'],
  ['--shadow-lg', 'چاپ سایه ندارد — flattening عمدی است'],
  ['--backdrop', 'پس‌زمینهٔ مودال در چاپ بی‌معناست — مقدار کم‌اثر'],
  ['--scrollbar-thumb', 'اسکرول‌بار در چاپ رندر نمی‌شود'],
  ['--scrollbar-thumb-hover', 'اسکرول‌بار در چاپ رندر نمی‌شود']
]);

describe('گیت ۱.۲۵.۰۵ — آینه‌بودن توکن‌های چاپ با تم روشن', () => {
  it('بلاک چاپ هستهٔ پالت را پوشش می‌دهد (حذف ناگهانی را نمی‌گذرد)', () => {
    for (const core of ['--bg', '--surface', '--text', '--primary', '--accent', '--success', '--error', '--warn', '--info', '--brand', '--hue-7-strong']) {
      expect(printTokens.has(core)).toBe(true);
    }
    expect(printTokens.size).toBeGreaterThanOrEqual(50);
  });

  it('هر توکن چاپ با مقدار تم روشنِ base.css برابر است، مگر استثناهای ثبت‌شدهٔ ALLOW', () => {
    const drifted: string[] = [];
    for (const [name, printVal] of printTokens) {
      const lightVal = lightTokens.get(name);
      if (lightVal === undefined) {
        drifted.push(`${name}: توکن در base.css تعریف نشده (چاپ جلوتر از منبع پالت است)`);
        continue;
      }
      if (ALLOW.has(name)) continue;
      const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
      if (norm(printVal) !== norm(lightVal)) {
        drifted.push(`${name}: چاپ=${printVal} × تم روشن=${lightVal}`);
      }
    }
    expect(drifted).toEqual([]);
  });

  it('استثناهای ALLOW هنوز واقعاً در بلاک چاپ تعریف‌اند (ALLOW کهنه نشود)', () => {
    for (const name of ALLOW.keys()) {
      if (name.startsWith('--shadow') || name.startsWith('--scrollbar') || name === '--backdrop') {
        expect(printTokens.has(name)).toBe(true);
      }
    }
  });
});
