/**
 * گیت رفتاری ۱.۲۵.۰۵ — بهداشت فرانت: تک‌منبعی‌شدن kpi/آستانهٔ ۲۰٪، ریشه‌کنی فال‌بک‌های
 * پالت میراثی، بازگشت استایل docs از تزریق JS به views.css و نگاره‌سازی حالت خالی.
 * الگو: front-print-tokens.test.ts () و front-shared-helpers.test.ts (۱.۲۵.۰۲).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const JS = join(__dirname, '../../public/assets/js');
const CSS = join(__dirname, '../../public/assets/css');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'dist') continue; /* باندلِ مولَّد — منبع گیت می‌شود */
      out.push(...walk(p));
    } else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const jsFiles = walk(JS);
const cssFiles = readdirSync(CSS).filter((f) => f.endsWith('.css')).map((f) => join(CSS, f));
const read = (p: string) => readFileSync(p, 'utf8');

describe('گیت ۱.۲۵.۰۵ — kpi و آستانهٔ هشدار تک‌منبع', () => {
  it('تعریف kpi فقط در ui.js است و نماهای سه‌گانه آن را import می‌کنند', () => {
    const defining = jsFiles.filter((f) => /export function kpi\(/.test(read(f)));
    expect(defining.map(relative.bind(null, JS))).toEqual(['ui.js']);
    for (const view of ['views/reports.js', 'views/dashboard.js', 'views/special-needs.js']) {
      const src = read(join(JS, view));
      expect(src).not.toMatch(/function kpi\(/);
      expect(src).toMatch(/import \{[^}]*\bkpi\b[^}]*\} from '\.\.\/ui\.js'/);
    }
  });

  it('countUp دیگر از charts.js صادر نمی‌شود (به ui.js نقل شد؛ بدون چرخهٔ import)', () => {
    expect(read(join(JS, 'charts.js'))).not.toMatch(/export function countUp/);
    expect(read(join(JS, 'ui.js'))).toMatch(/export function countUp/);
  });

  it('آستانهٔ بالینی ۲۰٪ فقط KPI_ALERT_RATE است — بدون عدد جادویی تکراری', () => {
    expect(read(join(JS, 'ui.js'))).toMatch(/export const KPI_ALERT_RATE = 0\.2/);
    expect(read(join(JS, 'views/reports.js'))).toMatch(/KPI_ALERT_RATE/);
    expect(read(join(JS, 'views/reports.js'))).not.toMatch(/>= 0\.2/);
    expect(read(join(JS, 'views/dashboard.js'))).toMatch(/KPI_ALERT_RATE/);
    expect(read(join(JS, 'views/dashboard.js'))).not.toMatch(/absencePct >= 20/);
  });
});

describe('گیت ۱.۲۵.۰۵ — ریشه‌کنی فال‌بک پالت میراثی', () => {
  it('هیچ var(--token, #hex|rgba()) در JS/CSS فرانت نیست (۱۱۰۸ حذفِ ۴۷ موضع ماندگار شود)', () => {
    const pat = /var\(--[a-z0-9-]+,\s*(#[0-9a-fA-F]{3,8}|rgba?\()/;
    const bad: string[] = [];
    for (const f of [...jsFiles, ...cssFiles]) {
      read(f).split('\n').forEach((line, i) => {
        if (pat.test(line)) bad.push(`${relative(join(__dirname, '../../public'), f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('گیت ۱.۲۵.۰۵ — استایل docs از تزریق JS به views.css', () => {
  it('docs.js هیچ <style> تزریق نمی‌کند و .docs-* در views.css تعریف شده', () => {
    const docs = read(join(JS, 'views/docs.js'));
    expect(docs).not.toMatch(/ensureStyles|createElement\('style'\)|el\('style'/);
    const views = read(join(CSS, 'views.css'));
    for (const cls of ['.docs-root', '.docs-card', '.docs-cat--ekhtelalat', '.docs-detail']) {
      expect(views).toContain(cls);
    }
    /* فال‌بک بنفش Tailwind در بلاک منتقل‌شده هم نباید برگردد */
    expect(views).not.toContain('#9333EA');
  });
});

describe('گیت ۱.۲۵.۰۵ — نگاره‌های حالت خالی به نماهای پربازدید وصل‌اند', () => {
  it('چهار وکتور جدید export شده و چهار نما importشان می‌کنند', () => {
    const illos = read(join(JS, 'illustrations.js'));
    for (const name of ['illoStudents', 'illoExercises', 'illoWaitlist', 'illoScreening']) {
      expect(illos).toMatch(new RegExp(`export const ${name}`));
    }
    expect(read(join(JS, 'views/students.js'))).toMatch(/import \{ illoStudents \}/);
    expect(read(join(JS, 'views/exercises.js'))).toMatch(/import \{ illoExercises \}/);
    expect(read(join(JS, 'waitlist.js'))).toMatch(/import \{ illoWaitlist \}/);
    expect(read(join(JS, 'views/screening.js'))).toMatch(/import \{ illoScreening \}/);
  });

  it('نگاره‌ها فقط با توکن‌ها رنگ می‌گیرند (بدون hex خام)', () => {
    const illos = read(join(JS, 'illustrations.js'));
    expect(illos).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
