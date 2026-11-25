/**
 * گیت CSP صفحات عمومی فرم رویداد — ۱.۲۷.۸۲ (sdt159: بستن security-007 با ADR-004):
 * پرکردن رویداد و پیش‌نمایش‌ها قبلاً بدون CSP بودند و اسکریپت درون‌خطی اجرایی داشتند؛
 * از این پس ثابت مشترک PUBLIC_PAGE_CSP (script-src بدون unsafe-inline) + بوت بیرونی
 * با بلاک دادهٔ JSON. صفحهٔ بازی هم همان ثابت را می‌گیرد (گیت front-play-gates).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderFillFormPage } from '../public-form';
import { renderPreviewPage } from '../preview-form';

const ROOT = join(__dirname, '../../../..');
const routesSrc = readFileSync(join(ROOT, 'src/domain/case-events/routes.ts'), 'utf8');

describe('CSP صفحات عمومی فرم رویداد (security-007 — ۱.۲۷.۸۲)', () => {
  it('پاسخ‌های HTML پرکردن/پیش‌نمایش، CSP یگانهٔ PUBLIC_PAGE_CSP می‌گیرند', () => {
    const hits = [...routesSrc.matchAll(/'Content-Security-Policy': PUBLIC_PAGE_CSP/g)].length;
    expect(hits).toBeGreaterThanOrEqual(2); // پاسخ fill + پاسخ preview
    expect(routesSrc).toContain("from '@core/shared/csp'"); // منبع یگانهٔ سیاست
    expect(routesSrc).toMatch(/c\.html\([\s\S]*PUBLIC_PAGE_CSP/); // صفحهٔ خطای preview هم CSP دارد
  });

  it('صفحهٔ پرکردن: بلاک دادهٔ JSON + اسکریپت بیرونی — بدون اسکریپت درون‌خطی اجرایی', () => {
    const html = renderFillFormPage({
      typeTitle: 'چک‌لیست خانواده',
      studentName: 'علی',
      sections: []
    }, 'tok-123');
    expect(html).toContain('<script type="application/json" id="fill-boot">');
    expect(html).toContain('/assets/public/fill-form.js?v=');
    expect(html).toContain('tok-123'); // توکن در بلاک دادهٔ امن (safeJsonEmbed) نشسته است
    expect(html).not.toMatch(/<script>\s*\(function/);
  });

  it('صفحهٔ پیش‌نمایش: بلاک دادهٔ JSON + اسکریپت بیرونی + بدون onclick درون‌خطی', () => {
    const html = renderPreviewPage({
      title: 'چک‌لیست آزمایشی',
      fields: [],
      subscales: []
    } as never, 'tok-456');
    expect(html).toContain('<script type="application/json" id="preview-boot">');
    expect(html).toContain('/assets/public/preview-form.js?v=');
    expect(html).not.toContain('onclick='); // script-src بدون unsafe-inline اتریبیوت رویداد را می‌بندد
    expect(html).not.toMatch(/<script>\s*\(function/);
  });
});
