/* ═══ ۱.۲۷.x — تحلیل ساختاری نظرسنجی خانواده (چک‌لیست چندحیطه‌ای) ═══
   انگیزه: فرم‌های خانواده‌محور بدون باندِ کل (زیرمقیاس‌های excludeFromTotal — مثل «فرم ارزیابی
   عملکرد حسی _فرم خانواده») از analyzeChecklist فقط «نمرهٔ کل: ۰ از ۰» می‌گرفتند و درمانگر
   تحلیل واقعی نداشت. موتور ساختارمحور است — از بخش‌بندی خودِ فرم (subscaleId یا سربرگ‌ها) نرخ
   نشانه‌ها را به تفکیک حیطه درمی‌آورد؛ هیچ هنجار روان‌سنجی ساخته نمی‌شود و تحلیل صریحاً توصیفی
   است. به کلید فرم خاصی سیم‌کشی نیست — برای هر چک‌لیست با آیتم نمره‌دار کار می‌کند. */

export type SurveyConcernLevel = 'low' | 'medium' | 'high';

export const SURVEY_CONCERN_LEVEL_LABELS: Record<SurveyConcernLevel, string> = { low: 'کم', medium: 'متوسط', high: 'بالا' };

/** آستانه‌های نمایشی سطح نشانه‌ها — هیوریستیک توصیفیِ این ماژول، نه هنجار روان‌سنجی */
export const SURVEY_CONCERN_MEDIUM_MIN = 20;
export const SURVEY_CONCERN_HIGH_MIN = 50;

const UNASSIGNED_DOMAIN_NAME = 'سایر موارد';
const UNGROUPED_DOMAIN_NAME = 'همهٔ آیتم‌ها';

export function surveyConcernLevelOf(pct: number): SurveyConcernLevel {
  return pct >= SURVEY_CONCERN_HIGH_MIN ? 'high' : pct >= SURVEY_CONCERN_MEDIUM_MIN ? 'medium' : 'low';
}

function faDigits(v: string | number): string {
  return String(v).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function pctOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((100 * part) / whole) : 0;
}

/** نمرهٔ مؤثر آیتم با همان قرارداد itemScoreOf (آیتم معکوس هم لحاظ می‌شود) — مقدار نامعتبر = بی‌پاسخ */
function effScoreOf(f: CaseEventField, raw: number): number | null {
  try { return itemScoreOf(f, raw); } catch { return null; }
}

/** متن پاسخ نشانه‌دار: برچسب گزینهٔ «single» یا برچسب نمرهٔ «scale» — همان که خانواده دیده است */
function answerTextOf(f: CaseEventField, raw: number): string {
  const label = f.type === 'single' ? (f.scoredOptions ?? [])[raw]?.label : (f.scaleLabels ?? [])[raw];
  return label ?? faDigits(raw);
}

interface DomainAcc { id: string | null; name: string; items: number; answered: number; concerning: number }

interface SurveyWalkResult { grouped_by: CaseEventSurveyAnalysis['grouped_by']; accs: DomainAcc[]; flagged: CaseEventSurveyFlag[] }

/** بخش‌بندی و شمارش: زیرمقیاس‌های فرم → سربرگ‌های فرم → تک‌حیطهٔ «همهٔ آیتم‌ها» (به‌ترتیب فرم) */
function surveyDomainWalkOf(fields: CaseEventField[], values: Record<string, number>, subs: CaseEventSubscale[]): SurveyWalkResult {
  const subNameOf = new Map(subs.map((s) => [s.id, s.name] as const));
  const isScored = (f: CaseEventField) => f.type === 'scale' || f.type === 'single';
  const usesSubscales = subs.length > 0 && fields.some((f) => isScored(f) && f.subscaleId && subNameOf.has(f.subscaleId));
  const accs: DomainAcc[] = [];
  const accByKey = new Map<string, DomainAcc>();
  const accFor = (id: string | null, name: string): DomainAcc => {
    const key = id ?? `#${name}`;
    const acc = accByKey.get(key) ?? { id, name, items: 0, answered: 0, concerning: 0 };
    if (!accByKey.has(key)) { accByKey.set(key, acc); accs.push(acc); }
    return acc;
  };
  const grouped_by: CaseEventSurveyAnalysis['grouped_by'] = usesSubscales ? 'subscale' : fields.some((f) => f.type === 'heading') ? 'heading' : 'none';
  if (usesSubscales) for (const s of subs) accFor(s.id, s.name); // ترتیب خودِ فرم حفظ می‌شود
  const accOfField = (f: CaseEventField, heading: string | null): DomainAcc => {
    if (usesSubscales) return f.subscaleId && subNameOf.has(f.subscaleId) ? accFor(f.subscaleId, subNameOf.get(f.subscaleId)!) : accFor(null, UNASSIGNED_DOMAIN_NAME);
    return grouped_by === 'heading' ? accFor(null, heading ?? UNASSIGNED_DOMAIN_NAME) : accFor(null, UNGROUPED_DOMAIN_NAME);
  };
  const flagged: CaseEventSurveyFlag[] = [];
  let heading: string | null = null;
  for (const f of fields) {
    if (f.type === 'heading') { heading = f.label.trim(); continue; }
    if (!isScored(f)) continue;
    const acc = accOfField(f, heading);
    acc.items += 1;
    const raw = values[f.key];
    if (raw === undefined || raw === null) continue;
    const eff = effScoreOf(f, Number(raw));
    if (eff === null) continue;
    acc.answered += 1;
    /* «نشانه‌دار» = نمرهٔ مؤثر غیرصفر — همان امتیازدهی چک‌لیست؛ «بله»/بیشترین نمره در فرم دودویی */
    if (eff > 0) {
      acc.concerning += 1;
      flagged.push({ key: f.key, question: f.label, answer: answerTextOf(f, Number(raw)) });
    }
  }
  return { grouped_by, accs, flagged };
}

