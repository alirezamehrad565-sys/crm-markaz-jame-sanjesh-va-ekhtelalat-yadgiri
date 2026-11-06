/* ═══════════════════════════════════════════════════════════════
   engine/scoring.js — نمره‌دهی موتور کلاینت (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
   آینهٔ فرمول‌های سرور (pure.ts) — «خام در برابر محاسبه‌شده» جداست:
   خروجی این ماژول موقت/نمایشی است؛ مرجع سنجه همیشه سرور است (§۸).
   قاعدهٔ دامنهٔ صفر: مخرج صفر = null، هرگز صفرِ ساختگی.
   جایگاه d-prime رزرو شده (بدون مقدار تا برقراری پایهٔ نُرم).
   ═══════════════════════════════════════════════════════════════ */

/** خلاصهٔ یک آزمون موتور: { go, correct, rtMs, rtValid, premature, multiple, block } */
export function medianOf(values) {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/** ضریب تغییرپذیری RT (CV = SD/mean) — روی پاسخ‌های درست گو؛ دادهٔ کم: null */
export function rtVariabilityOf(rts) {
  const v = rts.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < 3) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  if (mean <= 0) return null;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (v.length - 1));
  return Math.round((sd / mean) * 1000) / 1000;
}

function pct(num, den) {
  if (den === 0) return null; // دامنهٔ صفر
  return Math.round((num / den) * 10000) / 100;
}

/** خلاصهٔ جلسه از رکوردهای آزمون موتور */
export function summarizeSession(trials) {
  const t = Array.isArray(trials) ? trials : [];
  const go = t.filter((x) => x.go === true);
  const nogo = t.filter((x) => x.go === false);
  const correctGo = go.filter((x) => x.correct);
  const correctNogo = nogo.filter((x) => x.correct);
  const validRts = correctGo
    .filter((x) => x.rtValid !== false && Number.isFinite(x.rtMs))
    .map((x) => x.rtMs);

  const blocks = {};
  for (const x of t) {
    const b = 'b' + (x.block ?? 1);
    blocks[b] = blocks[b] || { total: 0, correct: 0 };
    blocks[b].total++;
    if (x.correct) blocks[b].correct++;
  }

  return {
    total: t.length,
    total_go: go.length,
    total_nogo: nogo.length,
    correct_go: correctGo.length,
    correct_nogo: correctNogo.length,
    commission: nogo.filter((x) => !x.correct && x.touched === true).length,
    omission: go.filter((x) => !x.correct && x.touched === false).length,
    premature: t.reduce((a, x) => a + (x.prematureCount || 0), 0),
    multiple: t.reduce((a, x) => a + (x.multipleCount || 0), 0),
    correct_go_pct: pct(correctGo.length, go.length),
    correct_nogo_pct: pct(correctNogo.length, nogo.length),
    commission_pct: pct(nogo.filter((x) => !x.correct && x.touched === true).length, nogo.length),
    omission_pct: pct(go.filter((x) => !x.correct && x.touched === false).length, go.length),
    median_rt: medianOf(validRts),
    rt_variability: rtVariabilityOf(validRts),
    blocks,
    // d-prime: رزرو — بدون برقراری پایهٔ نُرم هیچ مقداری تولید نمی‌شود (دفترچهٔ وظیفه §۵)
    dprime: null
  };
}
