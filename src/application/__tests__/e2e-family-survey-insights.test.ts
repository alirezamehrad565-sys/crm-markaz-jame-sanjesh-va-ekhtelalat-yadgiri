/**
 * e2e ۱.۲۵.۶۱ — تابلوی شاخص‌های «نظرسنجی خانواده‌ها» (بازطراحی مستقل ماژول)
 * خواست کارفرما: «این ماژول باید دوباره بازنگری و باز طراحی بشه به صورت مستقل — تحقیق کن
 * ببین مهم‌ترین گزارش‌هایی که از سامانه یه مدیر می‌تونه بگیره چیه … چه آمارهایی و چه شکل
 * ارائه‌ای برات مهمه … سپس کل ماژول رو باز طراحی کن و اجرا».
 * تابلوی تازه: پنجرهٔ جاری در برابر دورهٔ قبل + شاخص NPS استاندارد (٪مروجان − ٪منتقدان) +
 * روند برشی زمانی + تفکیک دو فرم + کارنامهٔ درمانگران + دسته‌بندی تماتیک متن‌های آزاد +
 * شمار معلق/مهلت‌گذشته — همه فقط-مدیر، فقط-عددی و بدون هیچ توکن لینک (قانون طلایی).
 * الگو: e2e-family-survey-monitor.test.ts — دادهٔ آزمونی محلی، بدون دست‌زدن به تولید.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent } from '../../test/harness';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const DAY = 86_400_000;

describe('تابلوی شاخص‌های نظرسنجی — بازطراحی مستقل ماژول (۱.۲۵.۶۱)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let secretary: Awaited<ReturnType<typeof asRole>>;
  let therapist: Awaited<ReturnType<typeof asRole>>;
  let therapistStaffId = '';
  let s1 = '';
  let s2 = '';
  let s3 = '';
  let s4 = '';
  let dischargeEvent = '';
  let progressEvent = '';
  let expiredEvent = '';
  let openEvent = '';
  let tokenDischarge = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
    s1 = (await createStudent(manager, { first_name: 'آوا', last_name: 'تابلو۱' })).id;
    s2 = (await createStudent(manager, { first_name: 'آرمین', last_name: 'تابلو۲' })).id;
    s3 = (await createStudent(manager, { first_name: 'نوید', last_name: 'تابلو۳' })).id;
    s4 = (await createStudent(manager, { first_name: 'هستی', last_name: 'تابلو۴' })).id;
    const staff = dataOf<{ id: string; role: string }[]>(await manager.get('/api/staff'));
    therapistStaffId = staff.find((x) => x.role === 'therapist')!.id;

    // ① نظرسنجی پایان دورهٔ s1 با درمانگر مشخص — کامل پر می‌شود (نظر آزادِ تم‌دار و منفی)
    const resD = await manager.post('/api/case-events/surveys', {
      student_ids: [s1], therapist_id: therapistStaffId, kind: 'discharge'
    });
    expect(resD.status).toBe(201);
    dischargeEvent = dataOf<{ created: { id: string; link: string | null }[] }>(resD).created[0].id;
    tokenDischarge = dataOf<{ created: { link: string | null }[] }>(resD).created[0].link!.split('token=')[1];
    const fillD = await A.app.request(`/public/case-events/${dischargeEvent}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: tokenDischarge,
        answers: {
          sv_cen1: 4, sv_cen2: 4, sv_cen3: 4,
          sv_thr1: 3, sv_thr2: 3, sv_thr3: 3, sv_thr4: 3,
          sv_prg1: 4, sv_prg2: 4, sv_prg3: 4,
          sv_nps: 9,
          sv_note: 'لطفاً ساعت نوبت‌ها را جمع‌تر کنید — تأخیر زیاد بود'
        }
      })
    });
    expect(fillD.status).toBe(200);

    // ② نظرسنجی حین درمانِ s2 بدون درمانگر — پر می‌شود و بعداً به دورهٔ قبل منتقل می‌شود
    const resP = await manager.post('/api/case-events/surveys', {
      student_ids: [s2], kind: 'progress'
    });
    expect(resP.status).toBe(201);
    progressEvent = dataOf<{ created: { id: string }[] }>(resP).created[0].id;
    const tokenP = dataOf<{ created: { link: string | null }[] }>(resP).created[0].link!.split('token=')[1];
    const fillP = await A.app.request(`/public/case-events/${progressEvent}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: tokenP,
        answers: {
          sv_cen1: 2, sv_cen2: 2,
          sv_thr1: 4, sv_thr2: 4, sv_thr3: 4,
          sv_prg1: 3, sv_prg2: 3,
          sv_nps: 6,
          sv_note: 'همه چیز خوب بود، ممنون از هماهنگی'
        }
      })
    });
    expect(fillP.status).toBe(200);

    // ③ نظرسنجی معلقِ مهلت‌گذشته + ④ نظرسنجی معلقِ زنده
    const res3 = await manager.post('/api/case-events/surveys', { student_ids: [s3], kind: 'progress' });
    expiredEvent = dataOf<{ created: { id: string }[] }>(res3).created[0].id;
    const res4 = await manager.post('/api/case-events/surveys', { student_ids: [s4], kind: 'discharge' });
    openEvent = dataOf<{ created: { id: string }[] }>(res4).created[0].id;

    // جابه‌جایی زمانی: s2 به ۴۰ روز پیش (پنجرهٔ قبلیِ ۳۰روزه) — s3 مهلتش به دیروز
    A.sql.prepare(`UPDATE case_events SET created_at = ?, occurred_at = ?, updated_at = ? WHERE id = ?`)
      .run(new Date(Date.now() - 40 * DAY).toISOString(), new Date(Date.now() - 40 * DAY).toISOString(), new Date(Date.now() - 40 * DAY).toISOString(), progressEvent);
    A.sql.prepare(`UPDATE case_events SET fill_expires_at = ? WHERE id = ?`)
      .run(new Date(Date.now() - 1 * DAY).toISOString(), expiredEvent);
  });

  it('تابلوی تحلیل فقط مدیر است — منشی و درمانگر ۴۰۳ می‌گیرند', async () => {
    expect((await manager.get('/api/case-events/surveys/insights?days=30')).status).toBe(200);
    expect((await secretary.get('/api/case-events/surveys/insights?days=30')).status).toBe(403);
    expect((await therapist.get('/api/case-events/surveys/insights?days=30')).status).toBe(403);
  });

  it('پنجرهٔ جاری در برابر دورهٔ قبل: ارسال/پاسخ/نرخ/میانگین‌ها دقیق است', async () => {
    const ins = dataOf<{
      window: { days: number; from_ymd: string; to_ymd: string };
      current: { sent: number; filled: number; response_rate: number | null; center_avg: number | null; therapist_avg: number | null; progress_avg: number | null; nps_avg: number | null; nps_index: number | null };
      previous: { sent: number; filled: number; response_rate: number | null; center_avg: number | null; nps_avg: number | null; nps_index: number | null };
    }>(await manager.get('/api/case-events/surveys/insights?days=30'));

    expect(ins.window.days).toBe(30);
    // جاری: s1 (پاسخ‌داده) + s3، s4 (معلق) — s2 به دورهٔ قبل منتقل شده
    expect(ins.current.sent).toBe(3);
    expect(ins.current.filled).toBe(1);
    expect(ins.current.response_rate).toBeCloseTo(1 / 3, 3);
    expect(ins.current.center_avg).toBe(100); // ۱۲/۱۲
    expect(ins.current.therapist_avg).toBe(75); // ۱۲/۱۶
    expect(ins.current.progress_avg).toBe(100);
    expect(ins.current.nps_avg).toBe(9);
    // شاخص NPS استاندارد: یک مروجان (۹)، صفر منتقدان → ۱۰۰
    expect(ins.current.nps_index).toBe(100);
    // قبلی: فقط s2 — نرخ ۱۰۰٪، مرکز ۵۰٪، NPS شش = منتقد → ۱۰۰−
    expect(ins.previous.sent).toBe(1);
    expect(ins.previous.filled).toBe(1);
    expect(ins.previous.response_rate).toBe(1);
    expect(ins.previous.center_avg).toBe(50);
    expect(ins.previous.nps_avg).toBe(6);
    expect(ins.previous.nps_index).toBe(-100);
  });

  it('تفکیک دو فرم: پایان دوره و حین درمان هرکدام ارسال/پاسخ/میانگین خودشان را دارند', async () => {
    const ins = dataOf<{ by_kind: Record<'discharge' | 'progress' | 'general', { sent: number; filled: number; response_rate: number | null; center_avg: number | null }> }>(
      await manager.get('/api/case-events/surveys/insights?days=30')
    );
    expect(ins.by_kind.discharge.sent).toBe(2);
    expect(ins.by_kind.discharge.filled).toBe(1);
    expect(ins.by_kind.discharge.center_avg).toBe(100);
    expect(ins.by_kind.progress.sent).toBe(1);
    expect(ins.by_kind.progress.filled).toBe(0);
    expect(ins.by_kind.progress.center_avg).toBeNull();
    expect(ins.by_kind.general.sent).toBe(0);
    expect(ins.by_kind.general.filled).toBe(0);
  });

  it('کارنامهٔ درمانگران: پاسخ‌های هر درمانگر جدا تجمیع می‌شود؛ معلق‌ها پاسخی ندارند', async () => {
    const ins = dataOf<{ therapists: { therapist_id: string | null; sent: number; filled: number; response_rate: number | null; therapist_avg: number | null; nps_avg: number | null; last_filled_at: string | null }[] }>(
      await manager.get('/api/case-events/surveys/insights?days=30')
    );
    expect(ins.therapists.length).toBe(2);
    const tCard = ins.therapists.find((c) => c.therapist_id === therapistStaffId)!;
    expect(tCard.sent).toBe(1);
    expect(tCard.filled).toBe(1);
    expect(tCard.response_rate).toBe(1);
    expect(tCard.therapist_avg).toBe(75);
    expect(tCard.nps_avg).toBe(9);
    expect(tCard.last_filled_at).toBeTruthy();
    const other = ins.therapists.find((c) => c.therapist_id !== therapistStaffId)!;
    expect(other.sent).toBe(2); // s3 و s4 بدون درمانگر انتخابی
    expect(other.filled).toBe(0);
    expect(other.therapist_avg).toBeNull();
  });

  it('دسته‌بندی تماتیک متن‌های آزاد: تم «نوبت‌دهی» با نشانهٔ منفی؛ متن بی‌تمِ مثبت بی‌پرچم', async () => {
    const ins = dataOf<{
      themes: { id: string; label: string; count: number; negative_count: number }[];
      notes: { id: string; note: string; student_name: string | null; themes: string[]; negative: boolean }[];
      notes_negative_count: number;
    }>(await manager.get('/api/case-events/surveys/insights?days=30'));
    expect(ins.themes).toEqual([{ id: 'scheduling', label: 'نوبت‌دهی و زمان', count: 1, negative_count: 1 }]);
    expect(ins.notes).toHaveLength(1); // متن s2 در پنجرهٔ قبلی است
    const n = ins.notes[0];
    expect(n.note).toContain('نوبت');
    expect(n.themes).toEqual(['scheduling']);
    expect(n.negative).toBe(true);
    expect(n.student_name).toContain('تابلو۱');
    expect(ins.notes_negative_count).toBe(1);
  });

  it('معلق‌ها: زنده و مهلت‌گذشته جدا شمرده می‌شوند', async () => {
    const ins = dataOf<{ pending_open: number; pending_expired: number }>(
      await manager.get('/api/case-events/surveys/insights?days=30')
    );
    expect(ins.pending_open).toBe(1);
    expect(ins.pending_expired).toBe(1);
  });

  it('روند برشی: ۳۰ روز → ۶ برش ۵روزه؛ ۷ روز → ۷ برش روزانه؛ برش آخر پاسخ امروز را دارد', async () => {
    const ins30 = dataOf<{ trend: { from_ymd: string; to_ymd: string; sent: number; filled: number; center_avg: number | null }[] }>(
      await manager.get('/api/case-events/surveys/insights?days=30')
    );
    expect(ins30.trend).toHaveLength(6);
    expect(ins30.trend[0].sent).toBe(0); // s2 چهل روز پیش است — بیرون کل پنجره
    expect(ins30.trend[0].center_avg).toBeNull();
    const last = ins30.trend[ins30.trend.length - 1];
    expect(last.filled).toBe(1);
    expect(last.center_avg).toBe(100);
    expect(last.from_ymd).toBeTruthy();

    const ins7 = dataOf<{ current: { sent: number; filled: number }; previous: { sent: number; response_rate: number | null }; trend: unknown[] }>(
      await manager.get('/api/case-events/surveys/insights?days=7')
    );
    expect(ins7.current.sent).toBe(3); // s1 امروز + s3/s4 معلقِ امروز — s2 چهل روز پیش است
    expect(ins7.current.filled).toBe(1);
    expect(ins7.previous.sent).toBe(0);
    expect(ins7.previous.response_rate).toBeNull();
    expect(ins7.trend).toHaveLength(7);
  });

  it('قانون طلایی: هیچ توکن لینک و هیچ شناسهٔ خانواده در خروجی تابلو نیست', async () => {
    const res = await manager.get('/api/case-events/surveys/insights?days=30');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(tokenDischarge); // توکن امن هرگز بیرون نمی‌آید
    expect(text).not.toContain('fill_token');
    expect(text).not.toContain('link');
  });
});
