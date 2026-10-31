import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent
} from '../../test/harness';

// بازگردانی بخش «مدیریت قالب‌ها» (ریشهٔ باگ: روت‌های /api/pathway-templates و جلسات مسیر
// در بازسازی باندل از src در از دست رفته بودند — پاریسی با باندل اصلی )

interface TemplateBody {
  key: string;
  title: string;
  description: string | null;
  protocol: string | null;
  targetKey: string | null;
  steps: { key: string; title: string; hint?: string | null }[];
  sessions: { title: string; items: { type: string; text: string }[] }[];
  isSystem: boolean;
  active: boolean;
  createdBy: string | null;
}

interface SessionBody {
  id: string;
  pathwayId: string;
  ord: number;
  title: string;
  plan: string | null;
  items: { type: string; text: string }[];
  status: string;
  doneAt: string | null;
  note: string | null;
}

interface PathBody {
  id: string;
  targetKey: string;
  status: string;
  steps: { key: string; title: string; doneAt: string | null }[];
  templateKey: string | null;
  templateTitle: string | null;
  sessions: SessionBody[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('مدیریت قالب‌های مسیر (CRUD /api/pathway-templates)', () => {
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

  const SESSIONS = [
    {
      title: 'جلسهٔ ۱ — آشنایی و ارزیابی پایه',
      items: [
        { type: 'exercise', text: 'تمرین آگاهی واجی — حذف صدای اول واژه' },
        { type: 'event', text: 'پروب خواندن کلمات' }
      ]
    },
    { title: 'جلسهٔ ۲ — تمرین ساختمان واژه', items: [{ type: 'homework', text: 'برگهٔ تمرین خانواده + ثبت زمان' }] }
  ];

  it('فهرست خالی → ۲۰۰', async () => {
    const res = await ali.get('/api/pathway-templates');
    expect(res.status).toBe(200);
    expect(dataOf<TemplateBody[]>(res)).toHaveLength(0);
  });

  it('ساخت قالب با جلسات → ۲۰۱ + summary کامل؛ RBAC منشی ۴۰۳؛ درمانگر دیگر ۲۰۱', async () => {
    const res = await ali.post('/api/pathway-templates', {
      key: 'tpl-reading-cycle-8',
      title: 'چرخهٔ هشت‌جلسه‌ای خواندن',
      description: 'گام‌ها + پروتکل جلسه به جلسهٔ خواندن',
      protocol: 'learning',
      target_key: 'dyslexia',
      steps: [{ key: 'observe', title: 'مشاهدهٔ پایه' }, { key: 'assess', title: 'ارزیابی دقیق' }],
      sessions: SESSIONS
    });
    expect(res.status).toBe(201);
    const tpl = dataOf<TemplateBody>(res);
    expect(tpl.key).toBe('tpl-reading-cycle-8');
    expect(tpl.targetKey).toBe('dyslexia');
    expect(tpl.isSystem).toBe(false);
    expect(tpl.active).toBe(true);
    expect(tpl.steps).toHaveLength(2);
    expect(tpl.sessions).toHaveLength(2);
    expect(tpl.sessions[0].items).toHaveLength(2);

    const byOther = await maryam.post('/api/pathway-templates', {
      key: 'tpl-attention-loop',
      title: 'حلقهٔ توجه — شش جلسه',
      protocol: 'mental_ot',
      target_key: 'adhd',
      sessions: [{ title: 'جلسهٔ ۱ — بازی توجه', items: [] }]
    });
    expect(byOther.status).toBe(201);

    expect((await sec.post('/api/pathway-templates', { key: 'tpl-sec', title: 'قالب منشی' })).status).toBe(403);
  });

  it('کلید تکراری → ۴۰۹ (رفتار تلاش مجدد خودکار کلید در فرانت)؛ کلید/هدف نامعتبر → ۴۰۰', async () => {
    const dup = await mgr.post('/api/pathway-templates', {
      key: 'tpl-reading-cycle-8',
      title: 'تلاش روی کلید موجود'
    });
    expect(dup.status).toBe(409);

    expect((await mgr.post('/api/pathway-templates', { key: 'TPL-UPPER', title: 'کلید بزرگ' })).status).toBe(400);
    expect((await mgr.post('/api/pathway-templates', { key: 'ab', title: 'کلید کوتاه' })).status).toBe(400);
    expect((await mgr.post('/api/pathway-templates', { key: 'tpl-ok-key', title: 'هدف قلابی', target_key: 'nope' })).status).toBe(400);
    expect((await mgr.post('/api/pathway-templates', { key: 'tpl-ok-key', title: 'پروتکل قلابی', protocol: 'magic' })).status).toBe(400);
  });

  it('ویرایش قالب (عنوان/جلسات) → ۲۰۰ + ماندگاری؛ حذف با active:false → از فهرست می‌افتد؛ قالب غایب ۴۰۴', async () => {
    const upd = await ali.patch('/api/pathway-templates/tpl-reading-cycle-8', {
      title: 'چرخهٔ هشت‌جلسه‌ای خواندن (ویرایش‌شده)',
      sessions: [...SESSIONS, { title: 'جلسهٔ ۳ — روان‌خوانی', items: [] }]
    });
    expect(upd.status).toBe(200);
    const updBody = dataOf<TemplateBody>(upd);
    expect(updBody.title).toContain('ویرایش‌شده');
    expect(updBody.sessions).toHaveLength(3);
    // ویرایش بدون sessions — جلسات قبلی دست‌نخورده می‌ماند
    const keep = await ali.patch('/api/pathway-templates/tpl-reading-cycle-8', { title: 'چرخهٔ خواندن — نهایی' });
    expect(dataOf<TemplateBody>(keep).sessions).toHaveLength(3);

    expect((await ali.patch('/api/pathway-templates/tpl-nope', { title: 'ناموجود' })).status).toBe(404);

    const off = await ali.patch('/api/pathway-templates/tpl-attention-loop', { title: 'حلقهٔ توجه — شش جلسه', active: false });
    expect(off.status).toBe(200);
    expect(dataOf<TemplateBody>(off).active).toBe(false);
    const list = dataOf<TemplateBody[]>(await mgr.get('/api/pathway-templates'));
    expect(list.some((t) => t.key === 'tpl-attention-loop')).toBe(false);
    expect(list.some((t) => t.key === 'tpl-reading-cycle-8')).toBe(true);
  });

  it('audit — pathway_template.create و pathway_template.update', async () => {
    const rows = A.sql
      .prepare(`SELECT action, resource_type FROM audit_log WHERE action LIKE 'pathway_template.%' ORDER BY rowid`)
      .all() as Array<{ action: string; resource_type: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) {
      expect(r.resource_type).toBe('pathway_template');
    }
    expect(rows.some((r) => r.action === 'pathway_template.create')).toBe(true);
    expect(rows.some((r) => r.action === 'pathway_template.update')).toBe(true);
  });
});

describe('ساخت مسیر از قالب + پروتکل جلسه‌به‌جلسه', () => {
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

    const tpl = await ali.post('/api/pathway-templates', {
      key: 'tpl-dsl-path',
      title: 'مسیر نارساخوانی — ده جلسه',
      protocol: 'learning',
      target_key: 'dyslexia',
      steps: [{ key: 'observe', title: 'مشاهدهٔ پایه' }, { key: 'intervene', title: 'مداخلهٔ ساختارشکن' }],
      sessions: [
        { title: 'جلسهٔ ۱ — ارزیابی پایه', items: [{ type: 'exercise', text: 'آگاهی واجی' }, { type: 'game', text: 'کارت‌های هم‌خانواده' }] },
        { title: 'جلسهٔ ۲ — شروع مداخله', items: [{ type: 'homework', text: 'تمرین خانگی' }] }
      ]
    });
    expect(tpl.status).toBe(201);
  });

  it('ساخت مسیر از قالب → گام‌ها و جلسات قالب کپی می‌شود + templateTitle', async () => {
    const studentId = (await createStudent(ali)).id;
    const res = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl-dsl-path' });
    expect(res.status).toBe(201);
    const path = dataOf<PathBody>(res);
    expect(path.templateKey).toBe('tpl-dsl-path');
    expect(path.templateTitle).toBe('مسیر نارساخوانی — ده جلسه');
    expect(path.targetKey).toBe('dyslexia'); // هدف پیش‌فرض قالب
    expect(path.status).toBe('suggested');
    expect(path.steps.map((s) => s.key)).toEqual(['observe', 'intervene']); // گام‌های قالب، نه گام‌های پیش‌فرض هدف
    expect(path.sessions).toHaveLength(2);
    expect(path.sessions[0].title).toBe('جلسهٔ ۱ — ارزیابی پایه');
    expect(path.sessions[0].status).toBe('planned');
    expect(path.sessions[0].items.map((i) => i.type)).toEqual(['exercise', 'game']);
    expect(path.sessions.map((s) => s.ord)).toEqual([1, 2]);
  });

  it('قالب بی‌هدف → بدون target_key خطا؛ با target_key هدف انتخابی می‌نشیند؛ قالب ناموجود ۴۰۰', async () => {
    await ali.post('/api/pathway-templates', { key: 'tpl-no-target', title: 'قالب بی‌هدف', sessions: [{ title: 'جلسهٔ ۱', items: [] }] });

    const studentId = (await createStudent(ali)).id;
    const noTarget = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl-no-target' });
    expect(noTarget.status).toBe(400);

    const withTarget = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl-no-target', target_key: 'adhd' });
    expect(withTarget.status).toBe(201);
    expect(dataOf<PathBody>(withTarget).targetKey).toBe('adhd');

    expect((await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl-ghost' })).status).toBe(400);
    // نه هدف نه قالب → ۴۰۰ (superRefine)
    expect((await ali.post(`/api/students/${studentId}/clinical-paths`, {})).status).toBe(400);
  });

  it('جلسه‌ها: افزودن/انجام/بازگشت/ویرایش/حذف + RBAC + مسیر بسته ۴۰۹', async () => {
    const studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl-dsl-path' });
    const path = dataOf<PathBody>(created);

    // افزودن جلسهٔ جدید — آیتم نامعتبر در سطح اسکیمای ورودی ۴۰۰ می‌گیرد
    const badItems = await ali.post(`/api/clinical-paths/${path.id}/sessions`, {
      title: 'جلسهٔ نامعتبر',
      items: [{ type: 'nope', text: 'دور انداخته شود' }]
    });
    expect(badItems.status).toBe(400);

    const add = await ali.post(`/api/clinical-paths/${path.id}/sessions`, {
      title: 'جلسهٔ ۳ — جمع‌بندی',
      plan: 'بازبینی پیشرفت',
      items: [{ type: 'instruction', text: 'متن جلسه آماده شود' }]
    });
    expect(add.status).toBe(201);
    const added = dataOf<SessionBody>(add);
    expect(added.ord).toBe(3);
    expect(added.items).toHaveLength(1);
    expect(added.items[0].type).toBe('instruction');

    // انجام جلسه → doneAt؛ بازگشت → planned و doneAt خالی
    const done = await ali.patch(`/api/clinical-paths/${path.id}/sessions/${added.id}`, { status: 'done' });
    expect(done.status).toBe(200);
    expect(dataOf<SessionBody>(done).status).toBe('done');
    expect(dataOf<SessionBody>(done).doneAt).toBeTruthy();
    const undo = await ali.patch(`/api/clinical-paths/${path.id}/sessions/${added.id}`, { status: 'planned' });
    expect(dataOf<SessionBody>(undo).doneAt).toBeNull();

    // ویرایش عنوان/آیتم‌ها
    const edit = await ali.patch(`/api/clinical-paths/${path.id}/sessions/${added.id}`, {
      title: 'جلسهٔ ۳ — جمع‌بندی و گزارش',
      items: [{ type: 'event', text: 'پروب خواندن متن' }]
    });
    expect(dataOf<SessionBody>(edit).title).toContain('گزارش');
    expect(dataOf<SessionBody>(edit).items).toHaveLength(1);
    expect(dataOf<SessionBody>(edit).items[0].type).toBe('event');

    // جلسهٔ قالب بدون تغییر — دست‌نخورده
    const list = dataOf<PathBody[]>(await ali.get(`/api/students/${studentId}/clinical-paths`));
    expect(list[0].sessions).toHaveLength(3);

    // چک RBAC (دسترسی نقش‌محور)
    expect((await sec.post(`/api/clinical-paths/${path.id}/sessions`, { title: 'جلسهٔ منشی' })).status).toBe(403);
    expect((await maryam.post(`/api/clinical-paths/${path.id}/sessions`, { title: 'جلسهٔ درمانگر دیگر' })).status).toBe(403);
    expect((await maryam.patch(`/api/clinical-paths/${path.id}/sessions/${added.id}`, { status: 'done' })).status).toBe(403);
    expect((await mgr.patch(`/api/clinical-paths/${path.id}/sessions/${added.id}`, { status: 'done' })).status).toBe(200);
    expect((await ali.delete(`/api/clinical-paths/${path.id}/sessions/${added.id}`)).status).toBe(200);
    expect((await ali.delete(`/api/clinical-paths/${path.id}/sessions/99999999-0000-0000-0000-000000000009`)).status).toBe(404);

    // مسیر بسته → افزودن ۴۰۹
    const p2 = dataOf<PathBody>(await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl-dsl-path' }));
    await ali.post(`/api/clinical-paths/${p2.id}/decision`, { action: 'reject', note: 'بستن برای آزمون' });
    expect((await ali.post(`/api/clinical-paths/${p2.id}/sessions`, { title: 'جلسهٔ ممنوع' })).status).toBe(409);
  });

  it('audit — session_add/session_update/session_delete روی مسیر', async () => {
    const studentId = (await createStudent(ali)).id;
    const path = dataOf<PathBody>(await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl-dsl-path' }));
    const s = dataOf<SessionBody>(await ali.post(`/api/clinical-paths/${path.id}/sessions`, { title: 'جلسهٔ آزمایشی' }));
    await ali.patch(`/api/clinical-paths/${path.id}/sessions/${s.id}`, { status: 'done' });
    await ali.delete(`/api/clinical-paths/${path.id}/sessions/${s.id}`);
    const rows = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND action LIKE 'clinical_path.session%' ORDER BY rowid`)
      .all(path.id) as Array<{ action: string }>;
    expect(rows.map((r) => r.action)).toEqual(['clinical_path.session_add', 'clinical_path.session_update', 'clinical_path.session_delete']);
  });
});
