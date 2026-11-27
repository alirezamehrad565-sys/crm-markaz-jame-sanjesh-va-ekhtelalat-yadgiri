// ممیزی صفحهٔ تقویم نوبت‌ها (#/appointments) — تست‌های بازتولید و رگرسیون رفع‌ها.
// هر آزمون «رفتار درست» را pin می‌کند؛ پیش از رفع، همین آزمون‌ها روی درخت تغییرنیافته قرمز بودند
// (شواهد یافته‌های ممیزی). مرزها: قفل خوش‌بینانهٔ نوبت و کارت سنجش، برگردانی دستهٔ کپی هفته،
// اعتبارسنجی ورودی، محدودهٔ درمانگرِ مالک پرونده، لغو نوبتِ با حضور ثبت‌شده، و افشای کمترِ دادهٔ کارکنان.
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  ALI_ID,
  MARYAM_ID
} from '../../test/harness';

interface ApptJson {
  id: string;
  staffId: string;
  status: string;
  version: number;
  note: string | null;
  students: Array<{ studentId: string; attendance: string }>;
}

type TestApp = ReturnType<typeof createTestApp>;

function data<T = ApptJson>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function count(A: TestApp, sql: string, ...params: string[]): number {
  return (A.sql.prepare(sql).get(...params) as { cnt: number }).cnt;
}

function messageOf(res: { body: unknown }): string {
  return (res.body as { message?: string } | null)?.message ?? '';
}

/* نمای حداقلیِ D1 ماک — فقط برای نصب قلابِ زیر */
interface RawStmt {
  bind(...params: unknown[]): RawStmt;
  run(): Promise<unknown>;
  all(): Promise<unknown>;
  first(col?: string): Promise<unknown>;
  raw(): Promise<unknown>;
  execSync(): unknown;
}
interface RawD1 {
  prepare(sql: string): RawStmt;
  batch(stmts: RawStmt[]): Promise<unknown[]>;
}

/**
 * شبیه‌سازی قطعیِ پنجرهٔ رقابت: درست پیش از اجرای نخستین دستورِ نوشتنِ ما روی جدول هدف، نوشتهٔ
 * «کاربر دیگر» (version += 1) روی همان ردیف می‌نشیند — همان چیزی که در D1 واقعی بین خواندنِ
 * پیش‌شرط و نوشتن رخ می‌دهد. قلاب هم مسیر db.execute (دروازهٔ بیرون تراکنش) و هم مسیر batchِ
 * داخل db.transaction را می‌گیرد، پس رفتار قبل و بعد از رفع را یکسان و قطعی می‌سنجد.
 */
function landCompetingWrite(A: TestApp, table: 'appointments' | 'assessment_blocks', rowId: string): void {
  const d1 = A.d1 as unknown as RawD1;
  const pattern = new RegExp(`\\bUPDATE\\s+${table}\\s+SET\\b`);
  let armed = true;
  const inject = (sql: string): void => {
    if (armed && pattern.test(sql)) {
      armed = false;
      A.sql.prepare(`UPDATE ${table} SET version = version + 1, updated_at = datetime('now') WHERE id = ?`).run(rowId);
    }
  };
  const realPrepare = d1.prepare.bind(d1);
  d1.prepare = (sql: string): RawStmt => {
    const wrap = (inner: RawStmt): RawStmt => ({
      bind: (...params: unknown[]) => wrap(inner.bind(...params)),
      run: async () => {
        inject(sql);
        return inner.run();
      },
      all: async () => inner.all(),
      first: async (col?: string) => inner.first(col),
      raw: async () => inner.raw(),
      execSync: () => {
        inject(sql);
        return inner.execSync();
      }
    });
    return wrap(realPrepare(sql));
  };
}

const at = (day: string, time = '08:00:00.000Z'): string => `2031-03-${day}T${time}`;

