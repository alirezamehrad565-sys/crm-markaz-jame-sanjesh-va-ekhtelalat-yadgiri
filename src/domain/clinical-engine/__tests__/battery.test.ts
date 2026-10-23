import { describe, it, expect } from 'vitest';
import {
  BATTERY,
  batteryDef,
  WCPM_NORM_50TH
} from '../instruments';
import { runInference } from '../infer';
import { CLINICAL_TARGETS, SUPPORT_TARGETS, ALL_TARGETS, targetOf, totalExerciseCount } from '../targets';
import { DSM_RECORDS } from '../dsm-criteria';
import { RULES, rulesOf, CONFIDENCE_THRESHOLDS, ODD_MIN_FULL_CRITERIA, BIF_IQ_RANGE, SCARED_SCHOOL_CUTOFF } from '../rules';
import { BATTERY_VERSION } from '../types';
import type { EvidenceEvent } from '../types';
import { CaseEventTypeInputSchema, validateTypeDefinition, resolveBandV2, FIELDS_MAX, packageComponentsOf, COMPOSITE_FAMILY_COMPONENTS } from '@domain/case-events/pure';
import type { CaseEventBand, CaseEventSubscale } from '@domain/case-events';

const EXISTING_TOOLS = new Set([
  'sdq-parent', 'conners-short', 'achenbach-practical', 'teacher-classroom', 'quick-multi-v1',
  'anamnesis', 'intervention', 'home_behavior', 'legacy_assessment', 'wechsler', 'ce-wechsler-w4-v1'
]);

