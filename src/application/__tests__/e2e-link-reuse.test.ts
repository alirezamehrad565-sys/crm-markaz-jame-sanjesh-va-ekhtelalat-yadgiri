import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET, asRole, createStudent } from '../../test/harness';
import type { Api } from '../../test/harness';

type Update = Record<string, unknown>;
type A = ReturnType<typeof createTestApp>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  reply: string | null;
  buttons: unknown;
  keyboard: string[][] | null;
}

async function bot(A: A, raw: Update): Promise<BotResponse> {
  const res = await A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(raw) },
    A.env as never
  );
  return (await res.json()) as BotResponse;
}

const tx = (t: string, chatId: number): Update => ({ update_id: Math.floor(Math.random() * 1e9), message: { chat: { id: chatId }, text: t } });

const CHAT_PARENT1 = 7601;
const CHAT_PARENT2 = 7602;
const CHAT_STAFF1 = 7603;
const CHAT_STAFF2 = 7604;
const CHAT_TEACHER1 = 7605;
const CHAT_TEACHER2 = 7606;

describe('لینک احراز هویت چندبارمصرف', () => {
  let A: A;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('کد خانواده — استفادهٔ دوباره از همین چت: idempotent موفق (نه «معتبر نیست»)', async () => {
    const kid = await createStudent(manager, { first_name: 'آرمان', last_name: 're126', guardian_phone: '09361110001' });
    const code = (((await manager.post('/api/notifications/links', { student_id: kid.id })).body as { data: { code: string } }).data).code;

    const first = await bot(A, tx(`/link ${code}`, CHAT_PARENT1));
    expect(first.reply).toContain('اتصال با موفقیت');

    const again = await bot(A, tx(`/link ${code}`, CHAT_PARENT1));
    expect(again.reply).toContain('اتصال با موفقیت');
    expect(again.reply).not.toContain('معتبر نیست');
  });

  it('کد خانواده — چت تازه: انتقال اتصال (prefs به چت تازه می‌رود و چت قدیمی ادعای پرونده را از دست می‌دهد)', async () => {
    const kid = await createStudent(manager, { first_name: 'بهار', last_name: 're126', guardian_phone: '09361110002' });
    const code = (((await manager.post('/api/notifications/links', { student_id: kid.id })).body as { data: { code: string } }).data).code;

    const first = await bot(A, tx(`/link ${code}`, CHAT_PARENT1));
    expect(first.reply).toContain('اتصال با موفقیت');

    const moved = await bot(A, tx(`/link ${code}`, CHAT_PARENT2));
    expect(moved.reply).toContain('اتصال با موفقیت');
    expect(moved.reply).toContain('منتقل شد');

    const prefs = await manager.get(`/api/notifications/prefs/${kid.id}`);
    const prefsData = (prefs.body as { data: { chatId: string | null; remindersEnabled: boolean } }).data;
    expect(prefsData.chatId).toBe('7602');
    expect(prefsData.remindersEnabled).toBe(true);
  });

  it('کد کارمند — اتصال دوباره از چت تازه (انتقال؛ /start CODE هم مثل /link کار می‌کند)', async () => {
    const staff = ((await manager.get('/api/staff')).body as { data: Array<{ id: string; fullName: string }> }).data;
    const ali = staff.find((s) => s.fullName.includes('علی')) ?? staff[0];
    const code = (((await manager.post('/api/notifications/staff-links', { staff_id: ali.id })).body as { data: { code: string } }).data).code;

    const first = await bot(A, tx(`/link ${code}`, CHAT_STAFF1));
    expect(first.reply).toContain('اتصال با موفقیت');

    const moved = await bot(A, tx(`/start ${code}`, CHAT_STAFF2));
    expect(moved.reply).toContain('اتصال با موفقیت');

    const kb2 = await bot(A, tx('/start', CHAT_STAFF2));
    expect(JSON.stringify(kb2.keyboard)).toContain('پیگیری\u200cهای من');
  });

  it('کد کلاس معلم — اتصال دوباره از چت تازه کار می‌کند', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان m126', kind: 'school', gender_type: 'mixed' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'پنجم m126', teacher_name: 'معلم m126', teacher_phone: '09171112233' })).body as { data: { id: string } }).data;
    const code = (((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { code: string } }).data).code;

    const first = await bot(A, tx(`/link ${code}`, CHAT_TEACHER1));
    expect(first.reply).toContain('اتصال با موفقیت');

    const moved = await bot(A, tx(`/link ${code}`, CHAT_TEACHER2));
    expect(moved.reply).toContain('اتصال با موفقیت');

    const kb = await bot(A, tx('/start', CHAT_TEACHER2));
    expect(JSON.stringify(kb.keyboard)).toContain('ثبت متقاضی');
  });

  it('کد کلاس لغوشده — همچنان مرده است (revoked؛ حتی همان چت قبلی)', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان لغو m126', kind: 'school', gender_type: 'mixed' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'ششم m126', teacher_name: 'معلم لغو', teacher_phone: '09171114455' })).body as { data: { id: string } }).data;
    const link = ((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { id: string; code: string } }).data;

    const first = await bot(A, tx(`/link ${link.code}`, CHAT_TEACHER1));
    expect(first.reply).toContain('اتصال با موفقیت');

    await manager.delete(`/api/notifications/class-links/${link.id}`);

    const same = await bot(A, tx(`/link ${link.code}`, CHAT_TEACHER1));
    expect(same.reply).toContain('معتبر نیست');
    const fresh = await bot(A, tx(`/link ${link.code}`, CHAT_TEACHER2));
    expect(fresh.reply).toContain('معتبر نیست');
  });

  it('کد ناشناس — همچنان «معتبر نیست»', async () => {
    const res = await bot(A, tx('/link NOPE99', CHAT_PARENT1));
    expect(res.reply).toContain('معتبر نیست');
  });

  it('دیپ‌لینک — /start CODE برای کد خانواده اتصال انجام می‌دهد', async () => {
    const kid = await createStudent(manager, { first_name: 'کیانا', last_name: 're126', guardian_phone: '09361110003' });
    const code = (((await manager.post('/api/notifications/links', { student_id: kid.id })).body as { data: { code: string } }).data).code;

    const res = await bot(A, tx(`/start ${code}`, CHAT_PARENT2));
    expect(res.reply).toContain('اتصال با موفقیت');

    const prefs = await manager.get(`/api/notifications/prefs/${kid.id}`);
    expect((prefs.body as { data: { chatId: string | null } }).data.chatId).toBe('7602');
  });
});
