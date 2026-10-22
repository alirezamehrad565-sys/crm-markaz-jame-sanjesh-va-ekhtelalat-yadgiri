/**
 * تست‌های e2e — پیشنهادگر چک‌لیست (T3/m147) — GET /api/students/:id/checklist-plan
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-checklist-plan.test.ts — مسیر API پیشنهاد پلن: RBAC (خواندن مثل تفسیر)، شکل قرارداد
// پاسخ، سناریوی دیرآموز (BIF → پلن پروب‌محور + فرم جامع خانواده) و خط قرمز ID (بدون پلن ابزار).
// رویدادها با SQL واقعی درج می‌شوند (الگوی e2e-ot-engine) — شکل payload/analysis همان قرارداد T1/T5.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent
} from '../../test/harness';

interface PlanItemBody {
  toolKey: string;
  priority: 'core' | 'recommended' | 'optional';
  reasonFa: string;
  hypothesisKeys: string[];
}

interface PlanBody {
  planType: 'جامع' | 'تکی';
  items: PlanItemBody[];
  basis: string;
  referralFa: string | null;
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

/** درج رویداد کامل با payload/analysis خام — بازگشت بدون خواندن */
async function insertEvent(
  A: ReturnType<typeof createTestApp>,
  studentId: string,
  typeKey: string,
  payload: unknown,
  analysis: unknown = null
): Promise<void> {
  const typeRow = await A.db.queryOne<{ id: string }>(`SELECT id FROM case_event_types WHERE key = ?`, [typeKey]);
  if (!typeRow) throw new Error(`نوع رویداد ${typeKey} seed نشده است`);
  await A.db.execute(
    `INSERT INTO case_events (id, event_type_id, student_id, occurred_at, status, payload, analysis, summary, created_by)
     VALUES (?, ?, ?, ?, 'completed', ?, ?, 'تست T3', 'e2e')`,
    [crypto.randomUUID(), typeRow.id, studentId, new Date().toISOString(), JSON.stringify(payload), analysis ? JSON.stringify(analysis) : null]
  );
}

/** نیم‌رخ وکسلر یکنواخت در باند داده‌شده — شکل T1 (profile + snapshot) */
function uniformEngine(fsiq: number): Record<string, unknown> {
  const idx = (v: number) => ({ scaled: v, percentile: null });
  return {
    ok: true,
    engineVersion: 'm98',
    snapshot: {
      fsiq,
      indexScatter: 2,
      indices: { VCI: idx(fsiq), PRI: idx(fsiq), WMI: idx(fsiq), PSI: idx(fsiq), FSIQ: idx(fsiq) },
      subtests: []
    },
    profile: {
      vci: idx(fsiq), pri: idx(fsiq), wmi: idx(fsiq), psi: idx(fsiq),
      fsiq,
      gai: null,
      gaiValidity: null,
      indexScatter: 2,
      fsiqBand: fsiq <= 69 ? 'ID' : fsiq <= 84 ? 'BIF' : fsiq <= 89 ? 'LOW_BORDER' : 'AVERAGE',
      acid: null,
      cad: null,
      step5: { strengths: [], weaknesses: [] },
      substitutes: [],
      flags: []
    },
    hypotheses: [],
    signals: []
  };
}

