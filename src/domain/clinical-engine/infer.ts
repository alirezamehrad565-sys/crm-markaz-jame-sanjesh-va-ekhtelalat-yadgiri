/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — استنتاج بالینی از نتایج
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// موتور شناسایی (پلن §۵): ملاک‌محور + وزن‌دار + تفریقی + ناهم‌رأیی + گپ اطلاعاتی
// بدون I/O — ورودی EvidenceEvent[] نرمال‌شده؛ خروجی InferenceOutput قطعی و بازتولیدپذیر.
// قراردادها:
// - فقط رویدادهای completed مصرف می‌شوند (سرویس فیلتر می‌کند — این‌جا هم محافظت می‌شود)
// - «آخرین اندازه‌گیری» برای امتیاز شواهد: جدیدترین رویداد هر ابزار
// - جدول ملاک‌ها از «دو رویداد آخر هر ابزار» نظر می‌گیرد (والد + معلم — پلن §۵ گام ۱)
// - هم‌رأیی والد/معلم: جفت شاهد danger از دو مرجعِ consensus — هر دو ×۱٫۵ (پلن §۵ گام ۲)

import type {
  EvidenceEvent,
  EvidenceRule,
  InferenceOutput,
  ProbeDef,
  RankedHypothesis,
  RuleSet,
  ConfidenceLevel,
  DsmCriterionStatus
} from './types';
import { BATTERY_VERSION } from './types';
import type { CaseEventBand } from '@domain/case-events';
import { RULES, rulesOf, CONFIDENCE_THRESHOLDS, ODD_MIN_FULL_CRITERIA, ASD_B_FULL_CRITERIA, BIF_IQ_RANGE, SCARED_SCHOOL_CUTOFF } from './rules';
import { DSM_RECORDS } from './dsm-criteria';
import { targetOf } from './targets';
import { WCPM_NORM_50TH, ALPHA_15S_NORM, DIGITS_2MIN_NORM, ENGINE_DISCLAIMER, batteryDef } from './instruments';
import { WECHSLER_W4_EVENT_KEY, wechslerHypothesisBoost } from './wechsler-link';

// ───────── نگاشت پروب‌ها (هاردکد — پلن §۴ لایهٔ ۳) ─────────

export const PROBES: ProbeDef[] = [
  { toolKey: 'ce-probe-read-v1', valueField: 'wcpm', gradeField: 'text_grade', norm: WCPM_NORM_50TH, fa: 'پروب روانی‌خواندن' },
  { toolKey: 'ce-probe-write-v1', valueField: 'alpha15s', gradeField: 'dict_grade', norm: ALPHA_15S_NORM, fa: 'پروب روانی‌نوشتن' },
  { toolKey: 'ce-probe-calc-v1', valueField: 'digits2min', gradeField: 'calc_grade', norm: DIGITS_2MIN_NORM, fa: 'پروب سلیقۀ حساب' }
];

function probeDefOf(toolKey: string): ProbeDef | undefined {
  return PROBES.find((p) => p.toolKey === toolKey);
}

// ───────── ابزارهای کمکی ─────────

function completed(events: EvidenceEvent[]): EvidenceEvent[] {
  return events.filter((e) => e.status === 'completed');
}

/** جدیدترین رویداد هر کلید ابزار (ورودی نزولی زمانی — اولین = جدیدترین) */
function latestPerTool(events: EvidenceEvent[]): Map<string, EvidenceEvent> {
  const map = new Map<string, EvidenceEvent>();
  for (const e of events) {
    if (!map.has(e.toolKey)) map.set(e.toolKey, e);
  }
  return map;
}

/** دو رویداد آخر هر ابزار — منابع جدول ملاک‌ها و هم‌رأیی */
function latestTwoPerTool(events: EvidenceEvent[]): Map<string, EvidenceEvent[]> {
  const map = new Map<string, EvidenceEvent[]>();
  for (const e of events) {
    const arr = map.get(e.toolKey);
    if (arr) {
      if (arr.length < 2) arr.push(e);
    } else {
      map.set(e.toolKey, [e]);
    }
  }
  return map;
}

function colorOfBandLabel(label: string | null | undefined, bands: CaseEventBand[] | null | undefined): 'ok' | 'warn' | 'danger' | null {
  if (!label || !bands) return null;
  return bands.find((b) => b.label === label)?.color ?? null;
}

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  return Number.isFinite(n) ? n : null;
}

function payloadText(e: EvidenceEvent, keys: string[]): string {
  if (!e.payload) return '';
  return keys.map((k) => e.payload?.[k]?.value ?? '').join(' ');
}

