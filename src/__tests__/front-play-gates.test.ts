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
const previewJs = read(join(PLAY, 'preview.js')); // پیش‌نمایش فقط-پرسنلی (۱.۲۵.۲۰) — همان قواعد امنیتی پخش‌کننده
const gonogoJs = read(join(PLAY, 'kinds/gonogo.js'));
const scanKindJs = read(join(PLAY, 'kinds/scan.js')); // حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — ماژول نمایش موج اسکن
const numlineKindJs = read(join(PLAY, 'kinds/numline.js')); // جادهٔ عددها (۱.۲۵.۲۸)
const stroopKindJs = read(join(PLAY, 'kinds/stroop.js')); // حقه‌باز رنگ‌ها (۱.۲۵.۳۲)
const flankerKindJs = read(join(PLAY, 'kinds/flanker.js')); // گلهٔ فریبکار (۱.۲۵.۳۲)
const trailKindJs = read(join(PLAY, 'kinds/trail.js')); // رد پای دزد (۱.۲۵.۳۲)
const sceneJs = read(join(PLAY, 'scene.js')); // کتابخانهٔ صحنهٔ دریایی (M2/۱.۲۵.۳۶) — بی‌متن و بی‌کلید
const playCss = read(join(PLAY, 'play.css'));
const fxJs = read(join(PLAY, 'fx.js')); // لایهٔ حسی بازی (۱.۲۵.۲۱) — همهٔ جنبش تزئینی همین‌جاست
const engineJs = ['machine.js', 'timing.js', 'response.js', 'trials.js', 'session.js', 'scoring.js', 'observe.js']
  .map((f) => read(join(PLAY, 'engine', f))).join('\n');
const pageSrc = read(join(__dirname, '../domain/games/page.ts'));
const routesSrc = read(join(__dirname, '../domain/games/routes.ts'));
const allPlaySrc = playJs + previewJs + gonogoJs + scanKindJs + numlineKindJs + stroopKindJs + flankerKindJs + trailKindJs + sceneJs + playCss + fxJs + engineJs;

