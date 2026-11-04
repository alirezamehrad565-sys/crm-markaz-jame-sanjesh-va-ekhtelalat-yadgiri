/**
 * e2e ۱.۲۵.۰۵ — احیای صورت‌بندی مورد: GET /api/students/:id/case-formulation
 * مسیری که فرانت‌اند از همیشه صدا می‌زد ولی تا امروز هیچ سرویس‌دهنده‌ای نداشت (۴۰۴ بی‌صدا).
 * قرارداد: FormulationResult موتور case-formulation + تلفیق استنتاج زندهٔ موتور بالینی.
 * الگو: e2e-ot-engine.test.ts () — دادهٔ آزمونی محلی، بدون دست‌زدن به تولید.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent
} from '../../test/harness';

import type { ConstructLevel } from '@domain/case-formulation';

interface FormulationBody {
  schemaVersion: string;
  generatedAt: string;
  childId: string;
  ageYears?: number;
  constructs: { key: string; titleFa: string; level: ConstructLevel; score: number; rawScore: number; sources: string[]; evidenceFa: unknown[] }[];
  coherence: string;
  patterns: unknown[];
  primaryProfile: { titleFa: string } | null;
  redFlags: unknown[];
  dataCoverage: { percent: number; missing: string[] };
  nextActions: unknown[];
  monitoring: { intervalMonths: number };
  confidence: number;
  capsFa: string[];
  inferenceRanked?: unknown[];
  inferenceConvergence?: unknown[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('/api/students/:id/case-formulation — احیای جمع‌بندی تشخیصی', () => {
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

  it('پروندهٔ نو → ۲۰۰ با شکل کامل FormulationResult: سازه‌های بی‌شواهد همگی «پایین»', async () => {
    const res = await ali.get(`/api/students/${studentId}/case-formulation`);
    expect(res.status).toBe(200);
    const f = dataOf<FormulationBody>(res);
    expect(f.schemaVersion).toBe('.2');
    expect(f.childId).toBe(studentId);
    expect(f.constructs.length).toBeGreaterThanOrEqual(8); // سازه‌های شناختی-رفتاری موتور
    expect(f.constructs.every((c) => c.level === 'پایین' && c.rawScore === 0)).toBe(true);
    expect(['هم‌گرا', 'ناقص', 'واگرا']).toContain(f.coherence);
    expect(f.confidence).toBeGreaterThanOrEqual(0);
    expect(f.confidence).toBeLessThanOrEqual(1);
    expect(f.dataCoverage.percent).toBeGreaterThanOrEqual(0);
    expect(f.dataCoverage.percent).toBeLessThanOrEqual(100);
    expect(Array.isArray(f.patterns)).toBe(true);
    expect(Array.isArray(f.nextActions)).toBe(true);
    /* تلفیق استنتاج زنده: خروجی runInference در همان پاسخ می‌نشیند */
    expect(Array.isArray(f.inferenceRanked)).toBe(true);
    expect(Array.isArray(f.inferenceConvergence)).toBe(true);
  });

  it('ثبت شرح‌حال → گیت شناسایی سبز و پوشش داده بالا می‌رود (زمینهٔ OT تزریقی نفس می‌کشد)', async () => {
    const typeRow = await A.db.queryOne<{ id: string }>(`SELECT id FROM case_event_types WHERE key = 'ce-anamnesis-v2'`);
    expect(typeRow).toBeTruthy();
    const iso = new Date().toISOString();
    await A.db.execute(
      `INSERT INTO case_events (id, event_type_id, student_id, occurred_at, status, payload, summary, created_by)
       VALUES (?, ?, ?, ?, 'completed', '{}', 'شرح‌حال تست', 'e2e')`,
      [crypto.randomUUID(), typeRow!.id, studentId, iso]
    );
    const before = dataOf<FormulationBody>(await ali.get(`/api/students/${studentId}/case-formulation`));
    expect(before.dataCoverage.percent).toBeGreaterThan(0);
  });

  it('RBAC — مسئول/مدیر/منشی ۲۰۰؛ درمانگرِ غیرمسئول ۴۰۳', async () => {
    expect((await ali.get(`/api/students/${studentId}/case-formulation`)).status).toBe(200);
    expect((await mgr.get(`/api/students/${studentId}/case-formulation`)).status).toBe(200);
    expect((await sec.get(`/api/students/${studentId}/case-formulation`)).status).toBe(200);
    expect((await maryam.get(`/api/students/${studentId}/case-formulation`)).status).toBe(403);
  });

  it('دانش‌آموز ناموجود → ۴۰۴', async () => {
    const res = await mgr.get('/api/students/no-such-id/case-formulation');
    expect(res.status).toBe(404);
  });
});
