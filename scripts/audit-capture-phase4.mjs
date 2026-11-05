// فاز ۴ ممیزی UX — گیت اطمینان: ضبط مجدد شواهد از پروداکشن پس از ۱.۰۶/۱.۰۷
// اجرا:  MGR_TOKEN=... THP_TOKEN=... BASE=https://… OUT=… node scripts/audit-capture-phase4.mjs
// فقط-خواندنی: هیچ درخواست نوشتن به API زده نمی‌شود؛ کاربر موقت بیرون از این اسکریپت ساخته/حذف می‌شود.
// v3 — تأخیر ثابت ۵ثانیه‌ای پس از آرام‌شدن (لود کامل منو/فونت/انیمیشن) + کیفیت بالا: DSF2 دسکتاپ + JPEG q90
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_VERSION_TAG = (fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core', 'version.ts'), 'utf8'
).match(/APP_VERSION = '([^']+)'/)?.[1]) ?? '?';

const BASE = process.env.BASE ?? 'https://center-system.sanjeshm.workers.dev';
const OUT = process.env.OUT ?? '/home/z/my-project/audit/shots-v2';
const MGR = process.env.MGR_TOKEN;
const THP = process.env.THP_TOKEN;
const STUDENT_ID = process.env.STUDENT_ID;
if (!MGR || !THP || !STUDENT_ID) { console.error('MGR_TOKEN/THP_TOKEN/STUDENT_ID لازم است'); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];

// مسیرهای ضبط — همان ماتریس سند ممیزی (۲۱ مسیر مدیر، ۸ مسیر درمانگر)
const MANAGER_PATHS = [
  'dashboard', 'students', 'working-day', 'appointments', 'waitlist',
  'case-event-types', 'docs', 'exercises', 'archive', 'backup', 'clearbook',
  'finance', 'outbox', 'reports', 'schools', 'screening', 'settings',
  'special-needs', 'staff', 'treatment-plans'
];
// حذف «progress-board» در ۱.۰۷.۱ — این مسیر هرگز route ثبت‌نشده بود (۴۰۴)؛
// هدف واقعی گلایهٔ ۲ «گزارش پیشرفت» است: #/students/:id/progress-report (در ویژه‌ها ضبط می‌شود)
const THERAPIST_PATHS = [
  'dashboard', 'students', 'working-day', 'appointments',
  'case-event-types', 'exercises', 'archive'
];
const BOTTOM_SHOTS = new Set([
  'students', 'clearbook', 'reports', 'appointments',
  'working-day', 'exercises', 'archive', 'case-event-types', 'docs'
]);

const CONTEXTS = [
  { vp: 'desktop', opts: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  { vp: 'mobile', opts: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } }
];

const SETTLE_DELAY_MS = Number(process.env.SETTLE_DELAY_MS ?? 5000); // تأخیر ۵ ثانیه‌ای — لود کامل منو

async function waitSettled(page, ms = 9000) {
  // انتظار تا محو شدن اسکلت‌های ناحیهٔ اصلی (تأخیر واقعی API پروداکشن) — با سقف زمانی
  await page.waitForFunction(
    () => document.querySelectorAll('.skel-state, .skel-card, .skel, .skeleton').length === 0,
    { timeout: ms }
  ).catch(() => {});
  await page.waitForTimeout(SETTLE_DELAY_MS); // ⬅ تأخیر ۵ثانیه‌ای درخواستی کاربر: منو و ویو کاملاً لود شود
}

const JPEG_QUALITY = Number(process.env.JPEG_QUALITY ?? 90); // ⬅ کیفیت بالاتر (q70 → q90)

async function shoot(page, role, name, vp) {
  const file = `${role}-${name}-${vp}.jpg`;
  await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, path: path.join(OUT, file) });
  manifest.push({ file, role, name, vp });
  process.stdout.write(`✓ ${file}\n`);
}

