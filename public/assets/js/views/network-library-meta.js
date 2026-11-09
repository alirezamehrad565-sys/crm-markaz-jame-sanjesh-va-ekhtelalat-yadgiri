// ─── کتابخانهٔ شبکه: فرادادهٔ نمایشی مشترک (۱.۲۵.۴۶) ───
// این مقادیر با قید CHECK جدول network_content و اسکیمای سینک cp-content هم‌قراردادند.

export const KIND_OPTIONS = [
  { value: 'exercise', label: 'تمرین / کارت آماده' },
  { value: 'plan', label: 'طرح درمان' },
  { value: 'doc', label: 'سند خام' }
];

export const STATUS_META = {
  draft: { label: 'پیش‌نویس', cls: 'badge--neutral' },
  queued: { label: 'در صف همرسانی', cls: 'badge--accent' },
  submitted: { label: 'همرسانده‌شده', cls: 'badge--success' },
  withdrawn: { label: 'کنارگذاشته', cls: 'badge--neutral' },
  published: { label: 'منتشرشدهٔ شبکه', cls: 'badge--success' }
};
