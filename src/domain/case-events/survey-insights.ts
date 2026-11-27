// ─── ۱.۲۵.۶۱ — تابلوی تحلیل «نظرسنجی خانواده‌ها»: موتور خالص و فقط-عددی ───
// خواست کارفرما: «این ماژول باید دوباره بازنگری و باز طراحی بشه به صورت مستقل — تحقیق کن
// ببین مهم‌ترین گزارش‌هایی که از سامانه یه مدیر می‌تونه بگیره چیه … چه آمارهایی و چه شکل
// ارائه‌ای برات مهمه … سپس کل ماژول رو باز طراحی کن و اجرا».
// خروجی این ماژول خوراک «تابلوی شاخص‌ها» است: پنجرهٔ جاری در برابر دورهٔ قبل، روند زمانی،
// تفکیک دو فرم، کارنامه درمانگران و دسته‌بندی تماتیک متن‌های آزاد.
// قانون طلایی cp-report: هیچ شناسهٔ خانواده/چت و هیچ توکن لینک در خروجی نمی‌آید؛
// نام درمانگر و نام دانش‌آموزِ متن آزاد فقط به مدیر می‌رسد (هم‌سطح فهرست موجود).
import { addDaysYmd, SURVEY_KIND_EVENT_KEYS, tehranDayRange, tehranTodayYmd } from '@core/shared';
import { itemScoreOf } from './pure';
import type {
  CaseEventAnalysis, CaseEventField, CaseEventSubscale,
  CaseEventSurveyAnalysis, CaseEventSurveyDomain, CaseEventSurveyFlag
} from './types';

export type SurveyKindName = 'discharge' | 'progress' | 'general';

/** ردیف نرمال‌شدهٔ نظرسنجی — سرویس از case_events می‌سازد؛ تحلیل فقط با همین قرارداد کار می‌کند */
export interface SurveyInsightRow {
  id: string;
  kind: SurveyKindName;
  /** پاسخ داده شده = status 'completed' با filled_by_chat_id */
  answered: boolean;
  /** در انتظارِ مهلت‌گذشته (بی‌پاسخ مانده) */
  expired: boolean;
  createdAt: string;
  staffId: string | null;
  staffName: string | null;
  studentName: string | null;
  /** درصد ۰-۱۰۰ زیرمقیاس‌ها — null یعنی پاسخ نداده */
  center: number | null;
  therapist: number | null;
  progress: number | null;
  /** توصیه ۰-۱۰ */
  nps: number | null;
  note: string | null;
}

export interface SurveyWindowStats {
  sent: number;
  filled: number;
  /** filled / sent — null وقتی ارسالی نیست */
  response_rate: number | null;
  center_avg: number | null;
  therapist_avg: number | null;
  progress_avg: number | null;
  /** میانگین توصیه ۰-۱۰ */
  nps_avg: number | null;
  /** شاخص NPS استاندارد: ٪مروجان (۹-۱۰) − ٪منتقدان (۰-۶) — دامنه ۱۰۰- تا ۱۰۰+ */
  nps_index: number | null;
}

export interface SurveyTrendBucket {
  from_ymd: string;
  to_ymd: string;
  sent: number;
  filled: number;
  center_avg: number | null;
  therapist_avg: number | null;
  progress_avg: number | null;
}

export interface SurveyKindStat {
  sent: number;
  filled: number;
  response_rate: number | null;
  center_avg: number | null;
  therapist_avg: number | null;
  progress_avg: number | null;
}

export interface SurveyTherapistCard {
  therapist_id: string | null;
  therapist_name: string | null;
  sent: number;
  filled: number;
  response_rate: number | null;
  therapist_avg: number | null;
  progress_avg: number | null;
  nps_avg: number | null;
  last_filled_at: string | null;
}

export interface SurveyThemeStat {
  id: string;
  label: string;
  count: number;
  /** از این تم، چند متن نشانهٔ منفی دارد */
  negative_count: number;
}

export interface SurveyNoteItem {
  id: string;
  kind: SurveyKindName;
  created_at: string;
  student_name: string | null;
  staff_name: string | null;
  note: string;
  themes: string[];
  negative: boolean;
}

