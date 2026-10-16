/**
 * تست‌های e2e — -dashboard
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--dashboard.test.ts — (0.50.0): بازطراحی داشبورد
// پوشش:
// ۱) دانش‌افزایی — خواندن همهٔ نقش‌ها؛ ساخت دفتر (مدیر/منشی)؛ حذف فقط مدیر؛
// پیش‌نویس از فهرست عمومی مخفی؛ سنجاق‌شده اول
// ۲) تابلوی رقابتی — فقط درمانگرها؛ جلساتِ «حاضر»/تمرین/رویداد/پیگیری دقیق شمرده
// می‌شوند و امتیاز/رتبه با فرمول شفاف می‌خواند
// ۳) کارنامهٔ من (/api/dashboard/me) — شمارنده‌ها + یادداشت جاافتاده + نوبت بعدی
// ۴) داشبورد امروز — بدون رگرسیون (KPIها سر جا)

import { describe, it, expect, beforeAll } from 'vitest';
import { addDaysYmd, tehranTodayYmd } from '@core/shared';
import {
  createTestApp,
  asRole,
  createStudent,
  apptBody,
  tehranTodayAt,
  ALI_ID,
  MARYAM_ID,
  MANAGER_ID,
  SECRETARY_ID
} from '../../test/harness';

/** — فردا ساعت مشخص تهران: تست «نوبت بعدی» نباید به ساعتِ اجرا وابسته باشد (رفع time-bomb) */
function tehranTomorrowAt(hour: number, minute = 0): string {
  const ymd = addDaysYmd(tehranTodayYmd(), 1);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(Date.parse(`${ymd}T${hh}:${mm}:00.000Z`) - 210 * 60_000).toISOString();
}

interface ScoreEntry {
  staffId: string;
  staffName: string;
  sessions: number;
  exercises: number;
  events: number;
  followups: number;
  score: number;
  rank: number;
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('دانش‌افزایی', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let sec: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let ther: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ther = await asRole(A, 'therapist');
  });

  it('خواندن برای همهٔ نقش‌ها آزاد است — فهرست خالی با ۲۰۰', async () => {
    for (const client of [mgr, sec, ther]) {
      const res = await client.get('/api/knowledge');
      expect(res.status).toBe(200);
      expect(dataOf<unknown[]>(res)).toEqual([]);
    }
  });

  it('درمانگر ساخت/ویرایش ندارد (۴۰۳) — منشی می‌سازد ولی حذف نمی‌کند (۴۰۳)', async () => {
    const denied = await ther.post('/api/knowledge', { title: 'نکتهٔ درمانگر', body: 'بدون اجازه است' });
    expect(denied.status).toBe(403);

    const created = await sec.post('/api/knowledge', {
      title: 'پروتکل ارجاع سنجش',
      body: 'هر متقاضیِ ارجاعی باید ظرف دو هفته پیگیری شود.',
      category: 'protocol',
      pinned: false,
      published: true
    });
    expect(created.status).toBe(201);
    const id = (created.body as { data: { id: string } }).data.id;

    const editDenied = await ther.patch(`/api/knowledge/${id}`, { title: 'هک' });
    expect(editDenied.status).toBe(403);

    const delDenied = await sec.delete(`/api/knowledge/${id}`);
    expect(delDenied.status).toBe(403);

    const del = await mgr.delete(`/api/knowledge/${id}`);
    expect(del.status).toBe(200);
    const after = await mgr.get('/api/knowledge');
    expect(dataOf<unknown[]>(after)).toEqual([]);
  });

  it('پیش‌نویس از فهرست عمومی مخفی است؛ سنجاق‌شده اول می‌آید؛ مدیریت همه را می‌بیند', async () => {
    const draft = await mgr.post('/api/knowledge', { title: 'پیش‌نویس راهنمای بات', body: 'هنوز کامل نیست', published: false });
    expect(draft.status).toBe(201);
    const tip = await mgr.post('/api/knowledge', { title: 'نکتهٔ حضور و غیاب', body: 'ثبت حضور را همان لحظه انجام دهید.', category: 'tip', pinned: false });
    expect(tip.status).toBe(201);
    const news = await mgr.post('/api/knowledge', { title: 'خبر: کارگاه مهر', body: 'کارگاه ارزیابی نوآموزان پنجشنبه برگزار می‌شود.', category: 'news', pinned: true });
    expect(news.status).toBe(201);

    const pub = dataOf<Array<{ id: string; title: string; category: string; published: boolean }>>(await ther.get('/api/knowledge'));
    expect(pub.some((k) => k.title === 'پیش‌نویس راهنمای بات')).toBe(false);
    expect(pub[0].title).toBe('خبر: کارگاه مهر'); // سنجاق‌شده اول
    expect(pub).toHaveLength(2);

    const manage = dataOf<Array<{ title: string; published: boolean }>>(await mgr.get('/api/knowledge/manage'));
    expect(manage).toHaveLength(3);
    expect(manage.some((k) => k.title === 'پیش‌نویس راهنمای بات' && k.published === false)).toBe(true);
  });
});