// ───────── رنگ هر قاعدهٔ شواهد از یک رویداد مشخص ─────────

type BandColor = 'ok' | 'warn' | 'danger';

/** رنگ تحقق یک قاعده نسبت به رویداد داده‌شده — null یعنی داده‌ای نیست */
function ruleColor(rule: EvidenceRule, event: EvidenceEvent | undefined): BandColor | null {
  if (!event) return null;

  if (rule.kind === 'probe') {
    const def = probeDefOf(rule.toolKey);
    if (!def) return null;
    const value = num(event.payload?.[def.valueField]?.value);
    const grade = event.payload?.[def.gradeField]?.value ?? null;
    if (value === null || !grade) return null;
    const n = def.norm[grade];
    if (!n) return null;
    // قرارداد پروب (قبلاً probeStatus): زیر ۸۰٪ هنجار = پایین از انتظار (شاهد اصلی)
    return value < n * 0.8 ? 'danger' : 'ok';
  }

  if (rule.kind === 'wechsler') {
    const fsiq = num(event.payload?.['fsiq']?.value);
    if (fsiq === null) return null;
    return fsiq >= BIF_IQ_RANGE.min && fsiq <= BIF_IQ_RANGE.max ? 'danger' : 'ok';
  }

  // anamnesis با پرچم هدف‌محور جداگانه اعمال می‌شود (anamnesisFlagFor) — این‌جا null
  if (rule.kind === 'anamnesis') return null;

  // instrument / sdq — از تحلیل چک‌لیست (زیرمقیاس یا کل)
  const analysis = event.analysis;
  if (!analysis) return null;
  if (rule.subscaleId) {
    const ss = analysis.subscaleScores?.find((s) => s.id === rule.subscaleId);
    if (!ss) return null;
    if (ss.color) return ss.color;
    // فال‌بک رویدادهای قدیمی: برچسب باند → رنگ از تعریف زیرمقیاس
    const def = event.subscales?.find((s) => s.id === rule.subscaleId);
    return colorOfBandLabel(ss.band, def?.bands ?? null);
  }
  return colorOfBandLabel(analysis.band, event.bands);
}

/**
 * پرچم‌های شرح‌حال — هیوریستیک شفاف v1 روی متن فیلدهای آزاد (کامنت‌دار و تست‌پذیر).
 * با دادهٔ مرکز به فلگ ساخت‌یافتهٔ دقیق ارتقا می‌یابد.
 */
const ANAMNESIS_TEXT_FIELDS = ['chief_complaint', 'weak_subjects', 'development', 'medical'];

function anamnesisFlagFor(targetKey: string, event: EvidenceEvent | undefined): boolean {
  if (!event || event.toolKey !== 'ce-anamnesis-v2') return false;
  const text = payloadText(event, ANAMNESIS_TEXT_FIELDS);
  if (!text) return false;
  if (targetKey === 'slow_learner') {
    // «افت تحصیلی تدریجی همه‌درسی» — الگوی متن آزاد v1
    return text.includes('افت') && (text.includes('همه') || text.includes('همۀ'));
  }
  if (targetKey === 'anxiety') {
    // «نشانهٔ جسمانی صبحگاهی بدون علت پزشکی»
    return text.includes('صبح') && ['دل‌درد', 'دل درد', 'تهوع', 'شکم', 'استفراغ', 'سردرد'].some((w) => text.includes(w));
  }
  return false;
}

// ───────── گام ۱ — جدول وضعیت ملاک‌ها ─────────

function criterionStatus(criterionId: string, ruleSet: RuleSet, perTool: Map<string, EvidenceEvent[]>): DsmCriterionStatus {
  const entries = ruleSet.criteriaMap.filter((m) => m.criterionId === criterionId);
  let metCount = 0;
  let answeredEvents = 0;
  let zeroOnly = true;
  const sources: string[] = [];

  for (const entry of entries) {
    for (const event of perTool.get(entry.toolKey) ?? []) {
      const values = entry.itemRefs.map((k) => num(event.payload?.[k]?.value));
      if (!values.some((v) => v !== null)) continue;
      answeredEvents += 1;
      const endorsed = values.some((v) => v !== null && v >= entry.passScore);
      const partial = values.some((v) => v !== null && v > 0 && v < entry.passScore);
      if (endorsed) {
        metCount += 1;
        zeroOnly = false;
      } else if (partial) {
        zeroOnly = false;
      }
      sources.push(event.typeTitle);
    }
  }

  // «باند بالا در دو مرجع = برآورده؛ یکی = ناقص؛ هیچ = نامشخص/نیاز به بررسی» (پلن §۵ گام ۱)
  if (metCount >= 2) return { criterionId, status: 'met', sources };
  if (metCount === 1) return { criterionId, status: 'partial', sources };
  if (answeredEvents > 0 && zeroOnly) return { criterionId, status: 'not_met', sources };
  return { criterionId, status: 'unknown', sources };
}