export interface SurveyInsights {
  window: { days: number; from_ymd: string; to_ymd: string; from_iso: string; to_iso: string };
  generated_at: string;
  current: SurveyWindowStats;
  previous: SurveyWindowStats;
  trend: SurveyTrendBucket[];
  by_kind: Record<SurveyKindName, SurveyKindStat>;
  therapists: SurveyTherapistCard[];
  themes: SurveyThemeStat[];
  notes: SurveyNoteItem[];
  /** شمار متن‌های با نشانهٔ منفی در پنجرهٔ جاری — کاندیدای پیگیری */
  notes_negative_count: number;
  /** در انتظار پاسخ (مهلت زنده) در پنجرهٔ جاری */
  pending_open: number;
  /** در انتظارِ مهلت‌گذشته در پنجرهٔ جاری — کاندیدای لغو/پاک‌سازی */
  pending_expired: number;
}

/* ─── دسته‌بندی تماتیک متن آزاد — کلیدواژه‌های فارسی، پایدار و آزمون‌پذیر ─── */
export const SURVEY_NOTE_THEMES = [
  { id: 'scheduling', label: 'نوبت‌دهی و زمان', words: ['نوبت', 'ساعت', 'وقت', 'انتظار', 'تأخیر', 'تاخیر', 'برنامه'] },
  { id: 'therapist', label: 'درمانگر و برخورد', words: ['درمانگر', 'تراپیست', 'روانشناس', 'برخورد', 'مهربان', 'صبور'] },
  { id: 'communication', label: 'اطلاع‌رسانی و پاسخ‌گویی', words: ['اطلاع', 'پیام', 'پاسخ', 'تماس', 'پیگیری', 'گزارش', 'مطلع'] },
  { id: 'progress', label: 'پیشرفت و نتیجه', words: ['پیشرفت', 'بهبود', 'نتیجه', 'تغییر', 'تفاوت'] },
  { id: 'facilities', label: 'فضا و محیط', words: ['فضا', 'نظافت', 'ساختمان', 'محیط', 'تجهیز'] },
  { id: 'finance', label: 'هزینه و شهریه', words: ['هزینه', 'قیمت', 'پول', 'تعرفه', 'شهریه', 'مبلغ'] }
] as const;

const NEGATIVE_CUES = [
  'ضعیف', 'بدتر', 'ناراضی', 'ناامید', 'مشکل', 'تأخیر', 'تاخیر', 'گله', 'شکایت',
  'متأسفانه', 'متاسفانه', 'بی‌توجه', 'سرد', 'دیر', 'ناتمام', 'لغو', 'نیست', 'کم بود'
] as const;

