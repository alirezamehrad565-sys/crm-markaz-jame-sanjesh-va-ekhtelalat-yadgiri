/**
 * گیت ۱.۲۵.۰۶ — بستهٔ صحت بالینی:
 *  ① برش‌های SNAP/SCARED تک‌منبع‌اند (instruments.ts) — کپی محلی در ot-engine و موتور صورت‌بندی ممنوع
 *  ② DCDQ مرز خطر سنی می‌گیرد (m176: ۵-۷→۳۱ · ۸-۹→۴۰ · ۱۰-۱۵→۴۲)
 *  ③ ODD هشت‌ملاکی است (oA6→odd.a6 بازگشت + هم‌گرایی SNAP s19-s26)
 *  ④ ردگیر ملاک‌های ADHD خالی نیست (a1/a2/c از SNAP هر دو مرجع)
 *  ⑤ رفتاری: موتور صورت‌بندی با وابستگی مشترک و باند سنی DCDQ درست کار می‌کند
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rulesOf } from '../rules';
import { SNAP_IV_CUTOFFS, SCARED_CUTOFFS, DCDQ_WARN_CEILING, dcdqDangerCutoffFor } from '../instruments';
import { formulateCase } from '@domain/case-formulation';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت ۱.۲۵.۰۶ — تک‌منبعی برش‌های پرسشنامه', () => {
  it('کپی محلی SNAP_CUTOFFS/SCARED در ot-engine و موتور صورت‌بندی تعریف نمی‌شود', () => {
    const ot = read('src/domain/ot-engine/service.ts');
    expect(ot).toMatch(/const SNAP_CUTOFFS = SNAP_IV_CUTOFFS/); // مستعارِ منبع مشترک
    expect(ot).not.toMatch(/SNAP_CUTOFFS = \{/);
    expect(ot).not.toMatch(/const SCARED_DANGER = \d/);
    const engine = read('src/domain/case-formulation/engine.js');
    expect(engine).not.toMatch(/var RULES = \[/); // fork قواعد حذف شد
    expect(engine).not.toMatch(/var EVIDENCE_WEIGHTS = \{/);
    expect(engine).not.toMatch(/SNAP_CUTOFFS = \{/);
    expect(engine).toMatch(/import \{ rulesOf/);
  });

  it('جدول مشترک همان ارزش‌های عملیاتی پیشین را دارد (بدون تغییر بالینی بی‌مجوز)', () => {
    expect(SNAP_IV_CUTOFFS.parent.ia).toEqual({ warn: 11, danger: 16 });
    expect(SNAP_IV_CUTOFFS.parent.hi.danger).toBe(13);
    expect(SNAP_IV_CUTOFFS.teacher.ia).toEqual({ warn: 14, danger: 16 });
    expect(SCARED_CUTOFFS).toEqual({ danger: 25, warnMin: 20, strong: 30 });
  });

  it('DCDQ: مرز خطر سنی — ۶س→۳۱ · ۹س→۴۰ · ۱۲س→۴۲ · بی‌سن→۳۱ (هم‌تیر m176)', () => {
    expect(dcdqDangerCutoffFor(6)).toBe(31);
    expect(dcdqDangerCutoffFor(7)).toBe(31);
    expect(dcdqDangerCutoffFor(8)).toBe(40);
    expect(dcdqDangerCutoffFor(9)).toBe(40);
    expect(dcdqDangerCutoffFor(10)).toBe(42);
    expect(dcdqDangerCutoffFor(15)).toBe(42);
    expect(dcdqDangerCutoffFor(undefined)).toBe(31);
    expect(DCDQ_WARN_CEILING).toBe(42);
  });
});

describe('گیت ۱.۲۵.۰۶ — ردگیر ملاک‌های DSM', () => {
  it('ODD هشت‌ملاکی: oA6→odd.a6 بازگشت؛ oA1 تنها در odd.a1؛ هم‌گرایی SNAP s19-s26 هر دو مرجع', () => {
    const odd = rulesOf('odd')!;
    const aMap = odd.criteriaMap.filter((m) => m.criterionId.startsWith('odd.a') && m.toolKey === 'ce-odd-criteria-v1');
    expect(aMap.map((m) => m.criterionId)).toEqual(['odd.a1', 'odd.a2', 'odd.a3', 'odd.a4', 'odd.a5', 'odd.a6', 'odd.a7', 'odd.a8']);
    expect(aMap.find((m) => m.criterionId === 'odd.a1')!.itemRefs).toEqual(['oA1']); // تا‌شدن oA6 برداشته شد
    const snapOdd = odd.criteriaMap.filter((m) => m.criterionId.startsWith('odd.a') && m.toolKey.startsWith('ce-snap-iv'));
    expect(snapOdd.length).toBe(16); // ۸ ملاک × والد + معلم
    expect(snapOdd.find((m) => m.criterionId === 'odd.a6')!.itemRefs).toEqual(['s24']);
  });

  it('ADHD: a1/a2/c با آیتم‌های SNAP هر دو مرجع پر شده‌اند — بدون itemRefs خالی', () => {
    const adhd = rulesOf('adhd')!;
    for (const cid of ['adhd.a1', 'adhd.a2', 'adhd.c']) {
      const entries = adhd.criteriaMap.filter((m) => m.criterionId === cid);
      expect(entries.length).toBe(2); // والد + معلم
      for (const e of entries) {
        expect(e.itemRefs.length).toBeGreaterThan(0);
        expect(e.passScore).toBe(2);
      }
    }
    expect(adhd.criteriaMap.find((m) => m.criterionId === 'adhd.a1' && m.toolKey === 'ce-snap-iv-p-v1')!.itemRefs).toHaveLength(9);
  });

  it('BIF آگاهانه خالی می‌ماند (ملاک بازه‌ای با ماشین ANY-item بیان‌شدنی نیست — سند در rules.ts)', () => {
    const bif = rulesOf('slow_learner')!;
    expect(bif.criteriaMap.every((m) => m.itemRefs.length === 0)).toBe(true);
  });
});

describe('گیت ۱.۲۵.۰۶ — رفتاری موتور صورت‌بندی با منبع مشترک', () => {
  const child = { id: 's-test', ageYears: 9 };
  /* موک هم‌شکل رویداد واقعی: analysis.subscaleScores (موتور از آن می‌خواند) + band/bands برای totalColor */
  const ev = (toolKey: string, payload: Record<string, { value: number }>, score: number, extra?: { subscaleScores?: { id: string; score: number; color?: string }[]; band?: string; bands?: { label: string; color: string }[] }) => ({
    eventId: crypto.randomUUID(),
    toolKey,
    status: 'completed',
    occurredAt: new Date().toISOString(),
    payload,
    analysis: { score, flags: [], subscaleScores: extra?.subscaleScores ?? null, band: extra?.band ?? null },
    bands: extra?.bands ?? null
  });

  it('DCDQ سنی: نمرهٔ ۳۸ برای کودک ۹س (مرز ۴۰) خطر می‌گیرد؛ بی‌سن همان نمره مرزی می‌ماند', () => {
    const dcdq = () => ev('ce-dcdq-v1', Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`d${String(i + 1).padStart(2, '0')}`, { value: 3 }])), 38, {
      band: 'بسته به سن — با مرزِ سنی مقایسه شود',
      bands: [{ label: 'بسته به سن — با مرزِ سنی مقایسه شود', color: 'warn' }]
    });
    const withAge = formulateCase({ events: [dcdq()], wechsler: null, ot: null, gates: null, child });
    const motorRow = withAge.constructs.find((c) => c.key === 'motor_coord')!;
    expect(motorRow.evidenceFa.some((e) => e.textFa.includes('زیر برش سنی'))).toBe(true); // ۳۸ ≤ ۴۰ → خطر
    const noAge = formulateCase({ events: [dcdq()], wechsler: null, ot: null, gates: null, child: { id: 's-test' } });
    const motorNoAge = noAge.constructs.find((c) => c.key === 'motor_coord')!;
    expect(motorNoAge.evidenceFa.some((e) => e.textFa.includes('در مرز برش سنی'))).toBe(true); // باند همگانی DB → مرزی
  });

  it('SNAP والد+معلم با نشانه‌های کامل → سازهٔ توجه-اجرا برمی‌آید (قواعد از rules.ts)', () => {
    const snap = (toolKey: string) => ev(toolKey, Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`s${String(i + 1).padStart(2, '0')}`, { value: 3 }])), 78, {
      subscaleScores: [
        { id: 'ia', score: 27, color: 'danger' },
        { id: 'hi', score: 27, color: 'danger' },
        { id: 'odd', score: 24, color: 'danger' }
      ]
    });
    const f = formulateCase({ events: [snap('ce-snap-iv-p-v1'), snap('ce-snap-iv-t-v1')], wechsler: null, ot: null, gates: null, child });
    const attention = f.constructs.find((c) => c.key === 'attention_exec')!;
    expect(attention.level).not.toBe('پایین');
    expect(attention.sources.length).toBeGreaterThanOrEqual(2); // هم‌گرایی خانه/مدرسه
  });
});