async function captureRole(browser, role, token, paths, contexts = CONTEXTS) {
  for (const { vp, opts } of contexts) {
    const ctx = await browser.newContext({ locale: 'fa-IR', timezoneId: 'Asia/Tehran', ...opts });
    await ctx.addInitScript((t) => localStorage.setItem('cs.token', t), token);
    const page = await ctx.newPage();
    for (const name of paths) {
      try {
        await page.goto(`${BASE}/#/${name}`, { waitUntil: 'load', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await waitSettled(page);
        await shoot(page, role, name, vp);
        if (vp === 'desktop' && BOTTOM_SHOTS.has(name)) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(900);
          const file = `${role}-${name}-${vp}-bottom.jpg`;
          await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, path: path.join(OUT, file) });
          manifest.push({ file, role, name, vp: 'desktop-bottom' });
          process.stdout.write(`✓ ${file}\n`);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      } catch (err) {
        console.error(`✗ ${role}/${name}/${vp}: ${err.message.split('\n')[0]}`);
      }
    }
    // حالت‌های ویژه
    if (vp === 'mobile') {
      try { // کشوی سایدبار باز
        await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'load' });
        await waitSettled(page, 6000);
        await page.click('#menu-btn');
        await page.waitForTimeout(700);
        await shoot(page, role, 'sidebar-open', vp);
        await page.keyboard.press('Escape');
      } catch (err) { console.error(`✗ ${role}/sidebar: ${err.message.split('\n')[0]}`); }
      try { // پروفایل دانش‌آموز
        await page.goto(`${BASE}/#/students/${STUDENT_ID}`, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await waitSettled(page);
        await shoot(page, role, 'student-profile', vp);
      } catch (err) { console.error(`✗ ${role}/profile-mobile: ${err.message.split('\n')[0]}`); }
      try { // گزارش پیشرفت — گلایهٔ ۲ (چک‌لیست مهارتی موبایل)
        await page.goto(`${BASE}/#/students/${STUDENT_ID}/progress-report`, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await waitSettled(page);
        await shoot(page, role, 'progress-report', vp);
      } catch (err) { console.error(`✗ ${role}/progress-report-mobile: ${err.message.split('\n')[0]}`); }
    }
    if (vp === 'desktop') {
      try {
        await page.goto(`${BASE}/#/students/${STUDENT_ID}`, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await waitSettled(page);
        await shoot(page, role, 'student-profile', vp);
      } catch (err) { console.error(`✗ ${role}/profile-desktop: ${err.message.split('\n')[0]}`); }
      try {
        await page.goto(`${BASE}/#/students/${STUDENT_ID}?tab=timeline`, { waitUntil: 'load' });
        await waitSettled(page);
        await shoot(page, role, 'student-profile-timeline', vp);
      } catch (err) { console.error(`✗ ${role}/profile-timeline: ${err.message.split('\n')[0]}`); }
      try { // گزارش پیشرفت — گلایهٔ ۲ (+ پایین اسکرول)
        await page.goto(`${BASE}/#/students/${STUDENT_ID}/progress-report`, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await waitSettled(page);
        await shoot(page, role, 'progress-report', vp);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(900);
        const prFile = `${role}-progress-report-${vp}-bottom.jpg`;
        await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, path: path.join(OUT, prFile) });
        manifest.push({ file: prFile, role, name: 'progress-report', vp: 'desktop-bottom' });
        process.stdout.write(`✓ ${prFile}\n`);
        await page.evaluate(() => window.scrollTo(0, 0));
      } catch (err) { console.error(`✗ ${role}/progress-report-desktop: ${err.message.split('\n')[0]}`); }
    }
    await ctx.close();
  }
}

const browser = await chromium.launch();
// اجرای بخشی (قابلیت ازسرگیری): ROLES=manager VPS=desktop → برای اجرای چندبلوکی در محیط‌های محدود
const ROLES = (process.env.ROLES ?? 'manager,therapist').split(',').map((s) => s.trim()).filter(Boolean);
const VPS = (process.env.VPS ?? 'desktop,mobile').split(',').map((s) => s.trim()).filter(Boolean);
const CONTEXTS_SEL = CONTEXTS.filter((c) => VPS.includes(c.vp));
try {
  if (ROLES.includes('manager')) await captureRole(browser, 'manager', MGR, MANAGER_PATHS, CONTEXTS_SEL);
  if (ROLES.includes('therapist')) await captureRole(browser, 'therapist', THP, THERAPIST_PATHS, CONTEXTS_SEL);
} finally {
  await browser.close();
}
// مانیفست تجمعی — اگر از اجرای قبلی موجود باشد، ادغام می‌شود (بدون تکرار بر اساس نام فایل)
const MPATH = path.join(OUT, 'manifest.json');
let prev = [];
try { prev = JSON.parse(fs.readFileSync(MPATH, 'utf8')).items ?? []; } catch {}
const byFile = new Map(prev.map((it) => [it.file, it]));
for (const it of manifest) byFile.set(it.file, it);
const items = [...byFile.values()];
fs.writeFileSync(MPATH, JSON.stringify({
  base: BASE, capturedAt: new Date().toISOString(), count: items.length,
  settleDelayMs: SETTLE_DELAY_MS, jpegQuality: JPEG_QUALITY,
  desktopScale: 2, appVersion: APP_VERSION_TAG, items
}, null, 2));
console.log(`\nتمام شد — ${manifest.length} تصویر این اجرا، ${items.length} تصویر تجمعی در ${OUT}`);