export function classifySurveyNote(raw: string | null | undefined): { themes: string[]; negative: boolean } {
  const text = (raw ?? '').trim();
  if (!text) return { themes: [], negative: false };
  const themes: string[] = [];
  for (const t of SURVEY_NOTE_THEMES) {
    if (t.words.some((w) => text.includes(w))) themes.push(t.id);
  }
  const negative = NEGATIVE_CUES.some((w) => text.includes(w));
  return { themes, negative };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function rateOf(num: number, den: number): number | null {
  if (den <= 0) return null;
  return round4(num / den);
}

function avgOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/** آیا ISO در بازهٔ [fromIso, toIso] است؟ (بر پایهٔ created_at — هم‌قانون KPI مرکز) */
function inWindow(iso: string, fromIso: string, toIso: string): boolean {
  return iso >= fromIso && iso <= toIso;
}

function statsOf(rows: SurveyInsightRow[], fromIso: string, toIso: string): SurveyWindowStats {
  const win = rows.filter((r) => inWindow(r.createdAt, fromIso, toIso));
  const filled = win.filter((r) => r.answered);
  const npsVals = filled.map((r) => r.nps).filter((v): v is number => v !== null);
  const promoters = npsVals.filter((v) => v >= 9).length;
  const detractors = npsVals.filter((v) => v <= 6).length;
  return {
    sent: win.length,
    filled: filled.length,
    response_rate: rateOf(filled.length, win.length),
    center_avg: avgOf(filled.map((r) => r.center).filter((v): v is number => v !== null)),
    therapist_avg: avgOf(filled.map((r) => r.therapist).filter((v): v is number => v !== null)),
    progress_avg: avgOf(filled.map((r) => r.progress).filter((v): v is number => v !== null)),
    nps_avg: avgOf(npsVals),
    nps_index: npsVals.length > 0 ? round2((100 * (promoters - detractors)) / npsVals.length) : null
  };
}

function kindStatOf(rows: SurveyInsightRow[], fromIso: string, toIso: string, kind: SurveyKindName): SurveyKindStat {
  const win = rows.filter((r) => r.kind === kind && inWindow(r.createdAt, fromIso, toIso));
  const filled = win.filter((r) => r.answered);
  return {
    sent: win.length,
    filled: filled.length,
    response_rate: rateOf(filled.length, win.length),
    center_avg: avgOf(filled.map((r) => r.center).filter((v): v is number => v !== null)),
    therapist_avg: avgOf(filled.map((r) => r.therapist).filter((v): v is number => v !== null)),
    progress_avg: avgOf(filled.map((r) => r.progress).filter((v): v is number => v !== null))
  };
}

/** برش‌های زمانی: ۷ روز → روزانه (۷ برش) · ۳۰ روز → ۵روزه (۶ برش) · ۹۰ روز → ۱۵روزه (۶ برش) */
export function surveyTrendSlices(days: 7 | 30 | 90): { bucketDays: number; count: number } {
  const bucketDays = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  return { bucketDays, count: Math.ceil(days / bucketDays) };
}

function trendOf(rows: SurveyInsightRow[], days: 7 | 30 | 90, todayYmd: string): SurveyTrendBucket[] {
  const { bucketDays, count } = surveyTrendSlices(days);
  const firstYmd = addDaysYmd(todayYmd, -(days - 1));
  const buckets: SurveyTrendBucket[] = [];
  for (let i = 0; i < count; i++) {
    const fromYmd = addDaysYmd(firstYmd, i * bucketDays);
    const rawTo = addDaysYmd(fromYmd, bucketDays - 1);
    const toYmd = rawTo > todayYmd ? todayYmd : rawTo;
    const fromIso = tehranDayRange(fromYmd).start;
    const toIso = tehranDayRange(toYmd).end;
    const win = rows.filter((r) => inWindow(r.createdAt, fromIso, toIso));
    const filled = win.filter((r) => r.answered);
    buckets.push({
      from_ymd: fromYmd,
      to_ymd: toYmd,
      sent: win.length,
      filled: filled.length,
      center_avg: avgOf(filled.map((r) => r.center).filter((v): v is number => v !== null)),
      therapist_avg: avgOf(filled.map((r) => r.therapist).filter((v): v is number => v !== null)),
      progress_avg: avgOf(filled.map((r) => r.progress).filter((v): v is number => v !== null))
    });
  }
  return buckets;
}

function therapistsOf(rows: SurveyInsightRow[], fromIso: string, toIso: string): SurveyTherapistCard[] {
  const win = rows.filter((r) => inWindow(r.createdAt, fromIso, toIso));
  const byStaff = new Map<string, { name: string | null; rows: SurveyInsightRow[] }>();
  for (const r of win) {
    const key = r.staffId ?? '__none';
    const entry = byStaff.get(key) ?? { name: r.staffName, rows: [] };
    if (!entry.name && r.staffName) entry.name = r.staffName;
    entry.rows.push(r);
    byStaff.set(key, entry);
  }
  const cards: SurveyTherapistCard[] = [];
  for (const [key, entry] of byStaff) {
    if (entry.rows.length === 0) continue;
    const filled = entry.rows.filter((r) => r.answered);
    const npsVals = filled.map((r) => r.nps).filter((v): v is number => v !== null);
    const lastFilledAt = filled
      .map((r) => r.createdAt)
      .sort()
      .at(-1) ?? null;
    cards.push({
      therapist_id: key === '__none' ? null : key,
      therapist_name: entry.name,
      sent: entry.rows.length,
      filled: filled.length,
      response_rate: rateOf(filled.length, entry.rows.length),
      therapist_avg: avgOf(filled.map((r) => r.therapist).filter((v): v is number => v !== null)),
      progress_avg: avgOf(filled.map((r) => r.progress).filter((v): v is number => v !== null)),
      nps_avg: avgOf(npsVals),
      last_filled_at: lastFilledAt
    });
  }
  // پرتعدادترین پاسخ اول، بعد رضایت بالاتر؛ کارت بدون درمانگر (ثبت‌کننده) آخر
  cards.sort((a, b) => {
    if (a.therapist_id === null && b.therapist_id !== null) return 1;
    if (b.therapist_id === null && a.therapist_id !== null) return -1;
    if (b.filled !== a.filled) return b.filled - a.filled;
    return (b.therapist_avg ?? -1) - (a.therapist_avg ?? -1);
  });
  return cards;
}

function themesOf(notes: SurveyNoteItem[]): { themes: SurveyThemeStat[]; negativeCount: number } {
  const stat = new Map<string, { count: number; negative: number }>();
  let negativeCount = 0;
  for (const n of notes) {
    if (n.negative) negativeCount += 1;
    for (const id of n.themes) {
      const s = stat.get(id) ?? { count: 0, negative: 0 };
      s.count += 1;
      if (n.negative) s.negative += 1;
      stat.set(id, s);
    }
  }
  const themes = SURVEY_NOTE_THEMES
    .map((t) => {
      const s = stat.get(t.id);
      return { id: t.id, label: t.label, count: s?.count ?? 0, negative_count: s?.negative ?? 0 };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
  return { themes, negativeCount };
}

/** موتور اصلی: از ردیف‌های نرمال‌شده، تابلوی کامل را می‌سازد */
export function buildSurveyInsights(
  rows: SurveyInsightRow[],
  opts: { days: 7 | 30 | 90; now: Date }
): SurveyInsights {
  const days = opts.days;
  const todayYmd = tehranTodayYmd(opts.now);
  const firstYmd = addDaysYmd(todayYmd, -(days - 1));
  const prevFirstYmd = addDaysYmd(firstYmd, -days);
  const curFrom = tehranDayRange(firstYmd).start;
  const curTo = tehranDayRange(todayYmd).end;
  const prevFrom = tehranDayRange(prevFirstYmd).start;
  const prevTo = tehranDayRange(firstYmd).end; // پایانِ روزِ قبل از پنجرهٔ جاری

  const curRows = rows.filter((r) => inWindow(r.createdAt, curFrom, curTo));
  const notes: SurveyNoteItem[] = curRows
    .filter((r) => (r.note ?? '').trim() !== '')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 100)
    .map((r) => {
      const c = classifySurveyNote(r.note);
      return {
        id: r.id,
        kind: r.kind,
        created_at: r.createdAt,
        student_name: r.studentName,
        staff_name: r.staffName,
        note: (r.note ?? '').trim(),
        themes: c.themes,
        negative: c.negative
      };
    });
  const { themes, negativeCount } = themesOf(notes);
  const pendingRows = curRows.filter((r) => !r.answered);

  return {
    window: { days, from_ymd: firstYmd, to_ymd: todayYmd, from_iso: curFrom, to_iso: curTo },
    generated_at: opts.now.toISOString(),
    current: statsOf(rows, curFrom, curTo),
    previous: statsOf(rows, prevFrom, prevTo),
    trend: trendOf(rows, days, todayYmd),
    by_kind: {
      discharge: kindStatOf(rows, curFrom, curTo, 'discharge'),
      progress: kindStatOf(rows, curFrom, curTo, 'progress'),
      general: kindStatOf(rows, curFrom, curTo, 'general')
    },
    therapists: therapistsOf(rows, curFrom, curTo),
    themes,
    notes,
    notes_negative_count: negativeCount,
    pending_open: pendingRows.filter((r) => !r.expired).length,
    pending_expired: pendingRows.filter((r) => r.expired).length
  };
}

/** کلید فرم ← نام نوع نظرسنجی (هم‌قرارداد سرویس) */
export function surveyKindOfEventKey(key: string): SurveyKindName {
  if (key === SURVEY_KIND_EVENT_KEYS.discharge) return 'discharge';
  if (key === SURVEY_KIND_EVENT_KEYS.progress) return 'progress';
  return 'general';
}

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
