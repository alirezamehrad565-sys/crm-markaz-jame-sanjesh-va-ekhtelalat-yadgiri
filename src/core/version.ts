/**
 * منبع یکتای نسخهٔ سامانه — «یک شماره، یک حقیقت» (سند طرح ارتقا، بند VER-1)
 * APP_VERSION نسخهٔ همین بیلد است؛ NODE_MIN_VERSION حداقل نسخهٔ نودی است که مرکز
 * در هندشیک نسخه (موج ۱، بند ۱-۴) در پاسخ‌های pull/push اعلام می‌کند.
 */

export const APP_VERSION = '1.27.2';

/**
 * موج ۱ (۱-۴) — حداقل نسخهٔ نود از دید مرکز. نامش عیناً همان کد receiving-سر است که از
 * ۱.۲۶.۱ آماده بود (۴۲۶/`error: 'NODE_MIN_VERSION'` سمت runner/coordinator) تا کلاینتِ
 * قدیمی بدون تغییر فهمد چه خبر است. مرکز این ثابت را در هر پاسخ موفق pull/push به شکل
 * `min_node_version` می‌فرستد؛ کلاینت با compareSemver «خودش ≥ این نسخه» را می‌سنجد و
 * ناسازگار → version_error → هماهنگ‌ساز mode=paused_version.
 */
export const NODE_MIN_VERSION = '1.26.0';

/** پارس دفاعی سه‌بخشی — «v» پیشوندی و پسوند غیرعددی (مثل 2-beta) نرم دور ریخته می‌شود */
function semverParts(v: string): [number, number, number] {
  const s = String(v ?? '').trim().replace(/^v/i, '');
  const segs = s.split('.');
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const n = Number.parseInt(segs[i] ?? '', 10);
    if (Number.isFinite(n) && n >= 0) out[i] = n;
  }
  return out;
}

/**
 * مقایسهٔ نسخهٔ سه‌بخشی عددی (بدون وابستگی تازه) — موج ۱ (۱-۴):
 *   -1 یعنی a قدیمی‌تر از b، ۰ برابر، 1 جدیدتر. هر جزء غایب/غیرعددی = ۰.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = semverParts(a);
  const pb = semverParts(b);
  if (pa[0] !== pb[0]) return pa[0] < pb[0] ? -1 : 1;
  if (pa[1] !== pb[1]) return pa[1] < pb[1] ? -1 : 1;
  if (pa[2] !== pb[2]) return pa[2] < pb[2] ? -1 : 1;
  return 0;
}
