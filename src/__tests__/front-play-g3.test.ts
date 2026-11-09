/**
 * گیت G3 آموزش و جریان کودک (۱.۲۵.۳۷) — رفع U7/U8 ممیزی + تمرین تعاملی همهٔ نوع‌ها + INTRO:
 *  · تمرین تعاملی «تا موفقیت» برای هر شش نوع‌بازی — همان الگوی گونوگو (اقتباس jsPsych)
 *  · کارت INTRO با نام/قانون/دکمهٔ بزرگ — فقط تمرین؛ ارزیابی دستورالعمل ثابت (C1)
 *  · U7 — خداحافظی نرم جلسهٔ ناتمام + «چند قدم مانده» به زبان کودک
 *  · U8 — parent_post با محتوای واقعی توصیفی (بدون هیچ ادعای بالینی)
 * الگو: front-play-gates.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLAY = join(__dirname, '../../public/assets/play');
const read = (p: string) => readFileSync(p, 'utf8');

const KINDS = ['gonogo', 'numline', 'scan', 'stroop', 'flanker', 'nback', 'corsi'] as const;
const kindSrc = (k: string) => read(join(PLAY, `kinds/${k}.js`));
const sessionJs = read(join(PLAY, 'engine/session.js'));
const playJs = read(join(PLAY, 'play.js'));
const pageSrc = read(join(__dirname, '../domain/games/page.ts'));
const serviceSrc = read(join(__dirname, '../domain/games/service.ts'));

describe('گیت G3 — تمرین تعاملی همهٔ نوع‌ها (الگوی گونوگو)', () => {
  it('هر شش نوع‌بازی تمرین تعاملی و کارت INTRO دارند — قرارداد ماژول نوع کامل شد', () => {
    for (const k of KINDS) {
      const src = kindSrc(k);
      expect(src, `${k}: practiceInteractive`).toContain('export async function practiceInteractive');
      expect(src, `${k}: intro`).toMatch(/export const intro = \{/);
      expect(src, `${k}: نام بازی در intro`).toMatch(/name: '[^']{3,}'/);
    }
  });

  it('تمرین تعاملی هر نوع «تا موفقیت» می‌چرخد و خواب یدکی را cancel می‌کند — قاعدهٔ پنجرهٔ گو/نوگو', () => {
    for (const k of KINDS) {
      const src = kindSrc(k);
      expect(src, `${k}: حلقهٔ تکرار تا موفقیت`).toMatch(/for\s*\(\s*;\s*;\s*\)/);
      expect(src, `${k}: خواب مکث‌پذیر در تمرین`).toContain('sleeper.sleep(');
      expect(src, `${k}: cancel خواب یدکی`).toContain('sleeper.cancel()');
      expect(src, `${k}: بازخورد آرام تکرار`).toMatch(/retry|Retry/);
    }
  });

  it('تمرین تعاملی بی‌کلید و بی‌شبکه است — کلید پاسخ هرگز به ماژول نمایش نمی‌رسد', () => {
    for (const k of KINDS) {
      const src = kindSrc(k);
      expect(src, `${k}: بدون fetch/XHR/eval`).not.toMatch(/fetch\(|XMLHttpRequest|eval\(/);
      expect(src, `${k}: بدون URL بیرونی`).not.toMatch(/https?:\/\//);
      expect(src, `${k}: جنبش فقط از fx — بدون .animate(`).not.toMatch(/\.animate\(/);
      expect(src, `${k}: بدون کلید سروری`).not.toMatch(/correct_touch|answer_display/);
    }
    // کلید پاسخ در هیچ ماژول نمایشی نیست — نمره فقط سرور
    for (const k of ['numline', 'scan', 'corsi']) {
      expect(kindSrc(k), `${k}: بدون tolerance و کلید لمس`).not.toMatch(/tolerance|correct_touch/);
    }
  });

  it('محتوای تمرین دانش عمومی خود بازی است — هیچ آیتم بانک/پروبی در تمرین نیست', () => {
    // ترکیب تمرین در ماژول ثابت است (جادهٔ ۰..۱۰ / موج چهارخانه / دو قدم استروپ / …)
    expect(kindSrc('numline')).toContain('PRACTICE_RANGE = [0, 10]');
    expect(kindSrc('scan')).toContain('spyIdxs = [0, 2]');
    expect(kindSrc('flanker')).toContain("['R', 'L', 'R']");
    // تمرین صحنهٔ آموزش می‌گیرد و در شِمال --teach می‌ماند — هرگز --main
    for (const k of ['numline', 'scan', 'stroop', 'flanker', 'nback', 'corsi']) {
      expect(kindSrc(k), `${k}: صحنهٔ تمرین`).toContain("sceneMarkup('teach')");
    }
  });

  it('پس از دو تلاش بی‌موفقیت، آموزش پس از پاسخ نشان می‌آید — از بازخورد/قانون عمومی، نه کلید', () => {
    for (const k of ['numline', 'scan', 'stroop', 'flanker', 'nback', 'corsi']) {
      expect(kindSrc(k), `${k}: آموزش پس از دو تلاش`).toMatch(/misses >= 2\)?\s*\w+\(|misses >= 2/);
    }
  });
});

describe('گیت G3 — کارت INTRO (نام/قانون/دکمهٔ بزرگ) و مرز ارزیابی', () => {
  it('موتور جلسه INTRO را فقط در تمرین می‌سازد — ارزیابی عیناً دستورالعمل ثابت کوتاه قبلی', () => {
    // شاخهٔ ارزیابی: متن ثابت + ادامه با لمس صفحه — هیچ کارت معرفی/صحنه/دکمه‌ای ندارد (C1)
    const assessBranch = sessionJs.split('if (isAssessment) {')[1]?.split('} else if (intro) {')[0] ?? '';
    expect(assessBranch).toContain('به دستورالعمل گوش کن'); // متن ارزیابی دست‌نخورده
    expect(assessBranch).toContain('tapToContinue');
    expect(assessBranch).not.toContain('play-intro');
    expect(assessBranch).not.toContain('decorateScene');
    // شاخهٔ INTRO تمرین: بج مأموریت + نام + قانون + دکمهٔ بزرگ
    const practiceBranch = sessionJs.split('} else if (intro) {')[1]?.split('} else {')[0] ?? '';
    expect(practiceBranch).toContain('مأموریت امروز');
    expect(practiceBranch).toContain('play-intro__name');
    expect(practiceBranch).toContain('play-btn--intro');
    expect(practiceBranch).toContain('شروع!');
    // صحنهٔ معرفی فقط با fishPuppet swim — همان هویت M2
    expect(practiceBranch).toContain("fishPuppet('swim'");
    // مدار قدیمی برای نوع‌بازی بدون intro محفوظ است
    expect(sessionJs).toContain('مدار قدیمی');
  });

  it('ادامه از INTRO فقط با دکمهٔ بزرگ — بدون شنوندهٔ لمس سراسری روی صفحه', () => {
    expect(sessionJs).toContain('function bigButtonContinue');
    expect(sessionJs).toContain("querySelector('.play-btn--intro')");
    // دکمهٔ بزرگ از .play-btn ارث می‌برد — هدف لمسی ≥۶۴px گیت‌دار باقی می‌ماند
    const css = read(join(PLAY, 'play.css'));
    expect(css).toContain('.play-btn--intro');
    expect(css).toMatch(/\.play-intro__name\s*\{/);
    expect(css).toMatch(/\.play-intro__remain\s*\{/);
  });
});

describe('گیت G3 — U7 خداحافظی نرم جلسهٔ ناتمام + «چند قدم مانده»', () => {
  it('فرادادهٔ ادامهٔ نرم از سرور می‌آید و فقط با حداقل یک پاسخ فعال می‌شود', () => {
    // صفحه: data-resume؛ پخش‌کننده: dataset.resume؛ موتور: پارامتر resume
    expect(pageSrc).toContain('data-resume=');
    expect(playJs).toContain('dataset.resume');
    expect(sessionJs).toMatch(/stageMeta, resume, onNetworkFail|resume,\s*onNetworkFail/);
    // سرور: فقط جلسهٔ دارای پاسخ؛ کل = فیلتر جریان مرحله؛ خرابی هرگز ورود را نمی‌شکند
    expect(serviceSrc).toContain('playResume: resumeMeta');
    expect(serviceSrc).toContain('SELECT COUNT(*) AS n FROM game_attempts WHERE session_id = ?');
  });

  it('کارت خوش‌برگشتی بی‌سرزنش است و «چند قدم مانده» به زبان کودک می‌گوید', () => {
    const introBranch = sessionJs.split('else if (intro) {')[1]?.split('} else {')[0] ?? '';
    expect(introBranch).toContain('نیمه‌تمام مونده بود');
    expect(introBranch).toContain('قدم مانده');
    // کلمات سرزنش‌آمیز در پیام ادامه نیست (لحن §۲)
    for (const w of ['باید بیشتر', 'دیر کردی', 'نبودت']) {
      expect(introBranch).not.toContain(w);
    }
  });

  it('نشانهٔ «چند قدم مانده» در جریان جلسه یک‌بار و فقط تمرین است — پیل آرام جای نوار خام', () => {
    expect(sessionJs).toContain('stepsLeftShown');
    expect(sessionJs).toContain('قدم مانده');
    // گارد فقط-تمرین پیش از پیل — ارزیابی هرگز نشانهٔ جریان نمی‌بیند (C1)
    expect(sessionJs.match(/!isAssessment && !stepsLeftShown/g)?.length).toBe(1);
  });

  it('پنل آرام شبکه خداحافظی نرم جلسهٔ ناتمام را دارد — ادامه از قدمِ همین‌جا', () => {
    expect(playJs).toContain('مأموریت همین‌جا برایت مونده است');
    expect(playJs).toContain('از همین قدم ادامه پیدا می‌کند');
  });
});

describe('گیت G3 — U8 پس‌گفت والد با محتوای واقعی', () => {
  it('parent_post دیگر جای‌گذار نیست — خلاصهٔ هفته/امروز + جملهٔ فردا از بستهٔ نسخه‌دار', () => {
    expect(pageSrc).not.toContain('بازخورد توصیفی این‌جا نمایش داده می‌شود');
    expect(pageSrc).toContain('model.parentPost');
    expect(pageSrc).toContain('sessions_week');
    expect(pageSrc).toContain('attempts_today');
    expect(pageSrc).toContain('tomorrow_fa');
    expect(serviceSrc).toContain('parentCopy.after');
    // جملهٔ فردا با نبودِ متن بسته به پیش‌فرض ملایم می‌رسد — هرگز جای‌گذار نمی‌شود
    expect(serviceSrc).toContain('فردا یک مأموریت تازه در راه است');
  });

  it('درس کوتاه والد (parent_pre) هم متن واقعی از parent_copy.before دارد', () => {
    expect(pageSrc).toContain('model.parentCopyBefore');
    expect(serviceSrc).toContain('parentCopyBefore');
  });

  it('پس‌گفت والد توصیف رفتار است — هیچ عدد هنجاری/درصدی و هیچ ادعای بالینی روبه‌والد نیست', () => {
    const postBranch = pageSrc.split("state === 'parent_post'")[1]?.split('if (model.state')[0] ?? '';
    expect(postBranch).not.toMatch(/درصد|هنجار|تست|تشخیص/);
    // هیچ مسیر کلید پاسخ در نمای والد نیست — عدد فقط شمار جلسه/پاسخ است
    expect(postBranch).not.toContain('correct');
    expect(postBranch).not.toContain('answer_display');
  });
});
