import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface ProbeEvent {
  id: string;
  status: string;
  typeTitle: string;
  analysis: { score: number; band: string | null; maxScore: number; answered: number; total: number; flags?: { key: string; label: string; value: number }[] } | null;
  payload: Record<string, { value: string; label: string }> | null;
  summary: string | null;
}

const probeCount = (A: ReturnType<typeof createTestApp>): number =>
  (A.sql.prepare(
    `SELECT COUNT(*) AS c FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id WHERE t.key LIKE 'ce-probe-%'`
  ).get() as { c: number }).c;

describe('آزمون‌های عملکرد مرکزی — ارزیابی درمانگر در مرکز (T12/m160)', () => {
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
    const s = await createStudent(manager, { first_name: 'پرهام', last_name: 'روان‌خوان' });
    studentId = s.id;
  });

  const probe = (area: string, values: unknown, api: Api = therapist) =>
    api.post(`/api/students/${studentId}/case-events/probe`, { area, values });

  it('خواندن — ثبت معتبر → تحلیل هنجاری، پرچم رمزگشایی، payload برچسب‌دار و audit', async () => {
    expect(probeCount(A)).toBe(0);
    const res = await probe('read', { text_grade: 'سوم', wcpm: 45, errors: 6, pseudo_correct: 7, comprehension: 1, notes: 'تعقیب با انگشت' });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ProbeEvent }).data;

    expect(ev.status).toBe('completed');
    expect(ev.typeTitle).toContain('آزمون کوتاه خواندن');
    expect(ev.analysis?.score).toBe(42);
    expect(ev.analysis?.maxScore).toBe(100);
    expect(ev.analysis?.band).toBe('پایین‌تر از انتظار پایه');
    expect(ev.analysis?.flags?.some((f) => f.key === 'pseudo_correct')).toBe(true);
    expect(ev.analysis?.flags?.some((f) => f.key === 'comprehension')).toBe(true);

    expect(ev.payload?.text_grade).toEqual({ value: 'سوم', label: 'متن استفاده‌شده (پایه)' });
    expect(ev.payload?.wcpm.value).toBe('۴۵');
    expect(ev.payload?.chip_metric_1.label).toBe('واژهٔ درست در دقیقه');
    expect(ev.payload?.chip_metric_1.value).toContain('۴۵');
    expect(ev.payload?.chip_metric_1.value).toContain('۱۰۷');
    expect(ev.payload?.chip_metric_2.label).toBe('رمزگشایی واژهٔ بی‌معنی');
    expect(ev.payload?.chip_band).toEqual({ value: 'پایین‌تر از انتظار پایه', label: 'باند' });
    expect(ev.payload?.norm_fa.value).toContain('هنجار داخلی مرکز');
    expect(ev.payload?.norm_fa.value).toContain('۱۰۷');
    expect(ev.payload?.norm_fa.label).toBe('انتظار پایه (هنجار داخلی مرکز)');
    expect(ev.payload?.fa_summary.value).toContain('آزمون خواندن: ۴۲٪ انتظار پایهٔ سوم');

    expect(ev.summary).toContain('امتیاز: ۴۲ از ۱۰۰');
    expect(ev.summary).toContain('پایین‌تر از انتظار پایه');

    const trow = A.sql
      .prepare(`SELECT key, active, is_system FROM case_event_types WHERE key = 'ce-probe-read-v1'`)
      .get() as { key: string; active: number; is_system: number };
    expect(trow.is_system).toBe(1);
    expect(trow.active).toBe(1);
    const tcount = A.sql
      .prepare(`SELECT COUNT(*) AS c FROM case_event_types WHERE key = 'ce-probe-read-v1'`)
      .get() as { c: number };
    expect(tcount.c).toBe(1);

    const audits = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_type = 'case_event' AND resource_id = ?`)
      .all(ev.id) as { action: string }[];
    expect(audits.some((a) => a.action === 'case_event.probe_created')).toBe(true);
  });

  it('خواندن — عملکرد در انتظار پایه → باند «در انتظار پایه» بدون پرچم', async () => {
    const res = await probe('read', { text_grade: 'سوم', wcpm: 120, pseudo_correct: 14, comprehension: 3 });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ProbeEvent }).data;
    expect(ev.analysis?.band).toBe('در انتظار پایه');
    expect(ev.analysis?.score).toBe(112); // ۱۲۰/۱۰۷ → ۱۱۲٪
    expect(ev.analysis?.flags).toBeUndefined();
  });

  it('نوشتن — قاعدهٔ ترکیبی: نرخ خطای بالا → «پایین‌تر از انتظار پایه» با پرچم روانی', async () => {
    const res = await probe('write', { dict_grade: 'سوم', dict_words: 20, err_phonetic: 5, err_visual: 2, err_rule: 1, alpha15s: 30, handwriting_note: 'خط ناپایدار' });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ProbeEvent }).data;
    expect(ev.analysis?.band).toBe('پایین‌تر از انتظار پایه');
    expect(ev.analysis?.score).toBe(60); // دقت املایی ۶۰٪
    expect(ev.analysis?.flags?.some((f) => f.key === 'alpha15s')).toBe(true);
    expect(ev.payload?.chip_metric_1.label).toBe('دقت املایی');
    expect(ev.payload?.chip_metric_1.value).toContain('۶۰٪');
    expect(ev.payload?.chip_metric_2.value).toContain('۳۰');
    expect(ev.payload?.fa_summary.value).toContain('دقت املایی ۶۰٪');
  });

  it('نوشتن — لبهٔ مرزی: نرخ خطا دقیقاً ۱۰٪ با روانی ۸۹٪ → «مرزی»', async () => {
    const res = await probe('write', { dict_grade: 'سوم', dict_words: 20, err_phonetic: 2, alpha15s: 40 });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ProbeEvent }).data;
    expect(ev.analysis?.band).toBe('مرزی');
    expect(ev.analysis?.flags).toBeUndefined(); // روانی ۸۹٪ ≥ ۸۰ → پرچم نمی‌گیرد
  });

  it('حساب — تشدید مستند: مقایسهٔ مقدار ≥۶ → «پایین‌تر از انتظار پایه» حتی با درصد پایهٔ قابل قبول', async () => {
    const res = await probe('calc', { calc_grade: 'سوم', digits2min: 30, compare_errors: 6, number_line_pct: 12, word_problem_support: 'متوسط' });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ProbeEvent }).data;
    expect(ev.analysis?.band).toBe('پایین‌تر از انتظار پایه');
    expect(ev.analysis?.flags?.some((f) => f.key === 'compare_errors')).toBe(true);
    expect(ev.payload?.chip_metric_3.label).toBe('خطای خط عددی');
    expect(ev.payload?.chip_metric_4.value).toBe('متوسط');
  });

  it('حساب — بدون تشدید: درصد پایه تعیین‌کننده است (۸۶٪ → «مرزی»)', async () => {
    const res = await probe('calc', { calc_grade: 'سوم', digits2min: 30, compare_errors: 2 });
    const ev = (res.body as { data: ProbeEvent }).data;
    expect(ev.analysis?.band).toBe('مرزی');
    expect(ev.analysis?.flags).toBeUndefined();
  });

  it('حوزهٔ نامعتبر → ۴۰۰ فارسی و بدون رکورد', async () => {
    const before = probeCount(A);
    const res = await probe('spelling', { text_grade: 'سوم', wcpm: 50, pseudo_correct: 10 });
    expect(res.status).toBe(400);
    expect((res.body as { message?: string }).message).toContain('حوزهٔ آزمون نامعتبر است');
    expect(probeCount(A)).toBe(before);
  });

  it('فیلد الزامیِ جا / خارج از قلم‌رو / پایهٔ نامعتبر → ۴۰۰ فارسی', async () => {
    const before = probeCount(A);
    const missing = await probe('read', { text_grade: 'سوم', wcpm: 50 });
    expect(missing.status).toBe(400);
    expect((missing.body as { message?: string }).message).toContain('بی‌پاسخ مانده است');
    expect((missing.body as { message?: string }).message).toContain('بی‌معنی');

    const over = await probe('read', { text_grade: 'سوم', wcpm: 500, pseudo_correct: 10 });
    expect(over.status).toBe(400);
    expect((over.body as { message?: string }).message).toContain('باید بین ۰ تا ۴۰۰ باشد');

    const badGrade = await probe('read', { text_grade: 'نهم', wcpm: 50, pseudo_correct: 10 });
    expect(badGrade.status).toBe(400);
    expect((badGrade.body as { message?: string }).message).toContain('از گزینه‌های مجاز نیست');
    expect(probeCount(A)).toBe(before);
  });

  it('RBAC — منشی ۴۰۳ می‌گیرد؛ دانش‌آموز ناموجود ۴۰۴', async () => {
    const res = await probe('read', { text_grade: 'سوم', wcpm: 50, pseudo_correct: 10 }, secretary);
    expect(res.status).toBe(403);
    const missing = await therapist.post('/api/students/00000000-0000-0000-0000-00000000dead/case-events/probe', {
      area: 'read', values: { text_grade: 'سوم', wcpm: 50, pseudo_correct: 10 }
    });
    expect(missing.status).toBe(404);
  });

  it('رویدادهای پروب در تایم‌لاین دانش‌آموز با summary باندخورده ظاهر می‌شوند', async () => {
    const list = await therapist.get(`/api/students/${studentId}/case-events`);
    expect(list.status).toBe(200);
    const items = (list.body as { data: ProbeEvent[] }).data.filter((e) => e.typeTitle.includes('آزمون کوتاه'));
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((e) => e.status === 'completed' && e.analysis?.band)).toBe(true);
  });
});