describe('ممیزی تقویم — قفل خوش‌بینانه: نوشتن با نسخهٔ کهنه باید ۴۰۹ بدهد، نه «موفق»', () => {
  let A: TestApp;
  let sec: Api;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    mgr = await asRole(A, 'manager');
  });

  it('move: رقیب درست پیش از دروازه نوشته → 409 با نسخهٔ تازه؛ زمان نوبت و audit دست‌نخورده', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('03'), 45, [st.id])));
    landCompetingWrite(A, 'appointments', appt.id);

    const res = await sec.patch(`/api/appointments/${appt.id}/move`, { start_at: at('03', '10:00:00.000Z'), version: appt.version });
    expect(res.status).toBe(409);
    expect(messageOf(res)).toContain('توسط کاربر دیگری');
    expect((res.body as { current_version?: number }).current_version).toBe(appt.version + 1);

    const row = A.sql.prepare(`SELECT start_at, end_at FROM appointments WHERE id = ?`).get(appt.id) as { start_at: string };
    expect(row.start_at).toBe(at('03'));
    expect(count(A, `SELECT COUNT(*) AS cnt FROM audit_log WHERE resource_id = ? AND action = 'appointment.move'`, appt.id)).toBe(0);
  });

  it('resize: نسخهٔ کهنه → 409؛ پایان نوبت و audit دست‌نخورده', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('04'), 45, [st.id])));
    landCompetingWrite(A, 'appointments', appt.id);

    const res = await sec.patch(`/api/appointments/${appt.id}/resize`, { end_at: at('04', '09:00:00.000Z'), version: appt.version });
    expect(res.status).toBe(409);

    const row = A.sql.prepare(`SELECT end_at FROM appointments WHERE id = ?`).get(appt.id) as { end_at: string };
    expect(row.end_at).toBe(at('04', '08:45:00.000Z'));
    expect(count(A, `SELECT COUNT(*) AS cnt FROM audit_log WHERE resource_id = ? AND action = 'appointment.resize'`, appt.id)).toBe(0);
  });

  it('cancel: نسخهٔ کهنه → 409؛ وضعیت و حضور دست‌نخورده، بدون audit و اعلانِ لغو', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('05'), 45, [st.id])));
    const notificationsBefore = count(A, `SELECT COUNT(*) AS cnt FROM notifications WHERE appointment_id = ?`, appt.id);
    landCompetingWrite(A, 'appointments', appt.id);

    const res = await sec.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(res.status).toBe(409);

    const row = A.sql.prepare(`SELECT status FROM appointments WHERE id = ?`).get(appt.id) as { status: string };
    expect(row.status).toBe('scheduled');
    expect(count(A, `SELECT COUNT(*) AS cnt FROM appointment_students WHERE appointment_id = ? AND attendance != 'pending'`, appt.id)).toBe(0);
    expect(count(A, `SELECT COUNT(*) AS cnt FROM audit_log WHERE resource_id = ? AND action = 'appointment.cancel'`, appt.id)).toBe(0);
    expect(count(A, `SELECT COUNT(*) AS cnt FROM notifications WHERE appointment_id = ?`, appt.id)).toBe(notificationsBefore);
  });

  it('restore: نسخهٔ کهنه → 409؛ نوبت لغوشده می‌ماند', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('06'), 45, [st.id])));
    const cancelled = data(await sec.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version }));
    landCompetingWrite(A, 'appointments', appt.id);

    const res = await sec.post(`/api/appointments/${appt.id}/restore`, { version: cancelled.version });
    expect(res.status).toBe(409);

    const row = A.sql.prepare(`SELECT status FROM appointments WHERE id = ?`).get(appt.id) as { status: string };
    expect(row.status).toBe('cancelled');
    expect(count(A, `SELECT COUNT(*) AS cnt FROM appointment_students WHERE appointment_id = ? AND attendance != 'cancelled'`, appt.id)).toBe(0);
    expect(count(A, `SELECT COUNT(*) AS cnt FROM audit_log WHERE resource_id = ? AND action = 'appointment.restore'`, appt.id)).toBe(0);
  });

  it('update (یادداشت): بدون قید نسخه، تغییرِ کاربر دیگر بی‌صدا کنار می‌رفت → اکنون 409', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('07'), 45, [st.id])));
    landCompetingWrite(A, 'appointments', appt.id);

    const res = await sec.patch(`/api/appointments/${appt.id}`, { note: 'یادداشتِ رقیب', version: appt.version });
    expect(res.status).toBe(409);

    const row = A.sql.prepare(`SELECT note, version FROM appointments WHERE id = ?`).get(appt.id) as { note: string | null; version: number };
    expect(row.note).toBeNull();
    expect(row.version).toBe(appt.version + 1);
    expect(count(A, `SELECT COUNT(*) AS cnt FROM audit_log WHERE resource_id = ? AND action = 'appointment.update'`, appt.id)).toBe(0);
  });

  it('کارت نوبت سنجش (PATCH /api/assessment-blocks/:id) با نسخهٔ کهنه → 409؛ ردیف دست‌نخورده', async () => {
    const created = (await mgr.post('/api/assessment-blocks', {
      date: '2031-03-09', start_minute: 600, end_minute: 720, therapist_ids: [ALI_ID]
    })).body as { data: Array<{ id: string; version: number }> };
    const block = created.data[0];
    landCompetingWrite(A, 'assessment_blocks', block.id);

    const res = await mgr.patch(`/api/assessment-blocks/${block.id}`, { note: 'اتاق ۲', version: block.version });
    expect(res.status).toBe(409);
    expect(messageOf(res)).toContain('توسط کاربر دیگری');

    const row = A.sql.prepare(`SELECT note FROM assessment_blocks WHERE id = ?`).get(block.id) as { note: string | null };
    expect(row.note).toBeNull();
  });
});

