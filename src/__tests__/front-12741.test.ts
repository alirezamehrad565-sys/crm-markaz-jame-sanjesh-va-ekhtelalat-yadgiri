/**
 * گیت فرانت ۱.۲۷.۴۱ — دو خواست کارفرما:
 * ① تحویل دسکتاپ = فقط نصاب Setup.exe — پک USB/autorun از CI، بستهٔ npm، اسکریپت سازنده و راهنمای کاربر حذف شد
 * ② بازطراحی UI/UX فرم‌ساز تعاملی (الهام پرس‌لاین/Typeform/Tally): پالت کارتی رنگی، درگ‌ودراپ بلوک‌ها،
 *    سوییچ «الزامی» درجا، پیش‌نمایش زندهٔ واقعی در پنل کناری، نوار ذخیرهٔ شناور، صندوق پاسخ‌ها با فیلتر «فقط جدید»
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت فرانت ۱.۲۷.۴۱ — تحویل دسکتاپ فقط Setup.exe', () => {
  const wf = read('.github/workflows/desktop-build.yml');

  it('آرتیفکت CI دسکتاپ فقط نصاب NSIS است — بدون پک USB', () => {
    expect(wf).toContain('name: setup-run-${{ github.run_number }}');
    expect(wf).toContain('path: desktop/src-tauri/target/release/bundle/nsis/*.exe');
    expect(wf).not.toContain('usb:pack');
    expect(wf).not.toContain('usb-pack');
  });

  it('اسکریپت سازندهٔ پک و autorun.inf از مخزن برداشته شده‌اند', () => {
    expect(read('package.json')).not.toContain('usb:pack');
    expect(existsSync(join(ROOT, 'scripts/build-usb-pack.mjs'))).toBe(false);
    expect(existsSync(join(ROOT, 'desktop/installer/autorun.inf'))).toBe(false);
  });

  it('راهنمای نصب کاربر نهایی فقط Setup.exe است — بدون autorun/USB', () => {
    const guide = read('desktop/installer/README-نصب.txt');
    expect(guide).not.toContain('autorun');
    expect(guide).not.toContain('USB');
    expect(guide).toContain('Setup.exe');
  });

  it('مستندات طراحی/عملیات به سیاست تازه مُهر خورده‌اند (بازنگری ۱.۲۷.۴۱)', () => {
    expect(read('docs/rust/installer.md')).toContain('بازنگری ۱.۲۷.۴۱');
    expect(read('docs/rust/design.md')).toContain('بازنگری ۱.۲۷.۴۱');
  });
});

describe('گیت فرانت ۱.۲۷.۴۱ — بازطراحی فرم‌ساز', () => {
  const fb = read('public/assets/js/views/form-builder.js');

  it('پالت بلوک‌ها کارتی رنگی است (هشت‌گانهٔ hue) — نه دکمهٔ فشرده', () => {
    expect(fb).toContain('fb-kind');
    expect(fb).toContain('fb-kind__ico');
    expect(fb).toMatch(/fb-chip--h/);
    expect(fb).toMatch(/fb-ico--h/);
  });

  it('بلوک‌ها با درگ‌ودراپ + دکمه‌های بالا/پایین جابه‌جا می‌شوند', () => {
    expect(fb).toContain("draggable: 'true'");
    expect(fb).toContain("ondragstart");
    expect(fb).toContain("ondrop");
    expect(fb).toContain("'تکرار بلوک'");
  });

  it('سوییچ «الزامی» درجا روی کارت بلوک + پیش‌نمایش زندهٔ واقعی در پنل کناری', () => {
    expect(fb).toContain('switch__track');
    expect(fb).toContain('fb-prev-row');
    expect(fb).toContain('fb-side');
    expect(fb).toContain('نمای پاسخ‌دهنده');
    // کنترل‌های واقعی پیش‌نمایش — همهٔ نوع‌ها
    expect(fb).toContain("type: 'radio'");
    expect(fb).toContain("type: 'checkbox'");
    expect(fb).toContain("class: 'fb-note'");
  });

  it('نوار ذخیرهٔ شناور + صندوق پاسخ‌ها با فیلتر «فقط جدید»', () => {
    expect(fb).toContain('fb-savebar');
    expect(fb).toContain('فقط جدید');
    expect(fb).toContain('fb-res__ans');
  });

  it('فونت/سایز فقط توکن‌مقیاس — بدون سایز خام زیر کف ۱۲px', () => {
    expect(fb).toMatch(/var\(--fs-2xs\)/);
    for (const m of fb.matchAll(/fontSize:\s*['"](\d+(?:\.\d+)?)px['"]/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    }
  });
});
