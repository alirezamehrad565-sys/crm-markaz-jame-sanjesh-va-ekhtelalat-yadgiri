import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, MANAGER_ID, SECRETARY_ID, ALI_ID } from '../../test/harness';

interface TodoBody {
  id: string;
  title: string;
  note: string | null;
  checklist: { text: string; done: boolean }[] | null;
  assignerId: string;
  assignerName: string | null;
  assigneeId: string;
  assigneeName: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  deletedAt: string | null;
}

interface BadgeBody {
  urgent: number;
  overdue: number;
  attention: number;
}

function todoOf(res: { body: unknown }): TodoBody {
  return (res.body as { data: TodoBody }).data;
}

function listBody(res: { body: unknown }): { data: TodoBody[]; badge: BadgeBody } {
  return res.body as { data: TodoBody[]; badge: BadgeBody };
}

const PAST_DUE = '2026-01-01T00:00:00.000Z';
const FUTURE_DUE = '2026-12-01T10:00:00.000Z';

let manager: Api;
let secretary: Api;
let therapist: Api;

beforeAll(async () => {
  const A = createTestApp();
  manager = await asRole(A, 'manager');
  secretary = await asRole(A, 'secretary');
  therapist = await asRole(A, 'therapist');
});

async function createTodo(api: Api, overrides: Record<string, unknown> = {}): Promise<TodoBody> {
  const res = await api.post('/api/todos', {
    title: 'تماس با مدرسه برای هماهنگی جلسهٔ اولیا',
    assignee_id: SECRETARY_ID,
    ...overrides
  });
  expect(res.status).toBe(201);
  return todoOf(res);
}

function auditRows(A: ReturnType<typeof createTestApp>, todoId: string) {
  return A.sql
    .prepare(`SELECT action, changes FROM audit_log WHERE resource_id = ? AND resource_type = 'todo' ORDER BY rowid`)
    .all(todoId) as { action: string; changes: string }[];
}

describe('فاز ۴ — ساخت کار و قواعد نقش §9', () => {
  it('T1: مدیر برای منشی کار می‌سازد — 201 با شکل کامل پاسخ (pending/normal)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await createTodo(m, { note: 'قبل از ساعت ۱۲ هماهنگی شود', priority: 'urgent' });
    expect(t.status).toBe('pending');
    expect(t.priority).toBe('urgent');
    expect(t.assigneeId).toBe(SECRETARY_ID);
    expect(t.assigneeName).toContain('زهرا');
    expect(t.assignerId).toBe(MANAGER_ID);
    expect(t.dueAt).toBeNull();
    expect(t.completedAt).toBeNull();
    expect(t.deletedAt).toBeNull();
  });

  it('T2: کار شخصی (گیرنده = خودم) — 201 ؛ در inbox و outbox خودِ بازیگر + بدون اعلان', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const res = await m.post('/api/todos', { title: 'کار شخصی من', assignee_id: MANAGER_ID });
    expect(res.status).toBe(201);
    const t = todoOf(res);
    expect(t.assigneeId).toBe(MANAGER_ID);
    expect(t.assignerId).toBe(MANAGER_ID);
    expect(listBody(await m.get('/api/todos?box=inbox')).data.some((x) => x.id === t.id)).toBe(true);
    expect(listBody(await m.get('/api/todos?box=outbox')).data.some((x) => x.id === t.id)).toBe(true);
    expect(A.sql.prepare(`SELECT id FROM notifications WHERE template = 'todo_assigned'`).all().length).toBe(0);
  });

  it('T3: گیرندهٔ درمانگر رد می‌شود — 400 (جفت فقط منشی↔مدیر)', async () => {
    const res = await manager.post('/api/todos', { title: 'کار اشتباه', assignee_id: ALI_ID });
    expect(res.status).toBe(400);
  });

  it('T4: گیرندهٔ ناموجود — 404', async () => {
    const res = await manager.post('/api/todos', { title: 'کار گم', assignee_id: '00000000-0000-4000-8000-00000000dead' });
    expect(res.status).toBe(404);
  });

  it('T5: درمانگر در همهٔ endpointها 403 است — خواندن و ساخت (requireRole قبل از هندلر)', async () => {
    const read = await therapist.get('/api/todos?box=inbox');
    expect(read.status).toBe(403);
    const post = await therapist.post('/api/todos', { title: 'کار درمانگر', assignee_id: SECRETARY_ID });
    expect(post.status).toBe(403);
  });

  it('T6: عنوان کوتاه/غایب — 400', async () => {
    expect((await manager.post('/api/todos', { title: 'خ', assignee_id: SECRETARY_ID })).status).toBe(400);
    expect((await manager.post('/api/todos', { assignee_id: SECRETARY_ID })).status).toBe(400);
  });
});