describe('ممیزی تقویم — برگردانی دستهٔ کپی هفته نباید سابقهٔ بالینی را دور بزند', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  /** هر آزمون دیتابیس مستقل دارد (ردیفِ مانده از آزمون قبل به هفتهٔ منبعِ بعدی نشت نکند) */
  async function freshApp(): Promise<{ A: TestApp; sec: Api }> {
    const A = createTestApp();
    return { A, sec: await asRole(A, 'secretary') };
  }
  const exists = (A: TestApp, id: string): boolean =>
    count(A, `SELECT COUNT(*) AS cnt FROM appointments WHERE id = ?`, id) === 1;

  /** دو نوبت در هفتهٔ منبع (شنبه) و کپی‌شان به هفتهٔ بعد؛ شنبه‌های ۲۰۳۱ */
  async function copyTwo(
    A: TestApp,
    sec: Api,
    sourceSaturday: string
  ): Promise<{ batchId: string; copies: Array<{ id: string; start_at: string }> }> {
    const day = (offset: number, time: string): string =>
      new Date(Date.parse(`${sourceSaturday}T00:00:00.000Z`) + offset * DAY_MS).toISOString().slice(0, 10) + time;
    const st = await createStudent(sec);
    expect((await sec.post('/api/appointments', apptBody(MARYAM_ID, day(2, 'T08:00:00.000Z'), 45, [st.id]))).status).toBe(201);
    expect((await sec.post('/api/appointments', apptBody(MARYAM_ID, day(3, 'T10:00:00.000Z'), 45, [st.id]))).status).toBe(201);
    const copy = await sec.post('/api/appointments/copy-week', {
      source_week_start: sourceSaturday, target_week_start: day(7, ''), staff_id: MARYAM_ID, dry_run: false
    });
    expect(copy.status).toBe(200);
    expect(data<{ copied: number }>(copy).copied).toBe(2);
    const batchId = data<{ batchId: string }>(copy).batchId;
    const copies = A.sql.prepare(`SELECT id, start_at FROM appointments WHERE batch_id = ? ORDER BY start_at`).all(batchId) as Array<{
      id: string;
      start_at: string;
    }>;
    return { batchId, copies };
  }

  it('نوبتِ کپی‌شده با گزارش جلسه (case event) حذف نمی‌شود و کل عملیات با خطای ۵۰۰ نمی‌شکند', async () => {
    const { A, sec } = await freshApp();
    const { batchId, copies } = await copyTwo(A, sec, '2031-03-08');
    A.sql.prepare(
      `INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at, status, created_by)
       VALUES (?, (SELECT id FROM case_event_types WHERE deleted_at IS NULL LIMIT 1),
               (SELECT student_id FROM appointment_students WHERE appointment_id = ? LIMIT 1), ?, ?, ?, 'completed', ?)`
    ).run(randomUUID(), copies[0].id, MARYAM_ID, copies[0].id, copies[0].start_at, MARYAM_ID);

    const undo = await sec.post(`/api/appointments/copy-week/${batchId}/undo`);
    expect(undo.status).toBe(200);
    expect(data<{ removed: number; blocked: number }>(undo)).toMatchObject({ removed: 1, blocked: 1 });
    expect(exists(A, copies[0].id)).toBe(true);
    expect(exists(A, copies[1].id)).toBe(false);
  });

  it('نوبتِ کپی‌شده‌ای که بعد از کپی جابه‌جا شده با برگردانی پاک نمی‌شود', async () => {
    const { A, sec } = await freshApp();
    const { batchId, copies } = await copyTwo(A, sec, '2031-03-15');
    const movedStart = copies[1].start_at.replace('T10:00:00.000Z', 'T13:00:00.000Z');
    const moved = await sec.patch(`/api/appointments/${copies[1].id}/move`, { start_at: movedStart, version: 1 });
    expect(moved.status).toBe(200);

    const undo = await sec.post(`/api/appointments/copy-week/${batchId}/undo`);
    expect(undo.status).toBe(200);
    expect(data<{ removed: number; blocked: number }>(undo)).toMatchObject({ removed: 1, blocked: 1 });
    expect(exists(A, copies[0].id)).toBe(false);
    const kept = A.sql.prepare(`SELECT start_at FROM appointments WHERE id = ?`).get(copies[1].id) as { start_at: string };
    expect(kept.start_at).toBe(movedStart);
  });

  it('نوبت با یادداشت جلسه یا ارجاع لیست انتظار با برگردانی پاک نمی‌شود', async () => {
    const { A, sec } = await freshApp();
    const { batchId, copies } = await copyTwo(A, sec, '2031-03-22');
    A.sql.prepare(`UPDATE appointment_students SET session_note = ? WHERE appointment_id = ?`).run('یادداشت جلسهٔ مهم', copies[0].id);
    A.sql.prepare(
      `INSERT INTO waitlist (id, first_name, last_name, phone, scheduled_appointment_id, status, created_by)
       VALUES (?, 'متقاضی', 'کپی', '09121119977', ?, 'scheduled', ?)`
    ).run(randomUUID(), copies[1].id, MARYAM_ID);

    const undo = await sec.post(`/api/appointments/copy-week/${batchId}/undo`);
    expect(undo.status).toBe(200);
    expect(data<{ removed: number; blocked: number }>(undo)).toMatchObject({ removed: 0, blocked: 2 });
    expect(exists(A, copies[0].id)).toBe(true);
    expect(exists(A, copies[1].id)).toBe(true);
    // ارجاع لیست انتظار هم دست‌نخورده می‌ماند (برگردانی نباید بی‌صدا ردیف لیست انتظار را بگرداند)
    expect(count(A, `SELECT COUNT(*) AS cnt FROM waitlist WHERE scheduled_appointment_id = ?`, copies[1].id)).toBe(1);
  });

  it('دستهٔ بدون سابقه مثل قبل کامل برگردانده می‌شود (رفتار موجود حفظ می‌شود)', async () => {
    const { A, sec } = await freshApp();
    const { batchId, copies } = await copyTwo(A, sec, '2031-03-29');
    const undo = await sec.post(`/api/appointments/copy-week/${batchId}/undo`);
    expect(undo.status).toBe(200);
    expect(data<{ removed: number; blocked: number }>(undo)).toMatchObject({ removed: 2, blocked: 0 });
    expect(copies.every((c) => !exists(A, c.id))).toBe(true);
  });
});

