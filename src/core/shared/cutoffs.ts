/**
 * برش‌های پرسشنامه‌های گزارش‌دهنده — تک‌منبع (۱.۲۷.۸۴ / sdt161: architecture-005)
 * از src/domain/clinical-engine/instruments.ts به هستهٔ مشترک منتقل شد؛ ot-engine و
 * clinical-engine (و گیت‌ها) همه از همین جدول می‌خوانند. اعداد = ارزش‌های عملیاتی جاری
 * (خانوادهٔ Swanson 95th برای والد: IA ۱۶ · HI ۱۳). تفاوت عمدی با باندهای نمایشی m176
 * (severity tiers) در CHANGELOG ۱.۲۵.۰۶ ثبت شده است.
 */
export const SNAP_IV_CUTOFFS = {
  parent: { ia: { warn: 11, danger: 16 }, hi: { danger: 13 }, odd: { warn: 10, danger: 14 } },
  teacher: { ia: { warn: 14, danger: 16 }, hi: { danger: 11 }, odd: { warn: 12, danger: 16 } }
} as const;

export const SCARED_CUTOFFS = { danger: 25, warnMin: 20, strong: 30 } as const; // نمرهٔ کل
