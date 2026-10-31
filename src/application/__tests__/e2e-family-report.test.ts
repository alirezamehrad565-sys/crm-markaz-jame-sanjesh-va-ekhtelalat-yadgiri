import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  WEBHOOK_SECRET
} from '../../test/harness';

// ─── پیام آزاد به خانواده (family-report): گفتگوهای متصل خانواده در بله ───

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

async function botUpdate(A: ReturnType<typeof createTestApp>, text: string, chatId = 90125) {
  return A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ update_id: 1, message: { chat: { id: chatId }, text } })
    },
    A.env as never
  );
}

const STUDENT_ANY_ID = '00000000-0000-4000-8000-000000009999';

describe('پیام آزاد به خانواده — family-report', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
  });

  it('خانوادهٔ متصل (لینک دانش‌آموز) پیام را می‌گیرد — 201 + اعلان family_report در صف', async () => {
    const s = await createStudent(manager);

    // لینک اتصال خانواده + اتصال بات با کد
    const link = await manager.post('/api/notifications/links', { student_id: s.id });
    expect(link.status).toBe(201);
    const code = (link.body as { data: { code: string } }).data.code;
    const hooked = await botUpdate(A, `/link ${code}`, 8100);
    expect(hooked.status).toBe(200);

    const res = await therapist.post('/api/notifications/family-report', {
      student_id: s.id,
      text: 'لطفاً تمرین تنفس امروز با علی مرور شود.'
    });
    expect(res.status).toBe(201);
    const rdata = (res.body as { data: { enqueued: number } }).data;
    expect(rdata.enqueued).toBe(1);

    const list = await manager.get('/api/notifications?student_id=' + s.id);
    const items = (list.body as { data: Array<{ template: string; recipient: string | null }> }).data;
    expect(items.some((n) => n.template === 'family_report' && n.recipient === '8100')).toBe(true);
  });

  it('خانوادهٔ متصل از مسیر notification_prefs (کانال بله) هم گیرنده است و تکرار گفتگو یک بار ارسال می‌شود', async () => {
    const s = await createStudent(manager);

    // prefs با کانال بله برای یک گفتگو (مسیر prefs مستقل از bot_links)
    const prefs = await manager.put(`/api/notifications/prefs/${s.id}`, {
      channel: 'bale',
      chat_id: '8200',
      reminders_enabled: true
    });
    expect(prefs.status).toBe(200);

    const res = await manager.post('/api/notifications/family-report', { student_id: s.id, text: 'یادآوری جلسهٔ فردا' });
    expect(res.status).toBe(201);
    expect(((res.body as { data: { enqueued: number } }).data).enqueued).toBe(1);

    const list = await manager.get('/api/notifications?student_id=' + s.id);
    const items = (list.body as { data: Array<{ template: string; recipient: string | null }> }).data;
    expect(items.filter((n) => n.template === 'family_report' && n.recipient === '8200').length).toBe(1);
  });

  it('خانوادهٔ بدون اتصال — ۴۰۹ با پیام راهنمای ساخت لینک', async () => {
    const s = await createStudent(manager);
    const res = await manager.post('/api/notifications/family-report', { student_id: s.id, text: 'پیام بی‌اتصال' });
    expect(res.status).toBe(409);
    const msg = (res.body as { message?: string }).message ?? '';
    expect(msg).toContain('لینک اتصال خانواده');
  });

  it('اعتبارسنجی: متن کوتاه ۴۰۰ و دانش‌آموز ناموجود ۴۰۴ است', async () => {
    expect((await manager.post('/api/notifications/family-report', { student_id: '00000000-0000-4000-8000-000000000000', text: 'متن آزمون' })).status).toBe(404);
    const s = await createStudent(manager);
    expect((await manager.post('/api/notifications/family-report', { student_id: s.id, text: 'م' })).status).toBe(400);
    expect((await manager.post('/api/notifications/family-report', { student_id: s.id, text: '' })).status).toBe(400);
  });

  it('کاربر مهمان ۴۰۱ می‌گیرد', async () => {
    const res = await new Api(A).post('/api/notifications/family-report', { student_id: STUDENT_ANY_ID, text: 'بدون ورود' });
    expect(res.status).toBe(401);
  });
});