describe('ممیزی تقویم — شناسهٔ دانش‌آموزِ نامعتبر باید ۴۰۰ بدهد، نه ۵۰۰', () => {
  let A: TestApp;
  let sec: Api;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
  });

  it('افزودن به نوبت با student_id غیر UUID — 400', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('13'), 45, [st.id])));
    const res = await sec.post(`/api/appointments/${appt.id}/students`, { student_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(count(A, `SELECT COUNT(*) AS cnt FROM appointment_students WHERE appointment_id = ?`, appt.id)).toBe(1);
  });

  it('افزودن دانش‌آموزِ ناموجود به نوبت (منشی) — 400', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('14'), 45, [st.id])));
    const res = await sec.post(`/api/appointments/${appt.id}/students`, { student_id: randomUUID() });
    expect(res.status).toBe(400);
    expect(count(A, `SELECT COUNT(*) AS cnt FROM appointment_students WHERE appointment_id = ?`, appt.id)).toBe(1);
  });

  it('ثبت نوبت با دانش‌آموزِ ناموجود (منشی) — 400 و هیچ نوبتی ساخته نمی‌شود', async () => {
    const before = count(A, `SELECT COUNT(*) AS cnt FROM appointments`);
    const res = await sec.post('/api/appointments', apptBody(MARYAM_ID, at('15'), 45, [randomUUID()]));
    expect(res.status).toBe(400);
    expect(count(A, `SELECT COUNT(*) AS cnt FROM appointments`)).toBe(before);
  });

  it('درمانگر با دانش‌آموزِ ناموجود — همچنان 403 (وجود/عدم وجود پرونده لو نمی‌رود)', async () => {
    const res = await ali.post('/api/appointments', apptBody(ALI_ID, at('16'), 45, [randomUUID()]));
    expect(res.status).toBe(403);
  });
});

