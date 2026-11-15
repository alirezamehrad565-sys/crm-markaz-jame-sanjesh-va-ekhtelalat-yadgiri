import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  apptBody,
  quarterHourFromNow,
  tehranTodayAt,
  ALI_ID,
  MARYAM_ID,
  STUDENT1_ID,
  STUDENT2_ID
} from '../../test/harness';
import { tehranYmdOf } from '@core/shared';

interface ApptBody {
  id: string;
  status: 'scheduled' | 'cancelled';
  version: number;
  note?: string | null;
}

function apptOf(res: { body: unknown }): ApptBody {
  return (res.body as { data: ApptBody }).data;
}

interface BoardBody {
  date: string;
  isToday: boolean;
  opsStats?: unknown;
  queue?: unknown;
  assessmentsToday: number;
  sessionStats: { total: number; pending: number; present: number; absent: number };
  notes: Array<{ id: string; kind?: string; body: string }>;
  staff: Array<{ staffId: string; appointments: Array<{ id: string; students: Array<{ studentId: string; attendance?: string; phone: string | null }> }> }>;
  unassigned: Array<{ id: string; students: Array<{ studentId: string; attendance?: string; phone: string | null }> }>;
}

function boardBody(res: { body: unknown }): BoardBody {
  return (res.body as { data: BoardBody }).data;
}

async function createSoon(api: Api) {
  const start = quarterHourFromNow(30);
  const res = await api.post('/api/appointments', apptBody(ALI_ID, start, 45, [STUDENT1_ID]));
  expect(res.status).toBe(201);
  return apptOf(res);
}

/* ۱.۱۸.۰ — سیستم موازی «وضعیت عملیاتی» (آمد/نیامد/شروع و اتمام جلسه) به‌کلی حذف شد؛
   حضور و غیاب تک‌دانش‌آموزی تنها مرجع است. این گیت‌ها تضمین می‌کنند مسیر حذف‌شده
   واقعاً بسته است و بورد فقط با حضور کار می‌کند. */
describe('گیت ۱.۱۸.۰ — بستن مسیر وضعیت عملیاتی', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
  });

  it('POST /api/appointments/:id/ops-status دیگر وجود ندارد — 404', async () => {
    const appt = await createSoon(mgr);
    const r = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    expect(r.status).toBe(404);
  });

  it('بورد دیگر opsStats و queue برنمی‌گرداند', async () => {
    await createSoon(mgr);
    const day = tehranYmdOf(quarterHourFromNow(30));
    const board = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    expect(board.opsStats).toBeUndefined();
    expect(board.queue).toBeUndefined();
    expect(typeof board.sessionStats.total).toBe('number');
  });

  it('بورد فقط با حضور کار می‌کند — ثبت حاضر/غایب در sessionStats بازتاب دارد', async () => {
    const appt = await createSoon(mgr);
    const day = tehranYmdOf(quarterHourFromNow(30));
    const before = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    expect(before.sessionStats.pending).toBeGreaterThanOrEqual(1);

    const present = await mgr.patch(`/api/attendance/${appt.id}/${STUDENT1_ID}`, { status: 'present' });
    expect(present.status).toBe(200);

    const after = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    expect(after.sessionStats.present).toBe(before.sessionStats.present + 1);
    expect(after.sessionStats.pending).toBe(before.sessionStats.pending - 1);

    const absent = await mgr.patch(`/api/attendance/${appt.id}/${STUDENT1_ID}`, { status: 'absent' });
    expect(absent.status).toBe(200);
    const third = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    expect(third.sessionStats.present).toBe(before.sessionStats.present);
    expect(third.sessionStats.absent).toBe(before.sessionStats.absent + 1);
  });
});

describe('بورد — نوبت، تماس سریع و یادداشت روز', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
  });

  it('ایجاد نوبت با note: null — 200/201 و ذخیرهٔ NULL (nullish)', async () => {
    const start = tehranTodayAt(13, 0); // — ایمن به گذر نیمه‌شب (قبلاً offset 120min flaky بود)
    const res = await mgr.post('/api/appointments', { ...apptBody(ALI_ID, start, 45, [STUDENT1_ID]), note: null });
    expect(res.status).toBe(201);
    expect(apptOf(res).note ?? null).toBeNull();

    const patch = await mgr.patch(`/api/appointments/${apptOf(res).id}`, { note: null, version: apptOf(res).version });
    expect(patch.status).toBe(200);
    expect((patch.body as { data: ApptBody }).data.note ?? null).toBeNull();
  });

  it('بورد — دانش‌آموزِ نوبت phone ولیّ را دارد (تماس سریع)', async () => {
    const appt = await createSoon(mgr);
    const day = tehranYmdOf(quarterHourFromNow(30));
    const board = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    const card = [...board.staff.flatMap((s) => s.appointments), ...board.unassigned]
      .find((a) => a.id === appt.id);
    expect(card).toBeTruthy();
    const st = card?.students.find((s) => s.studentId === STUDENT1_ID);
    expect(st?.phone ?? null).toBe('09121110001');
  });

  it('یادداشت روز — kind پیش‌فرض human؛ ردیف system از DB با نشان برمی‌گردد (D2)', async () => {
    const day = tehranYmdOf(quarterHourFromNow(30));
    const note = await mgr.post('/api/working-day/notes', { date: day, body: 'یادداشت انسانی منشی' });
    expect(note.status).toBe(201);
    expect((note.body as { data: { kind?: string } }).data.kind).toBe('human');

    A.sql
      .prepare(
        `INSERT INTO day_notes (id, date, body, kind, created_by, created_at)
         VALUES ('sys-note-1', ?, 'نوبت ۱۰:۳۰ لغو شد', 'system', (SELECT id FROM staff LIMIT 1), datetime('now'))`
      )
      .run(day);

    const board = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    const human = board.notes.find((n) => n.body.includes('یادداشت انسانی'));
    const system = board.notes.find((n) => n.id === 'sys-note-1');
    expect(human?.kind).toBe('human');
    expect(system?.kind).toBe('system');
  });
});

describe('بورد روز کاری درمانگر (scope به خودش)', () => {
  it('دفتر کل مرکز را می‌بیند؛ درمانگر فقط ستون خودش + آمار همان (200)', async () => {
    const A = createTestApp();
    const mgr = await asRole(A, 'manager');
    const sec = await asRole(A, 'secretary');
    const thr = await asRole(A, 'therapist');

    expect((await mgr.get('/api/working-day')).status).toBe(200);
    expect((await sec.get('/api/working-day')).status).toBe(200);

    const start = tehranTodayAt(11, 0);
    const mine = await mgr.post('/api/appointments', apptBody(ALI_ID, start, 45, [STUDENT1_ID]));
    expect(mine.status).toBe(201);
    const theirs = await mgr.post('/api/appointments', apptBody(MARYAM_ID, tehranTodayAt(12, 0), 45, [STUDENT2_ID]));
    expect(theirs.status).toBe(201);
    const mineId = apptOf(mine).id;

    const board = boardBody(await thr.get('/api/working-day'));
    expect(board.staff.length).toBe(1); // فقط ستون خودش
    expect(board.staff[0].staffId).toBe(ALI_ID);
    expect(board.staff[0].appointments.map((a) => a.id)).toContain(mineId);
    const allIds = [...board.staff.flatMap((s) => s.appointments.map((a) => a.id)), ...board.unassigned.map((a) => a.id)];
    expect(allIds).not.toContain(apptOf(theirs).id); // نوبت همکار دیده نمی‌شود
    expect(board.sessionStats.total).toBe(1); // آمار فقط نوبت‌های خودش
  });
});
