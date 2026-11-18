// گیت بایند LAN موتور محلی — v1.27.20 (خواست کارفرما: موبایل‌های هم‌شبکه از مرورگر وصل شوند)
// پیش از این: پوستهٔ Rust هرگز --bind پاس نمی‌داد → adapter روی 127.0.0.1 می‌ماند و
// گزارش کارفرما «پورت 127.0.0.1:8787» بود. چهار پیچ در این گیت سفت می‌شود.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('گیت بایند LAN موتور محلی (v1.27.20)', () => {
  it('پوستهٔ Rust ثابت DEFAULT_BIND=0.0.0.0 دارد و پرچم --bind را به adapter پاس می‌دهد', () => {
    const rs = read('desktop/src-tauri/src/engine.rs');
    expect(rs).toContain('const DEFAULT_BIND: &str = "0.0.0.0"');
    // زنجیرهٔ spawn: --port ← --bind ← --games-port (پین ساختاری، نه فقط رشتهٔ پراکنده)
    expect(rs).toMatch(/\.arg\("--port"\)\s*\.arg\(DEFAULT_PORT\.to_string\(\)\)\s*\.arg\("--bind"\)\s*\.arg\(DEFAULT_BIND\)/s);
  });

  it('adapter بایند را از موتور می‌گیرد (پیش‌فرض لوکال می‌ماند) و لینک عمومی از کارت LAN اول می‌آید', () => {
    const src = read('scripts/engine/adapter/server.mjs');
    expect(src).toContain("const host = bind ?? '127.0.0.1'");
    expect(src).toContain("from './lan.mjs'");
    expect(src).toContain('defaultPublicBaseOf(host, port)');
    expect(src).not.toContain('PUBLIC_BASE_URL: bindings.publicBaseUrl ?? `http://127.0.0.1:${port}`');
  });

  it('بوت موتور نشانی موبایل‌ها + خط راهنمای فایروال را چاپ می‌کند', () => {
    const src = read('scripts/engine/adapter/server.mjs');
    expect(src).toContain('bootUrlsOf(host, port)');
    expect(src).toContain('نشانی سرویس اصلی');
    expect(src).toContain('فایروال ویندوز');
  });

  it('ماژول lan محدودهٔ خصوصی را رعایت می‌کند و لینک-لوکال/لوکال را دور می‌ریزد', () => {
    const lan = read('scripts/engine/adapter/lan.mjs');
    expect(lan).toContain("'169.254.'");
    expect(lan).toContain("addr.startsWith('127.')");
    expect(lan).toContain('ni.internal');
    expect(lan).toContain("second >= 16 && second <= 31");
  });

  it('اسکریپت dev هم شبکه‌ای است (npm run dev = wrangler dev --ip 0.0.0.0)', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toBe('node scripts/dev-lan.mjs');
    const dev = read('scripts/dev-lan.mjs');
    expect(dev).toContain("'--ip'");
    expect(dev).toContain("'0.0.0.0'");
    expect(dev).toContain("bootUrlsOf('0.0.0.0'");
  });
});
