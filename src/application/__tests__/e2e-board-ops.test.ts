/**
 * تست‌های e2e — board-ops
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-board-ops.test.ts — فاز ۱ (بورد منشی): وضعیت عملیاتی نوبت + بورد غنی‌شده
// فلوی آمد→در جلسه→انجام شد، نیامد، ترنزیشن‌های نامعتبر، idempotent، RBAC،
// audit هم‌تراکنش، D6 (بدون اعلان)، بورد (opsStats/queue/kind/ارزیابی)

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
  opsStatus?: string | null;
  version: number;
  note?: string | null;
}

function apptOf(res: { body: unknown }): ApptBody {
  return (res.body as { data: ApptBody }).data;
}

interface BoardBody {
  date: string;
  isToday: boolean;
  opsStats: {
    planned: number;
    checkedIn: number;
    delayed: number;
    inSession: number;
    completed: number;
    noShow: number;
    cancelled: number;
    total: number;
  };
  queue: Array<{ appointmentId: string; staffName: string; studentNames: string[]; opsStatus: string | null }>;
  assessmentsToday: number;
  sessionStats: { total: number; pending: number; present: number; absent: number };
  notes: Array<{ id: string; kind?: string; body: string }>;
  staff: Array<{ staffId: string; appointments: Array<{ id: string; students: Array<{ studentId: string; phone: string | null }> }> }>;
  unassigned: Array<{ id: string; students: Array<{ studentId: string; phone: string | null }> }>;
}

function boardBody(res: { body: unknown }): BoardBody {
  return (res.body as { data: BoardBody }).data;
}

/** نوبت ۳۰ دقیقهٔ دیگر — همیشه داخل پنجرهٔ ۶۰ دقیقهٔ صف */
async function createSoon(api: Api) {
  const start = quarterHourFromNow(30);
  const res = await api.post('/api/appointments', apptBody(ALI_ID, start, 45, [STUDENT1_ID]));
  expect(res.status).toBe(201);
  return apptOf(res);
}