describe('ممیزی تقویم — درمانگرِ مالک پرونده می‌تواند برای دانش‌آموزِ خودش نوبت بگیرد', () => {
  let A: TestApp;
  let sec: Api;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
  });

  it('فهرست my-students و قاعدهٔ نوبت‌دهی یک تعریف دارند: پروندهٔ متعلق به درمانگر = دانش‌آموزِ خودش', async () => {
    const owned = await createStudent(ali); // POST /api/students برای درمانگر: owner_staff_id = خودش
    const list = await ali.get('/api/appointments/my-students');
    expect((list.body as { data: Array<{ id: string }> }).data.some((s) => s.id === owned.id)).toBe(true);

    const res = await ali.post('/api/appointments', apptBody(ALI_ID, at('17'), 45, [owned.id]));
    expect(res.status).toBe(201);
    expect(data(res).staffId).toBe(ALI_ID);
  });

  it('افزودن دانش‌آموزِ خودش به نوبتِ خودش هم مجاز است', async () => {
    const owned = await createStudent(ali);
    const other = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(ALI_ID, at('18'), 45, [other.id])));
    const add = await ali.post(`/api/appointments/${appt.id}/students`, { student_id: owned.id });
    expect(add.status).toBe(204);
  });

  it('درمانگر برای دانش‌آموزِ بی‌مالک و بی‌سابقه — همچنان 403', async () => {
    const stranger = await createStudent(sec);
    const res = await ali.post('/api/appointments', apptBody(ALI_ID, at('19'), 45, [stranger.id]));
    expect(res.status).toBe(403);
  });
});

