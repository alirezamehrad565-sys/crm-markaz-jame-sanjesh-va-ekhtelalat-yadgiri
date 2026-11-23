/**
 * گیت موج ۲ (۱.۲۷.۶۳) — فرود پوستهٔ «کارگاه درمان»: نگاشت دیپ‌لینک‌ها با تابع خالص.
 * قرارداد برنامهٔ بازطراحی (docs/PROFILE-REDESIGN-PROGRAM.md §۵):
 *  ① فرود بی‌پارامتر = هاب درمان (تفسیر بالینی) برای نقش بالینی، هاب امروز برای بقیه.
 *  ② ?tab=clinical → هاب؛ ?tab=info/timeline/narrative/exercises/games/comms → کشوی مرجع.
 *  ③ ?tab=sessions → ایستگاه «ثبت گزارش» (رفتار کلاسیک حفظ)؛ ?tab=followups → تاریخچه با فیلتر.
 *  ④ تب بدون صلاحیت به کشو نمی‌رود — به هاب برمی‌گردد (هیچ درِ قفل‌شده‌ای باز نمی‌شود).
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — ماژول خالص پوسته (بدون وابستگی) مستقیم وارد می‌شود
import { resolveWorkshopLanding } from '../../public/assets/js/profile/landing.js';

describe('resolveWorkshopLanding — فرود پوستهٔ کارگاه (موج ۲)', () => {
  const clinical = { canSeeClinical: true, canSeeGames: true };
  const clerk = { canSeeClinical: false, canSeeGames: false };

  it('۱) فرود بی‌پارامتر: نقش بالینی → هاب تفسیر؛ منشی → هاب امروز؛ ایستگاه از وضعیت میز می‌آید', () => {
    expect(resolveWorkshopLanding(clinical)).toEqual({ hub: 'clinical', drawer: null, station: null });
    expect(resolveWorkshopLanding(clerk)).toEqual({ hub: 'today', drawer: null, station: null });
  });

  it('۲) ?tab=clinical → هاب (قهرمان)، حتی با ?section هم‌زمان', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'clinical' } })).toEqual({ hub: 'clinical', drawer: null, station: null });
  });

  it('۳) تب‌های مرجع → کشو؛ بالینی همیشه در هاب می‌ماند', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'info' } })).toMatchObject({ hub: 'clinical', drawer: 'info' });
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'narrative' } })).toMatchObject({ drawer: 'narrative' });
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'timeline' } })).toMatchObject({ drawer: 'timeline' });
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'games' } })).toMatchObject({ drawer: 'games' });
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'comms' } })).toMatchObject({ drawer: 'comms' });
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'exercises' } })).toMatchObject({ drawer: 'exercises' });
  });

  it('۴) ?tab=sessions → ایستگاه «ثبت گزارش» (رفتار کلاسیک) بدون کشو', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'sessions' } })).toEqual({ hub: 'clinical', drawer: null, station: 'log' });
  });

  it('۵) ?tab=followups → تاریخچه با فیلتر پیگیری (نگاشت قدیمی محفوظ)', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'followups' } })).toMatchObject({ drawer: 'timeline' });
  });

  it('۶) تب بدون صلاحیت به هاب برمی‌گردد، نه کشوی قفل', () => {
    expect(resolveWorkshopLanding({ ...clerk, query: { tab: 'narrative' } })).toEqual({ hub: 'today', drawer: null, station: null });
    expect(resolveWorkshopLanding({ ...clerk, query: { tab: 'games' } })).toEqual({ hub: 'today', drawer: null, station: null });
    expect(resolveWorkshopLanding({ ...clerk, query: { tab: 'clinical' } })).toEqual({ hub: 'today', drawer: null, station: null });
  });

  it('۷) ?section= مستقیم؛ بالینی در کارگاه همیشه هاب است', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { section: 'snapshot' } })).toMatchObject({ drawer: 'snapshot' });
    expect(resolveWorkshopLanding({ ...clinical, query: { section: 'clinical' } })).toEqual({ hub: 'clinical', drawer: null, station: null });
  });

  it('۸) ?station= همیشه محترم است و از فرود عبور می‌کند', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { station: 'hold' } })).toMatchObject({ station: 'hold' });
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'sessions', station: 'follow' } })).toMatchObject({ station: 'follow' });
  });

  it('۹) ?station= نامعتبر نادیده گرفته می‌شود', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { station: 'nowhere' } })).toMatchObject({ station: null });
  });
});
