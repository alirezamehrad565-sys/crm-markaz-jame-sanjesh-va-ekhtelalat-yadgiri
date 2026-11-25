/**
 * گیت ui-005 (۱.۲۷.۸۳، sdt160) — بج وضعیت سرور و مناطق وضعیت نماها به فناوری‌های یاری‌رسان
 * اعلام می‌شوند: pill سربرگ و کارت «سرور محلی» role=status + aria-live=polite دارند و
 * بارگذاری سه نما (خطاهای مرورگر، صندوق خروجی، ویزارد ابری) با aria-busy اعلام می‌شود
 * (الگوی زندهٔ reports.js: aria-busy سه‌گانه).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت ui-005 — اعلام وضعیت به فناوری یاری‌رسان (۱.۲۷.۸۳)', () => {
  const app = read('public/assets/js/app.js');
  const panel = read('public/assets/js/views/health-panel.js');
  const clientErrors = read('public/assets/js/views/client-errors.js');
  const outbox = read('public/assets/js/views/outbox.js');
  const cloud = read('public/assets/js/views/cloud-setup.js');

  it('pill سربرگ: role=status + aria-live=polite — تغییر وضعیت اعلام می‌شود', () => {
    expect(app).toContain("pill.setAttribute('role', 'status')");
    expect(app).toContain("pill.setAttribute('aria-live', 'polite')");
  });

  it('کارت «سرور محلی» پنل سلامت: منطقهٔ زندهٔ اعلام وضعیت', () => {
    expect(panel).toContain("body.setAttribute('role', 'status')");
    expect(panel).toContain("body.setAttribute('aria-live', 'polite')");
  });

  it('خطاهای مرورگر و صندوق خروجی: aria-busy در بارگذاری', () => {
    expect(clientErrors).toContain("outlet.setAttribute('aria-busy', 'true')");
    expect(clientErrors).toContain("outlet.setAttribute('aria-busy', 'false')");
    expect(outbox).toContain("outlet.setAttribute('aria-busy', 'true')");
  });

  it('ویزارد ابری: خط نتیجهٔ عملیات role=status دارد', () => {
    expect(cloud).toContain("role: 'status'");
    expect(cloud).toContain("'aria-live': 'polite'");
  });

  it('الگوی مرجع reports.js دست‌نخورده مانده است', () => {
    const reports = read('public/assets/js/views/reports.js');
    expect(reports).toContain("content.setAttribute('aria-busy', 'true')");
  });
});