describe('ممیزی تقویم — لغو نوبت سابقهٔ حضورِ ثبت‌شده را پاک نمی‌کند', () => {
  let A: TestApp;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('با حضور/غیبت ثبت‌شده → 409 با راهنما؛ وضعیت و حضور دست‌نخورده؛ برگرداندن حضور به «در انتظار» → لغو 200', async () => {
    const st1 = await createStudent(sec);
    const st2 = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(30), 45, [st1.id, st2.id])));
    expect((await sec.patch(`/api/attendance/${appt.id}/${st1.id}`, { status: 'present' })).status).toBe(200);
    expect((await sec.patch(`/api/attendance/${appt.id}/${st2.id}`, { status: 'absent' })).status).toBe(200);

    const refused = await sec.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toContain('حضور');

    const after = data(await sec.get(`/api/appointments?id=${appt.id}`));
    expect(after.status).toBe('scheduled');
    expect(after.version).toBe(appt.version);
    expect(after.students.find((s) => s.studentId === st1.id)?.attendance).toBe('present');
    expect(after.students.find((s) => s.studentId === st2.id)?.attendance).toBe('absent');
    expect(count(A, `SELECT COUNT(*) AS cnt FROM audit_log WHERE resource_id = ? AND action = 'appointment.cancel'`, appt.id)).toBe(0);

    // جلسه در واقع برگزار نشده؟ اول حقیقتِ ثبت‌شده اصلاح می‌شود، بعد لغو
    expect((await sec.patch(`/api/attendance/${appt.id}/${st1.id}`, { status: 'pending' })).status).toBe(200);
    expect((await sec.patch(`/api/attendance/${appt.id}/${st2.id}`, { status: 'pending' })).status).toBe(200);
    const ok = await sec.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(ok.status).toBe(200);
    expect(data(ok).students.every((s) => s.attendance === 'cancelled')).toBe(true);
  });

  it('نوبتِ آینده بدون حضور ثبت‌شده مثل قبل لغو می‌شود (200)', async () => {
    const st = await createStudent(sec);
    const appt = data(await sec.post('/api/appointments', apptBody(MARYAM_ID, at('20'), 45, [st.id])));
    const res = await sec.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(res.status).toBe(200);
  });
});

describe('ممیزی تقویم — فهرست کارکنان برای نقش‌های غیرمدیر بدون دادهٔ حساس', () => {
  let A: TestApp;
  let sec: Api;
  let ali: Api;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    mgr = await asRole(A, 'manager');
  });

  const SENSITIVE = ['phone', 'nationalId', 'username', 'email'];

  it('درمانگر و منشی در GET /api/staff فقط فیلدهای لازم برای تقویم را می‌بینند', async () => {
    for (const api of [ali, sec]) {
      const res = await api.get('/api/staff?active=true');
      expect(res.status).toBe(200);
      const items = (res.body as { data: Array<Record<string, unknown>> }).data;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        for (const key of SENSITIVE) expect(item).not.toHaveProperty(key);
        expect(item).toMatchObject({ id: expect.any(String), fullName: expect.any(String), role: expect.any(String) });
      }
    }
  });

  it('GET /api/staff/:id هم برای غیرمدیر بدون دادهٔ حساس است؛ مدیر مثل قبل کامل می‌بیند', async () => {
    const ther = await ali.get(`/api/staff/${ALI_ID}`);
    expect(ther.status).toBe(200);
    for (const key of SENSITIVE) expect(ther.body as { data: Record<string, unknown> }).not.toHaveProperty(`data.${key}`);

    const full = await mgr.get(`/api/staff/${ALI_ID}`);
    expect(full.status).toBe(200);
    expect(full.body as { data: Record<string, unknown> }).toHaveProperty('data.username');
  });
});
