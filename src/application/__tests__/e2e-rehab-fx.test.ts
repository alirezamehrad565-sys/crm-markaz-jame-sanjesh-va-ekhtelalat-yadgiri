/**
 * تست‌های e2e — ارزیابی عملکردی توانبخشی ذهنی (m161)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-rehab-fx.test.ts — حلقهٔ کامل «ارزیابی عملکردی = آزمون درمانگر در مرکز» (مسیر توانبخشی):
// شش حیطهٔ شناختی پایه با دادهٔ خام + سطح راهنما در POST مسیر اختصاصی /case-events/rehab-fx؛
// تحلیل ملاکی سمت سرور (ملاک هر حیطه = ملاک کمی ot_skills؛ باند کلی از ترکیب شش حیطه)؛
// رویداد completed با payload برچسب‌دار (fx_{key}_band/fx_{key}_prompt/chip_metric_N/advice_N)؛
// حیطهٔ جا/خارج از قلم‌رو/راهنمای نامعتبر → ۴۰۰ فارسی و بدون رکورد؛
// type ce-rehab-fx-v1 idempotent ensure می‌شود (active=0 — خارج کتابخانه، is_system=1)؛
// RBAC همان گیت ثبت رویداد (منشی ۴۰۳)؛ audit هم‌تراکنش (case_event.rehab_fx_created)؛
// گیت‌های مسیرآگاه: pathway=rehab → سه گیت [anamnesis, skills, needs] — وکسلر/چک‌لیست‌ها اختیاری.

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface FxEvent {
  id: string;
  status: string;
  typeTitle: string;
  analysis: { score: number; band: string | null; maxScore: number; answered: number; total: number; flags?: { key: string; label: string; value: number }[] } | null;
  payload: Record<string, { value: string; label: string }> | null;
  summary: string | null;
}

interface GatesBody {
  phase: string;
  protocol: string | null;
  pathway: string | null;
  gates: { key: string; ord: number; label: string; done: boolean; detail: string }[];
  otCoverage: { scored: number; total: number; domainsCovered: number; domainsMin3: number };
}

/** ورودی کامل شش‌حیطه‌ای — نیم‌رخ قوی (همه در انتظار: ۱۲/۱/۵/۱/۰/۱۰ + داستان ۳) */
const STRONG_VALUES = {
  d_att_sus: 12, d_att_sel: 1, d_wm: 5, d_inh: 1, d_flex: 0, d_ps: 10, d_ps_story: 3,
  p_att_sus: 'بدون راهنما', p_att_sel: 'بدون راهنما', p_wm: 'بدون راهنما',
  p_inh: 'بدون راهنما', p_flex: 'بدون راهنما', p_ps: 'بدون راهنما',
  notes: 'همکاری خوب — با تشویق کلامی ادامه داد'
};

/** ورودی نیم‌رخ ضعیف — سه حیطه ضعیف + دو مرزی + یک در انتظار */
const WEAK_VALUES = {
  d_att_sus: 3, d_att_sel: 8, d_wm: 2, d_inh: 3, d_flex: 1, d_ps: 7,
  p_att_sus: 'راهنمای کلامی', p_wm: 'لمسی جزئی'
};

const fxCount = (A: ReturnType<typeof createTestApp>): number =>
  (A.sql.prepare(
    `SELECT COUNT(*) AS c FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id WHERE t.key = 'ce-rehab-fx-v1'`
  ).get() as { c: number }).c;

