/**
 * گیت ۱.۲۷.۷۸ (sdt155) — موج B1 «هاردن کردن لاگ و لینک‌های عمومی» (بستن security-005/008):
 * ① requestLogger مسیر را با maskSensitivePath لاگ می‌کند (نه خام)، ② قرارداد ماسک سه‌الگویی،
 * ③ سقف خواندنی‌های توکن‌دار عمومی با env اختصاصی و پیش‌فرض ۱۲۰، ④ پارس env مشترک،
 * ⑤ آزمون‌های واحد و e2e هر دو سرِ جای خودشان‌اند.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت B1 — هاردن کردن لاگ و سقف GET توکن‌دار ۱.۲۷.۷۸', () => {
  const routing = read('src/application/api-routing/middleware.ts'); // ۱.۲۷.۸۰ — میان‌افزار سراسری به middleware.ts منتقل شد (architecture-001)
  const logMask = read('src/core/shared/log-mask.ts');
  const rateLimit = read('src/application/http/rate-limit.ts');
  const barrel = read('src/application/http/index.ts');

  it('① requestLogger مسیرِ لاگ‌شده را ماسک می‌کند — path خام در لاگ نیست', () => {
    expect(routing).toContain('import { maskSensitivePath } from \'@core/shared/log-mask\'');
    expect(routing).toContain('path: maskSensitivePath(c.req.path)');
    expect(routing).not.toMatch(/path:\s*c\.req\.path[,}]/); // فرمِ خام بازنگشته
    expect(routing).toContain('security-005');
  });

  it('② قرارداد ماسک سه‌الگویی است: /m/:token و /api/m/:token/* و /webhook/bale/:secret', () => {
    expect(logMask).toContain('/^(\\/m\\/)[^/?]+/');
    expect(logMask).toContain('/^(\\/api\\/m\\/)[^/?]+/');
    expect(logMask).toContain('/^(\\/webhook\\/bale\\/)[^/?]+/');
    expect(logMask).toContain("':masked'");
  });

  it('③ سقف GET توکن‌دار: middleware سراسری با گارد مسیر + env اختصاصی + پیش‌فرض ۱۲۰', () => {
    expect(routing).toContain("parseTokenGetRateLimitPerMin(c.env?.API_TOKEN_GET_RATE_LIMIT_PER_MIN)");
    expect(routing).toContain("!/^\\/m\\/[^/]+/.test(p) && !p.startsWith('/api/m/')");
    expect(routing).toContain('tg:${perMin}:${ip}');
    expect(rateLimit).toContain('API_TOKEN_GET_RATE_LIMIT_PER_MIN_DEFAULT = 120');
    expect(rateLimit).toContain('parsePerMinWithDefault'); // پارس مشترک دو سقف — نه کپی منطق
    expect(barrel).toContain('parseTokenGetRateLimitPerMin');
    expect(barrel).toContain('API_TOKEN_GET_RATE_LIMIT_PER_MIN_DEFAULT');
  });

  it('④ سقف نوشتنی P2-15 دست‌نخورده مانده (مسیر مستثنی ورود + کلید IP سقف‌دار)', () => {
    /* architecture-008 (۱.۲۷.۸۳): منطق P2-15 به تعریف یگانهٔ @app/http/chain رفت —
       همان قرارداد (مستثنی ورود + کلید سقف‌دار IP) آن‌جاست و middleware delegate است */
    expect(routing).toContain('installWriteRateLimitGeneric');
    const chain = read('src/application/http/chain.ts');
    expect(chain).toContain("opts.exceptionPaths ?? ['/api/auth/login']");
    expect(chain).toContain('apiRateLimiter.allow(`${keyPrefix}${perMin}:${ip}`, perMin)');
  });

  it('⑤ آزمون‌ها سرِ جای خودشان‌اند: واحد ماسک + e2e سقف توکن‌دار', () => {
    const maskTest = read('src/__tests__/log-mask.test.ts');
    expect(maskTest).toContain('/m/:masked');
    expect(maskTest).toContain('/webhook/bale/:masked');
    const e2e = read('src/application/__tests__/e2e-rate-limit.test.ts');
    expect(e2e).toContain('محدودسازی GETهای توکن‌دار عمومی (security-008');
    expect(e2e).toContain('parseTokenGetRateLimitPerMin');
  });
});
