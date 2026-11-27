/* ۱.۲۷.۸۸ — الحاقیِ ADDITIVE به GET /api/dashboard/me (بدون تغییر شکل فیلدهای موجود):
   ① recentCases — تا ۶ دانش‌آموز با آخرین فعالیتِ ثبت‌شدهٔ همین درمانگر (پرونده‌های اخیر من)
   ② pendingSurveys — وضعیت پرسشنامه‌های ارسالی به خانواده‌ها (در انتظار / تکمیل‌شده)
   دامنهٔ «دانش‌آموزِ خودم» در هر دو، همان تعریفِ my-students است
   (سابقهٔ نوبت با من یا مالکیتِ فعالِ من — appointment-core/service.ts::listMyStudents). */

export type MyRecentCaseKind = 'session' | 'event' | 'survey' | 'plan' | 'exercise';

/** یک پروندهٔ اخیر — آخرین فعالیتِ همین کاربر روی دانش‌آموز (بدون احتساب فعالیت دیگران) */
export interface MyRecentCase {
  studentId: string;
  displayName: string;
  /** ISO — زمان آخرین فعالیت (منبع: ستون زمانِ همان منبع، نرمال‌شده به UTC) */
  lastAt: string;
  kind: MyRecentCaseKind;
  /** برچسب کوتاه فارسیِ آخرین فعالیت برای نمایش */
  brief: string;
}

/** یک پرسشنامهٔ ارسالی به خانواده (case_events با status pending_family/completed) */
export interface MyPendingSurveyItem {
  studentId: string;
  displayName: string;
  /** کلید منطقی فرم — case_event_types.key (مثلاً ce-survey-progress-v1) */
  formKey: string;
  /** عنوان فارسی فرم — case_event_types.title */
  formName: string;
  /** ISO یا null — زمان ارسال لینک واقعی (case_events.sent_at؛ ساختِ گروهی بدون ارسال = null) */
  sentAt: string | null;
  status: 'pending' | 'completed';
  /** ISO یا null — زمان تکمیل؛ ستون اختصاصی completed_at وجود ندارد، مقدار updated_atِ
      همان UPDATEِ fillByFamily است (نزدیک‌ترین زمان واقعیِ تکمیل بدون ساخت ستون تازه) */
  completedAt: string | null;
}

export interface MyPendingSurveys {
  /** شمار کل پرسشنامه‌های در انتظار در دامنه (برای نشانِ آینده) */
  count: number;
  /** تا ۵ مورد اخیر — هم pending و هم completed، تازه‌تر اول */
  items: MyPendingSurveyItem[];
}

/** خروجی getMyStats — MyPerformanceStats + فیلدهای اختیاری تازه (سازگار با کلاینت‌های فعلی) */
export type MyDashboardStats = import('@core/shared').MyPerformanceStats & {
  recentCases?: MyRecentCase[];
  pendingSurveys?: MyPendingSurveys;
};
