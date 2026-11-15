// توابع محض RUM: صدک‌ها + محدودکنندهٔ نرخ درون‌حافظه
// صدک روی آرایهٔ مرتب‌شده با درون‌یابی خطی
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const clamped = Math.min(Math.max(p, 0), 1);
  const idx = (sorted.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface RateLimiter {
  /** true = اجازهٔ عبور؛ false = سقف پنجره پر است */
  allow(): boolean;
}

// محدودکنندهٔ نرخ ثابت-پنجره‌ای درون‌حافظه (هر isolate جدا شمرده می‌شود — برای تله‌متری کافی است)
// کلید تماس‌گیرنده فقط در حافظه می‌ماند و هرگز لاگ/ذخیره نمی‌شود (قانون PII design.md §۶)
export function makeRateLimiter(max: number, windowMs: number): RateLimiter {
  let windowStart = 0;
  let count = 0;
  return {
    allow(): boolean {
      const now = Date.now();
      if (now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }
      if (count >= max) return false;
      count += 1;
      return true;
    }
  };
}
