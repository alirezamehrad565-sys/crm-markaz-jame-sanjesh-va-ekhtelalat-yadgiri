import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';
import { cogPerfTypeFields, COG_PERF_TASKS, COG_PERF_DOMAINS } from '../../domain/case-events/pure';

interface CogPerfEvent {
  id: string;
  status: string;
  typeTitle: string;
  analysis: { score: number; band: string | null; maxScore: number; answered: number; total: number; flags?: { key: string; label: string; value: number }[]; interpretation?: string | null } | null;
  payload: Record<string, { value: string; label: string }> | null;
  summary: string | null;
}

const RAW_OF: Record<string, number> = {
  t01: 5, t02: 18, t03: 4, t04: 3, t05: 2, t06: 3, t07: 4, t08: 5, t09: 3, t10: 27, t11: 2, t12: 1
};

function allValid(): Record<string, string | number> {
  const v: Record<string, string | number> = {};
  for (const [k, n] of Object.entries(RAW_OF)) {
    v[`s_${k}`] = 'معتبر';
    v[`d_${k}`] = n;
  }
  v['p_t02'] = 'P1 — تکرار استاندارد';
  v['cond'] = 'کیت پایلوت نسخهٔ A — اتاق آرام';
  v['note'] = 'همکاری خوب — با تشویق کلامی ادامه داد';
  return v;
}