describe('فاز ۴ — صندوق‌ها و badge', () => {
  it('T7: inbox/outbox قرینهٔ هم‌اند — منشی فقط دریافتی‌اش، مدیر فقط واگذارشده‌اش را می‌بیند', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const mine = await createTodo(m, { title: 'کار واگذاری برای تست صندوق' });

    const outbox = listBody(await m.get('/api/todos?box=outbox'));
    expect(outbox.data.some((t) => t.id === mine.id)).toBe(true);
    expect(outbox.data.every((t) => t.assignerId === MANAGER_ID)).toBe(true);

    const inbox = listBody(await s.get('/api/todos?box=inbox'));
    expect(inbox.data.some((t) => t.id === mine.id)).toBe(true);
    expect(inbox.data.every((t) => t.assigneeId === SECRETARY_ID)).toBe(true);

    expect(listBody(await m.get('/api/todos?box=inbox')).data.some((t) => t.id === mine.id)).toBe(false);
    expect(listBody(await s.get('/api/todos?box=outbox')).data.some((t) => t.id === mine.id)).toBe(false);
  });

  it('T8: badge = شمارش فوری/عقب‌افتاده/توجهِ یکتا در inbox (computed، بدون ستون)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    await createTodo(m, { title: 'فوری آینده', priority: 'urgent', due_at: FUTURE_DUE });
    await createTodo(m, { title: 'عقب‌افتادهٔ عادی', due_at: PAST_DUE });
    await createTodo(m, { title: 'فوریِ عقب‌افتاده', priority: 'urgent', due_at: PAST_DUE });
    await createTodo(m, { title: 'عادی آینده', due_at: FUTURE_DUE });
    const done = await createTodo(m, { title: 'انجام‌شدهٔ فوری', priority: 'urgent' });
    expect((await s.post(`/api/todos/${done.id}/complete`)).status).toBe(200); // انجام‌شده از badge خارج

    const inbox = listBody(await s.get('/api/todos?box=inbox'));
    expect(inbox.badge).toEqual({ urgent: 2, overdue: 2, attention: 3 });
  });
});

describe('فاز ۴ — ویرایش inline و مالکیت', () => {
  it('T9: ویرایش توسط ثبت‌کننده — 200 + نرمال‌سازی مهلتِ تاریخ خالی به پایان روز تهران', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await createTodo(m);
    const res = await m.patch(`/api/todos/${t.id}`, { title: 'عنوان تازه', priority: 'urgent', due_at: '2026-10-14' });
    expect(res.status).toBe(200);
    const updated = todoOf(res);
    expect(updated.title).toBe('عنوان تازه');
    expect(updated.priority).toBe('urgent');
    expect(updated.dueAt).toBe('2026-10-14T20:29:59.999Z');
    const audits = auditRows(A, t.id).map((r) => r.action);
    expect(audits).toEqual(['todo.created', 'todo.updated']);
  });

  it('T10: ویرایش توسط غیر ثبت‌کننده (حتی مسئولِ کار) — 403', async () => {
    const t = await createTodo(manager, {});
    const res = await secretary.patch(`/api/todos/${t.id}`, { title: 'دستکاری مسئول' });
    expect(res.status).toBe(403);
  });

  it('T11: PATCH بدون هیچ تغییر — no-op بدون audit اضافه', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await createTodo(m);
    const res = await m.patch(`/api/todos/${t.id}`, { title: t.title });
    expect(res.status).toBe(200);
    expect(auditRows(A, t.id).map((r) => r.action)).toEqual(['todo.created']);
  });

  it('T12: کار انجام‌شده ویرایش نمی‌شود — 409', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m);
    expect((await s.post(`/api/todos/${t.id}/complete`)).status).toBe(200);
    const res = await m.patch(`/api/todos/${t.id}`, { title: 'بعد از انجام' });
    expect(res.status).toBe(409);
  });
});

