/**
 * گیت طلایی ۱.۲۵.۵۱ — سخت‌سازی استروپ بر پایهٔ بازخورد میدانی مدیر مرکز:
 * «استروپ بهترین بازی ماست، اما مراحلش به‌اندازهٔ کافی سخت نیست؛ زمان زیاده است؛
 *  در مراحل ابتدایی به تعداد زیاد رنگِ نوشته همان متنِ نوشته است و حیله‌ای در کار نیست.»
 *
 * قاعدهٔ نگهبان سند نقد (docs/research/cognitive-games-critique.md §۴): اهرم سختی هر بازی
 * باید بتواند کودکِ لبهٔ بالای باند سنی را شکست بدهد. این گیت سه رکن سخت‌سازی بانک
 * authored «حقه‌باز رنگ‌ها» (stroop1 ۱.۱.۰) را قفل می‌کند:
 *   ۱) حیله از مرحلهٔ ۱ — کنگرنت (رنگ نوشته = متن نوشته) در همهٔ گروه‌های تمرین اقلیت است
 *   ۲) پنجرهٔ پاسخ تند — هیچ گروه تمرینی بالای ۳۰۰۰ms نیست و نردبان س ۱→۴ نزولی است
 *   ۳) نردبان گزینه‌ها ۳→۴→۵→۶ — جستجوی دیداری از س ۳ بار می‌گیرد
 * پروب (خط‌کش ثابت سنجش) ترکیب ۳ هم‌خوان از ۸ را نگه می‌دارد — سالم برای interference_ms
 * (هر دو سمت ≥۲ RT معتبر؛ آزمون فرمول در newkinds-evidence.test.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GEN = join(__dirname, '../../scripts/make-stroop-seed-sql.mjs');
const src = readFileSync(GEN, 'utf8');

/** یک خط پیکربندی گروه را به اجزای عددی/متنی می‌شکند */
function bandOf(key: string): { key: string; window: number; opts: string; cong: string; count: number } {
  const m = src.match(new RegExp('\\b' + key + ':\\s*\\{ window: (\\d+), opts: ([^,]+), cong: \'([^\']+)\''));
  if (!m) throw new Error('band ' + key + ' در مولد بانک یافت نشد');
  const c = src.match(new RegExp('\\b' + key + ':\\s*\\{[^}]*count: (\\d+)'));
  return { key, window: Number(m[1]), opts: m[2].trim(), cong: m[3], count: Number(c ? c[1] : 0) };
}

describe('گیت سخت‌سازی استروپ (۱.۲۵.۵۱) — حیله از مرحلهٔ ۱، پنجرهٔ تند، نردبان گزینه‌ها', () => {
  it('هیچ گروه تمرینی «کنگرنت‌محور» نیست — حیله (ناهم‌خوانی جوهر/واژه) در همهٔ گروه‌ها اقلیت‌ساز است', () => {
    for (const k of ['a', 'b', 'c', 'd']) {
      const b = bandOf(k);
      expect(b.cong, 'گروه ' + k + ': کنگرنت همه‌جا/نصفه ممنوع — حیله باید اقلیت یا غایب باشد').not.toMatch(/^(all|half)$/);
      expect(['rare', 'none'], 'گروه ' + k + ': cong باید rare یا none باشد').toContain(b.cong);
    }
    // گروه a — همان گروهی که در s1 (و s2) می‌آید: دقیقاً rare (۱ هم‌خوان از ۸)
    expect(bandOf('a').cong).toBe('rare');
    expect(bandOf('a').count).toBe(8);
  });

  it('روایت کارت مرحله با بانک حیله‌دار هم‌راستاست — «غار آرامِ» بی‌حیله برنمی‌گردد', () => {
    const registry = readFileSync(join(__dirname, '../domain/games/registry.ts'), 'utf8');
    expect(registry).not.toContain('غار آرام'); // روایت ساکن‌دلِ «واژه‌ها هنوز رنگ خودشان را دارند» ممنوع
    expect(registry).toContain('اولین حقه'); // s1 = حیلهٔ واقعی از قدم اول
  });

  it('پنجرهٔ پاسخ تند و نزولی — گرم‌کردنِ کندِ ۴۵۰۰ms برنمی‌گردد', () => {
    const a = bandOf('a'); const b = bandOf('b'); const c = bandOf('c'); const d = bandOf('d'); const p = bandOf('p');
    expect(a.window).toBeLessThanOrEqual(3000); // سقف پنجرهٔ س ۱
    expect(b.window).toBeLessThan(a.window);
    expect(c.window).toBeLessThan(b.window);
    expect(d.window).toBeLessThan(c.window);
    expect(p.window).toBeLessThanOrEqual(3000); // پروب هم تند — ولی ترکیبش ثابت
    expect(src).not.toMatch(/window:\s*4500/); // پنجرهٔ قدیمیِ کند در هیچ گروهی نیست
  });

  it('نردبان گزینه‌ها ۳→۶ — جستجوی دیداری از س ۳ بار می‌گیرد؛ س ۱ دیگر دوگزینه‌ایِ بدیهی نیست', () => {
    expect(bandOf('a').opts).toBe('3');
    expect(bandOf('b').opts).toBe('4');
    expect(bandOf('c').opts).toBe('5');
    expect(bandOf('d').opts).toBe('6');
    expect(bandOf('p').opts).toBe("'mixed46'"); // پروب آمیختهٔ ۴/۶ مثل قبل — تغییرناپذیری خط‌کش
  });

  it('پروب خط‌کش ثابت سنجش می‌ماند — ۳ هم‌خوان از ۸ برای سلامت interference_ms', () => {
    const p = bandOf('p');
    expect(p.cong).toBe('some');
    expect(p.count).toBe(8);
    // ترکیب some = الگوی i===0||i===3||i===5 در مولد — ۳ کنگرنت از ۸
    expect(src).toMatch(/return i === 0 \|\| i === 3 \|\| i === 5;/);
  });

  it('نسخهٔ بسته ۱.۱.۰ — تغییرناپذیری نسخهٔ منتشرشده؛ ۱.۰.۰ برای تجویزهای قدیمی می‌ماند', () => {
    expect(src).toContain("('stroop1', '1.1.0'");
    expect(src).not.toContain("('stroop1', '1.0.0'");
    expect(src).toContain('۱.۲۵.۵۱');
  });
});
