/**
 * shim سازگاری — ۱.۲۷.۸۴ (sdt161: architecture-006)
 * هستهٔ scoring به src/core/scoring/scoring.js منتقل شد (تک‌منبع؛ هیچ فایل src/ دیگر به worker/
 * import نسبی ندارد). این shim فقط برای مصرف‌کنندگان قدیمی مسیر worker/ است — کد تازه از
 * '@core/scoring/scoring.js' می‌خواند.
 */
export * from '../src/core/scoring/scoring.js';