describe('فاز ۴ — تکمیل کار (complete)', () => {
  it('T13: فقط مسئول انجام می‌تواند — منشی 200 + completed_at + audit todo.completed', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m);
    const res = await s.post(`/api/todos/${t.id}/complete`);
    expect(res.status).toBe(200);
    const done = todoOf(res);
    expect(done.status).toBe('done');
    expect(done.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const audits = auditRows(A, t.id);
    expect(audits.map((r) => r.action)).toEqual(['todo.created', 'todo.completed']);
    expect(JSON.parse(audits[1].changes)).toMatchObject({ status: { from: 'pending', to: 'done' } });
  });

  it('T14: تکمیل توسط غیرمسئول (ثبت‌کننده) — 403', async () => {
    const t = await createTodo(manager, {});
    expect((await manager.post(`/api/todos/${t.id}/complete`)).status).toBe(403);
  });

  it('T15: تکمیل دوباره — 409 (پایان‌حالت بسته)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m);
    expect((await s.post(`/api/todos/${t.id}/complete`)).status).toBe(200);
    expect((await s.post(`/api/todos/${t.id}/complete`)).status).toBe(409);
  });
});

describe('فاز ۴ — حذف نرم §28', () => {
  it('T16: deleted:true → از فهرست‌ها محو و PATCH بعدی 404؛ بدون حذف فیزیکی', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m);

    const del = await m.patch(`/api/todos/${t.id}`, { deleted: true });
    expect(del.status).toBe(200);
    expect(todoOf(del).deletedAt).not.toBeNull();

    expect(listBody(await s.get('/api/todos?box=inbox')).data.some((x) => x.id === t.id)).toBe(false);
    expect(listBody(await m.get('/api/todos?box=outbox')).data.some((x) => x.id === t.id)).toBe(false);

    const again = await m.patch(`/api/todos/${t.id}`, { deleted: true });
    expect(again.status).toBe(404);

    const row = A.sql.prepare('SELECT deleted_at, status FROM todos WHERE id = ?').get(t.id) as { deleted_at: string; status: string };
    expect(row.status).toBe('pending');
    expect(row.deleted_at).not.toBeNull();
  });

  it('T17: حذف نرم توسط غیر ثبت‌کننده — 403', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m);
    expect((await s.patch(`/api/todos/${t.id}`, { deleted: true })).status).toBe(403);
  });
});

