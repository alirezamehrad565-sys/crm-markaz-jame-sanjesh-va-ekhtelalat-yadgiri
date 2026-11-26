/**
 * گیت ۱.۲۷.۷۲ (sdt150) — لنگر مشترک پاپ‌اور منوها (خواست کارفرما: «مودال ارسال با بله درست سر جاش رندر نمیشه»).
 * ریشهٔ سنجش‌شده زنده: در پهنای ≤۶۴۰px پنل fixed بدون top در «جای ایستای» سند پین می‌شد
 * (دکمه y=326، پنل y=2082 — بیرون از دید). قراردادها:
 *  ① ddOpen مشترک در ui.js: لنگر زیر دکمه + فلیپ رو به بالا اگر جا نشد + مهار در دید + پیگیری اسکرول/resize.
 *  ② هر پنج مسیر بازشدن منو (پروفایل «ارسال با بله»، فیلتر درمانگر نوبت‌ها، فیلتر برچسب بایگانی،
 *     دو فیلتر فهرست دانش‌آموزان) از همان مسیر می‌روند — دستی دست‌ساز نمی‌ماند.
 *  ③ CSS موبایل: گارد ارتفاع (100dvh) تا در گوشی افقی هم پنل داخل دید بماند.
 *  ④ مودال‌های overlay (openModal/formModal/confirmModal + چهار دستی) دست‌نخورده — سنجش مرورگری: سالم.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('لنگر مشترک پاپ‌اور — ۱.۲۷.۷۲', () => {
  const ui = read('public/assets/js/ui.js');
  const css = read('public/assets/css/views.css');

  it('① ddOpen: لنگر امپیریک نسبت به ظرف واقعی + فلیپ بالا + مهار در دید + پیگیری اسکرول (خودپاک پس از بستن)', () => {
    expect(ui).toContain('export function ddOpen(btn, panel)');
    expect(ui).toContain("if (getComputedStyle(panel).position !== 'fixed') return; /* دسکتاپ: لنگر مطلق CSS */");
    expect(ui).toContain("const p = panel.getBoundingClientRect(); /* top:0 → بالای ظرفِ واقعی + ارتفاع */");
    expect(ui).toContain('panel.style.top = `${Math.round(vy - p.top)}px`; /* مختصات ظرف = دید − بالای ظرف */');
    expect(ui).toContain('/* جا نشد → فلیپ بالا */ ? b.top - gap - p.height : Math.min(below, Math.max(m, innerHeight - m - p.height));');
    expect(ui).toContain("document.addEventListener('scroll', follow, true);");
    expect(ui).toContain("if (panel.style.display === 'none' || !panel.isConnected)");
  });

  it('② پنج مسیر بازشدن منو از ddOpen می‌روند — هیچ panel.style.display = block دستی نمی‌ماند', () => {
    for (const [f, n] of [['views/student-profile.js', 1], ['views/appointments.js', 1], ['views/archive.js', 1], ['views/students.js', 2]]) {
      const src = read(`public/assets/js/${f}`);
      expect((src.match(/ddOpen\(btn, panel\)/g) ?? []).length).toBe(n);
      expect(src).not.toContain("panel.style.display = 'block'");
      expect(src).toContain('ddOpen } from \'../ui.js\'');
    }
  });

  it('④ ریشه: view-enter فقط در مدت فید می‌ماند — enterFade روتر کلاس را پس از animationend برمی‌دارد', () => {
    const router = read('public/assets/js/router.js');
    expect(router).toContain('function enterFade(host) {');
    expect(router).toMatch(/host\.classList\.add\('view-enter'\);[\s\S]*?animationend[\s\S]*?setTimeout\(done, 340\);/);
    expect(router).toContain('enterFade(host);');
    expect((router.match(/host\.classList\.add\('view-enter'\)/g) ?? []).length).toBe(1); // فقط داخل enterFade
  });

  it('③ CSS موبایل: پنل fixed با مهار افقی + گارد ارتفاع ۱۰۰dvh', () => {
    expect(css).toContain('max-height: min(340px, calc(100dvh - 48px)); /* ۱.۲۷.۷۲ گوشی افقی */');
    expect(css).toMatch(/@media \(max-width: 640px\) \{[\s\S]*?\.dd__panel \{[\s\S]*?position: fixed;\s*inset-inline: 12px;/);
  });
});
