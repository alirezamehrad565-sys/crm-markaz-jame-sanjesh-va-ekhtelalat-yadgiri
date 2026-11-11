// محدودسازی نرخ سراسری /api/* (ف۵ طرح ارتقا — P2-15): پنجرهٔ ثابت per-IP درون‌حافظه روی متدهای نوشتنی
// زمینه: طرح §۴ آیتم ۱۵ — «محدودسازی نرخ لبه‌ای /api/*»؛ تا امروز فقط تله‌متری (rum/client-errors)
// limiter داشت و بقیهٔ /api/* بی‌دروازه بود. این لایه دروازهٔ سخاوتمندانهٔ دوم است که کاربرد عادی
// کلینیک هرگز نمی‌خورد (پیش‌فرض ۲۴۰ نوشتنی در دقیقه بر IP) و فقط رگبارهای ماشینی را می‌بندد.
//
// محدودیت صادقانه (همین‌جا و در سند طرح ثبت است): شمارنده per-isolate و درون‌حافظه است — با چند
// isolate هم‌زمان هر کدام سهمیهٔ خودش را می‌شمارند (بودجهٔ مؤثر = سقف × تعداد isolate) و ری‌استارت
// isolate پنجره را صفر می‌کند. محدودسازی سخت و حساب‌شدهٔ لبه‌ای با WAF rate-limit کلادفلر روی
// دامنهٔ اختصاصی ممکن است (workers.dev دامنهٔ zone ندارد و WAF روی آن سوار نمی‌شود) — تا آن زمان
// این لایه فقط «کاهش‌دهندهٔ ریسک» است نه «جلوگیرندهٔ قطعی».
//
// کلید (IP) فقط در حافظهٔ همین isolate می‌ماند و هرگز لاگ/ذخیره نمی‌شود (قانون PII design.md §۶) —
// هم‌الگوی makeRateLimiter تله‌متری (@app/rum/pure) که خودش دوباره مصرف می‌شود.
import { makeRateLimiter } from '@app/rum/pure';
import type { RateLimiter } from '@app/rum/pure';

/** پیش‌فرض سقف نوشتنی per-IP در دقیقه — سخاوتمندانه تا کاربرد عادی کلینیک هرگز ۴۲۹ نبیند */
export const API_RATE_LIMIT_PER_MIN_DEFAULT = 240;
/** سقف منطقی پیکربندی — مقادیر غیرمنطقی بالای این با همین سقف گیره می‌شوند */
export const API_RATE_LIMIT_PER_MIN_MAX = 10_000;
/** پنجرهٔ شمارش بر حسب میلی‌ثانیه (قرارداد «در دقیقه») */
export const API_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * تفسیر env اختیاری `API_RATE_LIMIT_PER_MIN`:
 *   نبود/رشتهٔ خالی → پیش‌فرض ۲۴۰ · صفر → خاموش (میدل‌ور یک لاگ می‌دهد) ·
 *   غیرعددی/منفی → پیش‌فرض · عدد مثبت → گیرهٔ ۱..۱۰۰۰۰.
 * مقادیر env در Workers رشته می‌آیند؛ پس رشتهٔ «۳» هم می‌پذیریم.
 */
export function parseApiRateLimitPerMin(raw: unknown): number {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return API_RATE_LIMIT_PER_MIN_DEFAULT;
  }
  const n = typeof raw === 'string' ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return API_RATE_LIMIT_PER_MIN_DEFAULT;
  if (n === 0) return 0;
  return Math.min(Math.trunc(n), API_RATE_LIMIT_PER_MIN_MAX);
}

/**
 * نسخهٔ کلیددار makeRateLimiter — یک پنجرهٔ مستقل بر کلید (اینجا: IP). سقف (max) در لحظهٔ هر
 * فراخوانی داده می‌شود چون از env bindings خوانده می‌شود و می‌تواند در طول عمر isolate تغییر
 * کند؛ کلیدِ فراخوانی باید سقف را هم شامل باشد تا تغییر سقف، سطل تازه بسازد نه بازنویسی سطل قدیم.
 * نقشهٔ کلیدها سقف‌دار است (maxKeys): با سرریز، پنجره‌های ساکت‌شدهٔ کهنه بُرش می‌خورند و اگر
 * هنوز پر بود، کهنه‌ترین کلید بیرون می‌رود — حافظهٔ isolate هرگز بی‌کران رشد نمی‌کند و هر کلید فقط چند بایت است.
 */
export interface KeyedRateLimiter {
  /** true = اجازهٔ عبور برای این کلید؛ false = سقف پنجرهٔ این کلید پر است */
  allow(key: string, max: number): boolean;
}

export function makeKeyedRateLimiter(windowMs: number, maxKeys = 4096): KeyedRateLimiter {
  const buckets = new Map<string, { limiter: RateLimiter; lastSeen: number }>();
  return {
    allow(key: string, max: number): boolean {
      const now = Date.now();
      if (!buckets.has(key) && buckets.size >= maxKeys) {
        for (const [k, b] of buckets) {
          if (now - b.lastSeen >= windowMs) buckets.delete(k);
        }
        if (buckets.size >= maxKeys) {
          let oldestKey: string | null = null;
          let oldestAt = Number.POSITIVE_INFINITY;
          for (const [k, b] of buckets) {
            if (b.lastSeen < oldestAt) {
              oldestAt = b.lastSeen;
              oldestKey = k;
            }
          }
          if (oldestKey !== null) buckets.delete(oldestKey);
        }
      }
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { limiter: makeRateLimiter(max, windowMs), lastSeen: now };
        buckets.set(key, bucket);
      }
      bucket.lastSeen = now;
      return bucket.limiter.allow();
    }
  };
}