describe('گیت ۱.۲۵.۰۸ — لحن و امنیت متن کودک', () => {
  it('متن‌های روبه‌کودک هیچ واژهٔ ممنوعی ندارند (لینت مشترک با بسته‌ها) — شامل همهٔ نوع‌بازی‌ها، صحنه، موتور و fx (G3)', () => {
    for (const [name, src] of [['play.js', playJs], ['kinds/gonogo.js', gonogoJs], ['kinds/scan.js', scanKindJs], ['kinds/numline.js', numlineKindJs], ['kinds/stroop.js', stroopKindJs], ['kinds/flanker.js', flankerKindJs], ['kinds/trail.js', trailKindJs], ['scene.js', sceneJs], ['fx.js', fxJs], ['page.ts', pageSrc], ['engine/*', engineJs]] as const) {
      for (const w of FORBIDDEN_TEXT_PATTERNS) {
        expect(src.includes(w), `${name} حاوی واژهٔ ممنوع «${w}» است`).toBe(false);
      }
    }
  });

  it('پخش‌کننده هیچ منبع بیرونی و هیچ ارزیابی پویا ندارد (§۱۱) — شامل همهٔ نوع‌بازی‌ها، صحنه، موتور، fx و پیش‌نمایش', () => {
    for (const [name, src] of [['play.js', playJs], ['preview.js', previewJs], ['kinds/gonogo.js', gonogoJs], ['kinds/scan.js', scanKindJs], ['kinds/numline.js', numlineKindJs], ['kinds/stroop.js', stroopKindJs], ['kinds/flanker.js', flankerKindJs], ['kinds/trail.js', trailKindJs], ['scene.js', sceneJs], ['fx.js', fxJs], ['engine/*', engineJs]] as const) {
      expect(src, `${name} نباید URL مطلق بیرونی داشته باشد`).not.toMatch(/https?:\/\//);
      expect(src, `${name} نباید eval داشته باشد`).not.toMatch(/\beval\s*\(|new\s+Function/);
    }
  });

  it('تک‌نقطهٔ شبکهٔ کل پخش‌کننده + پیش‌نمایش: فقط requestJson، هر مسیر با API خودش', () => {
    const fetches = allJsFetches(playJs, engineJs, previewJs);
    expect(fetches.length).toBe(2); // تک‌نقطهٔ هر مسیر: play.js (کودک) + preview.js (پرسنلی)
    for (const f of fetches) expect(f).toContain('API + path');
    expect(playJs).toContain("'/api/m/'");
    expect(previewJs).toContain("'/api/play/preview/'");
    // پیش‌نمایش هرگز زنجیرهٔ کودک را صدا نمی‌زند و هیچ نوشتنی به زنجیرهٔ جلسهٔ واقعی ندارد
    expect(previewJs).not.toContain('/api/m/');
    expect(previewJs).not.toContain('/attempts');
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
  it('دارایی‌های بازی فقط در شاخهٔ child_active و شاخهٔ پیش‌نمایش فقط-پرسنلی سرو می‌شوند (css + js با نسخه)', () => {
    const occurrences = pageSrc.match(/assets\/play\//g) ?? [];
    // هر شاخه یک link + یک script: کودک (play.js) + پیش‌نمایش (preview.js) — ۱.۲۵.۲۰
    expect(occurrences.length).toBe(4);
    const childBranch = pageSrc.slice(
      pageSrc.indexOf("state === 'child_active'"),
      pageSrc.indexOf("state === 'child_done'")
    );
    expect(childBranch).toContain('id="play-root"');
    expect(childBranch).toContain('data-kind=');
    expect(childBranch).toContain('data-hint=');
    expect(childBranch).toContain('APP_VERSION');
    // شاخهٔ پیش‌نمایش: توکن خودش + بدون کلید؛ ماژول جدا از پخش‌کنندهٔ کودک
    const previewBranch = pageSrc.slice(pageSrc.indexOf('renderPreviewPage'));
    expect(previewBranch).toContain('id="play-root"');
    expect(previewBranch).toContain('data-protocol=');
    expect(previewBranch).toContain('preview.js');
    expect(previewBranch.indexOf('play.css')).toBeGreaterThan(-1);
    expect(previewBranch).not.toContain('play.js?');
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

describe('گیت G1 تثبیت موتور و صحت داده (۱.۲۵.۳۵) — رگرسیون‌های ممیزی M0', () => {
  const sessionJs = read(join(PLAY, 'engine/session.js'));
  const observeJs = read(join(PLAY, 'engine/observe.js'));

  it('شواهد صفر هاردکد ممنوع در پنج شاخهٔ خاص (P1-2) — همه از observe.js می‌آیند', () => {
    // پیش از G1، شاخه‌های خاص premature/multiple/out_of_surface/frame_drops را صفر هاردکد می‌گذاشتند
    expect(sessionJs).not.toMatch(/premature_count:\s*0[,}]/);
    expect(sessionJs).not.toMatch(/multiple_count:\s*0[,}]/);
    expect(sessionJs).not.toMatch(/out_of_surface_count:\s*0[,}]/);
    expect(sessionJs).not.toMatch(/frame_drops:\s*0[,}]/);
    for (const marker of ['createTouchLedger', 'attachTouchEvidence', 'observeDisplayFrames']) {
      expect(sessionJs, marker).toContain(marker);
    }
    expect(observeJs).toContain('classifyTouch'); // همان طبقه‌بندی ماشین — قرارداد فاز ۳
  });

  it('ساعت RT مکث‌پذیر در هر پنج شاخهٔ خاص (P1-1) — هر شاخه ساعت خودش را دارد', () => {
    // ۵ شاخه + یک import از timing.js — شاخهٔ timedchoice شرط دوگانه استروپ/فلانکر دارد
    expect(sessionJs.match(/createPausableClock/g)?.length).toBeGreaterThanOrEqual(6);
    for (const clock of ['clockN', 'clockS', 'clockT', 'clockQ', 'clockC']) {
      expect(sessionJs, clock).toMatch(new RegExp('const ' + clock + ' = createPausableClock()'));
      expect(sessionJs, clock).toMatch(new RegExp(clock + '\\.start\\(\\)'));
    }
    // گیره‌های مکث در همهٔ شاخه‌ها نصب و پس از پایان آزمون تخریب می‌شوند
    expect(sessionJs.match(/trialHooks\.pause = null/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sessionJs.match(/trialHooks\.resume = null/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('پنجرهٔ پاسخ پروتکل‌محور برای خط عددی و choice (P2-1) — بی‌پاسخ = اُمیشن نه گیر بی‌نهایت', () => {
    expect(sessionJs).toContain('response_window_extended_ms'); // پارامتر پروتکل با پیش‌فرض امن
    const numlineBranch = sessionJs.split("item.type === 'numline'")[1]?.split('continue;')[0] ?? '';
    const choiceBranch = sessionJs.split("item.type === 'choice'")[1]?.split('continue;')[0] ?? '';
    for (const [name, body] of [['numline', numlineBranch], ['choice', choiceBranch]] as const) {
      expect(body, name).toContain('sleeper.sleep('); // پنجره با خواب مکث‌پذیر — نه خام
      expect(body, name).toContain('sleeper.cancel'); // قاعدهٔ خواب یتیم
      expect(body, name).toContain('timedOut'); // بی‌پاسخ صریح
    }
    // سرور-آگاه: مقدار پنجره در response با window_ms ثبت می‌شود
    expect(numlineBranch).toContain('window_ms: winN');
    expect(choiceBranch).toContain('window_ms: winC');
  });

  it('max_frame_delta در همهٔ شاخه‌ها ثبت می‌شود — ستون مایگریشن ۰۰۹۱ دیگر همیشه null نیست', () => {
    expect(sessionJs.match(/max_frame_delta:/g)?.length).toBeGreaterThanOrEqual(5);
  });
});

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
    expect(previewJs).not.toContain('correct_touch'); // پیش‌نمایش هم — کلید فقط در سرویس می‌ماند
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

describe('گیت لایهٔ حسی بازی — گیم‌فیل (۱.۲۵.۲۱)', () => {
  it('همهٔ جنبش تزئینی فقط از fx.js است — با گارد کاهش‌جنبش و WAAPI، بدون ساعت اندازه‌گیری و بدون شبکه', () => {
    expect(fxJs).toContain('prefers-reduced-motion');
    expect(fxJs).toMatch(/\.animate\(/); // Web Animations API — موتور مرکب مرورگر
    expect(fxJs).not.toMatch(/performance\.now|fetch\(|setInterval|Audio/);
    // جنبش آزمون هرگز شفاف‌کنندهٔ محرک نیست — محرک از نخستین فریم کامل مرئی است (RT پاک می‌ماند)
    expect(fxJs).toMatch(/fade === false/);
  });

  it('حباب بازخورد شناور بالای صحنه است — دیگر در جریان پایین صفحه نیست؛ دو لحن جدا دارد', () => {
    expect(playCss).toMatch(/\.play-bubble\s*\{[^}]*position:\s*fixed/);
    expect(playCss).toMatch(/\.play-bubble--ok/);
    expect(playCss).toMatch(/\.play-bubble--calm/);
    expect(playCss).toMatch(/\.play-pill/);
    // ذرات/ستارهٔ پران: بی‌اثر برای لمس و با کاهش‌جنبش غایب
    expect(playCss).toMatch(/\.play-fx-bit\s*\{[^}]*pointer-events:\s*none/);
    expect(playCss).toMatch(/\.play-fx-star\s*\{[^}]*pointer-events:\s*none/);
  });

  it('سرشت آزمون دست‌نخورده ماند: برداشت ITI فوری و پنجرهٔ پاسخ بدون تأخیر ادراکی', () => {
    // محرک در آغاز ITI از تعامل خارج می‌شود (قرارداد فاز ۹) و DOM پیش از FIXATION بعدی پاک می‌شود
    expect(engineJs).toMatch(/pointerEvents = 'none'/);
    expect(engineJs).toMatch(/outThenRemove/);
    // ورود محرک پس از مُهر نمایش است — popIn بعد از stimulus_presented می‌آید
    const trialsSrc = read(join(PLAY, 'engine/trials.js'));
    expect(trialsSrc.indexOf('stimulus_presented')).toBeLessThan(trialsSrc.indexOf('fx.popIn'));
  });
});

describe('گیت جادهٔ عددها — مسیر ماشین و نمایش خط عددی (۱.۲۵.۲۸)', () => {
  const sessionJs = read(join(PLAY, 'engine/session.js'));

  it('شاخهٔ خط عددی و choice از مسیر اجباری ماشین می‌گذرند — FIXATION پیش از STIMULUS', () => {
    // رگرسیون گشت مرورگری ۱.۲۵.۲۸: گذار مستقیم PRACTICE→STIMULUS با گیت ماشین رد می‌شد
    const branches = sessionJs.split("if (item.type === '").slice(1);
    for (const src of branches) {
      const body = src.split('continue;')[0];
      if (!body.includes('numline') && !body.includes('choice')) continue;
      const fixAt = body.indexOf('STATES.FIXATION');
      const stimAt = body.indexOf('STATES.STIMULUS');
      expect(fixAt).toBeGreaterThan(-1);
      expect(stimAt).toBeGreaterThan(fixAt);
    }
  });

  it('نمایش خط عددی بی‌کلید است — tolerance/correct هرگز در ماژول نمایش نیست؛ جنبش فقط از fx', () => {
    expect(numlineKindJs).not.toMatch(/tolerance|correct_touch|\bcorrect\b/);
    expect(numlineKindJs).not.toMatch(/fetch\(|XMLHttpRequest|eval\(/);
    expect(numlineKindJs).not.toMatch(/\.animate\(/); // جنبش از session.js با fx می‌آید
    expect(playCss).toMatch(/\.play-numline__road\s*\{[^}]*touch-action:\s*none/);
    expect(playCss).toMatch(/height:\s*78px/); // هدف لمسی ≥۶۴px
  });

  it('نمایش موج جاسوس‌ها بی‌کلید است (۱.۲۵.۳۰) — correct/hits کلیدی در ماژول نمایش نیست؛ شبکه لمسی ثابت', () => {
    const scanKindJs = read(join(PLAY, 'kinds/scan.js'));
    expect(scanKindJs).toContain('<svg'); // ربات‌ها وکتور درون‌کد — بدون دارایی بیرونی
    expect(scanKindJs).not.toMatch(/<img\b|\.png|\.jpg|\.webp|\.mp3|\.ogg/);
    expect(scanKindJs).not.toMatch(/tolerance|correct_touch|answer_display/);
    expect(scanKindJs).not.toMatch(/fetch\(|XMLHttpRequest|eval\(|\.animate\(/);
    expect(scanKindJs).not.toMatch(/https?:\/\//);
    // شاخهٔ scan هم از مسیر اجباری ماشین می‌گذرد — FIXATION پیش از STIMULUS
    const scanBranch = sessionJs.split("if (item.type === '").slice(1)
      .find((src) => src.startsWith('scan'));
    expect(scanBranch).toBeDefined();
    const body = scanBranch!.split('continue;')[0];
    const fixAt = body.indexOf('STATES.FIXATION');
    const stimAt = body.indexOf('STATES.STIMULUS');
    expect(fixAt).toBeGreaterThan(-1);
    expect(stimAt).toBeGreaterThan(fixAt);
    // پاسخ موج فقط از تک‌نقطهٔ شبکه می‌رود — کلاینت خودش نمره نمی‌دهد
    expect(body).toContain('api.submit');
    // رگرسیون گشت مرورگری ۱.۲۵.۳۰: پایان موج با «گزارش بده!» خواب یدکی را لغو می‌کند —
    // وگرنه sleeper تک‌شکافهٔ ساعت یدکی، خواب موج بعدی را زودرس می‌برد (موج‌های خالی rt=null)
    expect(body).toContain('sleeper.cancel');
    expect(body).not.toMatch(/\.animate\(/); // جنبش فقط از fx
    // پوستهٔ عدی: حاشیهٔ آژیر ایستا بدون فلاش — هدف لمسی خانه ≥۶۴px
    expect(playCss).toMatch(/\.play-stage--scan/);
    expect(playCss).toMatch(/\.play-scan__tile\s*\{[^}]*min-height:\s*76px/);
    expect(playJs).toContain('scanMarkup'); // سیم‌کشی ماژول در بارگیر نوع‌بازی
  });
});