/** تعداد ملاک‌های A با نمرهٔ کامل از هر مرجع — قاعدهٔ ویژهٔ ODD (≥۴ از ۸) */
function fullCriteriaCount(targetKey: string, perTool: Map<string, EvidenceEvent[]>): number {
  const ruleSet = rulesOf(targetKey);
  if (!ruleSet) return 0;
  let full = 0;
  for (const entry of ruleSet.criteriaMap) {
    if (!entry.criterionId.startsWith(`${targetKey}.a`)) continue;
    const endorsed = (perTool.get(entry.toolKey) ?? []).some((event) =>
      entry.itemRefs.some((k) => {
        const v = num(event.payload?.[k]?.value);
        return v !== null && entry.passScore > 0 && v >= entry.passScore;
      })
    );
    if (endorsed) full += 1;
  }
  return full;
}

/** الگوی ملاکی اتیسم: هر سه A برآورده + تعداد Bهای برآورده (قاعدهٔ §۵ — حداقل ۲ از ۴) */
function autismPattern(perTool: Map<string, EvidenceEvent[]>): { allA: boolean; bMet: number } {
  const ruleSet = rulesOf('autism');
  if (!ruleSet) return { allA: false, bMet: 0 };
  const status = (id: string) => criterionStatus(id, ruleSet, perTool).status;
  const allA = ['autism.a1', 'autism.a2', 'autism.a3'].every((id) => status(id) === 'met');
  const bMet = ['autism.b1', 'autism.b2', 'autism.b3', 'autism.b4'].filter((id) => status(id) === 'met').length;
  return { allA, bMet };
}

// ───────── هم‌رأیی والد/معلم (گام ۲ — ×۱٫۵) ─────────

/**
 * آیا این رویداد، شاهد danger برای یکی از قواعد danger همان ابزار می‌سازد؟
 * خروجی: وزن قاعدهٔ محقق‌شده (برای محاسبهٔ ضریب) — یا null.
 */
function dangerWeightOf(rules: EvidenceRule[], toolKey: string, event: EvidenceEvent): number | null {
  for (const rule of rules) {
    if (rule.toolKey !== toolKey || rule.band !== 'danger') continue;
    if (rule.kind === 'anamnesis') continue;
    if (ruleColor(rule, event) === 'danger') return rule.weight;
  }
  return null;
}

interface ConsensusResult {
  /** نیم‌جمع وزن جفت — به امتیاز اضافه می‌شود تا جفت = ۱٫۵ برابر جمع پایه */
  bonus: number;
  /** شاهد تک‌مرجعی خانه بدون تأیید معلم — برای خط ناهم‌رأیی */
  oneSided: boolean;
}

function consensusOf(ruleSet: RuleSet, perTool: Map<string, EvidenceEvent[]>): ConsensusResult {
  if (!ruleSet.consensus) return { bonus: 0, oneSided: false };
  const { parent, teacher } = ruleSet.consensus;
  const parentEvents = perTool.get(parent) ?? [];
  // ابزار یکسان (مثل چک‌لیست‌های ملاکی والد+معلم): دو رویداد جدا؛ ابزار متفاوت (SNAP والد/معلم)
  const teacherEvents = teacher === parent ? parentEvents.slice(1) : perTool.get(teacher) ?? [];
  const pw = parentEvents.length > 0 ? dangerWeightOf(ruleSet.evidence, parent, parentEvents[0]) : null;
  const tw = teacherEvents.length > 0 ? dangerWeightOf(ruleSet.evidence, teacher, teacherEvents[0]) : null;
  if (pw !== null && tw !== null) {
    return { bonus: pw * 0.5 + tw * 0.5, oneSided: false };
  }
  // ناهم‌رأیی فقط وقتی هر دو مرجع پاسخ داده‌اند ولی فقط یکی danger است
  if (parentEvents.length > 0 && teacherEvents.length > 0 && (pw !== null) !== (tw !== null)) {
    return { bonus: 0, oneSided: true };
  }
  return { bonus: 0, oneSided: false };
}

// ───────── موتور اصلی ─────────

export interface InferOptions {
  /** ISO UTC — تزریقی برای تست */
  now?: () => Date;
}

