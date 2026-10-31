import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET, asRole, createStudent } from '../../test/harness';
import type { Api } from '../../test/harness';

type Update = Record<string, unknown>;
type A = ReturnType<typeof createTestApp>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
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
const cb = (data: string, chatId: number): Update => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: { id: 'c1', data, message: { chat: { id: chatId } } }
});

const CHAT_TEACHER = 7501;
const CHAT_PARENT = 7502;
const CHAT_STAFF = 7503;
const CHAT_NONE = 7599;
const CHAT_STRANGER = 7511;

const ALI_NID = '3149977797';

describe('مدیریت کدهای اتصال معلم‌ها (مشاهده بدون تولید + لغو)', () => {
  let A: A;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('GET بدون class_id → همهٔ کدها با نام کلاس/مدرسه (فهرست مدیریت)', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان مدیریت ', kind: 'school', gender_type: 'female' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'دوم ب' })).body as { data: { id: string } }).data;
    await manager.post('/api/notifications/class-links', { class_id: cls.id });

    const all = await manager.get('/api/notifications/class-links?limit=200');
    expect(all.status).toBe(200);
    const rows = (all.body as { data: { classId: string; className?: string; schoolName?: string }[] }).data;
    const mine = rows.find((r) => r.classId === cls.id);
    expect(mine).toBeTruthy();
    expect(mine!.className).toBe('دوم ب');
    expect(mine!.schoolName).toBe('دبستان مدیریت ');
  });

  it('مشاهدهٔ کد فقط GET است — شمارش کدها تغییر نمی‌کند (بدون تولید خودکار)', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان مشاهده', kind: 'school', gender_type: 'mixed' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'سوم الف' })).body as { data: { id: string } }).data;
    await manager.post('/api/notifications/class-links', { class_id: cls.id });

    const before = (await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: unknown[] };
    const after = (await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: unknown[] };
    expect(after.data.length).toBe(before.data.length);
  });

  it('DELETE → کد لغو می‌شود؛ اتصال با آن شکست می‌خورد؛ idempotent', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان لغو', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'پنجم الف' })).body as { data: { id: string } }).data;
    const link = ((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { id: string; code: string } }).data;

    const del = await manager.delete(`/api/notifications/class-links/${link.id}`);
    expect(del.status).toBe(200);
    const rows = ((await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: { status: string }[] }).data;
    expect(rows[0].status).toBe('revoked');

    const tryLink = await bot(A, tx(`/link ${link.code}`, CHAT_STRANGER));
    expect(tryLink.reply).toContain('معتبر نیست');

    const again = await manager.delete(`/api/notifications/class-links/${link.id}`);
    expect(again.status).toBe(200);
  });

  it('تولید کد جدید پس از لغو (POST صریح) — فقط یک کدِ در انتظار', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان بازتولید', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'ششم الف' })).body as { data: { id: string } }).data;
    const first = ((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { id: string } }).data;
    await manager.delete(`/api/notifications/class-links/${first.id}`);
    const second = await manager.post('/api/notifications/class-links', { class_id: cls.id });
    expect(second.status).toBe(201);
    const rows = ((await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: { status: string }[] }).data;
    expect(rows.filter((r) => r.status === 'pending').length).toBe(1);
  });
});