describe('باتری battery-v1 — اعتبار ساختاری', () => {
  it('۲۳ ابزار ثابت دارد و کلیدها یکتا هستند (T4: شرح‌حال نسخهٔ ۳ کنار نسخهٔ ۲ — T5: جامع خانواده — T7: جامع معلم + ملاک‌های کلاسی — T9/m152: چیپ حسی — T10/m153: چیپ هستهٔ خواندن)', () => {
    const BATTERY_KEYS = BATTERY.map((d) => d.key);
    expect(BATTERY.length).toBe(23);
    expect(new Set(BATTERY_KEYS).size).toBe(23);
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

  it('هر ابزار از اعتبارسنجی معنایی (باندها = بیشینهٔ ممکن) می‌گذرد — پکیج با شاخهٔ packageComponents', () => {
    for (const def of BATTERY) {
      expect(() =>
        validateTypeDefinition({
          category: def.category,
          fields: def.fields ?? [],
          bands: def.bands ?? null,
          familyFillable: def.familyFillable,
          subscales: def.subscales ?? null,
          packageComponents: def.packageComponents ?? null
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

describe('شرح‌حال — نسخهٔ ۲ و نسخهٔ ۳ (T4 m148)', () => {
  const V3_ENGINE_KEYS = [
    'sld_read_concern', 'sld_write_concern', 'sld_calc_concern', 'attention_concern', 'hyper_concern',
    'exam_anxiety', 'morning_somatic', 'crisis_event', 'sensory_concern', 'home_language',
    'decline_scope', 'absence_level', 'school_change', 'prev_intervention'
  ];

  it('نسخهٔ ۲ دست‌نخورده است — ۳۴ فیلد، ۷ سربرگ، شکایت اصلی الزامی (پرونده‌های قدیمی)', () => {
    const v2 = batteryDef('ce-anamnesis-v2');
    expect(v2).toBeTruthy();
    expect(v2?.fields?.length).toBe(34);
    expect(v2?.fields?.filter((f) => f.type === 'heading')).toHaveLength(7);
    expect(v2?.fields?.find((f) => f.key === 'chief_complaint')?.required).toBe(true);
    expect(v2?.bands ?? null).toBeNull();
    expect(v2?.subscales ?? null).toBeNull();
  });

  it('نسخهٔ ۳ — جلسه، مخاطب خانواده، بدون باند، ≤۴۵ فیلد با کلیدهای ثابت موتور', () => {
    const v3 = batteryDef('ce-anamnesis-v3');
    expect(v3).toBeTruthy();
    expect(v3?.category).toBe('session');
    expect(v3?.familyFillable).toBe(false);
    expect(v3?.audience).toBe('family');
    expect(v3?.bands ?? null).toBeNull();
    expect(v3?.subscales ?? null).toBeNull();
    expect(v3?.fields!.length).toBeLessThanOrEqual(FIELDS_MAX);
    expect(v3?.fields?.filter((f) => f.type === 'heading')).toHaveLength(7);
    const keys = new Set(v3?.fields?.map((f) => f.key));
    for (const k of V3_ENGINE_KEYS) expect(keys.has(k), `کلید موتور v3: ${k}`).toBe(true);
    expect(v3?.fields?.find((f) => f.key === 'chief_complaint')?.required).toBe(true);
    expect(keys.has('weak_subjects')).toBe(true);
  });

  it('گزینه‌های کلیدهای موتور نسخهٔ ۳ با جدول نگاشت موتور هم‌خوان است', () => {
    const v3 = batteryDef('ce-anamnesis-v3');
    const opt = (k: string): string[] => v3?.fields?.find((f) => f.key === k)?.options ?? [];
    for (const k of ['sld_read_concern', 'sld_write_concern', 'sld_calc_concern', 'attention_concern', 'hyper_concern', 'exam_anxiety', 'sensory_concern']) {
      expect(opt(k), k).toEqual(['بدون نگرانی', 'کم', 'متوسط', 'زیاد — نگران‌کننده']);
    }
    expect(opt('decline_scope')).toContain('همهٔ درس‌ها با هم افت کرده‌اند');
    expect(opt('morning_somatic')).toEqual(['نه', 'گاهی', 'بیشتر روزها — بدون علت پزشکی']);
    expect(opt('absence_level')).toEqual(['ندارد', 'کمتر از یک ماه', 'یک تا سه ماه', 'بیش از سه ماه']);
    expect(opt('home_language')).toEqual(['فارسی', 'دوزبانه', 'غیرفارسی']);
  });
});

describe('T5 (m150) — فرم جامع خانواده: SDQ والد رسمی + سنجهٔ انطباق + پکیج', () => {
  it('SDQ والد: ۲۵ آیتم با همان کلید/ترتیب/لنگر نسخهٔ معلم، زیرمقیاس‌ها دقیقاً emo/cond/hyper/peer/pros، باندهای کل رسمی به‌تفکیک گزارش‌دهنده (m176)', () => {
    const p = batteryDef('ce-sdq-p-v1');
    const t = batteryDef('ce-sdq-t-v1');
    expect(p).toBeTruthy();
    expect(p?.audience).toBe('family');
    expect(p?.familyFillable).toBe(true);
    expect(p?.fields?.length).toBe(25);
    expect(p?.fields?.map((f) => f.key)).toEqual(t?.fields?.map((f) => f.key));
    expect(p?.fields?.map((f) => f.scaleLabels)).toEqual(t?.fields?.map((f) => f.scaleLabels));
    const diffKeys = p?.fields?.filter((f, i) => f.label !== t?.fields?.[i].label).map((f) => f.key);
    expect(diffKeys).toEqual(['i06', 'i09', 'i11', 'i14', 'i19']);
    expect(p?.subscales?.map((s) => s.id)).toEqual(['emo', 'cond', 'hyper', 'peer', 'pros']);
    expect(JSON.stringify(p?.subscales)).toBe(JSON.stringify(t?.subscales));
    // — m176: برش کل رسمی چهارباندی — والد ۱۳/۱۶/۱۹، معلم ۱۱/۱۵/۱۸ (برگهٔ رسمی ۴–۱۷، sdqinfo)
    const pb = p?.bands as CaseEventBand[];
    const tb = t?.bands as CaseEventBand[];
    expect(pb.map((b) => (b.max === 9999 ? 'X' : b.max))).toEqual([13, 16, 19, 'X']);
    expect(tb.map((b) => (b.max === 9999 ? 'X' : b.max))).toEqual([11, 15, 18, 'X']);
    expect(pb.length).toBe(4);
    expect(tb.length).toBe(4);
    expect(resolveBandV2(13, pb)?.color).toBe('ok');
    expect(resolveBandV2(14, pb)?.color).toBe('warn');
    expect(resolveBandV2(20, pb)?.color).toBe('danger');
    expect(resolveBandV2(11, tb)?.color).toBe('ok');
    expect(resolveBandV2(12, tb)?.color).toBe('warn');
    expect(resolveBandV2(19, tb)?.color).toBe('danger');
  });

  it('سنجهٔ انطباق: ۱۲ آیتم ۰–۲، زیرمقیاس واحد id_adapt، نمرهٔ بالاتر = انطباق بهتر (باندهای پایین/مرزی/نرمال)', () => {
    const d = batteryDef('ce-id-adapt-v1');
    expect(d).toBeTruthy();
    expect(d?.familyFillable).toBe(true);
    expect(d?.fields?.length).toBe(12);
    for (const f of d?.fields ?? []) {
      expect(f.type).toBe('scale');
      expect(f.scaleMax).toBe(2);
      expect(f.subscaleId).toBe('id_adapt');
    }
    expect(d?.subscales?.map((s) => s.id)).toEqual(['id_adapt']);
    const bands = d?.bands as CaseEventBand[];
    expect(resolveBandV2(5, bands)?.color).toBe('danger');
    expect(resolveBandV2(15, bands)?.color).toBe('warn');
    expect(resolveBandV2(22, bands)?.color).toBe('ok');
    expect((d?.fields ?? []).reduce((sum, f) => sum + (f.scaleMax ?? 3), 0)).toBe(24);
    expect(bands[bands.length - 1].max).toBe(24);
  });

  it('پکیج ce-comp-family-v2: دستهٔ جلسه، خانواده‌پذیر، بلوک زمینه ≤۸ فیلد بدون آیتم نمره‌دار و کامپوننت‌ها به‌ترتیب قرارداد', () => {
    const d = batteryDef('ce-comp-family-v2');
    expect(d).toBeTruthy();
    expect(d?.category).toBe('session');
    expect(d?.familyFillable).toBe(true);
    expect(d?.audience).toBe('family');
    expect(d?.bands ?? null).toBeNull();
    expect(d?.subscales ?? null).toBeNull();
    expect(d?.packageComponents).toEqual(['ce-snap-iv-p-v1', 'ce-sdq-p-v1', 'ce-scared-p-v1', 'ce-id-adapt-v1']);
    expect((d?.fields?.length ?? 0)).toBeLessThanOrEqual(8);
    for (const f of d?.fields ?? []) {
      expect(['heading', 'select', 'text', 'longtext']).toContain(f.type);
    }
    expect(d?.fields?.find((f) => f.key === 'filled_by')?.required).toBe(true);
  });

  it('پاریتی قرارداد: packageComponents باتری ≡ COMPOSITE_FAMILY_COMPONENTS case-events و بدون تداخل کلید فیلدها', () => {
    const d = batteryDef('ce-comp-family-v2');
    expect(d?.packageComponents).toEqual([...COMPOSITE_FAMILY_COMPONENTS]);
    expect(packageComponentsOf('ce-comp-family-v2')).toEqual([...COMPOSITE_FAMILY_COMPONENTS]);
    expect(packageComponentsOf('ce-sdq-t-v1')).toBeNull();
    expect(packageComponentsOf(undefined)).toBeNull();
    const allKeys = COMPOSITE_FAMILY_COMPONENTS.flatMap((k) => (batteryDef(k)?.fields ?? []).map((f) => f.key));
    expect(new Set(allKeys).size).toBe(allKeys.length);
    const ctxKeys = (batteryDef('ce-comp-family-v2')?.fields ?? []).map((f) => f.key);
    expect(allKeys.filter((k) => ctxKeys.includes(k))).toEqual([]);
    for (const k of COMPOSITE_FAMILY_COMPONENTS) {
      expect(batteryDef(k), k).toBeTruthy();
    }
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

  it('SNAP-IV والد: برش کم‌توجهی ۱۶ (میانگین ۱٫۷۸×۹) و نافرمانی ۱۵ (۱٫۸۸×۸ — m176)', () => {
    const def = batteryDef('ce-snap-iv-p-v1');
    const ia = (def?.subscales as CaseEventSubscale[]).find((s) => s.id === 'ia');
    expect(ia?.bands?.length).toBe(3);
    expect(ia?.bands?.[0].max).toBe(16);
    const odd = (def?.subscales as CaseEventSubscale[]).find((s) => s.id === 'odd');
    expect(odd?.bands?.[0].max).toBe(15);
    expect(odd?.bands?.[1].max).toBe(19);
    // — m176: برش نافرمانی والد = ۱٫۸۸ (Swanson 2001/Bussing 2008) — ۱٫۶۷ برش ترکیبی والد است نه نافرمانی
  });

  it('m176 — SCARED: برش اجتماعی ۸ (عادی ≤۷) و مدرسه ۳ در قواعد؛ DCDQ: باندهای سنی محتاطانه ۳۱/۴۲/۶۰', () => {
    const scared = batteryDef('ce-scared-p-v1');
    const soc = (scared?.subscales as CaseEventSubscale[]).find((s) => s.id === 'soc');
    expect(soc?.bands?.[0].max).toBe(7);
    const sch = (scared?.subscales as CaseEventSubscale[]).find((s) => s.id === 'sch');
    expect(sch?.name).toBe('ترس از مدرسه');
    expect(SCARED_SCHOOL_CUTOFF).toBe(3);
    const dcdq = batteryDef('ce-dcdq-v1');
    const db = dcdq?.bands as CaseEventBand[];
    expect(db.map((b) => b.max)).toEqual([31, 42, 60]);
    expect(resolveBandV2(31, db)?.color).toBe('danger');
    expect(resolveBandV2(35, db)?.color).toBe('warn');
    expect(resolveBandV2(43, db)?.color).toBe('ok');
    expect(db[1].advice).toContain('۵ تا ۷ سال: ۳۱');
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
    const low = dysOf(probe(40, 'دوم'))!;
    expect(low).toBeDefined();
    expect(low.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.medium);
    expect(low.evidenceFa.some((e) => e.includes('پروب خواندن'))).toBe(true);
    expect(dysOf(probe(90, 'دوم'))).toBeUndefined();
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
