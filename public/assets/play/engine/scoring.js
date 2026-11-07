/* ═══════════════════════════════════════════════════════════════
   engine/scoring.js — خلاصهٔ موتور کلاینت (بازنویسی G1 / ۱.۲۵.۳۵)
   نسخهٔ قبلی فیلدهای ناکارآمد می‌خواند (rtMs/rtValid/prematureCount) و
   جمع‌های گو/نوگو/کمسیون همیشه صفر می‌گذاشت — مسیر محاسبهٔ مرده (P1-3 ممیزی M0).
   مرز قرارداد: کلاینت کلید پاسخ ندارد — گو بودن، درستی و کمسیون/اُمیشن فقط
   سرور می‌داند (C1). این خلاصه فقط توصیف رفتار ثبت‌شدهٔ موتور است؛ مرجع سنجه
   همیشه سرور است (§۸) و این خروجی به گزارش درمانگر نمی‌رود.
   قاعدهٔ دامنهٔ صفر: مخرج صفر = null، هرگز صفرِ ساختگی.
   ═══════════════════════════════════════════════════════════════ */

/** میانهٔ خالص — آزمون طلایی دارد */
export function medianOf(values) {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/** خلاصهٔ جلسه از رکوردهای واقعی موتور — هر شاخه (runTrial + پنج شاخهٔ خاص)
 *  فیلدهای rt_ms/touched/*_count/frame_drops را با شواهد مشترک observe.js می‌فرستد. */
export function summarizeSession(trials) {
  const t = Array.isArray(trials) ? trials : [];
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  const touchedRts = t
    .filter((x) => x.touched === true && Number.isFinite(x.rt_ms))
    .map((x) => x.rt_ms);
  return {
    total: t.length,
    touched: t.filter((x) => x.touched === true).length,
    no_response: t.filter((x) => x.touched === false).length,
    median_rt: medianOf(touchedRts),
    premature_total: t.reduce((a, x) => a + num(x.premature_count), 0),
    multiple_total: t.reduce((a, x) => a + num(x.multiple_count), 0),
    out_of_surface_total: t.reduce((a, x) => a + num(x.out_of_surface_count), 0),
    frame_drops_total: t.reduce((a, x) => a + num(x.frame_drops), 0)
    /* سنجهٔ شناختی این‌جا ساخته نمی‌شود — کلید پاسخ در کلاینت نیست (C1)؛
       d-prime و جمع‌های گو/نوگو فقط سرور (scoring.ts) — قاعدهٔ §۵/§۸ */
  };
}