describe('GET /api/students/:id/checklist-plan — پیشنهادگر چک‌لیست', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api; // درمانگر مسئول
  let maryam: Api; // درمانگر دیگر
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    maryam = new Api(A, await loginToken(A, 'maryam'));
    studentId = (await createStudent(ali)).id;
  });

  it('پروندهٔ بی‌داده → ۲۰۰ با باتری پایهٔ سبک (SDQ والد+معلم) و پلن تکی + پانویس', async () => {
    const res = await ali.get(`/api/students/${studentId}/checklist-plan`);
    expect(res.status).toBe(200);
    const plan = dataOf<PlanBody>(res);
    expect(Object.keys(plan).sort()).toEqual(['basis', 'items', 'planType', 'referralFa']); // m156: disclaimer حذف شد
    expect(plan.planType).toBe('تکی');
    expect(plan.items.map((i) => i.toolKey)).toEqual(['ce-sdq-p-v1', 'ce-sdq-t-v1']);
    expect(plan.items.every((i) => i.priority === 'core' && i.reasonFa.length > 10 && i.hypothesisKeys.length >= 1)).toBe(true);
    expect(plan.referralFa).toBeNull();
  });

  it('RBAC — مسئول/مدیر/منشی ۲۰۰؛ درمانگر غیرمسئول ۴۰۳؛ دانش‌آموز ناموجود ۴۰۴', async () => {
    expect((await ali.get(`/api/students/${studentId}/checklist-plan`)).status).toBe(200);
    expect((await mgr.get(`/api/students/${studentId}/checklist-plan`)).status).toBe(200);
    expect((await sec.get(`/api/students/${studentId}/checklist-plan`)).status).toBe(200);
    expect((await maryam.get(`/api/students/${studentId}/checklist-plan`)).status).toBe(403);
    expect((await ali.get('/api/students/99999999-0000-0000-0000-000000000002/checklist-plan')).status).toBe(404);
  });

  it('قطعیت — دو فراخوانی پیاپی روی همان پرونده → پاسخ یکسان (محاسبهٔ زنده، بدون ذخیره)', async () => {
    const a = await ali.get(`/api/students/${studentId}/checklist-plan`);
    const b = await ali.get(`/api/students/${studentId}/checklist-plan`);
    expect(JSON.stringify(dataOf<PlanBody>(a))).toBe(JSON.stringify(dataOf<PlanBody>(b)));
  });

  it('سناریوی دیرآموز (FSIQ ۷۸) → پلن جامع: سه پروب + فرم جامع خانواده؛ بدون چک‌لیست ملاکی', async () => {
    const bif = (await createStudent(ali)).id;
    await insertEvent(A, bif, 'ce-wechsler-w4-v1', {
      engine_output: { value: JSON.stringify(uniformEngine(78)), label: 'خروجی موتور تفسیر' }
    });
    const res = await ali.get(`/api/students/${bif}/checklist-plan`);
    expect(res.status).toBe(200);
    const plan = dataOf<PlanBody>(res);
    expect(plan.planType).toBe('جامع');
    const keys = plan.items.map((i) => i.toolKey);
    expect(keys).toEqual(expect.arrayContaining([
      'ce-probe-read-v1', 'ce-probe-write-v1', 'ce-probe-calc-v1', 'ce-comp-family-v2'
    ]));
    expect(keys.some((k) => k.startsWith('ce-sld-'))).toBe(false);
    expect(plan.basis).toContain('مرزی/دیرآموزی');
    expect(plan.referralFa).toBeNull();
  });

  it('خط قرمز ID (FSIQ ۶۵ + انطباق پایین) → بدون پلن ابزار + پرچم ارجاع شفاف', async () => {
    const red = (await createStudent(ali)).id;
    await insertEvent(A, red, 'ce-wechsler-w4-v1', {
      engine_output: { value: JSON.stringify(uniformEngine(65)), label: 'خروجی موتور تفسیر' }
    });
    await insertEvent(A, red, 'ce-id-adapt-v1', null, {
      score: 10,
      band: null,
      answered: 12,
      total: 12,
      maxScore: 24,
      subscaleScores: [{ id: 'id_adapt', name: 'انطباق روزمره', score: 10, max: 24, band: 'پایین — نیاز به بررسی', color: 'danger' }]
    });
    const res = await ali.get(`/api/students/${red}/checklist-plan`);
    expect(res.status).toBe(200);
    const plan = dataOf<PlanBody>(res);
    expect(plan.items).toEqual([]);
    expect(plan.referralFa).toContain('خط قرمز');
    expect(plan.basis).toContain('ناتوانی هوشی');
  });

  it('مرز پایین (FSIQ ۸۷ یکنواخت) → فقط باتری پایه؛ بدون ابزار سنگین', async () => {
    const border = (await createStudent(ali)).id;
    await insertEvent(A, border, 'ce-wechsler-w4-v1', {
      engine_output: { value: JSON.stringify(uniformEngine(87)), label: 'خروجی موتور تفسیر' }
    });
    const res = await ali.get(`/api/students/${border}/checklist-plan`);
    const plan = dataOf<PlanBody>(res);
    expect(plan.items.map((i) => i.toolKey)).toEqual(['ce-sdq-p-v1', 'ce-sdq-t-v1']);
    expect(plan.basis).toContain('مرز پایین');
  });
});
