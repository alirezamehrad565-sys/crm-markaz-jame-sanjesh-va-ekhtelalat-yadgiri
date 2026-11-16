// آزمون‌های بلوک نوبت سنجش (۱.۲۵.۷۶ — خواست کارفرما):
// GET همهٔ احرازشده‌ها · POST/DELETE فقط-مدیر · سد سخت ثبت/جابه‌جایی نوبت در بازهٔ سنجش
// (درمانگر ۴۰۰ پیام فارسی «سنجش») · معافیت مدیر · آزاد شدن بازه پس از حذف
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent, apptBody, ALI_ID } from '../../test/harness';
import { tehranTodayYmd, tehranMinuteWindow, addDaysYmd } from '@core/shared';

let manager: Api;
let therapist: Api;

beforeAll(async () => {
  const A = createTestApp();
  manager = await asRole(A, 'manager');
  therapist = await asRole(A, 'therapist');
});

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function errMessageOf(res: { body: unknown }): string {
  // پاکت خطای سامانه تخت است: { error: CODE, message: 'متن فارسی انسانی' }
  const b = res.body as { message?: string };
  return b?.message ?? '';
}

const D = tehranTodayYmd();

describe('بلوک نوبت سنجش — RBAC و قرارداد', () => {
  it('G1: GET برای همهٔ نقش‌های احرازشده ۲۰۰ است (تقویمِ همه باید سایه را ببیند)', async () => {
    const res = await therapist.get('/api/assessment-blocks');
    expect(res.status).toBe(200);
    expect(dataOf(res)).toEqual([]);
  });

  it('G2: فقط مدیر می‌سازد و حذف می‌کند — درمانگر ۴۰۳', async () => {
    expect((await therapist.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 660 })).status).toBe(403);
    expect((await therapist.delete('/api/assessment-blocks/some-id')).status).toBe(403);
  });

  it('G3: ثبت بازه با قرارداد کامل — ۲۰۱ + شکل داده؛ ورودی بد → ۴۰۰', async () => {
    const res = await manager.post('/api/assessment-blocks', {
      date: D,
      start_minute: 600,
      end_minute: 720,
      therapist_ids: [ALI_ID],
      note: 'وژومتر — ارزیابی پروندهٔ نوآموزان'
    });
    expect(res.status).toBe(201);
    const b = dataOf<{ date: string; startMinute: number; endMinute: number; therapistIds: string[]; note: string | null; version: number }>(res);
    expect(b.date).toBe(D);
    expect(b.startMinute).toBe(600);
    expect(b.endMinute).toBe(720);
    expect(b.therapistIds).toEqual([ALI_ID]);
    expect(b.note).toContain('وژومتر');
    expect(b.version).toBe(1);
    // ورودی ناسازگار — پایان قبل از شروع
    expect((await manager.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 500 })).status).toBe(400);
    // تاریخ بدشکل
    expect((await manager.post('/api/assessment-blocks', { date: '2026/10/12', start_minute: 600, end_minute: 660 })).status).toBe(400);
  });

  it('G4: سد سخت — درمانگر نمی‌تواند درون بازهٔ سنجش نوبت ثبت کند (۴۰۰ پیام فارسی)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await asRole(A, 'therapist');
    const st = await createStudent(m);
    // نوبتِ معرفی توسط مدیر (بیرون بازه) — دانش‌آموز وارد سکوپ درمانگر می‌شود
    const intro = tehranMinuteWindow(D, 840, 900); // ۱۴:۰۰–۱۵:۰۰ تهران
    expect((await m.post('/api/appointments', apptBody(ALI_ID, intro.start, 60, [st.id]))).status).toBe(201);
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720, therapist_ids: [ALI_ID] });
    const win = tehranMinuteWindow(D, 600, 660); // ۱۰:۰۰–۱۱:۰۰ تهران — درون بازهٔ سنجش
    const res = await t.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]));
    expect(res.status).toBe(400);
    expect(errMessageOf(res)).toContain('سنجش');
  });

  it('G5: خارج از بازه ثبت می‌شود — ۲۰۱', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await asRole(A, 'therapist');
    const st = await createStudent(m);
    const intro = tehranMinuteWindow(D, 840, 900); // معرفی دانش‌آموز به سکوپ درمانگر
    expect((await m.post('/api/appointments', apptBody(ALI_ID, intro.start, 60, [st.id]))).status).toBe(201);
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720 });
    const win = tehranMinuteWindow(D, 720, 780); // ۱۲:۰۰–۱۳:۰۰ — بیرون بازه
    expect((await t.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]))).status).toBe(201);
  });

  it('G6: مدیر معاف است — جلسهٔ خودِ سنجش را می‌تواند نوبت‌گذاری کند', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720, therapist_ids: [ALI_ID] });
    const st = await createStudent(m);
    const win = tehranMinuteWindow(D, 630, 690); // کاملاً درون بازه
    expect((await m.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]))).status).toBe(201);
  });

  it('G7: جابه‌جایی نوبتِ موجودِ درمانگر به درون بازه — ۴۰۰', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await asRole(A, 'therapist');
    const st = await createStudent(m);
    const intro = tehranMinuteWindow(D, 840, 900); // معرفی دانش‌آموز به سکوپ درمانگر
    await m.post('/api/appointments', apptBody(ALI_ID, intro.start, 60, [st.id]));
    const outside = tehranMinuteWindow(D, 720, 780);
    const created = dataOf<{ id: string; version: number }>(
      await t.post('/api/appointments', apptBody(ALI_ID, outside.start, 60, [st.id]))
    );
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720 });
    const inside = tehranMinuteWindow(D, 600, 660);
    const res = await t.patch(`/api/appointments/${created.id}/move`, { start_at: inside.start, version: created.version });
    expect(res.status).toBe(400);
    expect(errMessageOf(res)).toContain('سنجش');
  });

  it('G8: پس از حذف مدیر، بازه آزاد می‌شود و ثبت نوبت ۲۰۱ می‌دهد', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await asRole(A, 'therapist');
    const st = await createStudent(m);
    const intro = tehranMinuteWindow(D, 840, 900); // معرفی دانش‌آموز به سکوپ درمانگر
    await m.post('/api/appointments', apptBody(ALI_ID, intro.start, 60, [st.id]));
    const created = dataOf<{ id: string }>(
      await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720 })
    );
    expect((await m.delete(`/api/assessment-blocks/${created.id}`)).status).toBe(204);
    const win = tehranMinuteWindow(D, 600, 660);
    expect((await t.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]))).status).toBe(201);
  });

  it('G9: GET ?from&to فیلتر تاریخ اعمال می‌کند', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 660 });
    await m.post('/api/assessment-blocks', { date: addDaysYmd(D, 3), start_minute: 600, end_minute: 660 });
    const onlyToday = dataOf<{ date: string }[]>(await m.get(`/api/assessment-blocks?from=${D}&to=${D}`));
    expect(onlyToday).toHaveLength(1);
    expect(onlyToday[0].date).toBe(D);
  });
});
