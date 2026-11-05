/**
 * گیت رفتاری ۱.۲۵.۰۸ — پخش‌کنندهٔ کودک /play:
 * نسخهٔ کودک بی‌صداست و وکتوری؛ بدون تایمر نمایشی و فلاش؛ ساعت واکنش روی
 * پنهان‌شدن برگه می‌ایستد؛ هدف‌های لمسی سخاوتمند؛ متن کودک از لینت واژه‌های
 * ممنوع عبور می‌کند؛ دارایی‌های بازی فقط در حالت کودک سرو می‌شوند.
 * الگو: front-hygiene-12505.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORBIDDEN_TEXT_PATTERNS } from '../domain/games/pure';

const PLAY = join(__dirname, '../../public/assets/play');
const read = (p: string) => readFileSync(p, 'utf8');

const playJs = read(join(PLAY, 'play.js'));
const gonogoJs = read(join(PLAY, 'kinds/gonogo.js'));
const playCss = read(join(PLAY, 'play.css'));
const pageSrc = read(join(__dirname, '../domain/games/page.ts'));
const routesSrc = read(join(__dirname, '../domain/games/routes.ts'));

describe('گیت ۱.۲۵.۰۸ — لحن و امنیت متن کودک', () => {
  it('متن‌های روبه‌کودک هیچ واژهٔ ممنوعی ندارند (لینت مشترک با بسته‌ها)', () => {
    for (const [name, src] of [['play.js', playJs], ['kinds/gonogo.js', gonogoJs], ['page.ts', pageSrc]] as const) {
      for (const w of FORBIDDEN_TEXT_PATTERNS) {
        expect(src.includes(w), `${name} حاوی واژهٔ ممنوع «${w}» است`).toBe(false);
      }
    }
  });

  it('پخش‌کننده هیچ منبع بیرونی و هیچ ارزیابی پویا ندارد (§۱۱)', () => {
    for (const [name, src] of [['play.js', playJs], ['kinds/gonogo.js', gonogoJs]] as const) {
      expect(src, `${name} نباید URL مطلق بیرونی داشته باشد`).not.toMatch(/https?:\/\//);
      expect(src, `${name} نباید eval داشته باشد`).not.toMatch(/\beval\s*\(|new\s+Function/);
    }
  });

  it('همهٔ درخواست‌های شبکه پخش‌کننده به زنجیرهٔ توکن‌دار /api/m/ می‌روند', () => {
    const fetches = playJs.match(/fetch\([^;]*?\)/g) ?? [];
    expect(fetches.length).toBe(1); // تک‌نقطهٔ شبکه: requestJson
    expect(fetches[0]).toContain('API + path');
    expect(playJs).toContain("'/api/m/'");
  });
});

describe('گیت ۱.۲۵.۰۸ — قواعد حسی §۹', () => {
  it('نسخهٔ کودک بی‌صداست — هیچ Audio یا صوتی در ماژول بازی نیست', () => {
    expect(gonogoJs).not.toMatch(/\bAudio\b|new Audio|<audio|\.play\s*\(|replay_audio/);
    expect(playJs).not.toMatch(/\bAudio\b|new Audio|<audio/);
  });

  it('محرک‌ها وکتور درون‌کدند — بدون <img و بدون فایل دارایی', () => {
    expect(gonogoJs).toContain('<svg');
    expect(gonogoJs).not.toMatch(/<img\b/);
    expect(gonogoJs).not.toMatch(/\.png|\.jpg|\.webp|\.mp3|\.ogg/);
  });

  it('بدون شمارش‌معکوس نمایشی؛ ساعت واکنش روی visibilitychange می‌ایستد', () => {
    expect(playJs).not.toMatch(/setInterval\s*\(/);
    expect(playJs).toContain('visibilitychange');
    expect(playJs).toMatch(/performance\.now\(\)/);
  });

  it('کاهش‌جنبش محترم است و هیچ انیمیشن تندی تعریف نشده', () => {
    expect(playCss).toContain('prefers-reduced-motion');
    expect(playCss).not.toMatch(/animation:[^;]*0\.\d+s/); // هیچ انیمیشن زیر یک‌ثانیه
    expect(playCss).not.toMatch(/@keyframes/);
  });

  it('هدف لمسی سخاوتمند: دکمه و گزینه ۶۴px، صحنه ۲۴۰px (≥۴۸ قاعدهٔ کف)', () => {
    expect(playCss).toMatch(/\.play-btn\s*\{[^}]*min-height:\s*64px/);
    expect(playCss).toMatch(/\.play-option\s*\{[^}]*min-height:\s*64px/);
    expect(playCss).toMatch(/\.play-stage\s*\{[^}]*min-height:\s*240px/);
  });
});

describe('گیت ۱.۲۵.۰۸ — اتصال صفحه به پخش‌کننده', () => {
  it('دارایی‌های بازی فقط در شاخهٔ child_active سرو می‌شوند (css + js با نسخه)', () => {
    const occurrences = pageSrc.match(/assets\/play\//g) ?? [];
    expect(occurrences.length).toBe(2); // یک link + یک script — فقط در حالت کودک
    const childBranch = pageSrc.slice(
      pageSrc.indexOf("state === 'child_active'"),
      pageSrc.indexOf("state === 'child_done'")
    );
    expect(childBranch).toContain('id="play-root"');
    expect(childBranch).toContain('data-kind=');
    expect(childBranch).toContain('data-hint=');
    expect(childBranch).toContain('APP_VERSION');
  });

  it('CSP صفحهٔ کودک مبدأ خودی را برای ماژول بازی اجازه می‌دهد و همچنان بسته است', () => {
    expect(routesSrc).toContain("script-src 'self' 'unsafe-inline'");
    expect(routesSrc).toContain("style-src 'self' 'unsafe-inline'");
    expect(routesSrc).toContain("default-src 'none'");
    expect(routesSrc).toContain("frame-ancestors 'none'");
  });
});