function countAudit(A: ReturnType<typeof createTestApp>, resourceId: string): number {
  const row = A.sql
    .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE resource_id = ? AND action = 'appointment.ops_status.changed'`)
    .get(resourceId) as { n: number | null } | undefined;
  return Number(row?.n ?? 0);
}

function countNotifications(A: ReturnType<typeof createTestApp>): number {
  const row = A.sql.prepare(`SELECT COUNT(*) AS n FROM notifications`).get() as { n: number | null } | undefined;
  return Number(row?.n ?? 0);
}

describe('فاز ۱ — فلوی کامل وضعیت عملیاتی', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
  });

  it('آمد → در جلسه → انجام شد (هر مرحله 200 و در پاسخ و GET بازتاب دارد)', async () => {
    const appt = await createSoon(mgr);

    const r1 = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    expect(r1.status).toBe(200);
    expect(apptOf(r1).opsStatus).toBe('checked_in');
    expect(apptOf(r1).status).toBe('scheduled'); // status دست‌نخورده

    const r2 = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'in_session' });
    expect(r2.status).toBe(200);
    expect(apptOf(r2).opsStatus).toBe('in_session');

    const r3 = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'completed' });
    expect(r3.status).toBe(200);
    expect(apptOf(r3).opsStatus).toBe('completed');

    // GET تکی — از مسیر repository (خواندن با درمانگرِ صاحب برنامه — نوبتِ ALI)
    const ther = await asRole(A, 'therapist');
    const get = await ther.get(`/api/appointments?id=${appt.id}`);
    expect(apptOf(get).opsStatus).toBe('completed');
    expect(apptOf(get).version).toBe(appt.version); // بدون bump نسخه (D1)

    // audit هم‌تراکنش — سه ترنزیشن واقعی (idempotent نبوده)
    expect(countAudit(A, appt.id)).toBe(3);
  });

  it('پایان‌حالت انجام‌شده دیگر تغییر نمی‌کند — 409 با پیام actionable', async () => {
    const appt = await createSoon(mgr);
    await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'in_session' });
    await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'completed' });

    const bad = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    expect(bad.status).toBe(409);
    const msg = (bad.body as { message?: string }).message ?? '';
    expect(msg).toContain('انجام شد');
  });

  it('نیامد مستقیم از حالت برنامه‌ریزی‌شده؛ بعدش هیچ ترنزیشنی مجاز نیست', async () => {
    const appt = await createSoon(mgr);
    const r = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'no_show' });
    expect(r.status).toBe(200);
    expect(apptOf(r).opsStatus).toBe('no_show');

    const after = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    expect(after.status).toBe(409);
    expect(((after.body as { message?: string }).message ?? '')).toContain('نیامد');
  });

  it('ترنزیشن پرشی نامعتبر — 409 (برنامه‌ریزی‌شده → انجام شد / آمد → انجام شد)', async () => {
    const a1 = await createSoon(mgr);
    const jump = await mgr.post(`/api/appointments/${a1.id}/ops-status`, { ops_status: 'completed' });
    expect(jump.status).toBe(409);
    expect(((jump.body as { message?: string }).message ?? '')).toContain('مجاز');

    const a2 = await createSoon(mgr);
    await mgr.post(`/api/appointments/${a2.id}/ops-status`, { ops_status: 'checked_in' });
    const skip = await mgr.post(`/api/appointments/${a2.id}/ops-status`, { ops_status: 'completed' });
    expect(skip.status).toBe(409);
  });

  it('همان‌وضعیت = no-op idempotent (200 بدون ردیف audit جدید)', async () => {
    const appt = await createSoon(mgr);
    await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'delayed' });
    expect(countAudit(A, appt.id)).toBe(1);

    const again = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'delayed' });
    expect(again.status).toBe(200);
    expect(apptOf(again).opsStatus).toBe('delayed');
    expect(countAudit(A, appt.id)).toBe(1); // audit اضافه نشد
  });
});

describe('فاز ۱ — RBAC، لغو، خطاها، D6', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ther: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ther = await asRole(A, 'therapist');
  });

  it('RBAC — منشی مجاز؛ درمانگر روی نوبت خودش 200، روی نوبت همکار 403', async () => {
    const appt = await createSoon(mgr); // نوبتِ علی (درمانگر تست) که مدیر ساخته

    const bySec = await sec.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    expect(bySec.status).toBe(200);

    // درمانگر روی کارت خودش عملیات بوردی دارد (آمد → شروع جلسه)
    const own = await ther.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'in_session' });
    expect(own.status).toBe(200);
    expect(apptOf(own).opsStatus).toBe('in_session');

    // نوبت همکار (مریم) — ۴۰۳
    const otherStart = tehranTodayAt(14, 0); // — فقط «نوبت دیگری برای همکار» کافی است؛ ایمن به نیمه‌شب
    const other = await mgr.post('/api/appointments', apptBody(MARYAM_ID, otherStart, 45, [STUDENT2_ID]));
    expect(other.status).toBe(201);
    const otherId = apptOf(other).id;
    const byTher = await ther.post(`/api/appointments/${otherId}/ops-status`, { ops_status: 'checked_in' });
    expect(byTher.status).toBe(403);
  });

  it('نوبت لغوشده وضعیت عملیاتی نمی‌گیرد — 409', async () => {
    const appt = await createSoon(mgr);
    const cancel = await mgr.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(cancel.status).toBe(200);

    const res = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    expect(res.status).toBe(409);
  });

  it('خطاها — نوبت ناموجود 404؛ مقدار نامعتبر 400', async () => {
    const nf = await mgr.post(`/api/appointments/00000000-0000-0000-0000-00000000dead/ops-status`, { ops_status: 'checked_in' });
    expect(nf.status).toBe(404);

    const appt = await createSoon(mgr);
    const bad = await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'bogus' });
    expect(bad.status).toBe(400);
  });

  it('D6 — تغییر وضعیت عملیاتی هیچ رکورد اعلانی نمی‌سازد', async () => {
    const appt = await createSoon(mgr);
    const before = countNotifications(A);
    await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'checked_in' });
    await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'in_session' });
    const after = countNotifications(A);
    expect(after).toBe(before);
  });

  // ارگونومی API: کلید حذف‌شده و null هر دو «بدون توضیح» معنا دارند (قبلاً 400 می‌داد)
  it('ایجاد نوبت با note: null — 200/201 و ذخیرهٔ NULL (nullish)', async () => {
    const start = tehranTodayAt(13, 0); // — ایمن به گذر نیمه‌شب (قبلاً offset 120min flaky بود)
    const res = await mgr.post('/api/appointments', { ...apptBody(ALI_ID, start, 45, [STUDENT1_ID]), note: null });
    expect(res.status).toBe(201);
    expect(apptOf(res).note ?? null).toBeNull();

    // ویرایش با null هم مجاز است — یعنی «پاک‌کردن توضیح»
    const patch = await mgr.patch(`/api/appointments/${apptOf(res).id}`, { note: null, version: apptOf(res).version });
    expect(patch.status).toBe(200);
    expect((patch.body as { data: ApptBody }).data.note ?? null).toBeNull();
  });
});

describe('فاز ۱ — بورد غنی‌شده (opsStats/queue/kind/ارزیابی)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
  });

  it('نوار وضعیت و صف — شمارش‌ها با ترنزیشن همگام می‌شود؛ صف فقط برای امروز', async () => {
    const appt = await createSoon(mgr);
    const day = tehranYmdOf(quarterHourFromNow(30));

    const board1 = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    expect(board1.opsStats.total).toBeGreaterThanOrEqual(1);
    const plannedBefore = board1.opsStats.planned;
    expect(plannedBefore).toBeGreaterThanOrEqual(1);
    expect(typeof board1.assessmentsToday).toBe('number');

    // صف فقط برای امروز پر می‌شود
    if (board1.isToday) {
      const item = board1.queue.find((q) => q.appointmentId === appt.id);
      expect(item).toBeTruthy();
      expect(item?.staffName.length ?? 0).toBeGreaterThan(0);
      expect(item?.staffName).not.toBe('—');
      expect(item?.studentNames.length).toBe(1);
      expect(item?.opsStatus).toBeNull();
    } else {
      expect(board1.queue).toHaveLength(0);
    }

    await mgr.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: 'no_show' });

    const board2 = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    expect(board2.opsStats.noShow).toBe(board1.opsStats.noShow + 1);
    expect(board2.opsStats.planned).toBe(plannedBefore - 1);
    if (board2.isToday) {
      // نیامد پایان‌حالت است — باید از صف خارج شود
      expect(board2.queue.some((q) => q.appointmentId === appt.id)).toBe(false);
    }
  });

  // تماس سریع با ولیّ از بورد: موبایل ولیّ در ردیف دانش‌آموزِ کارت بورد هست
  it('بورد — دانش‌آموزِ نوبت phone ولیّ را دارد (تماس سریع)', async () => {
    const appt = await createSoon(mgr);
    const day = tehranYmdOf(quarterHourFromNow(30));
    const board = boardBody(await mgr.get(`/api/working-day?date=${day}`));
    const card = [...board.staff.flatMap((s) => s.appointments), ...board.unassigned]
      .find((a) => a.id === appt.id);
    expect(card).toBeTruthy();
    const st = card?.students.find((s) => s.studentId === STUDENT1_ID);
    // موبایل ولیّ از رکورد دانش‌آموز می‌آید — فقط غیرتهی و نرمال‌شدهٔ ۰۹xx
    expect(st?.phone ?? null).toBe('09121110001');
  });

  it('یادداشت روز — kind پیش‌فرض human؛ ردیف system از DB با نشان برمی‌گردد (D2)', async () => {
    const day = tehranYmdOf(quarterHourFromNow(30));
    const note = await mgr.post('/api/working-day/notes', { date: day, body: 'یادداشت انسانی منشی' });
    expect(note.status).toBe(201);
    expect((note.body as { data: { kind?: string } }).data.kind).toBe('human');

    // Projection سیستمی آینده — مسیر خواندن D2 از همین حالا آماده است
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

// بورد روز کاری ابزار دفتر بود؛ — به دستور کاربر درمانگر هم «کپی روز کاری» دارد:
// همان طراحی، ولی بورد نسبت به خودش scope می‌شود (فقط ستون خودش؛ بدون «سایر نوبت‌ها»؛
// آمار/صف از نوبت‌های خودش) — نوبت‌های همکاران دیده نمی‌شود
describe('بورد روز کاری درمانگر (scope به خودش)', () => {
  it('دفتر کل مرکز را می‌بیند؛ درمانگر فقط ستون خودش + آمار همان (200)', async () => {
    const A = createTestApp();
    const mgr = await asRole(A, 'manager');
    const sec = await asRole(A, 'secretary');
    const thr = await asRole(A, 'therapist');

    expect((await mgr.get('/api/working-day')).status).toBe(200);
    expect((await sec.get('/api/working-day')).status).toBe(200);

    // دو نوبت: یکی برای علی (درمانگر تست) و یکی برای مریم (همکار)
    // m128 — ساعت ثابت صبح به‌جای now+offset: بعدِ ~۲۱:۴۵ تهران، quarterHourFromNow
    // به روز بعد می‌غلتد و بوردِ «امروز» خالی می‌شد (flaky ساعتی)
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
    expect(board.opsStats.total).toBe(1);
  });
});