describe('ارزیابی شناختی — پروتکل عملکردی کاردرمانی ذهنی (m168)', () => {
  let A: ReturnType<typeof createTestApp>;
  let therapist: Api;
  let secretary: Api;
  let manager: Api;
  let studentId = '';

  beforeAll(async () => {
    A = createTestApp();
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'نگار', last_name: 'شناختیار', pathway: 'rehab' });
    studentId = s.id;
  });

  const postPerf = (values: unknown, api: Api = therapist) =>
    api.post(`/api/students/${studentId}/case-events/cog-perf`, { values });

  const countOf = (): number =>
    (A.sql.prepare(
      `SELECT COUNT(*) AS c FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id WHERE t.key = 'ce-rehab-cogperf-v1'`
    ).get() as { c: number }).c;

  it('نگاشت ۱۲ تکلیف به ۷ حیطه مطابق مشخصات — فیلدهای قالب کامل و بدون نشت', () => {
    expect(COG_PERF_TASKS.length).toBe(12);
    expect(COG_PERF_DOMAINS.map((d) => d.taskKeys.length).reduce((a, b) => a + b, 0)).toBe(12);
    expect(COG_PERF_DOMAINS.length).toBe(7);
    const fields = cogPerfTypeFields();
    expect(fields.length).toBe(45); // ۳۶ فیلد تکلیف + ۷ سطح توصیفی + شرایط + مشاهده = سقف FIELDS_MAX
    const keys = new Set(fields.map((f) => f.key));
    expect(keys.size).toBe(45);
  });

  it('ثبت کامل معتبر → ۲۰۱؛ باند آزمایشی، نسخهٔ الگوریتم، وضعیت اعتبار و payload برچسب‌دار + audit', async () => {
    expect(countOf()).toBe(0);
    const res = await postPerf(allValid());
    expect(res.status).toBe(201);
    const ev = (res.body as { data: CogPerfEvent }).data;

    expect(ev.status).toBe('completed');
    expect(ev.typeTitle).toContain('پروتکل عملکردی کاردرمانی ذهنی');
    expect(ev.analysis?.band).toBe('ثبت شد — نسخهٔ آزمایشی');
    expect(ev.analysis?.score).toBe(12);
    expect(ev.analysis?.total).toBe(12);
    expect(ev.analysis?.interpretation).toContain('cogperf-v1');
    expect(ev.analysis?.interpretation).toContain('اعتبارسنجی‌نشده');

    expect(ev.payload?.fa_summary?.value).toContain('۱۲ تکلیف معتبر از ۱۲');
    expect(ev.payload?.algo_version).toEqual({ value: 'cogperf-v1', label: 'نسخهٔ الگوریتم' });
    expect(ev.payload?.validity_status?.value).toContain('اعتبارسنجی‌نشده');
    expect(ev.payload?.d_t03?.label).toContain('بازگویی توالی اعداد');
    expect(ev.payload?.d_t03?.value).toContain('۴');
    expect(ev.payload?.p_t02?.value).toBe('P1 — تکرار استاندارد');
    expect(ev.summary).toContain('خلاصهٔ پروتکل عملکردی');
    expect(ev.payload?.norm_fa?.value).toContain('بدون نمرهٔ کل');

    const trow = A.sql
      .prepare(`SELECT key, active, is_system, family_fillable, audience, created_by FROM case_event_types WHERE key = 'ce-rehab-cogperf-v1'`)
      .get() as { key: string; active: number; is_system: number; family_fillable: number; audience: string; created_by: string };
    expect(trow.is_system).toBe(1);
    expect(trow.active).toBe(0); // فقط از بخش اختصاصی مسیر — خارج از رویدادساز و بات
    expect(trow.family_fillable).toBe(0);
    expect(trow.audience).toBe('staff');
    expect(trow.created_by).toBe('seed-m168');

    const audits = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_type = 'case_event' AND resource_id = ?`)
      .all(ev.id) as { action: string }[];
    expect(audits.some((a) => a.action === 'case_event.cog_perf_created')).toBe(true);
  });

  it('سطح توصیفی حیطهٔ کامل ثبت می‌شود و در خلاصه می‌نشیند', async () => {
    const res = await postPerf({ ...allValid(), lvl_att: 'مختلط یا مرزی', lvl_mem: 'بدون نشان بالینی در این جلسه' });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: CogPerfEvent }).data;
    expect(ev.payload?.lvl_att?.value).toBe('مختلط یا مرزی');
    expect(ev.payload?.lvl_mem?.value).toBe('بدون نشان بالینی در این جلسه');
    expect(ev.payload?.fa_summary?.value).toContain('توجه و تمرکز: مختلط یا مرزی');
  });

  it('«اجرا نشد» صفر فرض نمی‌شود — شمارندهٔ معتبر می‌آید و پرچم می‌خورد', async () => {
    const v = allValid();
    delete v.d_t03;
    v.s_t03 = 'اجرا نشد';
    const res = await postPerf(v);
    expect(res.status).toBe(201);
    const ev = (res.body as { data: CogPerfEvent }).data;
    expect(ev.analysis?.score).toBe(11);
    expect(ev.analysis?.flags?.some((f) => f.key === 't03' && f.label.includes('صفر فرض نشد'))).toBe(true);
    expect(ev.payload?.st_t03?.value).toBe('اجرا نشد');
    expect(ev.payload?.d_t03?.value).toBe('—');
    expect(ev.analysis?.interpretation).toContain('اجرا نشد — صفر فرض نشد');
  });

  it('سطح توصیفی روی حیطهٔ ناقص مسدود است — فقط «داده کافی نیست» پذیرفته می‌شود', async () => {
    const before = countOf();
    const v = allValid();
    delete v.d_t03;
    v.s_t03 = 'اجرا نشد';
    const blocked = await postPerf({ ...v, lvl_mem: 'مختلط یا مرزی' });
    expect(blocked.status).toBe(400);
    expect((blocked.body as { message?: string }).message).toContain('همهٔ تکالیف حیطه معتبر باشند');

    const ok = await postPerf({ ...v, lvl_mem: 'داده کافی نیست' });
    expect(ok.status).toBe(201);
    const ev = (ok.body as { data: CogPerfEvent }).data;
    expect(ev.payload?.lvl_mem?.value).toBe('داده کافی نیست');
    expect(countOf()).toBe(before + 1);
  });

  it('اعتبارسنجی — وضعیت جا، خامِ جا برای «معتبر»، قلم‌رو، گزینهٔ نامعتبر → ۴۰۰ فارسی و بدون رکورد', async () => {
    const before = countOf();

    const noStatus = await postPerf((() => { const v = allValid(); delete v.s_t04; return v; })());
    expect(noStatus.status).toBe(400);
    expect((noStatus.body as { message?: string }).message).toContain('وضعیت اجرای تکلیف «اجرای دستور چندمرحله‌ای»');

    const noRaw = await postPerf((() => { const v = allValid(); delete v.d_t04; return v; })());
    expect(noRaw.status).toBe(400);
    expect((noRaw.body as { message?: string }).message).toContain('الزامی است');

    const over = await postPerf({ ...allValid(), d_t01: 9 });
    expect(over.status).toBe(400);
    expect((over.body as { message?: string }).message).toContain('باید بین ۰ تا ۶ باشد');

    const badPrompt = await postPerf({ ...allValid(), p_t05: 'کمک کامل' });
    expect(badPrompt.status).toBe(400);
    expect((badPrompt.body as { message?: string }).message).toContain('گزینه‌های مجاز');

    const badStatus = await postPerf({ ...allValid(), s_t05: 'بد' });
    expect(badStatus.status).toBe(400);

    const badLevel = await postPerf({ ...allValid(), lvl_ps: 'ضعیف قطعی' });
    expect(badLevel.status).toBe(400);
    expect((badLevel.body as { message?: string }).message).toContain('گزینه‌های مجاز');

    expect(countOf()).toBe(before);
  });

  it('P4 پرچم می‌خورد — ماهیت تکلیف تغییر کرده', async () => {
    const res = await postPerf({ ...allValid(), p_t05: 'P4 — نمایش/مدل‌سازی' });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: CogPerfEvent }).data;
    expect(ev.analysis?.flags?.some((f) => f.key === 'p_t05' && f.label.includes('P4'))).toBe(true);
  });

  it('رقم فارسی در شاخص خام پذیرفته می‌شود', async () => {
    const res = await postPerf({ ...allValid(), d_t03: '۵' });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: CogPerfEvent }).data;
    expect(ev.payload?.d_t03?.value).toContain('۵');
  });

  it('RBAC — منشی ۴۰۳؛ دانش‌آموز ناموجود ۴۰۴', async () => {
    const res = await postPerf(allValid(), secretary);
    expect(res.status).toBe(403);
    const missing = await therapist.post('/api/students/00000000-0000-0000-0000-00000000dead/case-events/cog-perf', { values: allValid() });
    expect(missing.status).toBe(404);
  });

  it('ویرایش عمومی مسدود است — اصلاح فقط با ثبت جدید (تاریخچه با نسخه حفظ می‌شود)', async () => {
    const created = await postPerf(allValid());
    const ev = (created.body as { data: CogPerfEvent }).data;
    const patch = await therapist.patch(`/api/case-events/${ev.id}`, { values: { note: 'تلاش برای ویرایش' } });
    expect(patch.status).toBe(409);
    expect((patch.body as { message?: string }).message).toContain('ثبت جدید');
  });

  it('قالب قدیمی ce-rehab-cog-v1 بازنشسته ولی محفوظ است — تاریخچه و ارجاع‌ها سالم', () => {
    const row = A.sql
      .prepare(`SELECT key, active, is_system FROM case_event_types WHERE key = 'ce-rehab-cog-v1'`)
      .get() as { key: string; active: number; is_system: number } | undefined;
    expect(row).toBeDefined();
    expect(row?.is_system).toBe(1);
    expect(row?.active).toBe(0);
    const perfRow = A.sql
      .prepare(`SELECT COUNT(*) AS c FROM case_event_types WHERE key = 'ce-rehab-cogperf-v1'`)
      .get() as { c: number };
    expect(perfRow.c).toBe(1);
  });
});
