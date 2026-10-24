import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  WEBHOOK_SECRET,
  ALI_ID,
  SECRETARY_ID
} from '../../test/harness';

type Update = Record<string, unknown>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
}

async function bot(A: ReturnType<typeof createTestApp>, raw: Update): Promise<BotResponse> {
  const res = await A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(raw)
    },
    A.env as never
  );
  return (await res.json()) as BotResponse;
}

const tx = (t: string, chatId: number): Update => ({ update_id: 1, message: { chat: { id: chatId }, text: t } });
const cb = (data: string, chatId: number): Update => ({
  update_id: 2,
  callback_query: { id: 9, data, message: { chat: { id: chatId } } }
});

const CHAT_ALI = 7101;
const CHAT_MANAGER = 7102;
const CHAT_PARENT = 7103;
const CHAT_NONE = 7199;

const ALI_NID = '3149977797';
const MANAGER_NID = '3672818690';

describe('بات اطلاع‌رسان: پیگیری‌ها، حضور فرزند، خلاصهٔ روز (m184)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let parentStudentId = '';
  let fuOverdueId = '';
  let fuNoDueId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    const linkAli = await bot(A, tx(ALI_NID, CHAT_ALI));
    expect(linkAli.reply).toContain('اتصال انجام شد');
    const linkMgr = await bot(A, tx(MANAGER_NID, CHAT_MANAGER));
    expect(linkMgr.reply).toContain('اتصال انجام شد');

    const s = await createStudent(manager, { guardian_phone: '09125550077' });
    parentStudentId = s.id;
    const linkParent = await bot(A, tx(s.nationalId, CHAT_PARENT));
    expect(linkParent.reply).toContain('اتصال انجام شد');
  });

  it('«پیگیری‌های من» بدون اتصال → راهنما؛ والد → پیام انکار', async () => {
    const none = await bot(A, tx('پیگیری‌های من', CHAT_NONE));
    expect(none.handled).toBe(true);
    expect(none.reply).toContain('راهنمای بات');

    const parent = await bot(A, tx('پیگیری‌های من', CHAT_PARENT));
    expect(parent.reply).toContain('برای همکاران مرکز است');
  });

  it('«پیگیری‌های من» همکار → گروه عقب‌افتاده + دکمهٔ انجام (fudone)', async () => {
    const s = await createStudent(manager);
    const overdue = await manager.post('/api/followups', {
      entity_type: 'student',
      entity_id: s.id,
      title: 'تماس با ولیّ برای گزارش جلسه',
      assignee_id: ALI_ID,
      due_at: new Date(Date.now() - 2 * 86400000).toISOString() // دو روز پیش → عقب‌افتاده
    });
    expect(overdue.status).toBe(201);
    fuOverdueId = (overdue.body as { data: { id: string } }).data.id;

    const noDue = await manager.post('/api/followups', {
      entity_type: 'student',
      entity_id: s.id,
      title: 'تهیهٔ برگه ارزیابی',
      assignee_id: ALI_ID
    });
    fuNoDueId = (noDue.body as { data: { id: string } }).data.id;
    const cleared = await manager.patch(`/api/followups/${fuNoDueId}`, { due_at: null });
    expect(cleared.status).toBe(200);

    const res = await bot(A, tx('پیگیری‌های من', CHAT_ALI));
    expect(res.reply).toContain('پیگیری‌های روی میز شما');
    expect(res.reply).toContain('عقب‌افتاده');
    expect(res.reply).toContain('تماس با ولیّ برای گزارش جلسه');
    expect(res.reply).toContain('بدون مهلت');
    expect(res.buttons).not.toBeNull();
    const flat = res.buttons!.flat();
    expect(flat.some((b) => b.callbackData === `fudone:${fuOverdueId}`)).toBe(true);
    expect(flat.some((b) => b.callbackData === `fudone:${fuNoDueId}`)).toBe(true);
  });

  it('دکمهٔ «انجام شد» → پیگیری done + audit با بازیگر bale-bot؛ تکرار → رد؛ پیگیری دیگران → رد', async () => {
    const done = await bot(A, cb(`fudone:${fuOverdueId}`, CHAT_ALI));
    expect(done.reply).toContain('پیگیری انجام شد');
    expect(done.reply).toContain('تماس با ولیّ برای گزارش جلسه');

    const rows = A.sql
      .prepare(`SELECT status FROM followups WHERE id = ?`)
      .all(fuOverdueId) as Array<{ status: string }>;
    expect(rows[0].status).toBe('done');

    const audit = A.sql
      .prepare(`SELECT actor_id, action FROM audit_log WHERE resource_id = ? AND resource_type = 'followup' ORDER BY rowid DESC`)
      .all(fuOverdueId) as Array<{ actor_id: string; action: string }>;
    expect(audit[0].action).toBe('followup.completed');
    expect(audit[0].actor_id).toBe('bale-bot');

    const again = await bot(A, cb(`fudone:${fuOverdueId}`, CHAT_ALI));
    expect(again.reply).toContain('تعلق ندارد یا بسته شده');

    const s = await createStudent(manager);
    const other = await manager.post('/api/followups', {
      entity_type: 'student',
      entity_id: s.id,
      title: 'پیگیری زهرا',
      assignee_id: SECRETARY_ID
    });
    const otherId = (other.body as { data: { id: string } }).data.id;
    const foreign = await bot(A, cb(`fudone:${otherId}`, CHAT_ALI));
    expect(foreign.reply).toContain('تعلق ندارد یا بسته شده');
  });

  it('«حضور فرزند» والد → آمار حاضر/غایب ۳۰ روز؛ همکار → انکار', async () => {
    const appt1 = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(-120), 30, [parentStudentId]));
    const appt2 = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(-240), 30, [parentStudentId]));
    const appt1Id = (appt1.body as { data: { id: string } }).data.id;
    const appt2Id = (appt2.body as { data: { id: string } }).data.id;

    const mark1 = await manager.patch(`/api/attendance/${appt1Id}/${parentStudentId}`, { status: 'present' });
    expect(mark1.status).toBe(200);
    const mark2 = await manager.patch(`/api/attendance/${appt2Id}/${parentStudentId}`, { status: 'absent' });
    expect(mark2.status).toBe(200);

    const res = await bot(A, tx('حضور فرزند', CHAT_PARENT));
    expect(res.reply).toContain('حضور فرزند');
    expect(res.reply).toContain('حاضر ۱ · غایب ۱');

    const ali = await bot(A, tx('حضور فرزند', CHAT_ALI));
    expect(ali.reply).toContain('برای والدین است');
  });

  it('خلاصهٔ روز — پوش همکار/خانواده + یادآور پیگیری؛ اجرای دوم duplicate؛ پرچم خاموش', async () => {
    const s = await createStudent(manager);
    await manager.post('/api/followups', {
      entity_type: 'student',
      entity_id: s.id,
      title: 'پیگیری تمرین خانگی',
      assignee_id: ALI_ID,
      due_at: new Date(Date.now() - 86400000).toISOString()
    });

    await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(90), 30, [parentStudentId]));

    const before = await manager.get('/api/settings');
    expect((before.body as { data: { notifyDigest: boolean } }).data.notifyDigest).toBe(true);

    const countRows = () =>
      (A.sql.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE template IN ('digest_staff','digest_family','digest_class','followup_nudge')`).all() as Array<{ n: number }>)[0].n;

    const rowsBefore = countRows();

    const res = await manager.post('/api/notifications/digest');
    expect(res.status).toBe(200);
    const summary = (res.body as { data: { staffSent: number; familySent: number; followupNudges: number; skippedEmpty: number; enqueued: number; flagEnabled: boolean } }).data;
    expect(summary.flagEnabled).toBe(true);
    expect(summary.staffSent).toBeGreaterThanOrEqual(1);  // chat علی (نوبت امروز دارد)
    expect(summary.familySent).toBeGreaterThanOrEqual(1); // chat والد (نوبت امروز فرزند)
    expect(summary.followupNudges).toBeGreaterThanOrEqual(1); // پیگیری عقب‌افتادهٔ علی
    expect(summary.skippedEmpty).toBeGreaterThanOrEqual(1); // chat مدیر — امروز نوبتی ندارد

    const rows = A.sql
      .prepare(`SELECT template, recipient, dedup_key, status FROM notifications WHERE template IN ('digest_staff','digest_family','followup_nudge') AND rowid > ?`)
      .all(rowsBefore) as Array<{ template: string; recipient: string; dedup_key: string; status: string }>;
    expect(rows.some((r) => r.template === 'digest_staff' && r.recipient === '7101' && r.status === 'sent')).toBe(true);
    expect(rows.some((r) => r.template === 'digest_family' && r.recipient === '7103' && r.status === 'sent')).toBe(true);
    expect(rows.some((r) => r.template === 'followup_nudge' && r.dedup_key.includes(ALI_ID) && r.status === 'sent')).toBe(true);

    const res2 = await manager.post('/api/notifications/digest');
    const summary2 = (res2.body as { data: { duplicates: number; staffSent: number; familySent: number; followupNudges: number; enqueued: number } }).data;
    expect(summary2.duplicates).toBe(summary.staffSent + summary.familySent);
    expect(summary2.followupNudges).toBe(0);
    expect(summary2.enqueued).toBe(0);
    expect(countRows()).toBe(
      ((A.sql.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE template IN ('digest_staff','digest_family','digest_class','followup_nudge')`).all() as Array<{ n: number }>)[0].n)
    );
    const afterSecond = countRows();
    expect(afterSecond).toBe(rowsBefore + rows.length);

    const off = await manager.put('/api/settings', { notify_digest: false });
    expect((off.body as { data: { notifyDigest: boolean } }).data.notifyDigest).toBe(false);
    const res3 = await manager.post('/api/notifications/digest');
    const summary3 = (res3.body as { data: { flagEnabled: boolean; enqueued: number } }).data;
    expect(summary3.flagEnabled).toBe(false);
    expect(summary3.enqueued).toBe(0);
    expect(countRows()).toBe(afterSecond);
  });

  it('خلاصهٔ روز — RBAC: منشی 403', async () => {
    const sec = await asRole(A, 'secretary');
    const res = await sec.post('/api/notifications/digest');
    expect(res.status).toBe(403);
  });
});
