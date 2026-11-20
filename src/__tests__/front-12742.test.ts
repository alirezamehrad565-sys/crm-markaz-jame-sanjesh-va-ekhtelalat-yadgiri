/**
 * گیت فرانت ۱.۲۷.۴۲ — خواست‌های کارفرمای این نوبت:
 * ① فرم‌های عمومی دقیقاً وسط صفحه (عمودی‌چین با safe center — پدینگ متقارن)
 * ② فونت وزیر متن فقط خودی و واقعاً لودشونده در همهٔ صفحات عمومی (حذف CDN jsdelivr + CSP سخت‌گیرانه)
 * ③ حذف «فرم تکمیلی خانواده (وضعیت خانواده)» از مسیر ولی + دستهٔ تازهٔ «مشکلات رفتاری هیجانی»
 * ④ پرسشنامه‌های سیستمی: دکمهٔ پیش‌نمایش روی کارت + فوتر هم‌تراز + سقف چیپ‌ها
 * ⑤ فرم‌ساز: ردیف «بلوک تازه» + پیش‌نمایش زندهٔ واقعاً هم‌گام + شمارندهٔ زندهٔ بلوک‌ها
 * ⑥ متن‌های بازنویسی‌شدهٔ بات (محاوره‌ای) در templates/bot-commands
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت فرانت ۱.۲۷.۴۲ — فرم‌ها دقیقاً وسط صفحه', () => {
  const pages: Array<[string, string, string]> = [
    ['فرم معرفی', 'src/domain/waitlist/referral-page.ts', '.app{max-width:560px'],
    ['فرم عمومی فرم‌ساز', 'src/domain/form-builder/form-page.ts', '.app{max-width:560px'],
    ['فرم خانواده (سیستمی)', 'src/domain/case-events/public-form.ts', '.wrap { max-width: 640px'],
    ['پیش‌نمایش فرم‌ساز', 'src/domain/case-events/preview-form.ts', '.wrap { max-width: 640px']
  ];

  it('هر چهار صفحهٔ عمومی: flex + safe center + پدینگ متقارن', () => {
    for (const [name, path, head] of pages) {
      const src = read(path);
      expect(src, name).toMatch(/flex-direction:\s*column/);
      expect(src, name).toMatch(/justify-content:\s*safe center/);
      expect(src, name).toMatch(/min-height:\s*100dvh/);
      expect(src, name).not.toMatch(/padding:\s*32px 16px 64px/); // پدینگ نامتقارن قدیمی حذف شد
      void head;
    }
  });
});

describe('گیت فرانت ۱.۲۷.۴۲ — فونت وزیر متن فقط خودی', () => {
  it('@font-face خودی در همهٔ صفحات عمومی — بدون هیچ URL بیرونی', () => {
    const files = [
      'src/domain/waitlist/referral-page.ts',
      'src/domain/waitlist/guide-page.ts',
      'src/domain/form-builder/form-page.ts',
      'src/domain/case-events/public-form.ts',
      'src/domain/case-events/preview-form.ts',
      'src/domain/exercise-bank/activities-page.ts'
    ];
    for (const f of files) {
      expect(read(f), f).toContain("/assets/fonts/Vazirmatn-Variable.woff2");
      expect(read(f), f).not.toContain('jsdelivr');
    }
  });

  it('CSP صفحات عمومی دیگر مبدا بیرونی برای فونت ندارد', () => {
    for (const f of ['src/domain/form-builder/routes.ts', 'src/domain/waitlist/routes.ts', 'src/domain/exercise-bank/routes.ts']) {
      const src = read(f);
      expect(src, f).toContain("font-src 'self'");
      expect(src, f).not.toContain('cdn.jsdelivr.net');
    }
  });
});

describe('گیت فرانت ۱.۲۷.۴۲ — حذف «وضعیت خانواده» + دستهٔ رفتاری هیجانی', () => {
  const referral = read('src/domain/waitlist/referral-page.ts');

  it('فرم تکمیلی خانواده از مسیر ولی حذف شد — جریان خانواده ۱۱ گام', () => {
    expect(referral).toContain('function familyTotal(){return 11;}');
    expect(referral).not.toContain('FAM_QUESTIONS');
    expect(referral).not.toContain('renderFamily');
    expect(referral).not.toContain('وضع فرهنگی خانواده');
    expect(referral).toContain('قبلاً جایی ارزیابی یا تشخیص داشته؟');
  });

  it('دستهٔ «مشکلات رفتاری هیجانی» در فرم و بک‌اند ثبت است', () => {
    expect(referral).toContain("v:'behavioral'");
    expect(referral).toContain('مشکلات رفتاری هیجانی');
    expect(read('src/core/shared/constants.ts')).toContain("'behavioral'");
    expect(read('src/domain/waitlist/types.ts')).toContain("behavioral: 'رفتاری هیجانی'");
  });

  it('متن‌های بازبینی‌شدهٔ صفحات آگاهی نشسته‌اند', () => {
    expect(referral).toContain('حیطه‌ها با همسالان خودش تفاوت مشهود داره');
    expect(referral).toContain('اقدامات مؤثرتری می‌شه براشون انجام داد');
    expect(referral).toContain('شاید نیازه که مجدد ارزیابی و جای‌دهی بشه');
  });
});

describe('گیت فرانت ۱.۲۷.۴۲ — پرسشنامه‌های سیستمی و فرم‌ساز', () => {
  const view = read('public/assets/js/views/case-event-types.js');
  const fb = read('public/assets/js/views/form-builder.js');

  it('دکمهٔ پیش‌نمایش روی کارت قالب‌ها + فوتر هم‌تراز کارت‌ها', () => {
    expect(view).toContain('openSavedPreview');
    expect(view).toContain("icon('eye', 14), 'پیش‌نمایش'");
    expect(view).toContain("flexDirection: 'column', height: '100%'");
    expect(view).toContain('+${fa(subscales.length - 4)} بیشتر');
  });

  it('فرم‌ساز: ردیف «بلوک تازه» + پیش‌نمایش زندهٔ هم‌گام (paintPreview) + شمارندهٔ زنده', () => {
    expect(fb).toContain('fb-addrow');
    expect(fb).toContain('openPaletteModal');
    expect(fb).toContain('function paintPreview()');
    expect(fb).toContain('blocksBadge.textContent');
    expect(fb).toContain('prevBody.replaceChildren(renderPreviewBody(');
  });
});

describe('گیت فرانت ۱.۲۷.۴۲ — متن‌های بازنویسی‌شدهٔ بات', () => {
  const tpl = read('src/core/notify/templates.ts');
  const cmd = read('src/application/notify/bot-commands.ts');

  it('محاوره‌سازی‌های سند بازبینی نشسته‌اند', () => {
    expect(tpl).toContain('خوش اومدید');
    expect(tpl).toContain('اگر همکارِ معلم ما در مدارس هستید لطفاً لینک ورود رو از مرکز بگیرید');
    expect(tpl).toContain('🔒 این پرونده از قبل به یک گفتگوی دیگر وصله.');
    expect(tpl).toContain('به دستمون رسید');
    expect(tpl).toContain('بعد از اتصال، منوی مخصوص نقش شما نصب می‌شه');
    expect(tpl).toContain('آدرس: سروستان، خیابان جمهوری، کوچه ۳.');
    expect(tpl).not.toContain('همکاری مدرسه + خانواده + مرکز');
    expect(cmd).toContain('زیر نظر اداره آموزش و پرورش استثنایی');
  });
});
