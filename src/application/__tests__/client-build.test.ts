// آزمون باندل کلاینت (فاز C نقشهٔ کارایی): build-client.mjs باید boot نام‌دار + چانک‌های
// جدا برای نماها بسازد، index.html موقت را idempotent بازنویسی کند و xlsx را وارد گراف نکند.
// خروجی به tmp می‌رود — هیچ‌گاه public/ را نمی‌سازد (public/dist فقط در predeploy ساخته می‌شود).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const BUILD = join(ROOT, 'scripts', 'build-client.mjs');

function runBuild() {
  const dir = mkdtempSync(join(tmpdir(), 'client-build-'));
  const html = join(dir, 'index.html');
  // نسخهٔ موقت از index.html واقعی — تا بازنویسیِ build روی آن سنجیده شود بدون دست‌زدن به اصلی
  execFileSync('cp', [join(ROOT, 'public', 'index.html'), html]);
  execFileSync('node', [BUILD, '--outdir', join(dir, 'dist'), '--html', html, '--quiet'], {
    cwd: ROOT,
    timeout: 60_000
  });
  return { dir, html, dist: join(dir, 'dist'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('build-client (باندل کلاینت نام‌دار — )', () => {
  it('boot.[hash].js می‌سازد و مانیفست هم‌خوان تولید می‌کند', () => {
    const { dist, cleanup } = runBuild();
    try {
      const mf = JSON.parse(readFileSync(join(dist, 'build-manifest.json'), 'utf8'));
      expect(mf.boot).toMatch(/^boot\.[A-Za-z0-9_-]+\.js$/);
      expect(existsSync(join(dist, mf.boot))).toBe(true);
      for (const dep of mf.bootImports) expect(existsSync(join(dist, dep))).toBe(true);
      // باندل ESM با splitting باید چانک مشترک داشته باشد (ماژول‌های مشترک پوسته/نماها)
      expect(mf.bootImports.length).toBeGreaterThan(0);
      // چانک‌های تنبل نماها: حداقل ۲۰ خروجی js (۲۱ نما − docs دو export از یک ماژول)
      const jsFiles = readdirSync(dist).filter((f) => f.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThanOrEqual(20);
    } finally {
      cleanup();
    }
  });

  it('هیچ خروجی xlsx در باندل نیست (وندور سنگین on-demand می‌ماند)', () => {
    const { dist, cleanup } = runBuild();
    try {
      const jsFiles = readdirSync(dist).filter((f) => /xlsx/i.test(f));
      expect(jsFiles).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('index.html موقت به boot ارجاع می‌دهد و دیگر به app.js?v= ارجاع ندارد', () => {
    const { html, cleanup } = runBuild();
    try {
      const out = readFileSync(html, 'utf8');
      const mfBoot = out.match(/<script type="module" src="\/assets\/dist\/(boot\.[A-Za-z0-9_-]+\.js)"><\/script>/);
      expect(mfBoot).not.toBeNull();
      expect(out).not.toContain('/assets/js/app.js?v=');
      // modulepreload چانک‌های لحظهٔ بوت تزریق شده باشد
      expect((out.match(/<link rel="modulepreload" href="\/assets\/dist\//g) ?? []).length).toBeGreaterThan(0);
      // theme-boot (گارد FOUC ) باید قبل از ورودی باندل بیاید
      expect(out.indexOf('theme-boot.js')).toBeLessThan(out.indexOf(mfBoot![1]));
    } finally {
      cleanup();
    }
  });

  it('اجرای دوباره idempotent است — بلاک ورودی دوبرابر نمی‌شود', () => {
    const { dir, html, dist, cleanup } = runBuild();
    try {
      execFileSync('node', [BUILD, '--outdir', dist, '--html', html, '--quiet'], { cwd: ROOT, timeout: 60_000 });
      const out = readFileSync(html, 'utf8');
      expect((out.match(/<script type="module" src="\/assets\/dist\/boot\.[A-Za-z0-9_-]+\.js"><\/script>/g) ?? []).length).toBe(1);
      // preload تکراری نباید انباشته شود (۳ چانک مشترک فعلی بوت)
      const mf = JSON.parse(readFileSync(join(dist, 'build-manifest.json'), 'utf8'));
      expect((out.match(/<link rel="modulepreload" href="\/assets\/dist\//g) ?? []).length).toBe(mf.bootImports.length);
    } finally {
      cleanup();
    }
  });
});