export function runInference(events: EvidenceEvent[], options: InferOptions = {}): InferenceOutput {
  const done = completed(events);
  const latest = latestPerTool(done);
  const perTool = latestTwoPerTool(done);
  const now = options.now ?? (() => new Date());

  const seen = [...latest.keys()];
  const seenTitles = [...new Set([...latest.values()].map((e) => e.typeTitle))];

  const hypotheses: RankedHypothesis[] = [];
  const criteria: InferenceOutput['criteria'] = [];
  const discrepancies: string[] = [];
  const referralFlags: string[] = [];
  const nextActionsSet = new Set<string>();

  for (const ruleSet of RULES) {
    const target = targetOf(ruleSet.targetKey);
    if (!target) continue;

    // ۰) گیت داده: بدون هیچ رویدادِ معنادار از ابزارهای همین هدف → رد شود (بدون ملاک‌های بی‌معنی)
    const toolKeys = new Set<string>([
      ...ruleSet.evidence.map((r) => r.toolKey),
      ...ruleSet.criteriaMap.map((m) => m.toolKey)
    ]);
    if (ruleSet.consensus) {
      toolKeys.add(ruleSet.consensus.parent);
      toolKeys.add(ruleSet.consensus.teacher);
    }
    // تقویت وکسلر خودش شاهد است — فرضیه‌های engine_output فرم ce-wechsler-w4-v1 به هدف همین ruleSet
    const wBoost0 = wechslerHypothesisBoost(latest.get(WECHSLER_W4_EVENT_KEY), ruleSet.targetKey);
    const hasData = [...toolKeys].some((k) => {
      const e = latest.get(k);
      return Boolean(e && (e.analysis || e.payload));
    }) || Boolean(wBoost0);
    if (!hasData) continue;

    // ۱) امتیاز شواهد — instrument/sdq از «دو مرجع» (دو رویداد آخر هر ابزار)؛
    // پروب/وکسلر از آخرین اندازه‌گیری؛ band = رنگِ دقیقِ لازم (warn فقط مرزی، danger فقط بالینی)
    const evidenceFa: string[] = [];
    const seenFa = new Set<string>();
    const addFa = (fa: string) => {
      if (!seenFa.has(fa)) {
        seenFa.add(fa);
        evidenceFa.push(fa);
      }
    };
    let score = 0;
    for (const rule of ruleSet.evidence) {
      if (rule.kind === 'anamnesis') continue; // با پرچم هدف‌محور پایین
      if (rule.kind === 'probe' || rule.kind === 'wechsler') {
        const color = ruleColor(rule, latest.get(rule.toolKey));
        if (color === null || color !== rule.band) continue;
        score += rule.weight;
        addFa(rule.fa);
        continue;
      }
      for (const event of perTool.get(rule.toolKey) ?? []) {
        const color = ruleColor(rule, event);
        if (color === null || color !== rule.band) continue;
        score += rule.weight;
        addFa(rule.fa);
      }
    }

    // پرچم شرح‌حال هدف‌محور (w۱)
    if (ruleSet.evidence.some((r) => r.kind === 'anamnesis') && anamnesisFlagFor(ruleSet.targetKey, latest.get('ce-anamnesis-v2'))) {
      score += 1;
      const rule = ruleSet.evidence.find((r) => r.kind === 'anamnesis');
      if (rule) evidenceFa.push(rule.fa);
    }

    // تقویت فرضیهٔ وکسلر ۴ — وزن ۲ (بالا) یا ۱ (متوسط) به امتیاز و متن شاهد به شواهد
    if (wBoost0) {
      score += wBoost0.weight;
      evidenceFa.push(wBoost0.fa);
    }

    // ۲) هم‌رأیی والد/معلم — جفت danger هر دو مرجع → جمع جفت ×۱٫۵
    const consensus = consensusOf(ruleSet, perTool);
    score += consensus.bonus;
    if (consensus.bonus > 0) {
      evidenceFa.push('گزارش خانه و مدرسه هم‌رأی است — وزن شواهد بیشتر شد.');
    } else if (consensus.oneSided) {
      discrepancies.push(`برای «${target.title}» گزارش خانه و مدرسه هم‌رأی نیست — هیچ‌کدام را قطعی نگیرید؛ بررسی بیشتر لازم است.`);
    }

    // ۳) قواعد ویژهٔ ملاکی
    if (ruleSet.targetKey === 'odd') {
      const full = fullCriteriaCount('odd', perTool);
      if (full >= ODD_MIN_FULL_CRITERIA) {
        evidenceFa.push(`${full} ملاک A نافرمانی با نمرهٔ کامل گزارش شده است (حداقل لازم: ${ODD_MIN_FULL_CRITERIA}).`);
        score += 1;
      }
    }
    if (ruleSet.targetKey === 'autism') {
      const asd = autismPattern(perTool);
      if (asd.allA && asd.bMet >= ASD_B_FULL_CRITERIA) {
        evidenceFa.push(`هر سه ملاک A و ${asd.bMet} ملاک B اتیسم برآورده شده است (حداقل B لازم: ${ASD_B_FULL_CRITERIA}).`);
        score += 1;
      }
    }

    // ۴) جدول ملاک‌ها — همیشه کامل حتی برای فرضیه‌های نشده (پلن §۵ گام ۱)
    const dsm = DSM_RECORDS[ruleSet.targetKey];
    const critSummary = { met: 0, partial: 0, unknown: 0, notMet: 0 };
    if (dsm) {
      for (const criterion of dsm.criteria) {
        const status = criterionStatus(criterion.id, ruleSet, perTool);
        criteria.push({ ...status, targetKey: ruleSet.targetKey, textFa: criterion.textFa, group: criterion.group });
        critSummary[status.status === 'not_met' ? 'notMet' : status.status] += 1;
      }
    }

    // ۵) گپ اطلاعاتی — ابزار بعدی همان هدف
    const missingFa: string[] = [];
    for (const toolKey of ruleSet.nextInstrument) {
      if (!latest.has(toolKey)) {
        const probe = probeDefOf(toolKey);
        missingFa.push(probe ? `${probe.fa} هنوز گرفته نشده است.` : `${batteryDef(toolKey)?.title ?? `ابزار «${toolKey}»`} هنوز ارسال/ثبت نشده است.`);
      }
    }

    // ۶) اطمینان توصیفی (آستانه‌های §۵ — کم/متوسط/زیاد)
    const confidence: ConfidenceLevel =
      score >= CONFIDENCE_THRESHOLDS.high ? 'زیاد' : score >= CONFIDENCE_THRESHOLDS.medium ? 'متوسط' : 'کم';

    // ۷) تفریق‌ها فقط برای فرضیه‌های جدی
    const differentialsFa = confidence === 'کم' ? [] : ruleSet.differentials.map((d) => d.fa);

    if (score > 0) {
      hypotheses.push({
        targetKey: ruleSet.targetKey,
        targetTitle: target.title,
        confidence,
        score: Math.round(score * 10) / 10,
        evidenceFa,
        missingFa,
        differentialsFa,
        criteriaSummary: critSummary
      });
    }

    // ۸) گپ → اقدام بعدی
    for (const m of missingFa) nextActionsSet.add(m);

    // ۹) خط قرمز — آیتم‌های بحرانی ابزارهای همین هدف
    const consensusTools = [ruleSet.consensus?.parent, ruleSet.consensus?.teacher].filter(Boolean) as string[];
    for (const toolKey of new Set([...consensusTools, ...ruleSet.evidence.filter((r) => r.kind === 'instrument').map((r) => r.toolKey)])) {
      for (const e of perTool.get(toolKey) ?? []) {
        for (const flag of e.analysis?.flags ?? []) {
          referralFlags.push(`${e.typeTitle}: ${flag.label}`);
        }
      }
    }
  }

  // رتبه‌بندی: امتیاز ↓ سپس ملاک‌های برآورده ↓ (sort پایدار ترتیب سند را حفظ می‌کند)
  hypotheses.sort((a, b) => b.score - a.score || b.criteriaSummary.met - a.criteriaSummary.met);

  // سقف فرضیه (پلن §۱۱ پیش‌فرض: ۳)
  const ranked = hypotheses.slice(0, 3);

  // پرچم اجتناب از مدرسه (SCARED sch — برش از قواعد: SCARED_SCHOOL_CUTOFF)
  const sch = latest.get('ce-scared-p-v1')?.analysis?.subscaleScores?.find((s) => s.id === 'sch');
  if (sch && sch.score >= SCARED_SCHOOL_CUTOFF) {
    nextActionsSet.add('اجتناب از مدرسه در SCARED گزارش شده — با معلم و خانواده دربارهٔ موقعیت مدرسه صحبت کنید.');
  }

  if (ranked.length === 0) {
    nextActionsSet.add('هنوز دادهٔ کافی برای فرضیه نیست — SDQ (والد/معلم) و شرح حال ساخت‌یافته را کامل کنید.');
  }

  return {
    batteryVersion: BATTERY_VERSION,
    generatedAt: now().toISOString(),
    criteria,
    ranked,
    discrepancies: [...new Set(discrepancies)],
    nextActions: [...nextActionsSet].slice(0, 8),
    dataCoverage: { seen, seenTitles },
    referralFlags: [...new Set(referralFlags)].slice(0, 10),
    disclaimer: ENGINE_DISCLAIMER
  };
}
