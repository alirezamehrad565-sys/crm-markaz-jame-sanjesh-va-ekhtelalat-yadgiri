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
const engineJs = ['machine.js', 'timing.js', 'response.js', 'trials.js', 'session.js', 'scoring.js']
  .map((f) => read(join(PLAY, 'engine', f))).join('\n');
const pageSrc = read(join(__dirname, '../domain/games/page.ts'));
const routesSrc = read(join(__dirname, '../domain/games/routes.ts'));
const allPlaySrc = playJs + gonogoJs + playCss + engineJs;

describe('گیت ۱.۲۵.۰۸ — لحن و امنیت متن کودک', () => {
  it('متن‌های روبه‌کودک هیچ واژهٔ ممنوعی ندارند (لینت مشترک با بسته‌ها) — شامل موتور', () => {
    for (const [name, src] of [['play.js', playJs], ['kinds/gonogo.js', gonogoJs], ['page.ts', pageSrc], ['engine/*', engineJs]] as const) {
      for (const w of FORBIDDEN_TEXT_PATTERNS) {
        expect(src.includes(w), `${name} حاوی واژهٔ ممنوع «${w}» است`).toBe(false);
      }
    }
  });

  it('پخش‌کننده هیچ منبع بیرونی و هیچ ارزیابی پویا ندارد (§۱۱) — شامل موتور engine/', () => {
    for (const [name, src] of [['play.js', playJs], ['kinds/gonogo.js', gonogoJs], ['engine/*', engineJs]] as const) {
      expect(src, `${name} نباید URL مطلق بیرونی داشته باشد`).not.toMatch(/https?:\/\//);
      expect(src, `${name} نباید eval داشته باشد`).not.toMatch(/\beval\s*\(|new\s+Function/);
    }
  });

  it('تک‌نقطهٔ شبکهٔ کل پخش‌کننده (ورودی + موتور): فقط requestJson در play.js', () => {
    const fetches = allJsFetches(playJs, engineJs);
    expect(fetches.length).toBe(1); // تک‌نقطهٔ شبکه: requestJson
    expect(fetches[0]).toContain('API + path');
    expect(playJs).toContain("'/api/m/'");
  });
});

describe('گیت ۱.۲۵.۰۸ — قواعد حسی §۹', () => {
  it('نسخهٔ کودک بی‌صداست — هیچ Audio یا صوتی در ماژول بازی و موتور نیست', () => {
    expect(gonogoJs).not.toMatch(/\bAudio\b|new Audio|<audio|\.play\s*\(|replay_audio/);
    expect(playJs + engineJs).not.toMatch(/\bAudio\b|new Audio|<audio/);
  });

  it('محرک‌ها وکتور درون‌کدند — بدون <img و بدون فایل دارایی', () => {
    expect(gonogoJs).toContain('<svg');
    expect(gonogoJs).not.toMatch(/<img\b/);
    expect(gonogoJs).not.toMatch(/\.png|\.jpg|\.webp|\.mp3|\.ogg/);
  });

  it('بدون شمارش‌معکوس نمایشی؛ ساعت واکنش روی visibilitychange می‌ایستد — در کل موتور', () => {
    expect(allPlaySrc).not.toMatch(/setInterval\s*\(/);
    expect(allPlaySrc).toContain('visibilitychange');
    expect(allPlaySrc).toMatch(/performance\.now\(\)/);
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

/** همهٔ فراخوانی‌های fetch در ماژول‌های پخش‌کننده (ورودی + موتور) */
function allJsFetches(...sources: string[]): string[] {
  return sources.flatMap((src) => src.match(/fetch\([^;]*?\)/g) ?? []);
}

describe('گیت فاز ۳ بازطراحی — موتور ۱۴-حالته (۱.۲۵.۱۳)', () => {
  it('ماشین ۱۴-حالته دفترچهٔ وظیفه در engine/machine.js حاضر است', () => {
    for (const s of ['IDLE', 'INSTRUCTION', 'DEMONSTRATION', 'PRACTICE', 'READY', 'FIXATION',
      'STIMULUS', 'RESPONSE_WINDOW', 'INTER_TRIAL_INTERVAL', 'BREAK', 'COMPLETED',
      'PAUSED', 'INTERRUPTED', 'INVALID']) {
      expect(engineJs).toContain(s);
    }
  });

  it('پاسخ زودتر از محرک و لمس‌های چندگانه ثبت می‌شوند (C4/C5 ممیزی)', () => {
    expect(engineJs).toContain('premature');
    expect(engineJs).toContain('multiple');
    expect(engineJs).toContain('out_of_surface');
    expect(engineJs).toContain('classifyTouch');
  });

  it('دو حالت از یک موتور — behavior پروتکل تصمیم می‌گیرد نه if هاردکد', () => {
    expect(engineJs).toMatch(/feedback_in_main/);
    expect(engineJs).toMatch(/star_basket/);
    expect(engineJs).toMatch(/data-protocol|dataset\.protocol/);
  });

  it('کلید پاسخ هرگز به کلاینت نمی‌رود — موتور گو بودن را نمی‌داند', () => {
    expect(engineJs).not.toContain('correct_touch');
    expect(engineJs).not.toContain("correct'");
    expect(engineJs).not.toContain('correct"');
    // بازخورد آموزشی فقط از سرور می‌آید (fb.correct) — کلید آیتم هرگز
  });

  it('مُهر نمایش واقعی و افت فریم ثبت می‌شوند (C7 ممیزی)', () => {
    expect(engineJs).toMatch(/presented_at/);
    expect(engineJs).toMatch(/frame_drops/);
    expect(engineJs).toMatch(/requestAnimationFrame/);
  });
});

describe('گیت فاز ۹+۱۰ بازطراحی — پرهیز از نشت واریانت و QA (۱.۲۵.۱۹)', () => {
  it('هیچ کد واریانت پیشرفته (cued/distractor/auditory/variable) در دارایی‌های پخش‌کننده نیست', () => {
    // سند فاز ۹: واریانت‌ها ساخته نمی‌شوند — اگر این گیت شکست، یعنی بی‌صدایی §۹ یا قرارداد فاز ۹ نقض شده
    expect(allPlaySrc.toLowerCase()).not.toMatch(/distractor|cued|auditory|variable_timing/);
  });

  it('دو حالت از موتور: data-protocol صفحه + behavior پروتکل + امنیت ارزیابی', () => {
    expect(pageSrc).toContain('data-protocol=');
    expect(engineJs).toMatch(/feedback_in_main/);
    expect(engineJs).toMatch(/isAssessment/);
    // ارزیابی: بی‌سبد ستاره حتی اگر کلید سبد فعال شد
    expect(engineJs).toMatch(/star_basket && !isAssessment/);
  });

  it('شواهد نمایش فاز ۴ در کل زنجیره حاضرند (مُهر نمایش/افت فریم/لمس‌ها)', () => {
    expect(engineJs).toMatch(/presented_at/);
    expect(engineJs).toMatch(/frame_drops/);
    expect(engineJs).toMatch(/pause_count|pause_total_ms/);
  });

  it('نظافت تک‌نقطهٔ شبکهٔ کل پخش‌کننده پس از موتور جدید', () => {
    expect(allJsFetches(playJs, engineJs).length).toBe(1);
    expect(engineJs).not.toMatch(/fetch\(/);
  });
});

describe('گیت فاز ۲ بازطراحی — پالت/فونت/پنج‌شِمال (۱.۲۵.۱۲)', () => {
  it('پالت دفترچهٔ وظیفه §۲ در CSS و محرک‌ها حاضر است', () => {
    expect(playCss).toContain('#153E50'); // Navy
    expect(playCss).toContain('#438C89'); // Teal — محرک نوگو
    expect(playCss).toContain('#E4AA46'); // Amber — محرک گو
    expect(playCss).toContain('#F5F0E5'); // Cream
    expect(gonogoJs).toContain('#438C89');
    expect(gonogoJs).toContain('#E4AA46');
  });

  it('آبی/زرد قدیمی محرک‌ها هیچ‌جا باقی نمانده (تعارض پالت ممیزی §۳.۴)', () => {
    expect(allPlaySrc).not.toContain('#4E8DD4');
    expect(allPlaySrc).not.toContain('#F2C14E');
    expect(allPlaySrc).not.toContain('#229ED9');
  });

  it('فونت Vazirmatn فقط خودی است — بدون هیچ URL بیرونی', () => {
    expect(playCss).toContain("font-family: 'Vazirmatn Play'");
    expect(playCss).toContain('/assets/fonts/vazirmatn-fa-regular.woff2');
    expect(playCss).toContain('/assets/fonts/vazirmatn-fa-bold.woff2');
    expect(routesSrc).toContain("font-src 'self'");
  });

  it('پنج‌شِمال: شِمال‌های آموزش/اجرای اصلی/پایان جدا دارند؛ اجرای اصلی بی‌چرم است', () => {
    expect(playCss).toMatch(/\.play-stage--teach/);
    expect(playCss).toMatch(/\.play-stage--main/);
    expect(playCss).toMatch(/\.play-stage--end/);
  });

  it('ارزیابی بی‌نوار پیشرفت و بی‌سبد ستاره — تمایز دو حالت در CSS', () => {
    expect(playCss).toMatch(/data-mode='assessment'\] \.play-progress/);
    expect(playCss).toMatch(/data-basket='on'\] \.play-basket/);
    expect(pageSrc).toContain('data-protocol=');
    expect(pageSrc).toContain('id="play-basket"');
  });

  it('مقیاس محرک سن‌محور با متغیر پروتکل — بدون عدد جادویی مستقل', () => {
    expect(playCss).toContain('--stim-scale');
    expect(playCss).toMatch(/\.play-svg\s*\{[^}]*var\(--stim-scale\)/);
  });
});
