/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — ساعت ارسال دسته‌ای اعلان‌ها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// موتور «ساعت ارسال» پیش‌نویس اعلان — pure و بدون دیتابیس (کاملاً قابل تست)
//
// سیاست CRM (تصمیم ):
// * اعلان «ثبت نوبت جدید» → پیش‌نویس تا ساعت ارسال روز (notify_batch_hour، پیش‌فرض 18:00 تهران)
// * تغییر/لغو/تکلیف/غیبت/یادآور → همیشه فوری (ایمنی خانواده)
// * اگر ساعت ارسال امروز گذشته باشد → فوری (نگه‌داشتن تا فردا یعنی تأخیر ۲۴ ساعته بی‌دلیل)
// * اگر نوبت کمتر از BATCH_MIN_LEAD_HOURS بعد از ساعت ارسال شروع شود → فوری
// (اعلانِ بعد از شروع نوبت بی‌معناست)

import { BATCH_MIN_LEAD_HOURS, TEHRAN_OFFSET_MINUTES } from '@core/shared';

/** نتیجهٔ محاسبه — null یعنی «فوری بفرست» (بدون پیش‌نویس) */
export type BatchSendAt = string | null;

/** ISO «امروز تهران» روی ساعت مشخص — ورودی فقط عدد 0..23 */
export function tehranTodayBatchInstant(nowMs: number, hour: number): number {
  const tehranNowMs = nowMs + TEHRAN_OFFSET_MINUTES * 60_000;
  const ymd = new Date(tehranNowMs).toISOString().slice(0, 10);
  // نیمه‌شب تهران به UTC: ساعت تهران − آفست
  const batchUtcMs = Date.parse(`${ymd}T00:00:00.000Z`) - TEHRAN_OFFSET_MINUTES * 60_000 + hour * 3_600_000;
  return batchUtcMs;
}

/**
 * ساعت ارسال پیش‌نویس برای اعلان «ثبت نوبت جدید»:
 * 1. اگر ساعت ارسال امروز گذشته → null (فوری)
 * 2. اگر نوبت پیش از «ساعت ارسال + حداقل فاصله» شروع می‌شود → null (فوری)
 * 3. وگرنه → ISO ساعت ارسال امروز
 */
export function computeBatchSendAt(input: {
  nowIso: string;
  /** شروع نوبت (ISO UTC) */
  appointmentStartIso: string;
  /** ساعت ارسال 0..23 تهران از تنظیمات */
  batchHour: number;
}): BatchSendAt {
  const nowMs = Date.parse(input.nowIso);
  const batchMs = tehranTodayBatchInstant(nowMs, input.batchHour);

  // 1) قطار امشب رفت — نگه‌داشتن تا فردا یعنی ۲۴ ساعت تأخیر
  if (batchMs <= nowMs) return null;

  // 2) نوبتِ نزدیک‌تر از حد مجاز به ساعت ارسال → فوری
  const startMs = Date.parse(input.appointmentStartIso);
  if (!Number.isFinite(startMs)) return null;
  if (startMs - batchMs < BATCH_MIN_LEAD_HOURS * 3_600_000) return null;

  return new Date(batchMs).toISOString();
}

/** آیا این قالب از دستهٔ «ثبت جدید» است؟ (تنها دستهٔ پیش‌نویس‌شونده) */
export function isCreatedTemplate(template: string): boolean {
  return (
    template === 'appointment_created' ||
    template === 'staff_appointment_created' ||
    template === 'teacher_appointment_created'
  );
}
