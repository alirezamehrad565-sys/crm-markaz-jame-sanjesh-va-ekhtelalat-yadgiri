// ─── شاخص‌های مرکز (محور اول — کلاینت): انواع ماژول ───
// تجمیع فقط-عددی از جدول‌های واقعی نود برای تابلوی «شاخص‌های مرکز».
// دو حوزهٔ تعریف‌شدهٔ شبکه: کیفیت مداخله و ثبت پرونده (+ بازخورد خانواده دربارهٔ
// نتایج و طرح درمان‌ها) و کیفیت عملکردی مرکز (پر بودن نوبت‌ها، جا نیفتادن‌ها).
// هیچ رکورد خام و هیچ شناسهٔ دانش‌آموز در پاسخ نیست — هم‌قانون طلایی cp-report.

export type KpiDays = 7 | 30 | 90;

export interface KpiWindow {
  days: KpiDays;
  /** آغاز پنجره (ISO UTC — ابتدای روز تهران) */
  from_iso: string;
  /** پایان پنجره (ISO UTC — انتهای امروز تهران) */
  to_iso: string;
  /** برچسب جلالی پنجره برای نمایش */
  from_ymd: string;
  to_ymd: string;
}

export interface AppointmentKpi {
  total: number;
  scheduled: number;
  cancelled: number;
  /** نرخ لغو — null وقتی نوبتی نیست */
  cancel_rate: number | null;
  attendance: {
    present: number;
    absent: number;
    pending: number;
    cancelled: number;
  };
  /** نرخ جا نیفتادن (absent / حاضرواقعی+غایب) — null وقتی هیچ حضوری قطعی نشده */
  absent_rate: number | null;
  /** نوبت‌های گذشته که حضورشان هنوز «pending» است — کل تاریخی، نه پنجره */
  pending_overdue: number;
  /** دقیقه‌های نوبت‌بسته‌شدهٔ گذشته در پنجره */
  booked_minutes: number;
  /** ظرفیت دقیقه‌ای اعلام‌شدهٔ ساعات کاری برای روزهای گذشتهٔ پنجره */
  capacity_minutes: number;
  /** نرخ پر بودن ظرفیت (خالی نبودن نوبت‌ها) — null وقتی ظرفیت صفر است */
  fill_rate: number | null;
  /** دانش‌آموز یکتای دارای نوبت در پنجره */
  students_served: number;
}

export interface InterventionKpi {
  /** جلسات طرح درمان انجام‌شده در پنجره */
  pathway_sessions_done: number;
  pathway_sessions_skipped: number;
  /** done / (done + skipped) — null وقتی هیچ‌کدام نیست */
  session_completion_rate: number | null;
  /** جلسات با چک‌لیست وفاداری پرشده (protocol/homework/parent) */
  fidelity_checked: number;
  fidelity_full: number;
  /** جلسات بازی شناختی — وضعیت اعتبار */
  game_sessions: number;
  game_valid: number;
  game_partial: number;
  game_invalid: number;
  game_valid_rate: number | null;
  /** پاسخ‌های نمره‌دار بازی (correct ثبت‌شده) */
  game_attempts_scored: number;
  game_correct: number;
  game_correct_rate: number | null;
  /** تکالیف/تمرین‌های ارجاعی بانک تمرین */
  assignments_total: number;
  assignments_done: number;
  assignments_cancelled: number;
  assignment_done_rate: number | null;
}

export interface DocumentationKpi {
  students_active: number;
  case_events_total: number;
  /** گزارش جلسهٔ مداخلهٔ ثبت‌شده (نوع‌های category='session') */
  session_notes: number;
  /** دانش‌آموزان دارای حداقل یک رویداد پرونده در پنجره */
  students_documented: number;
  /** پوشش ثبت پرونده = documented / active — null وقتی دانش‌آموز فعالی نیست */
  documentation_coverage: number | null;
  /** ارزیابی‌های ثبت‌شده در پنجره (غیرحذف‌شده) */
  assessments_recorded: number;
  /** بازخورد خانواده: فرم‌های قابل‌پُرکردن خانواده در پنجره */
  family_requests: number;
  /** پاسخ‌داده‌شدهٔ خانواده (completed با filled_by_chat_id) */
  family_filled: number;
  family_response_rate: number | null;
  /** میانگین نمرهٔ تحلیلی چک‌لیست‌های پرشدهٔ خانواده — null اگر نمره‌ای نیست */
  family_avg_score: number | null;
}

/* ۱.۲۵.۵۹ — رضایت خانواده‌ها: نظرسنجی ce-center-survey-v1 — تجمیع فقط-عددی (هم‌قانون طلایی) */
export interface FamilySurveyKpi {
  /** نظرسنجی‌های ارسالی در پنجره */
  surveys_sent: number;
  /** پاسخ‌داده‌شده (completed) */
  surveys_filled: number;
  /** filled / sent — null وقتی نظرسنجی‌ای نیست */
  response_rate: number | null;
  /** میانگین درصد رضایت از مرکز (زیرمقیاس center) — null اگر پاسخی نیست */
  center_avg: number | null;
  /** میانگین درصد رضایت از درمانگر (زیرمقیاس therapist) — null اگر پاسخی نیست */
  therapist_avg: number | null;
  /** میانگین احتمال توصیه (۰-۱۰) — null اگر پاسخی نیست */
  nps_avg: number | null;
}

export interface KpiSummary {
  window: KpiWindow;
  generated_at: string;
  appointments: AppointmentKpi;
  intervention: InterventionKpi;
  documentation: DocumentationKpi;
  family_survey: FamilySurveyKpi; // ۱.۲۵.۵۹
}

export interface CenterKpiDeps {
  db: import('@core/db').DbClient;
}

export interface CenterKpiService {
  summary(days: KpiDays, now?: Date): Promise<KpiSummary>;
}

export function isKpiDays(v: number): v is KpiDays {
  return v === 7 || v === 30 || v === 90;
}
