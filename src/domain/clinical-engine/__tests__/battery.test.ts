/**
 * تست‌های واحد — battery
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست‌های هستهٔ علمی: اعتبار باتری (زود + معنایی)، پوشش باندها، گره ملاک‌ها، ۱۸ هدف/۵۴ تمرین

import { describe, it, expect } from 'vitest';
import {
  BATTERY,
  batteryDef,
  WCPM_NORM_50TH
} from '../instruments';
import { runInference } from '../infer';
import { CLINICAL_TARGETS, SUPPORT_TARGETS, ALL_TARGETS, targetOf, totalExerciseCount } from '../targets';
import { DSM_RECORDS } from '../dsm-criteria';
import { RULES, rulesOf, CONFIDENCE_THRESHOLDS, ODD_MIN_FULL_CRITERIA, BIF_IQ_RANGE } from '../rules';
import { BATTERY_VERSION } from '../types';
import type { EvidenceEvent } from '../types';
import { CaseEventTypeInputSchema, validateTypeDefinition, resolveBandV2, FIELDS_MAX } from '@domain/case-events/pure';
import type { CaseEventBand, CaseEventSubscale } from '@domain/case-events';

// ابزارهای استاندارد موجود در DB (قبل از ) — قواعد به آن‌ها هم ارجاع می‌دهند
// (m132+: فرم وکسلر قدیمی wechsler بازنشسته شد — قواعد به فرم جدید ce-wechsler-w4-v1 ارجاع می‌دهند)
const EXISTING_TOOLS = new Set([
  'sdq-parent', 'conners-short', 'achenbach-practical', 'teacher-classroom', 'quick-multi-v1',
  'anamnesis', 'intervention', 'home_behavior', 'legacy_assessment', 'wechsler', 'ce-wechsler-w4-v1'
]);

describe('باتری battery-v1 — اعتبار ساختاری', () => {
  it('۱۵ ابزار ثابت دارد و کلیدها یکتا هستند', () => {
    const BATTERY_KEYS = BATTERY.map((d) => d.key);
    expect(BATTERY.length).toBe(15);
    expect(new Set(BATTERY_KEYS).size).toBe(15);
    expect(BATTERY_VERSION).toBe('battery-v1');
  });

  it('هر ابزار از اسکیمای Zod نوع رویداد می‌گذرد', () => {
    for (const def of BATTERY) {
      const parsed = CaseEventTypeInputSchema.safeParse({
        title: def.title,
        category: def.category,
        icon: def.icon,
        familyFillable: def.familyFillable,
        fields: def.fields ?? [],
        bands: def.bands ?? null,
        subscales: def.subscales ?? null,
        tags: def.tags,
        audience: def.audience
      });
      expect(parsed.success, `${def.key}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });

  it('هر چک‌لیست از اعتبارسنجی معنایی (باندها = بیشینهٔ ممکن) می‌گذرد', () => {
    for (const def of BATTERY) {
      expect(() =>
        validateTypeDefinition({
          category: def.category,
          fields: def.fields ?? [],
          bands: def.bands ?? null,
          familyFillable: def.familyFillable,
          subscales: def.subscales ?? null
        })
      ).not.toThrow(def.key);
    }
  });

  it('آیتم‌های چک‌لیست همه نمره‌دار و زیرمقیاس‌دار و کلیدها یکتا هستند', () => {
    for (const def of BATTERY) {
      if (def.category !== 'checklist') continue;
      const keys = new Set<string>();
      for (const f of def.fields ?? []) {
        expect(['scale', 'single'], `${def.key}:${f.key}`).toContain(f.type);
        expect(f.subscaleId, `${def.key}:${f.key}`).toBeTruthy();
        expect(keys.has(f.key), `کلید تکراری ${def.key}:${f.key}`).toBe(false);
        keys.add(f.key);
      }
    }
  });

  it('sameItemsAs حل شده — SNAP-IV معلم آیتم‌های والد را دارد', () => {
    const p = batteryDef('ce-snap-iv-p-v1');
    const t = batteryDef('ce-snap-iv-t-v1');
    expect(p?.fields?.length).toBe(26);
    expect(t?.fields?.length).toBe(26);
    expect(t?.fields?.[0].key).toBe(p?.fields?.[0].key);
    // باندها متفاوت‌اند (برش معلم بالاتر در کم‌توجهی)
    const pIa = (p?.subscales as CaseEventSubscale[]).find((s) => s.id === 'ia');
    const tIa = (t?.subscales as CaseEventSubscale[]).find((s) => s.id === 'ia');
    expect(pIa?.bands?.[0].max).toBe(16);
    expect(tIa?.bands?.[0].max).toBe(23);
  });

  it('سقف فیلد برای SCARED-41 و SNAP-IV-26 کافی است', () => {
    expect(FIELDS_MAX).toBeGreaterThanOrEqual(41);
    expect(batteryDef('ce-scared-p-v1')?.fields?.length).toBe(41);
  });
});

describe('باتری — برش‌ها و باندها (شواهد منتشرشده)', () => {
  it('SDQ معلم: برش کل ۱۲+ مرزی و ۱۶+ بالینی (Goodman) و بیشینهٔ ۲۰', () => {
    const bands = batteryDef('ce-sdq-t-v1')?.bands as CaseEventBand[];
    expect(resolveBandV2(10, bands)?.color).toBe('ok');
    expect(resolveBandV2(13, bands)?.color).toBe('warn');
    expect(resolveBandV2(18, bands)?.color).toBe('danger');
    const last = bands[bands.length - 1];
    expect(last.max).toBeGreaterThanOrEqual(20);
  });

  it('SCARED والد: برش کل ۲۵ (Birmaher) و بیشینهٔ ۸۲', () => {
    const bands = batteryDef('ce-scared-p-v1')?.bands as CaseEventBand[];
    expect(resolveBandV2(20, bands)?.color).toBe('ok');
    expect(resolveBandV2(25, bands)?.color).toBe('danger');
    const last = bands[bands.length - 1];
    expect(last.max).toBeGreaterThanOrEqual(82);
  });

  it('DCDQ: باندهای معکوس (نمرهٔ بالا = خوب) و بیشینهٔ ۶۰', () => {
    const bands = batteryDef('ce-dcdq-v1')?.bands as CaseEventBand[];
    expect(resolveBandV2(15, bands)?.color).toBe('danger');
    expect(resolveBandV2(35, bands)?.color).toBe('warn');
    expect(resolveBandV2(55, bands)?.color).toBe('ok');
    const last = bands[bands.length - 1];
    expect(last.max).toBeGreaterThanOrEqual(60);
  });

  it('SNAP-IV والد: برش کم‌توجهی ۱۷ (میانگین ۱٫۷۸×۹) بالای صدک ۹۵', () => {
    const def = batteryDef('ce-snap-iv-p-v1');
    const ia = (def?.subscales as CaseEventSubscale[]).find((s) => s.id === 'ia');
    expect(ia?.bands?.length).toBe(3);
    expect(ia?.bands?.[0].max).toBe(16);
  });

  it('چک‌لیست‌های ملاکی SLD: زیرمقیاس C/D خارج از جمع کل (مثل prosocial SDQ)', () => {
    for (const key of ['ce-sld-read-v1', 'ce-sld-wri-v1', 'ce-sld-calc-v1']) {
      const subs = (batteryDef(key)?.subscales ?? []) as CaseEventSubscale[];
      const c = subs.find((s) => s.id === 'critc');
      const d = subs.find((s) => s.id === 'critd');
      expect(c?.excludeFromTotal, key).toBe(true);
      expect(d?.excludeFromTotal, key).toBe(true);
    }
  });
});

describe('لایهٔ DSM — ملاک‌های ۱۰ هدف بالینی', () => {
  it('هر ۱۰ هدف بالینی رکورد DSM با کد ICD دارد', () => {
    expect(CLINICAL_TARGETS.length).toBe(10);
    for (const t of CLINICAL_TARGETS) {
      expect(DSM_RECORDS[t.key], t.key).toBeTruthy();
      expect(DSM_RECORDS[t.key].icd.length).toBeGreaterThan(2);
      expect(DSM_RECORDS[t.key].criteria.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('۸ هدف پشتیبان رکورد DSM ندارند (هرگز برچسب اختلال نمی‌گیرند)', () => {
    expect(SUPPORT_TARGETS.length).toBe(8);
    for (const t of SUPPORT_TARGETS) {
      expect(t.dsm).toBeUndefined();
    }
  });

  it('محیط IQ دیرآموزی ۷۰–۸۵ و قاعدهٔ ODD دست‌کم ۴ ملاک کامل', () => {
    expect(BIF_IQ_RANGE).toEqual({ min: 70, max: 85 });
    expect(ODD_MIN_FULL_CRITERIA).toBe(4);
  });
});

describe('قواعد شواهد — گره ابزار/آیتم/ملاک', () => {
  it('هر هدف قاعده دارد، ۱۰ قاعدهٔ بالینی', () => {
    expect(RULES.length).toBe(10);
    for (const t of CLINICAL_TARGETS) {
      expect(rulesOf(t.key)?.targetKey, t.key).toBe(t.key);
    }
  });

  it('کلیدهای ابزار قواعد در باتری یا ابزارهای موجود DB هستند', () => {
    const BATTERY_KEYS = BATTERY.map((d) => d.key);
    for (const r of RULES) {
      for (const e of r.evidence) {
        expect(BATTERY_KEYS.includes(e.toolKey) || EXISTING_TOOLS.has(e.toolKey), `${r.targetKey}→${e.toolKey}`).toBe(true);
      }
      for (const c of r.criteriaMap) {
        expect(BATTERY_KEYS.includes(c.toolKey) || EXISTING_TOOLS.has(c.toolKey), `${r.targetKey}→${c.toolKey}`).toBe(true);
      }
      if (r.consensus) {
        expect(BATTERY_KEYS.includes(r.consensus.parent) || EXISTING_TOOLS.has(r.consensus.parent)).toBe(true);
        expect(BATTERY_KEYS.includes(r.consensus.teacher) || EXISTING_TOOLS.has(r.consensus.teacher)).toBe(true);
      }
    }
  });

  it('هر آیتم criteriaMap واقعاً در ابزار مربوط وجود دارد', () => {
    for (const r of RULES) {
      for (const c of r.criteriaMap) {
        // معادل batteryScoredFields حذف‌شده: فقط آیتم‌های نمره‌دار (scale/single)
        const fields = c.toolKey.startsWith('ce-')
          ? (batteryDef(c.toolKey)?.fields ?? []).filter((f) => f.type === 'scale' || f.type === 'single')
          : [];
        for (const ref of c.itemRefs) {
          expect(fields.some((f) => f.key === ref), `${r.targetKey}: ${c.criterionId} ← ${ref}`).toBe(true);
        }
      }
    }
  });

  it('شناسهٔ ملاک‌های criteriaMap در رکورد DSM همان هدف تعریف شده‌اند', () => {
    for (const r of RULES) {
      const dsm = DSM_RECORDS[r.targetKey];
      const ids = new Set(dsm.criteria.map((c) => c.id));
      for (const c of r.criteriaMap) {
        expect(ids.has(c.criterionId), `${r.targetKey}: ${c.criterionId}`).toBe(true);
      }
    }
  });

  it('تفریق‌های تشخیصی به هدف‌های واقعی اشاره می‌کنند', () => {
    const keys = new Set(ALL_TARGETS.map((t) => t.key));
    for (const r of RULES) {
      for (const d of r.differentials) {
        expect(keys.has(d.targetKey), `${r.targetKey}→${d.targetKey}`).toBe(true);
      }
    }
  });

  it('آستانهٔ اطمینان صعودی و معقول', () => {
    expect(CONFIDENCE_THRESHOLDS.medium).toBeLessThan(CONFIDENCE_THRESHOLDS.high);
  });
});

describe('۱۸ هدف و ۵۴ تمرین — دفترهای آموزشی', () => {
  it('۱۸ هدف = ۱۰ بالینی + ۸ پشتیبان و هر هدف ۳ تمرین دارد', () => {
    expect(ALL_TARGETS.length).toBe(18);
    expect(totalExerciseCount()).toBe(54);
    for (const t of ALL_TARGETS) {
      expect(t.exercises.length, t.key).toBe(3);
      expect(t.exercises.every((e) => e.minutes > 0 && e.title.length > 3), t.key).toBe(true);
      expect(t.homeSigns.length).toBe(2);
      expect(t.schoolSigns.length).toBe(2);
      expect(t.texts.saw.length).toBeGreaterThan(5);
      expect(t.texts.means.length).toBeGreaterThan(5);
      expect(t.texts.next.length).toBeGreaterThan(5);
      expect(t.path.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('دیرآموزی مسیر ۵ گامی اختصاصی دارد', () => {
    expect(targetOf('slow_learner')?.path.length).toBe(5);
  });

  it('کلیدها یکتا و بدون هم‌پوشانی با برچسب‌های DB', () => {
    const keys = ALL_TARGETS.map((t) => t.key);
    expect(new Set(keys).size).toBe(18);
    for (const k of keys) {
      expect(['dyslexia', 'dysgraphia', 'dyscalculia', 'adhd', 'autism', 'speech_language', 'anxiety', 'motor_coordination', 'slow_learner', 'odd', 'working_memory', 'opportunity_gap', 'demotivation', 'test_anxiety', 'study_habits', 'transition', 'family_stress', 'single_subject']).toContain(k);
    }
  });
});

describe('پروب‌ها — هنجار و وضعیت', () => {
  it('هنجار WCPM برای پایه‌های ۱ تا ۸ موجود است', () => {
    for (const g of ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم']) {
      expect(WCPM_NORM_50TH[g]).toBeGreaterThan(0);
    }
  });

  it('قرارداد پروب در موتور شناسایی: زیر ۸۰٪ هنجار = شاهد خطر؛ در انتظار/بدون پایه = بدون شاهد', () => {
    // مصرف‌کنندهٔ واقعی هنجارها ruleColor داخل infer.ts است — قرارداد از همان‌جا سنجیده می‌شود
    const probe = (wcpm: number | null, grade: string | null): EvidenceEvent => ({
      eventId: 'p1',
      toolKey: 'ce-probe-read-v1',
      typeTitle: 'پروب عملکردی خواندن (ثبت درمانگر)',
      status: 'completed',
      occurredAt: '2026-10-03T08:00:00.000Z',
      payload: {
        ...(wcpm !== null ? { wcpm: { value: String(wcpm), label: 'WCPM' } } : {}),
        ...(grade !== null ? { text_grade: { value: grade, label: 'پایهٔ متن' } } : {})
      },
      analysis: null,
      bands: null,
      subscales: null
    });
    const dysOf = (e: EvidenceEvent) => runInference([e]).ranked.find((h) => h.targetKey === 'dyslexia');
    // زیر ۸۰٪ هنجار «دوم» (۰٫۸×۸۹ ≈ ۷۱) → شاهد پروب با وزن ۲
    const low = dysOf(probe(40, 'دوم'))!;
    expect(low).toBeDefined();
    expect(low.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.medium);
    expect(low.evidenceFa.some((e) => e.includes('پروب خواندن'))).toBe(true);
    // در بازهٔ انتظار (۹۰ ∈ ۷۱..۱۰۷) → بدون شاهد
    expect(dysOf(probe(90, 'دوم'))).toBeUndefined();
    // پایهٔ ناموجود در هنجار / مقدار یا پایهٔ غایب → نادیده
    expect(dysOf(probe(40, 'نهم'))).toBeUndefined();
    expect(dysOf(probe(null, 'دوم'))).toBeUndefined();
    expect(dysOf(probe(40, null))).toBeUndefined();
  });

  it('سه پروب عملکردی در باتری هستند و familyFillable نیستند', () => {
    for (const key of ['ce-probe-read-v1', 'ce-probe-write-v1', 'ce-probe-calc-v1']) {
      const d = batteryDef(key);
      expect(d).toBeTruthy();
      expect(d?.familyFillable).toBe(false);
      expect(d?.category).toBe('session');
    }
  });
});