describe('ارزیابی عملکردی توانبخشی ذهنی — ثبت درمانگر در مرکز (m161)', () => {
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
    const s = await createStudent(manager, { first_name: 'بهرام', last_name: 'ذهنیار', pathway: 'rehab' });
    studentId = s.id;
  });

  const postFx = (values: unknown, api: Api = therapist) =>
    api.post(`/api/students/${studentId}/case-events/rehab-fx`, { values });

  it('نیم‌رخ ضعیف — ثبت معتبر → باند کلی، پرچم هر حیطه، payload برچسب‌دار، پیشنهاد حیطه‌ای و audit', async () => {
    expect(fxCount(A)).toBe(0);
    const res = await postFx(WEAK_VALUES);
    expect(res.status).toBe(201);
    const ev = (res.body as { data: FxEvent }).data;

    expect(ev.status).toBe('completed');
    expect(ev.typeTitle).toContain('ارزیابی عملکردی توانبخشی ذهنی');
    // ۳ حیطه ضعیف (att_sus=3، wm=2، att_sel=8) → «نیاز به مداخلهٔ همه‌جانبهٔ ذهنی»
    expect(ev.analysis?.band).toBe('نیاز به مداخلهٔ همه‌جانبهٔ ذهنی');
    expect(ev.analysis?.score).toBe(1); // فقط flex=1 در انتظار
    expect(ev.analysis?.maxScore).toBe(6);
    expect(ev.analysis?.answered).toBe(6);
    expect(ev.analysis?.flags?.some((f) => f.key === 'att_sus')).toBe(true);
    expect(ev.analysis?.flags?.some((f) => f.key === 'wm')).toBe(true);
    expect(ev.analysis?.flags?.some((f) => f.key === 'att_sel')).toBe(true);

    // payload — فیلد خام با رقم فارسی + باند و سطح راهنمای هر حیطه + ردیف‌های عددی + ملاک مرجع + خلاصه
    expect(ev.payload?.d_att_sus).toEqual({ value: '۳', label: 'توجه پایدار — دقیقهٔ تمرکز پیوسته' });
    expect(ev.payload?.fx_att_sus_band.value).toBe('ضعف آشکار');
    expect(ev.payload?.fx_att_sus_prompt.value).toBe('راهنمای کلامی');
    expect(ev.payload?.fx_wm_prompt.value).toBe('لمسی جزئی');
    expect(ev.payload?.fx_ps_band.value).toBe('مرزی'); // پازل ۷ → مرزی
    expect(ev.payload?.fx_flex_band.value).toBe('در انتظار'); // ۱ کمک → در انتظار
    expect(ev.payload?.chip_metric_1.value).toContain('۳');
    expect(ev.payload?.chip_band).toEqual({ value: 'نیاز به مداخلهٔ همه‌جانبهٔ ذهنی', label: 'باند کلی' });
    expect(ev.payload?.norm_fa.value).toContain('ot-cog-07');
    expect(ev.payload?.fa_summary.value).toContain('۱ حیطه در انتظار، ۲ مرزی، ۳ ضعف از ۶');
    // پیشنهاد حیطه‌ای — فقط حیطه‌های مرزی/ضعیف به ترتیب نمایش
    expect(ev.payload?.advice_1.label).toContain('توجه پایدار');
    expect(ev.payload?.advice_1.value).toContain('تایمر دیداری');
    expect(ev.summary).toContain('امتیاز: ۱ از ۶');

    // type — idempotent ensure، خارج کتابخانه (active=0) اما سیستمی
    const trow = A.sql
      .prepare(`SELECT key, active, is_system, created_by FROM case_event_types WHERE key = 'ce-rehab-fx-v1'`)
      .get() as { key: string; active: number; is_system: number; created_by: string };
    expect(trow.is_system).toBe(1);
    expect(trow.active).toBe(0);
    expect(trow.created_by).toBe('seed-m161');
    const tcount = A.sql
      .prepare(`SELECT COUNT(*) AS c FROM case_event_types WHERE key = 'ce-rehab-fx-v1'`)
      .get() as { c: number };
    expect(tcount.c).toBe(1);

    // audit هم‌تراکنش
    const audits = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_type = 'case_event' AND resource_id = ?`)
      .all(ev.id) as { action: string }[];
    expect(audits.some((a) => a.action === 'case_event.rehab_fx_created')).toBe(true);
  });

  it('نیم‌رخ قوی — همهٔ حیطه‌ها در انتظار → «نیم‌رخ پایه در انتظار» بدون پرچم و بدون پیشنهاد', async () => {
    const res = await postFx(STRONG_VALUES);
    expect(res.status).toBe(201);
    const ev = (res.body as { data: FxEvent }).data;
    expect(ev.analysis?.band).toBe('نیم‌رخ پایه در انتظار');
    expect(ev.analysis?.score).toBe(6);
    expect(ev.analysis?.flags).toBeUndefined();
    expect(ev.payload?.advice_1).toBeUndefined(); // حیطهٔ مرزی/ضعیف نیست
    expect(ev.payload?.fx_ps_band.value).toBe('در انتظار');
  });

  it('لبهٔ مرزی — یک ضعیف + دو مرزی + سه در انتظار → «گیرهای نقطه‌ای»', async () => {
    const res = await postFx({ d_att_sus: 2, d_att_sel: 4, d_wm: 3, d_inh: 2, d_flex: 1, d_ps: 10 });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: FxEvent }).data;
    expect(ev.analysis?.band).toBe('گیرهای نقطه‌ای — مداخلهٔ حیطه‌ای هدفمند');
    expect(ev.analysis?.score).toBe(3);
  });

  it('رقم فارسی و سطح راهنمای حذف‌شده → پیش‌فرض «بدون راهنما» در payload', async () => {
    const res = await postFx({ d_att_sus: '۱۱', d_att_sel: '۲', d_wm: '۴', d_inh: '۱', d_flex: '۰', d_ps: '۹' });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: FxEvent }).data;
    expect(ev.payload?.d_att_sus.value).toBe('۱۱');
    expect(ev.payload?.fx_att_sus_prompt.value).toBe('بدون راهنما');
    expect(ev.analysis?.band).toBe('نیم‌رخ پایه در انتظار');
  });

  it('حیطهٔ جا / خارج از قلم‌رو / راهنمای نامعتبر → ۴۰۰ فارسی و بدون رکورد', async () => {
    const before = fxCount(A);
    const missing = await postFx({ d_att_sus: 10, d_wm: 4, d_inh: 1, d_flex: 0, d_ps: 9 }); // d_att_sel جا
    expect(missing.status).toBe(400);
    expect((missing.body as { message?: string }).message).toContain('بی‌پاسخ مانده است');
    expect((missing.body as { message?: string }).message).toContain('توجه انتخابی');

    const over = await postFx({ d_att_sus: 99, d_att_sel: 2, d_wm: 4, d_inh: 1, d_flex: 0, d_ps: 9 });
    expect(over.status).toBe(400);
    expect((over.body as { message?: string }).message).toContain('باید بین ۰ تا ۱۵ باشد');

    const badPrompt = await postFx({ ...STRONG_VALUES, p_wm: 'بازداری کامل' });
    expect(badPrompt.status).toBe(400);
    expect((badPrompt.body as { message?: string }).message).toContain('از گزینه‌های مجاز نیست');

    const badStory = await postFx({ ...STRONG_VALUES, d_ps_story: 9 });
    expect(badStory.status).toBe(400);
    expect((badStory.body as { message?: string }).message).toContain('توالی داستان');
    expect(fxCount(A)).toBe(before);
  });

  it('RBAC — منشی ۴۰۳ می‌گیرد؛ دانش‌آموز ناموجود ۴۰۴', async () => {
    const res = await postFx(STRONG_VALUES, secretary);
    expect(res.status).toBe(403);
    const missing = await therapist.post('/api/students/00000000-0000-0000-0000-00000000dead/case-events/rehab-fx', { values: STRONG_VALUES });
    expect(missing.status).toBe(404);
  });

  it('گیت‌های مسیرآگاه — پروندهٔ rehab سه گیت دارد و وکسلر/چک‌لیست گیت نمی‌سازند', async () => {
    const res = await manager.get(`/api/students/${studentId}/clinical-gates`);
    expect(res.status).toBe(200);
    const gates = (res.body as { data: GatesBody }).data;
    expect(gates.pathway).toBe('rehab');
    expect(gates.gates.map((g) => g.key)).toEqual(['anamnesis', 'skills', 'needs']);
    // شماره‌گذاری از جایگاه واقعی — وکسلر/چک‌لیست‌ها از مسیر خارج‌اند
    expect(gates.gates.map((g) => g.ord)).toEqual([1, 2, 3]);
    const skills = gates.gates.find((g) => g.key === 'skills')!;
    expect(skills.label).toContain('ارزیابی عملکردی توانبخشی');
    // ارزیابی عملکردی ثبت شده (تست اول) → گیت مهارتی سبز است حتی با OT۷ خالی
    expect(skills.done).toBe(true);
    expect(skills.detail).toContain('خط پایهٔ شش حیطه‌ای موجود است');
    const needs = gates.gates.find((g) => g.key === 'needs')!;
    expect(needs.detail).toContain('پس از شرح‌حال و ارزیابی عملکردی');
  });

  it('مسیر استاندارد دست‌نخورده — پروندهٔ بدون مسیر همان پنج گیت را دارد', async () => {
    const s = await createStudent(manager, { first_name: 'سام', last_name: 'استاندارد' });
    const res = await manager.get(`/api/students/${s.id}/clinical-gates`);
    const gates = (res.body as { data: GatesBody }).data;
    expect(gates.gates.map((g) => g.key)).toEqual(['anamnesis', 'wechsler', 'behavioral', 'skills', 'needs']);
    expect(gates.gates.find((g) => g.key === 'skills')!.detail).toContain('۷ با حداقل ۳ نمره');
  });

  it('گیت مهارتی rehab بدون ثبت ارزیابی → بسته با پیام راهنما؛ با OT۷ پوشیده → سبز (پروندهٔ قدیمی)', async () => {
    const fresh = await createStudent(manager, { first_name: 'کیان', last_name: 'بدون‌پایه', pathway: 'rehab' });
    const before = (await manager.get(`/api/students/${fresh.id}/clinical-gates`)).body as { data: GatesBody };
    const skillsBefore = before.data.gates.find((g) => g.key === 'skills')!;
    expect(skillsBefore.done).toBe(false);
    expect(skillsBefore.detail).toContain('هنوز ثبت نشده');

    // پوشش کامل OT۷ (۷ حیطه × ۳ مهارت mastered) → گیت سبز حتی بدون فرم عملکردی
    const all = A.sql.prepare(`SELECT id, domain FROM ot_skills WHERE COALESCE(is_primary, 1) = 1 ORDER BY domain, ord`).all() as { id: string; domain: string }[];
    const byDomain = new Map<string, string[]>();
    for (const s of all) {
      const arr = byDomain.get(s.domain) ?? [];
      if (arr.length < 3) arr.push(s.id);
      byDomain.set(s.domain, arr);
    }
    expect(byDomain.size).toBe(7); // هفت حیطه واقعاً پوشیده شود
    let i = 0;
    for (const ids of byDomain.values()) {
      for (const skillId of ids) {
        i += 1;
        A.sql.prepare(
          `INSERT INTO ot_progress (id, student_id, skill_id, status, occurred_at, created_at)
           VALUES (?, ?, ?, 'mastered', ?, ?)`
        ).run(`op-${i}`, fresh.id, skillId, new Date(Date.now() + i * 1000).toISOString(), new Date().toISOString());
      }
    }
    const after = (await manager.get(`/api/students/${fresh.id}/clinical-gates`)).body as { data: GatesBody };
    expect(after.data.gates.find((g) => g.key === 'skills')!.done).toBe(true);
  });

  it('رویدادهای ارزیابی عملکردی در تایم‌لاین با summary باندخورده ظاهر می‌شوند', async () => {
    const list = await therapist.get(`/api/students/${studentId}/case-events`);
    expect(list.status).toBe(200);
    const items = (list.body as { data: FxEvent[] }).data.filter((e) => e.typeTitle.includes('ارزیابی عملکردی توانبخشی'));
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((e) => e.status === 'completed' && e.analysis?.band)).toBe(true);
  });
});
