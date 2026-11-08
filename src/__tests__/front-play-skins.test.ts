/**
 * گیت G7 پوسته‌های اختصاصی نوع‌بازی (۱.۲۵.۴۳) — هر بازی پوستهٔ خودش را دارد:
 *  · برای هر نوع شناخته‌شدهٔ رجیستری، فایل public/assets/play/skins/<kind>.css موجود است
 *  · هر پوسته کلاس ماندگار .play-skin--<kind> را هدف می‌گیرد (موتور آن را روی #play-root می‌گذارد)
 *  · سقف حجم ratchet — هر پوسته ≤ ۷۰۰۰ بایت خام (فقط سفت‌شونده)
 *  · هنرِ بی‌جنبش: هیچ @keyframes و هیچ animation — جنبش فقط از fx.js با گارد کاهش‌جنبش
 *  · صفر دارایی خارجی: هیچ URL بیرونی، هیچ @import (قاعدهٔ {d,ink} سند ART_DIRECTION)
 *  · بلوک prefers-reduced-motion: reduce الزامی — هم‌قرارداد پوستهٔ آلبوم دریایی
 *  · سیم‌کشی: page.ts با skinLink بعد از play.css سرو می‌کند؛ session.js کلاس را می‌گذارد؛
 *    برنچ انتخاب زمان‌دار nback را هم می‌گیرد (رفع unsupported_kind — G4ب)
 * الگو: front-play-gates.test.ts
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const SKINS = join(ROOT, 'public/assets/play/skins');
const KINDS = ['gonogo', 'numline', 'scan', 'stroop', 'flanker', 'trail', 'nback'] as const;
const SKIN_CEILING_BYTES = 7000;

const read = (p: string) => readFileSync(p, 'utf8');
const sessionJs = read(join(ROOT, 'public/assets/play/engine/session.js'));
const pageSrc = read(join(ROOT, 'src/domain/games/page.ts'));

describe('گیت G7 — پوستهٔ اختصاصی هر نوع‌بازی', () => {
  it('هر هفت نوع‌بازی فایل پوستهٔ موجود و زیر سقف حجم دارد', () => {
    for (const k of KINDS) {
      const p = join(SKINS, `${k}.css`);
      expect(existsSync(p), `${k}: skins/${k}.css موجود نیست`).toBe(true);
      const size = statSync(p).size;
      expect(size, `${k}: پوسته ${size} بایت — بالای سقف ${SKIN_CEILING_BYTES}`).toBeLessThanOrEqual(SKIN_CEILING_BYTES);
      expect(size, `${k}: پوسته تقریباً خالی است — پوستهٔ واقعی نیست`).toBeGreaterThan(1200);
    }
  });

  it('هر پوسته کلاس ماندگار خودش را هدف می‌گیرد و گارد کاهش‌جنبش دارد', () => {
    for (const k of KINDS) {
      const src = read(join(SKINS, `${k}.css`));
      expect(src, `${k}: سلکتور ریشهٔ پوسته`).toContain(`.play-skin--${k}`);
      expect(src, `${k}: بلوک prefers-reduced-motion الزامی است`).toContain('prefers-reduced-motion');
    }
  });

  it('هنرِ بی‌جنبش و صفر دارایی خارجی — هیچ @keyframes/animation/@import/URL بیرونی', () => {
    for (const k of KINDS) {
      const src = read(join(SKINS, `${k}.css`));
      expect(src, `${k}: @keyframes ممنوع — جنبش فقط از fx.js`).not.toContain('@keyframes');
      // animation: none داخل بلوک کاهش‌جنبش الگوی مجاز خنثی‌سازی است؛ هر مقدار دیگری ممنوع
      const strippedAnim = src.replace(/animation\s*:\s*none/g, '');
      expect(strippedAnim, `${k}: animation: ممنوع — جنبش فقط از fx.js`).not.toMatch(/animation\s*:/);
      expect(src, `${k}: @import ممنوع`).not.toContain('@import');
      expect(src, `${k}: URL بیرونی ممنوع — قاعدهٔ {d,ink}`).not.toMatch(/https?:\/\//);
    }
  });

  it('کف فونت ۱۲px در همهٔ پوسته‌ها — هم‌قرارداد گیت کف فونت کل دارایی‌ها', () => {
    for (const k of KINDS) {
      const src = read(join(SKINS, `${k}.css`));
      const sizes = [...src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => parseFloat(m[1]));
      for (const s of sizes) {
        expect(s, `${k}: font-size ${s}px زیر کف ۱۲px است`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('سیم‌کشی صفحه و موتور — پوسته از سرور سرو می‌شود و کلاس ماندگار روی ریشه می‌نشیند', () => {
    // page.ts: helper پوسته فقط برای نوع‌های رجیستری، بعد از play.css در هر دو شاخه
    expect(pageSrc).toContain("href=\"/assets/play/skins/${k}.css?v=${APP_VERSION}\"");
    expect(pageSrc).toContain('skinLink(model.playGame)');
    expect(pageSrc).toContain('skinLink(state.game)');
    // session.js: کلاس ماندگار از data-kind سرور — بدون فهرست هاردکد (موتور نوع-آگنوست)
    expect(sessionJs).toContain("root.classList.add('play-skin--' + KIND_NAME)");
    expect(sessionJs).toMatch(/KIND_NAME && \/\^\[a-z\]\[a-z0-9\]\*\$\//);
  });

  it('برنچ انتخاب زمان‌دار هر سه نوع timedChoice را می‌گیرد — nback دیگر unsupported نمی‌شود', () => {
    expect(sessionJs).toContain("item.type === 'stroop' || item.type === 'flanker' || item.type === 'nback'");
    // سقوط صریح برای نوع‌های بدون برچسب هنوز هست — پوسته جای آن را نمی‌گیرد
    expect(sessionJs).toContain('unsupported_kind');
  });

  it('قفل جهت — چرخش به عمودی همان مسیر مکث برگه را می‌رود، نه پنجرهٔ شانسی', () => {
    // مکث گیت‌محور: پنهان‌شدن برگه و چرخش از یک مسیر gatePause/gateResume می‌گذرند
    expect(sessionJs).toContain('const gatePause');
    expect(sessionJs).toContain('const gateResume');
    expect(sessionJs).toContain("matchMedia('(orientation: portrait)')");
    expect(sessionJs).toContain("matchMedia('(pointer: coarse)')");
    // پوشش چرخش در هر دو صفحهٔ کودک و پیش‌نمایش هست — پیش‌نمایش هم دیگر بدون گیت نیست
    const previewJs = read(join(ROOT, 'public/assets/play/preview.js'));
    expect(previewJs).toContain('orientationGate()');
  });
});