describe('تابلوی رقابتی و کارنامهٔ من', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let ther: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let typeId = '';

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    ther = await asRole(A, 'therapist');

    const st = await createStudent(mgr, { first_name: 'سینا', last_name: 'رقابتی' });
    studentId = st.id;

    // نوع رویداد ساده برای شمارش «طراحی رویداد»
    const t = await mgr.post('/api/case-events/types', {
      title: 'یادداشت مشاهدهٔ m68',
      category: 'session',
      fields: [{ key: 'note', label: 'یادداشت', type: 'text' }]
    });
    expect(t.status).toBe(201);
    typeId = (t.body as { data: { id: string } }).data.id;
  });

  it('فعالیت‌های علی (۲ جلسهٔ حاضر، ۱ تمرین، ۱ رویداد، ۱ پیگیری) امتیاز ۱۱ و رتبهٔ ۱ می‌گیرد', async () => {
    // ─── ۲ جلسهٔ امروز با «حاضر» ───
    const appt1 = await mgr.post('/api/appointments', apptBody(ALI_ID, tehranTodayAt(10), 45, [studentId]));
    expect(appt1.status).toBe(201);
    const a1 = (appt1.body as { data: { id: string } }).data.id;
    const appt2 = await mgr.post('/api/appointments', apptBody(ALI_ID, tehranTodayAt(11), 45, [studentId]));
    const a2 = (appt2.body as { data: { id: string } }).data.id;

    const m1 = await mgr.patch(`/api/attendance/${a1}/${studentId}`, { status: 'present' });
    expect(m1.status).toBe(200);
    const m2 = await mgr.patch(`/api/attendance/${a2}/${studentId}`, { status: 'present' });
    expect(m2.status).toBe(200);

    // ─── ۱ تمرینِ علی ───
    const ex = await ther.post('/api/exercises', {
      title: 'تمرین همخوان پایانی',
      format: 'worksheet',
      published: true,
      file: { filename: 't.pdf', mime_type: 'application/pdf', content_b64: Buffer.from('%PDF-1.4 m68').toString('base64') }
    });
    expect(ex.status).toBe(201);

    // ─── ۱ رویداد پروندهٔ علی ───
    const ev = await ther.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeId, values: { note: 'پیشرفت در همخوان‌ها' } });
    expect(ev.status).toBe(201);

    // ─── ۱ پیگیریِ علی از مسیر واقعی: یادداشت جلسه با next_action=follow_up ───
    const note = await ther.put(`/api/appointments/${a1}/students/${studentId}/note`, {
      session_note: 'جلسهٔ اول خوب پیش رفت',
      next_action: 'follow_up'
    });
    expect(note.status).toBe(200);

    // ─── تابلو ───
    const board = dataOf<{ entries: ScoreEntry[]; me: { rank: number; of: number; score: number } | null }>(
      await ther.get('/api/dashboard/leaderboard')
    );
    // نوبت دفتری‌ها در تابلو نیستند — فقط درمانگرها رقیب‌اند
    const ids = board.entries.map((e) => e.staffId);
    expect(ids).toContain(ALI_ID);
    expect(ids).toContain(MARYAM_ID);
    expect(ids).not.toContain(MANAGER_ID);
    expect(ids).not.toContain(SECRETARY_ID);

    const ali = board.entries.find((e) => e.staffId === ALI_ID);
    expect(ali).toBeDefined();
    expect(ali!.sessions).toBe(2); // هر دو جلسهٔ «حاضر» شمرده می‌شوند
    expect(ali!.exercises).toBe(1);
    expect(ali!.events).toBe(1);
    expect(ali!.followups).toBe(1);
    expect(ali!.score).toBe(2 * 2 + 1 * 3 + 1 * 1 + 1 * 1); // فرمول شفاف
    expect(ali!.rank).toBe(1);
    expect(board.me?.rank).toBe(1);
    expect(board.me?.score).toBe(ali!.score);
  });

  it('جلسهٔ لغوشده و بدونِ «حاضر» شمرده نمی‌شود — مریم صفرِ واقعی دارد', async () => {
    const appt = await mgr.post('/api/appointments', apptBody(MARYAM_ID, tehranTodayAt(12), 45, [studentId]));
    const apptId = (appt.body as { data: { id: string } }).data.id;
    await mgr.post(`/api/appointments/${apptId}/cancel`, { version: 1 });

    const board = dataOf<{ entries: ScoreEntry[] }>(await mgr.get('/api/dashboard/leaderboard'));
    const maryam = board.entries.find((e) => e.staffId === MARYAM_ID);
    expect(maryam).toBeDefined();
    expect(maryam!.sessions).toBe(0);
    expect(maryam!.score).toBe(0);
  });

  it('کارنامهٔ من — یادداشتِ نوشته‌شده از شمارندهٔ جاافتاده کم می‌شود', async () => {
    const me = dataOf<{
      sessions: number;
      sessionsPrev: number;
      exercises: number;
      events: number;
      followups: number;
      missingNotes: number;
      rank: { position: number; of: number } | null;
      nextAppointment: { studentNames: string[] } | null;
    }>(await ther.get('/api/dashboard/me'));

    expect(me.sessions).toBe(2);
    expect(me.exercises).toBe(1);
    expect(me.events).toBe(1);
    expect(me.followups).toBe(1);
    // دو جلسهٔ حاضر؛ یکی یادداشت دارد → یکی جاافتاده
    expect(me.missingNotes).toBe(1);
    expect(me.rank?.position).toBe(1);
    expect(me.sessionsPrev).toBe(0);
  });

  it('نوبت بعدیِ من — اولین scheduled آینده با نام دانش‌آموز', async () => {
    // نوبت فردا (نه امروز ۱۷:۰۰): بعد از گذر ساعتِ ثابت، نوبت «گذشته» می‌شد و تست می‌ترکید
    await mgr.post('/api/appointments', apptBody(ALI_ID, tehranTomorrowAt(10), 45, [studentId]));
    const me = dataOf<{ nextAppointment: { studentNames: string[] } | null }>(await ther.get('/api/dashboard/me'));
    expect(me.nextAppointment).not.toBeNull();
    expect(me.nextAppointment!.studentNames.join('، ')).toContain('سینا');
  });

  it('داشبورد امروز — بدون رگرسیون، KPIهای پایه پاسخ می‌دهند', async () => {
    const today = dataOf<{ appointments: { total: number }; pendingAttendance: number; studentsSummary: { totalStudents: number } }>(
      await mgr.get('/api/dashboard/today')
    );
    expect(today.appointments.total).toBeGreaterThanOrEqual(2);
    expect(today.studentsSummary.totalStudents).toBeGreaterThanOrEqual(1);
  });
});
