/**
 * CSP صفحات عمومی توکن‌دار — ۱.۲۷.۸۲ (sdt159: بستن security-007، ADR-004):
 * منبع یگانهٔ سیاست صفحات HTML رندر سرور (بازی‌ها + پرکردن رویداد + پیش‌نمایش‌ها).
 * script-src بدون unsafe-inline است — همهٔ اسکریپت‌های اجرایی فایل بیرونی‌اند و داده‌های
 * صفحه در بلاک <script type="application/json"> می‌نشینند (CSP آن را اجرا نمی‌کند و
 * با safeJsonEmbed از خروج </script> امن است). style-src 'unsafe-inline' عمداً می‌ماند:
 * <style> صفحه و style-attrها خطر اجرای اسکریپت ندارند (تصمیم ثبت‌شده در ADR-004).
 */
export const PUBLIC_PAGE_CSP =
  "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** CSP حداقلی پاسخ‌های JSON/API — صفحه‌ای نیست؛ فقط اجازهٔ هیچ و ممنوعیت فریم */
export const JSON_API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** جاسازی امن JSON داخل بلاک دادهٔ <script type="application/json"> — الگوی safeJson (SEC-12775) */
export function safeJsonEmbed(v: unknown): string {
  return JSON.stringify(v ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
