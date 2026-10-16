/**
 * تست‌های e2e — followups
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-followups.test.ts — فاز ۳ (بنیاد پیگیری): ساخت/خواندن RBAC، ماتریس ترنزیشن،
// مالکیت ویرایش (مسئول/مدیر/منشی)، audit (created/updated/completed)، گروه‌بندی §13.4
// با مرزهای تهران، mine=1 و فیلتر موجودیت — overdue کاملاً computed است (بدون ستون)

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  ALI_ID,
  MARYAM_ID,
  SECRETARY_ID,
  STUDENT1_ID
} from '../../test/harness';

interface FollowUpBody {
  id: string;
  entityType: string;
  entityId: string;
  studentId: string | null;
  studentName: string | null;
  title: string;
  assigneeId: string;
  assigneeName: string | null;
  dueAt: string | null;
  status: string;
  completedAt: string | null;
}

function fuOf(res: { body: unknown }): FollowUpBody {
  return (res.body as { data: FollowUpBody }).data;
}

function listOf(res: { body: unknown }): FollowUpBody[] {
  return (res.body as { data: FollowUpBody[] }).data;
}

const DAY = 24 * 60 * 60 * 1000;

async function createFu(api: Api, overrides: Record<string, unknown> = {}): Promise<FollowUpBody> {
  const res = await api.post('/api/followups', {
    entity_type: 'student',
    entity_id: STUDENT1_ID,
    title: 'تماس با خانواده برای پیگیری تمرین‌ها',
    assignee_id: SECRETARY_ID,
    ...overrides
  });
  expect(res.status).toBe(201);
  return fuOf(res);
}

function auditRows(A: ReturnType<typeof createTestApp>, fuId: string) {
  return A.sql
    .prepare(`SELECT action, changes FROM audit_log WHERE resource_id = ? AND resource_type = 'followup' ORDER BY rowid`)
    .all(fuId) as Array<{ action: string; changes: string | null }>;
}

describe('فاز ۳ — ساخت، خواندن و RBAC', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
  });

  it('ساخت توسط مدیر — 201، وضعیت open، مهلت پیش‌فرض +۷ روز نرمال‌شده (ISO.000Z)', async () => {
    const before = Date.now();
    const fu = await createFu(mgr);
    const after = Date.now();

    expect(fu.status).toBe('open');
    expect(fu.dueAt).toBeTruthy();
    // نرمال‌سازی toISOString — قالب یکنواخت با میلی‌ثانیه (مقایسهٔ رشته‌ای مرزها معتبر می‌ماند)
    expect(fu.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(fu.dueAt as string)).toBeGreaterThanOrEqual(before + 7 * DAY - 1000);
    expect(Date.parse(fu.dueAt as string)).toBeLessThanOrEqual(after + 7 * DAY + 1000);
  });

  it('ساخت با student_id و مهلت صریح — نام دانش‌آموز/مسئول از join؛ due_at نرمال می‌شود', async () => {
    const fu = await createFu(mgr, {
      student_id: STUDENT1_ID,
      assignee_id: SECRETARY_ID,
      due_at: '2026-10-10T12:30:00Z' // بدون میلی‌ثانیه — باید نرمال شود
    });
    expect(fu.studentId).toBe(STUDENT1_ID);
    expect(fu.studentName).toContain('علی');
    expect(fu.assigneeId).toBe(SECRETARY_ID);
    expect(fu.assigneeName).toContain('زهرا');
    expect(fu.dueAt).toBe('2026-10-10T12:30:00.000Z');
  });

  it('RBAC — درمانگر POST 403؛ خواندن برای همهٔ نقش‌های داخلی آزاد', async () => {
    const denied = await ali.post('/api/followups', {
      entity_type: 'student',
      entity_id: STUDENT1_ID,
      title: 'درمانگر نمی‌سازد مستقیم',
      assignee_id: ALI_ID
    });
    expect(denied.status).toBe(403);

    for (const client of [mgr, sec, ali]) {
      const list = await client.get('/api/followups');
      expect(list.status).toBe(200);
    }
  });

  it('اعتبارسنجی — entity_type ناشناس/عنوان کوتاه/due_at غیرISO → 400؛ مسئول ناموجود → 404', async () => {
    const badEntity = await mgr.post('/api/followups', {
      entity_type: 'todo', entity_id: 'x1', title: 'عنوان معتبر', assignee_id: SECRETARY_ID
    });
    expect(badEntity.status).toBe(400);

    const badTitle = await mgr.post('/api/followups', {
      entity_type: 'student', entity_id: STUDENT1_ID, title: 'ک', assignee_id: SECRETARY_ID
    });
    expect(badTitle.status).toBe(400);

    const badDue = await mgr.post('/api/followups', {
      entity_type: 'student', entity_id: STUDENT1_ID, title: 'عنوان معتبر', assignee_id: SECRETARY_ID, due_at: 'دیروز'
    });
    expect(badDue.status).toBe(400);

    const badAssignee = await mgr.post('/api/followups', {
      entity_type: 'student', entity_id: STUDENT1_ID, title: 'عنوان معتبر', assignee_id: '99999999-9999-4999-8999-999999999999'
    });
    expect(badAssignee.status).toBe(404);
  });
});

describe('فاز ۳ — ویرایش، ماتریس ترنزیشن و مالکیت', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let maryam: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    maryam = new Api(A, await loginToken(A, 'maryam'));
  });

  it('مسیر کامل open→in_progress→done — completed_at ثبت و audit completed می‌آید', async () => {
    const fu = await createFu(mgr, { assignee_id: ALI_ID });

    const started = await sec.patch(`/api/followups/${fu.id}`, { status: 'in_progress' });
    expect(started.status).toBe(200);
    expect(fuOf(started).status).toBe('in_progress');

    const done = await mgr.patch(`/api/followups/${fu.id}`, { status: 'done' });
    expect(done.status).toBe(200);
    const body = fuOf(done);
    expect(body.status).toBe('done');
    expect(body.completedAt).toBeTruthy();

    const rows = auditRows(A, fu.id);
    expect(rows.map((r) => r.action)).toEqual(['followup.created', 'followup.updated', 'followup.completed']);
    const completedChanges = JSON.parse(rows[2].changes ?? '{}') as { status?: { from: string; to: string } };
    expect(completedChanges.status).toEqual({ from: 'in_progress', to: 'done' });
  });

  it('پایان‌حالت بسته است — done→open و done→in_progress هر دو 409؛ تکرار همان وضعیت no-op بدون audit', async () => {
    const fu = await createFu(mgr);
    await sec.patch(`/api/followups/${fu.id}`, { status: 'done' });
    expect(auditRows(A, fu.id)).toHaveLength(2); // created + completed

    const reopen = await mgr.patch(`/api/followups/${fu.id}`, { status: 'open' });
    expect(reopen.status).toBe(409);

    const restart = await mgr.patch(`/api/followups/${fu.id}`, { status: 'in_progress' });
    expect(restart.status).toBe(409);

    const same = await mgr.patch(`/api/followups/${fu.id}`, { status: 'done' });
    expect(same.status).toBe(200);
    expect(auditRows(A, fu.id)).toHaveLength(2); // audit اضافه نشد
  });

  it('مالکیت ویرایش — خودِ مسئولِ درمانگر 200؛ درمانگرِ غیرمسئول 403؛ منشی/مدیر همیشه مجاز', async () => {
    const fu = await createFu(mgr, { assignee_id: ALI_ID });

    const byAssignee = await ali.patch(`/api/followups/${fu.id}`, { status: 'in_progress' });
    expect(byAssignee.status).toBe(200);

    const byOtherTherapist = await maryam.patch(`/api/followups/${fu.id}`, { status: 'done' });
    expect(byOtherTherapist.status).toBe(403);

    const bySec = await sec.patch(`/api/followups/${fu.id}`, { status: 'done' });
    expect(bySec.status).toBe(200);
    expect(fuOf(bySec).status).toBe('done');
  });

  it('تغییر مسئول و حذف مهلت — در یک PATCH با audit updated و changes کامل', async () => {
    const fu = await createFu(mgr, { assignee_id: ALI_ID });
    const res = await sec.patch(`/api/followups/${fu.id}`, { assignee_id: MARYAM_ID, due_at: null });
    expect(res.status).toBe(200);
    const body = fuOf(res);
    expect(body.assigneeId).toBe(MARYAM_ID);
    expect(body.dueAt).toBeNull();

    const rows = auditRows(A, fu.id);
    expect(rows[rows.length - 1].action).toBe('followup.updated');
    const changes = JSON.parse(rows[rows.length - 1].changes ?? '{}') as Record<string, { from: unknown; to: unknown }>;
    expect(changes.assignee_id).toEqual({ from: ALI_ID, to: MARYAM_ID });
    expect(changes.due_at?.to).toBeNull();
  });

  it('PATCH خالی 400 (refine)؛ id ناموجود — GET و PATCH هر دو 404', async () => {
    const empty = await mgr.patch(`/api/followups/${(await createFu(mgr)).id}`, {});
    expect(empty.status).toBe(400);

    const ghost = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect((await mgr.get(`/api/followups/${ghost}`)).status).toBe(404);
    expect((await mgr.patch(`/api/followups/${ghost}`, { status: 'done' })).status).toBe(404);
  });
});

describe('فاز ۳ — گروه‌بندی §13.4، mine و فیلتر موجودیت', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let ali: Api;
  let fOver: FollowUpBody;
  let fWeek: FollowUpBody;
  let fFuture: FollowUpBody;
  let fNoDue: FollowUpBody;
  let fWaitlist: FollowUpBody;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    ali = await asRole(A, 'therapist');

    fOver = await createFu(mgr, { title: 'پیگیری عقب‌افتاده', due_at: '2020-01-01T00:00:00.000Z' });
    fWeek = await createFu(mgr, { title: 'پیگیری این هفته', assignee_id: ALI_ID, due_at: new Date(Date.now() + 3 * DAY).toISOString() });
    fFuture = await createFu(mgr, { title: 'پیگیری دور', assignee_id: ALI_ID, due_at: new Date(Date.now() + 30 * DAY).toISOString() });
    fNoDue = await createFu(mgr, { title: 'پیگیری بی‌مهلت', due_at: null });
    fWaitlist = await createFu(mgr, { title: 'پیگیری متقاضی', entity_type: 'waitlist', entity_id: 'wl-fixture-1' });
  });

  it('mine=1 — فقط پیگیری‌های روی میزِ خودِ کاربر', async () => {
    const mine = await ali.get('/api/followups?mine=1');
    expect(mine.status).toBe(200);
    const ids = listOf(mine).map((f) => f.id);
    expect(ids).toContain(fWeek.id);
    expect(ids).toContain(fFuture.id);
    expect(ids).not.toContain(fOver.id);
    expect(ids).not.toContain(fNoDue.id);
    expect(ids).not.toContain(fWaitlist.id);
  });

  it('group=overdue — فقط مهلت‌گذشته‌ها (computed؛ بدون ستون)', async () => {
    const res = await mgr.get('/api/followups?group=overdue');
    const ids = listOf(res).map((f) => f.id);
    expect(ids).toContain(fOver.id);
    expect(ids).not.toContain(fWeek.id);
    expect(ids).not.toContain(fFuture.id);
    expect(ids).not.toContain(fNoDue.id); // بی‌مهلت overdue نمی‌شود
  });

  it('group=week و group=future — مرزهای +۷ روز تهران', async () => {
    const week = listOf(await mgr.get('/api/followups?group=week')).map((f) => f.id);
    expect(week).toContain(fWeek.id);
    expect(week).not.toContain(fOver.id);
    expect(week).not.toContain(fFuture.id);

    const future = listOf(await mgr.get('/api/followups?group=future')).map((f) => f.id);
    expect(future).toContain(fFuture.id);
    expect(future).not.toContain(fWeek.id);
  });

  it('group=open (پیش‌فرض بدون group) — همهٔ بازها از جمله بی‌مهلت‌ها', async () => {
    for (const url of ['/api/followups?group=open', '/api/followups']) {
      const res = await mgr.get(url);
      expect(res.status).toBe(200);
      const ids = listOf(res).map((f) => f.id);
      for (const f of [fOver, fWeek, fFuture, fNoDue, fWaitlist]) {
        expect(ids).toContain(f.id);
      }
    }
  });

  it('فیلتر موجودیت — entity_type/entity_id با هم؛ GET تکی هم 200', async () => {
    const res = await mgr.get('/api/followups?entity_type=waitlist&entity_id=wl-fixture-1');
    const items = listOf(res);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(fWaitlist.id);
    expect(items[0].entityType).toBe('waitlist');

    const single = await mgr.get(`/api/followups/${fOver.id}`);
    expect(single.status).toBe(200);
    expect(fuOf(single).title).toBe('پیگیری عقب‌افتاده');
  });
});
