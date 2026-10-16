/**
 * رنگ اختصاصی همکاران در تقویم
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// staff-hue.js — نگاشت پایدار staffId → یکی از ۸ رنگ پالت درمانگر
//
// چرا هش و نه ترتیب فهرست؟ با ترتیب فهرست، افزودن/غیرفعال‌شدن یک همکار
// رنگ «همه» را عوض می‌کرد؛ هش FNV-1a برای هر staffId همیشه یک رنگ ثابت
// می‌دهد — در همهٔ دستگاه‌ها، بازدیدها و تغییرهای فهرست کارکنان.
// برخورد رنگ (دو درمانگر هم‌رنگ در یک نما) با ≤۸ نفر نادر است و
// ستون نام + راهنمای رنگ آن را جبران می‌کند.

const CACHE = new Map();

function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** شمارهٔ hue ثابت ۱..۸ برای یک staffId */
export function staffHue(staffId) {
  const key = String(staffId ?? '');
  if (!CACHE.has(key)) CACHE.set(key, (fnv1a(key) % 8) + 1);
  return CACHE.get(key);
}

/** کلاس CSS رنگ — «hue-1» تا «hue-8» (روی کارت/چیپ/نقطه مصرف می‌شود) */
export function hueClass(staffId) {
  return `hue-${staffHue(staffId)}`;
}

/** نقطهٔ رنگی کوچک برای چیپ فیلتر/سربرگ ستون/جدول */
export function hueDot(staffId, size = 10) {
  const span = document.createElement('span');
  span.className = `staff-chip__dot ${hueClass(staffId)}`;
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.setAttribute('aria-hidden', 'true');
  return span;
}
