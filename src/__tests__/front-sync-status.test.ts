/**
 * آزمون کارت «وضعیت هم‌گامی» پنل سلامت (ف۶):
 * نگاشت حالت موتور هم‌گامی → برچسب فارسی/کلاس رنگ باید پایدار بماند —
 * قرارداد GET /api/node-sync/status: synced/catching_up/offline/error/idle.
 * نگاشت‌ها تابع خالص‌اند (بدون DOM) — الگو: front-view-identifiers.test.ts و format-front.test.ts.
 */
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است
import { syncErrorKindView, syncStateView } from '../../public/assets/js/views/health-panel.js';

describe('کارت وضعیت هم‌گامی پنل سلامت — نگاشت حالت به برچسب/رنگ', () => {
  it('پنج حالت شناخته‌شدهٔ قرارداد → برچسب فارسی و کلاس رنگ درست', () => {
    expect(syncStateView('synced')).toMatchObject({ badge: 'badge--success', dot: 'dot--success', label: 'هم‌گام شد' });
    expect(syncStateView('catching_up')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'هم‌گام‌سازی جبرانی در جریان است…' });
    expect(syncStateView('offline')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'خارج از خط — ثبت‌ها محفوظ است' });
    expect(syncStateView('error')).toMatchObject({ badge: 'badge--error', dot: 'dot--error', label: 'خطای هم‌گامی — تلاش دوباره خودکار می‌شود' });
    expect(syncStateView('idle')).toMatchObject({ badge: 'badge--neutral', dot: 'dot--neutral', label: 'در انتظار اولین هم‌گامی' });
  });

  it('حالت/گونهٔ ناشناخته یا حذف‌شده → «نامشخص» بی‌کرش (درگاه شاید هنوز مستقر نباشد)', () => {
    expect(syncStateView('nonsense')).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت هم‌گامی نامشخص' });
    expect(syncStateView(undefined)).toMatchObject({ dot: 'dot--neutral', label: 'وضعیت هم‌گامی نامشخص' });
    expect(syncErrorKindView('network')).toBe('مشکل شبکه');
    expect(syncErrorKindView('quota')).toBe('سقف مصرف');
    expect(syncErrorKindView('version')).toBe('ناسازگاری نسخه');
    expect(syncErrorKindView('other_kind')).toBe('خطای نامشخص');
    expect(syncErrorKindView(undefined)).toBe('خطای نامشخص');
  });
});