describe('فاز ۴ — چک‌لیست کار', () => {
  it('C1: ساخت کار با موارد اولیه — همهٔ done=false و به‌ترتیب', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const res = await m.post('/api/todos', {
      title: 'چک‌لیست بازدید مدرسه',
      assignee_id: MANAGER_ID,
      checklist: ['تماس با مدیر', 'بازدید کلاس‌ها', 'گزارش']
    });
    expect(res.status).toBe(201);
    expect(todoOf(res).checklist).toEqual([
      { text: 'تماس با مدیر', done: false },
      { text: 'بازدید کلاس‌ها', done: false },
      { text: 'گزارش', done: false }
    ]);
  });

  it('C2: تغییر وضعیت مورد — ثبت‌کننده و مسئول هر دو مجاز', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m, { checklist: ['مورد یک', 'مورد دو'] });
    expect((await s.post(`/api/todos/${t.id}/checklist`, { index: 0, done: true })).status).toBe(200);
    const listed = listBody(await m.get('/api/todos?box=outbox')).data.find((x) => x.id === t.id);
    expect(listed?.checklist?.[0]).toEqual({ text: 'مورد یک', done: true });
    expect(listed?.checklist?.[1]).toEqual({ text: 'مورد دو', done: false });
    expect((await m.post(`/api/todos/${t.id}/checklist`, { index: 0, done: false })).status).toBe(200);
  });

  it('C3: افزودن مورد از سمت مسئول — مورد تازه append می‌شود؛ تکراری 409', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m, { checklist: ['مورد یک'] });
    const res = await s.post(`/api/todos/${t.id}/checklist`, { text: 'مورد تازهٔ مسئول' });
    expect(res.status).toBe(200);
    expect(todoOf(res).checklist?.map((i) => i.text)).toEqual(['مورد یک', 'مورد تازهٔ مسئول']);
    expect((await s.post(`/api/todos/${t.id}/checklist`, { text: 'مورد یک' })).status).toBe(409);
  });

  it('C4: چک‌لیست کارِ انجام‌شده تغییر نمی‌کند — 409 (toggle و افزودن)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m, { checklist: ['مورد یک'] });
    expect((await s.post(`/api/todos/${t.id}/complete`)).status).toBe(200);
    expect((await s.post(`/api/todos/${t.id}/checklist`, { index: 0, done: true })).status).toBe(409);
    expect((await s.post(`/api/todos/${t.id}/checklist`, { text: 'دیگر دیر است' })).status).toBe(409);
  });

  it('C5: سقف ۲۰ مورد — مورد ۲۱ام 400', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const items = Array.from({ length: 20 }, (_, i) => `مورد ${i + 1}`);
    const t = await createTodo(m, { checklist: items });
    expect((await m.post(`/api/todos/${t.id}/checklist`, { text: 'مورد ۲۱' })).status).toBe(400);
  });

  it('C6: ویرایش با checklist (جایگزینی کامل) + حذف با null — فقط ثبت‌کننده', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await asRole(A, 'secretary');
    const t = await createTodo(m, { checklist: ['الف', 'ب'] });
    expect(
      (await s.patch(`/api/todos/${t.id}`, { checklist: [{ text: 'دستکاری', done: true }] })).status
    ).toBe(403);
    const res = await m.patch(`/api/todos/${t.id}`, {
      checklist: [
        { text: 'الف', done: true },
        { text: 'ج', done: false }
      ]
    });
    expect(res.status).toBe(200);
    expect(todoOf(res).checklist).toEqual([
      { text: 'الف', done: true },
      { text: 'ج', done: false }
    ]);
    expect(todoOf(await m.patch(`/api/todos/${t.id}`, { checklist: null })).checklist).toBeNull();
  });
});

describe('فاز ۴ — اعلان todo_assigned (§9.5)', () => {
  it('T18: با چت متصل بله (توکن نداریم → internal) رکورد صف با dedup todo+assignee ساخته می‌شود', async () => {
    const A = createTestApp();
    A.sql
      .prepare(
        `INSERT INTO staff_bot_links (id, code, staff_id, chat_id, status, created_by) VALUES ('sl-test', 'CODE99', ?, '9001', 'linked', ?)`
      )
      .run(SECRETARY_ID, MANAGER_ID);

    const m = await asRole(A, 'manager');
    const t = await createTodo(m, { title: 'کارِ دارای اعلان' });

    const rows = A.sql
      .prepare(`SELECT channel, template, recipient, staff_id, payload, dedup_key, status FROM notifications WHERE template = 'todo_assigned'`)
      .all() as { channel: string; template: string; recipient: string; staff_id: string; payload: string; dedup_key: string; status: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ channel: 'internal', recipient: '9001', staff_id: SECRETARY_ID, status: 'sent' });
    expect(rows[0].dedup_key).toBe(`todo-assigned:${t.id}:${SECRETARY_ID}`);
    const payload = JSON.parse(rows[0].payload) as { taskTitle: string; extra: string };
    expect(payload.taskTitle).toBe('کارِ دارای اعلان');
    expect(payload.extra).toContain('ثبت‌کننده');
  });

  it('T19: بدون لینک بله، رکورد بی‌مصرف ساخته نمی‌شود (قرارداد )', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    await createTodo(m, { title: 'کار بدون اعلان' });
    const rows = A.sql.prepare(`SELECT id FROM notifications WHERE template = 'todo_assigned'`).all();
    expect(rows.length).toBe(0);
  });
});
