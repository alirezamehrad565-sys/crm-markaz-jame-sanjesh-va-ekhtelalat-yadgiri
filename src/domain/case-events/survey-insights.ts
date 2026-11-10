// ─── ۱.۲۵.۶۱ — تابلوی تحلیل «نظرسنجی خانواده‌ها»: موتور خالص و فقط-عددی ───
// خواست کارفرما: «این ماژول باید دوباره بازنگری و باز طراحی بشه به صورت مستقل — تحقیق کن
// ببین مهم‌ترین گزارش‌هایی که از سامانه یه مدیر می‌تونه بگیره چیه … چه آمارهایی و چه شکل
// ارائه‌ای برات مهمه … سپس کل ماژول رو باز طراحی کن و اجرا».
// خروجی این ماژول خوراک «تابلوی شاخص‌ها» است: پنجرهٔ جاری در برابر دورهٔ قبل، روند زمانی،
// تفکیک دو فرم، کارنامه درمانگران و دسته‌بندی تماتیک متن‌های آزاد.
// قانون طلایی cp-report: هیچ شناسهٔ خانواده/چت و هیچ توکن لینک در خروجی نمی‌آید؛
// نام درمانگر و نام دانش‌آموزِ متن آزاد فقط به مدیر می‌رسد (هم‌سطح فهرست موجود).
import { addDaysYmd, SURVEY_KIND_EVENT_KEYS, tehranDayRange, tehranTodayYmd } from '@core/shared';

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
