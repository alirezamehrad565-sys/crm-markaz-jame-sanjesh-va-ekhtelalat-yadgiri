// آزمون‌های بلوک نوبت سنجش (۱.۲۷.۱۴/۷۷ — خواست کارفرما):
// GET همهٔ احرازشده‌ها · POST/DELETE فقط-مدیر · سد سخت ثبت/جابه‌جایی نوبت در بازهٔ سنجش
// (۴۰۰ پیام فارسی «سنجش») · ۱.۲۷.۱۵: سد بر پایهٔ «درمانگرِ درگیر» و برای همهٔ نقش‌ها حتی
// مدیر؛ بلوک بدون فهرست = سدِ زمانی برای درمانگر/منشی · آزاد شدن بازه پس از حذف
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent, apptBody, ALI_ID, MARYAM_ID } from '../../test/harness';
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

  it('G3: ثبت بازه با قرارداد کامل — ۲۰۱ + شکل داده (آرایهٔ فن‌اوت‌شده)؛ ورودی بد → ۴۰۰', async () => {
    const res = await manager.post('/api/assessment-blocks', {
      date: D,
      start_minute: 600,
      end_minute: 720,
      therapist_ids: [ALI_ID],
      note: 'وژومتر — ارزیابی پروندهٔ نوآموزان'
    });
    expect(res.status).toBe(201);
    /* ۱.۲۷.۱۵ — فن‌اوت: برای هر درمانگر یک ردیف/کارت مستقل؛ خروجی آرایه است */
    const arr = dataOf<Array<{ id: string; date: string; startMinute: number; endMinute: number; therapistIds: string[]; note: string | null; version: number }>>(res);
    expect(arr).toHaveLength(1);
    const b = arr[0];
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

  it('G6: سدِ درمانگرِ درگیر برای همهٔ نقش‌ها — مدیر هم ۴۰۰ می‌گیرد (۱.۲۷.۱۵ خواست کارفرما)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720, therapist_ids: [ALI_ID] });
    const st = await createStudent(m);
    const win = tehranMinuteWindow(D, 630, 690); // کاملاً درون بازه
    const res = await m.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]));
    expect(res.status).toBe(400);
    expect(errMessageOf(res)).toContain('سنجش');
  });

  it('G6b: درمانگرِ غیردرگیر در همان بازه آزاد است — ثبت توسط مدیر ۲۰۱ (۱.۲۷.۱۵)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720, therapist_ids: [ALI_ID] });
    const st = await createStudent(m);
    const win = tehranMinuteWindow(D, 630, 690); // کاملاً درون بازه
    expect((await m.post('/api/appointments', apptBody(MARYAM_ID, win.start, 60, [st.id]))).status).toBe(201);
  });

  it('G10: منشی برای درمانگرِ درگیر ۴۰۰ و برای غیردرگیر ۲۰۱ (۱.۲۷.۱۵)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const st = await createStudent(m);
    await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720, therapist_ids: [ALI_ID] });
    const win = tehranMinuteWindow(D, 630, 690); // کاملاً درون بازه
    const blocked = await s.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]));
    expect(blocked.status).toBe(400);
    expect(errMessageOf(blocked)).toContain('سنجش');
    expect((await s.post('/api/appointments', apptBody(MARYAM_ID, win.start, 60, [st.id]))).status).toBe(201);
  });

  it('G11: کپی هفته — نوبتِ درمانگرِ درگیر به درون بازهٔ سنجش کپی نمی‌شود (تداخل assessment_block) (۱.۲۷.۱۵)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const st = await createStudent(m);
    const srcMonday = '2030-01-07'; // دوشنبه
    const tgtMonday = '2030-01-14'; // دوشنبهٔ بعد
    const srcWin = tehranMinuteWindow(srcMonday, 570, 630); // ۰۹:۳۰–۱۰:۳۰ تهران
    expect((await m.post('/api/appointments', apptBody(ALI_ID, srcWin.start, 60, [st.id]))).status).toBe(201);
    expect((await m.post('/api/appointments', apptBody(MARYAM_ID, srcWin.start, 60, [st.id]))).status).toBe(201);
    // بازهٔ سنجش دوشنبهٔ هدف، همان ساعت — فقط علی درگیر است
    await m.post('/api/assessment-blocks', { date: tgtMonday, start_minute: 570, end_minute: 690, therapist_ids: [ALI_ID] });
    const copy = await m.post('/api/appointments/copy-week', { source_monday: srcMonday, target_monday: tgtMonday });
    expect(copy.status).toBe(200);
    const result = (copy.body as { data: { copied: number; conflicts: Array<{ type: string; staffId: string }> } }).data;
    expect(result.copied).toBe(1); // مریم — بدون بلوک — کپی شده است
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].type).toBe('assessment_block');
    expect(result.conflicts[0].staffId).toBe(ALI_ID);
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
    const created = dataOf<{ id: string }[]>(await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720 }));
    expect((await m.delete(`/api/assessment-blocks/${created[0].id}`)).status).toBe(204);
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

  it('G16: ساخت چنددرمانگره فن‌اوت می‌شود — برای هر درمانگر یک کارت مستقل (۱.۲۷.۱۵ خواست کارفرما)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const res = await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 660, therapist_ids: [ALI_ID, MARYAM_ID] });
    expect(res.status).toBe(201);
    const arr = dataOf<{ id: string; therapistIds: string[]; version: number }[]>(res);
    expect(arr).toHaveLength(2);
    expect(arr.map((x) => x.therapistIds[0]).sort()).toEqual([ALI_ID, MARYAM_ID].sort());
    // دو کارت مستقل = دو ردیف تک‌درمانگره در فهرست
    const list = dataOf<{ id: string; therapistIds: string[] }[]>(await m.get(`/api/assessment-blocks?from=${D}&to=${D}`));
    const singles = list.filter((x) => x.therapistIds.length === 1);
    expect(singles.length).toBeGreaterThanOrEqual(2);
  });

  it('G12: PATCH کارت — جابه‌جایی روز/ساعت (درگ‌اند‌دراپ)؛ سدِ سخت از ردیف به‌روزشده پیروی می‌کند (۱.۲۷.۱۵)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await asRole(A, 'therapist');
    const st = await createStudent(m);
    const intro = tehranMinuteWindow(D, 840, 900); // معرفی دانش‌آموز به سکوپ درمانگر
    expect((await m.post('/api/appointments', apptBody(ALI_ID, intro.start, 60, [st.id]))).status).toBe(201);
    const [b] = dataOf<{ id: string; version: number }[]>(
      await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 720, therapist_ids: [ALI_ID] })
    );
    // جابه‌جایی روی خود روز + کش‌دادن
    const moved = await m.patch(`/api/assessment-blocks/${b.id}`, { start_minute: 660, end_minute: 780, version: b.version });
    expect(moved.status).toBe(200);
    const mb = dataOf<{ id: string; startMinute: number; endMinute: number; version: number }>(moved);
    expect(mb.startMinute).toBe(660);
    expect(mb.endMinute).toBe(780);
    expect(mb.version).toBe(2);
    // درون بازهٔ جدید برای درمانگرِ درگیر سد است
    const win = tehranMinuteWindow(D, 690, 750);
    const blocked = await t.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]));
    expect(blocked.status).toBe(400);
    expect(errMessageOf(blocked)).toContain('سنجش');
    // جابه‌جایی به فردا (درگ روی ستون روز دیگر)
    const tomorrow = addDaysYmd(D, 1);
    expect((await m.patch(`/api/assessment-blocks/${b.id}`, { date: tomorrow, version: mb.version })).status).toBe(200);
    const list = dataOf<{ id: string; date: string }[]>(await m.get(`/api/assessment-blocks?from=${tomorrow}&to=${tomorrow}`));
    expect(list.some((x) => x.id === mb.id)).toBe(true);
  });

  it('G13: PATCH staff_id — پرتاب کارت به ستون درمانگر دیگر؛ سد هم‌راهش می‌رود (۱.۲۷.۱۵)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const st = await createStudent(m);
    const [b] = dataOf<{ id: string; version: number }[]>(
      await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 660, therapist_ids: [ALI_ID] })
    );
    const moved = await m.patch(`/api/assessment-blocks/${b.id}`, { staff_id: MARYAM_ID, version: b.version });
    expect(moved.status).toBe(200);
    expect(dataOf<{ therapistIds: string[] }>(moved).therapistIds).toEqual([MARYAM_ID]);
    const win = tehranMinuteWindow(D, 630, 690); // کاملاً درون بازه
    // علی حالا آزاد است — منشی/مدیر می‌تواند نوبت بدهد
    expect((await m.post('/api/appointments', apptBody(ALI_ID, win.start, 60, [st.id]))).status).toBe(201);
    // مریم حالا درمانگرِ درگیر است — حتی برای مدیر ۴۰۰ (رفتار ۱.۲۷.۱۵)
    const blocked = await m.post('/api/appointments', apptBody(MARYAM_ID, win.start, 60, [st.id]));
    expect(blocked.status).toBe(400);
    expect(errMessageOf(blocked)).toContain('سنجش');
  });

  it('G14: قفل نسخه و RBAC پچ — نسخهٔ کهنه ۴۰۹؛ درمانگر/منشی ۴۰۳؛ جزئیات ذخیره می‌شود (۱.۲۷.۱۵)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await asRole(A, 'therapist');
    const [b] = dataOf<{ id: string; version: number }[]>(
      await m.post('/api/assessment-blocks', { date: D, start_minute: 600, end_minute: 660 })
    );
    expect((await t.patch(`/api/assessment-blocks/${b.id}`, { note: 'x', version: b.version })).status).toBe(403);
    expect((await s.patch(`/api/assessment-blocks/${b.id}`, { note: 'x', version: b.version })).status).toBe(403);
    expect((await m.patch(`/api/assessment-blocks/${b.id}`, { note: 'x', version: b.version + 5 })).status).toBe(409);
    // نوشتن جزئیات از مودال کلیکِ کارت
    const noteRes = await m.patch(`/api/assessment-blocks/${b.id}`, { note: 'اتاق سنجش ۲', version: b.version });
    expect(noteRes.status).toBe(200);
    expect(dataOf<{ note: string | null }>(noteRes).note).toBe('اتاق سنجش ۲');
    // پایانِ قبل از شروع با پچ → ۴۰۰
    expect((await m.patch(`/api/assessment-blocks/${b.id}`, { start_minute: 600, end_minute: 500, version: b.version })).status).toBe(400);
  });
});