/**
 * موتور تحلیل ساختاری: fields + پاسخ‌های نمره‌دار → تفکیک حیطه‌ای، گویه‌های نشانه‌دار و پاراگراف توصیفی.
 * خروجی null یعنی فرم آیتم نمره‌دار ندارد و مسیر تحلیل قدیمی باید دست‌نخورده بماند.
 */
export function buildSurveyStructuredInsight(
  fields: CaseEventField[],
  values: Record<string, number>,
  subscales?: CaseEventSubscale[] | null
): CaseEventSurveyAnalysis | null {
  if (!fields.some((f) => f.type === 'scale' || f.type === 'single')) return null;
  const { grouped_by, accs, flagged } = surveyDomainWalkOf(fields, values, subscales ?? []);
  const domains: CaseEventSurveyDomain[] = accs.map((a) => ({ id: a.id, name: a.name, items: a.items, answered: a.answered, concerning: a.concerning, concern_pct: pctOf(a.concerning, a.answered) }));
  const answered = domains.reduce((s, d) => s + d.answered, 0);
  const concerning = domains.reduce((s, d) => s + d.concerning, 0);
  const concernPct = pctOf(concerning, answered);
  const level = answered > 0 ? surveyConcernLevelOf(concernPct) : null;
  return {
    grouped_by, domains, flagged,
    items: domains.reduce((s, d) => s + d.items, 0),
    answered, concerning, concern_pct: concernPct,
    level,
    level_label: level ? SURVEY_CONCERN_LEVEL_LABELS[level] : null,
    interpretation: surveyInterpretationOf(grouped_by, domains, answered, concerning, concernPct, level, flagged.length)
  };
}

/** پاراگراف تفسیر توصیفی — صریح دربارهٔ بی‌هنجاری: هیچ برچسب تشخیصی یا هنجار روان‌سنجی ندارد */
function surveyInterpretationOf(
  grouped_by: CaseEventSurveyAnalysis['grouped_by'],
  domains: CaseEventSurveyDomain[], answered: number, concerning: number,
  concernPct: number, level: SurveyConcernLevel | null, flaggedCount: number
): string {
  const lines: string[] = ['تحلیل توصیفی پاسخ خانواده بر پایهٔ ساختار همین فرم — بدون هنجار روان‌سنجی و بدون برچسب تشخیصی.'];
  if (answered === 0 || level === null) return [...lines, 'هیچ آیتم نمره‌داری پاسخ داده نشده است.'].join('\n');
  lines.push(`از ${faDigits(answered)} آیتمِ پاسخ‌گرفته، ${faDigits(concerning)} مورد نشانهٔ گزارش‌شده دارد (${faDigits(concernPct)}٪) — سطح کلی نشانه‌ها در گزارش خانواده: ${SURVEY_CONCERN_LEVEL_LABELS[level]}.`);
  if (grouped_by === 'none') {
    lines.push('این فرم بخش‌بندی صریح ندارد؛ نرخ‌ها روی کل آیتم‌ها محاسبه شده است.');
  } else {
    const tops = domains.filter((d) => d.concerning > 0 && d.answered > 0)
      .sort((a, b) => (b.concern_pct - a.concern_pct) || (b.concerning - a.concerning))
      .slice(0, 2)
      .map((d) => `«${d.name}» (${faDigits(d.concerning)} از ${faDigits(d.answered)}؛ ${faDigits(d.concern_pct)}٪)`);
    if (tops.length === 1) lines.push(`بیشترین نشانه‌ها در ${tops[0]} است.`);
    if (tops.length === 2) lines.push(`بیشترین نشانه‌ها در ${tops[0]} است و پس از آن ${tops[1]}.`);
  }
  if (flaggedCount > 0) lines.push(`فهرست کامل ${faDigits(flaggedCount)} گویهٔ نشانه‌دار در بخش «گویه‌های نشانه‌دار» همین تحلیل آمده است.`);
  return lines.join('\n');
}

/* اتصال به خروجی analyzeChecklist: تحلیل ساختاری در کلید اختیاری survey می‌نشیند و تفسیر قدیمی
   فقط وقتی فاقد محتواست (maxScore صفر — «نمرهٔ کل: ۰ از ۰») جایگزین می‌شود؛ در غیر این صورت
   پاراگراف توصیفی به انتهای تفسیر موجود اضافه می‌گردد (extend، نه break). */
export function applySurveyStructuredAnalysis(analysis: CaseEventAnalysis, insight: CaseEventSurveyAnalysis): CaseEventAnalysis {
  analysis.survey = insight;
  const legacy = (analysis.interpretation ?? '').trim();
  const degenerate = (analysis.maxScore ?? 0) === 0;
  analysis.interpretation = degenerate ? insight.interpretation : [legacy, insight.interpretation].filter((s) => s.length > 0).join('\n');
  return analysis;
}

/** خلاصهٔ تک‌خطی برای ستون summary فهرست‌ها — توصیفی، بدون هنجار */
export function surveyStructuredSummaryFa(insight: CaseEventSurveyAnalysis): string {
  if (insight.answered === 0) return 'تحلیل توصیفی: پاسخ نمره‌داری ثبت نشده است';
  return `تحلیل توصیفی: ${faDigits(insight.concerning)} نشانه از ${faDigits(insight.answered)} پاسخ (${faDigits(insight.concern_pct)}٪) — سطح کلی: ${insight.level_label ?? 'نامشخص'}`;
}
