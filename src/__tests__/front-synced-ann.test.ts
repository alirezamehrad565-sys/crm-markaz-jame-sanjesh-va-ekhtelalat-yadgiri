/**
 * گیت فرانت rust-f15 — نمایش UI اطلاعیه‌های سینک‌شده از synced_announcements (گیت فاز ۶)
 * منبع سومِ بنرها فقط در میز (گیت CENTER_DESKTOP_ENGINE؛ وب ۴۰۴ کم‌دست و نرم رد می‌شود)
 * + نشان «از مرکز — سینک میز» + استایل آن + مسیر سرور پشت requireDesktopEngine.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت فرانت rust-f15 — بنر اطلاعیه‌های سینک‌شده', () => {
  const banners = read('public/assets/js/announcements.js');
  const css = read('public/assets/css/views.css');
  const routes = read('src/internal-sync/routes.ts');
  const service = read('src/internal-sync/service.ts');

  it('منبع سوم در بنرها — فقط میز، نرم در وب، فقط ردیف فعال', () => {
    expect(banners).toContain("/api/internal/sync/announcements");
    expect(banners).toContain('از مرکز — سینک میز');
    expect(banners).toContain('Number(a.active) === 1');
    expect(banners).toContain('const syncedIds = new Set()');
    expect(banners).toContain('تولید وب این منبع ندارد'); // فیل نرم — رفتار وب دست‌نخورده
  });

  it('مسیر سرور پشت گیت میز + سشن کارمند؛ فهرست جدیدترین‌اول با سقف ۵۰', () => {
    expect(routes).toContain("app.get('/api/internal/sync/announcements'");
    expect(routes).toContain('listSyncedAnnouncements');
    expect(service).toContain('export async function listSyncedAnnouncements');
    expect(service).toContain('ORDER BY (published_at IS NULL) ASC, published_at DESC, received_at DESC');
    expect(service).toContain('LIMIT ?');
  });

  it('استایل نشان سینک — هم‌خانوادهٔ accent بنرها', () => {
    expect(css).toContain('.ann-banner__src');
    expect(css).toContain('var(--accent-soft)');
    expect(css).toContain('var(--fs-xs)');
  });
});
