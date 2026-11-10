/**
 * گیت لایهٔ هنری M2 — «Premium 2D Underwater» به‌روش راه A (۱.۲۵.۳۶)
 * صحنهٔ دریایی = وکتور درون‌کد + CSS ایستا + جنبش فقط-fx؛ سه مرز ناف‌شکن:
 *  ۱) صفر دارایی خارجی و صفر شبکه — همه‌چیز {d,ink} خودی
 *  ۲) صفر تماس با اندازه‌گیری — صحنه هرگز در شاخه‌های آزمون نمی‌آید
 *     (CSS هم کمربند‌وبند: display:none در شِمال اجرای اصلی)
 *  ۳) صفر جنبش بیرون fx — با کاهش‌جنبش کل صحنه ایستا می‌ماند
 * الگو: front-play-gates.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORBIDDEN_TEXT_PATTERNS } from '../domain/games/pure';

const PLAY = join(__dirname, '../../public/assets/play');
const read = (p: string) => readFileSync(p, 'utf8');

const sceneJs = read(join(PLAY, 'scene.js'));
const gonogoJs = read(join(PLAY, 'kinds/gonogo.js'));
const sessionJs = read(join(PLAY, 'engine/session.js'));
const fxJs = read(join(PLAY, 'fx.js'));
const playCss = read(join(PLAY, 'play.css'));

describe('گیت هنری M2 — کتابخانهٔ صحنه (scene.js)', () => {
  it('شخصیت‌های چندحالته ماهی/خرچنگ با چهار حالت روایت حاضرند', () => {
    for (const state of ['idle', 'swim', 'happy', 'oops']) {
      // هر حالت هم در ماهی و هم در خرچنگ — چهار حالت × دو شخصیت
      expect(sceneJs.match(new RegExp(state + ':\\s*\\{', 'g'))?.length).toBeGreaterThanOrEqual(2);
    }
    expect(sceneJs).toContain('export function fishPuppet');
    expect(sceneJs).toContain('export function crabPuppet');
    expect(sceneJs).toContain('export const HERO_VECTORS');
  });

  it('صحنه فقط نمایش است — بدون شبکه، بدون دارایی بیرونی، بدون ساعت و بدون کلید', () => {
    expect(sceneJs).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/);
    expect(sceneJs).not.toMatch(/https?:\/\//);
    expect(sceneJs).not.toMatch(/<img\b|\.png|\.jpg|\.webp|\.mp3|\.ogg/);
    expect(sceneJs).not.toMatch(/\bAudio\b|new Audio|<audio/);
    expect(sceneJs).not.toMatch(/\.animate\(|performance\.now|setInterval/); // جنبش فقط از fx
    expect(sceneJs).not.toMatch(/classifyTouch|machine|window_ms|rt_ms|correct/); // صفر تماس با اندازه‌گیری
  });

  it('گفتار صحنه از لینت واژهٔ ممنوع می‌گذرد — البته صحنه بی‌متن است (aria-hidden)', () => {
    expect(sceneJs).toContain('aria-hidden');
    for (const w of FORBIDDEN_TEXT_PATTERNS) {
      expect(sceneJs.includes(w), `scene.js حاوی واژهٔ ممنوع «${w}» است`).toBe(false);
    }
  });

  it('دکور مینیمال (۱.۲۵.۴۱): حباب + قهرمان — مرجان/بستر شنی/جلبک‌های مرده بازنمی‌گردند', () => {
    for (const layer of ['play-scene__bubble', 'play-scene__hero', 'play-scene__bubbles']) {
      expect(sceneJs, layer).toContain(layer);
    }
    // دکور مردهٔ حذف‌شده — دیگر در منبع صحنه نیستند (ممیزی اسکرین‌شات ۱.۲۵.۴۱)
    expect(sceneJs).not.toContain('play-scene__far');
    expect(sceneJs).not.toContain('play-scene__mid');
    expect(sceneJs).not.toContain('play-scene__near');
    expect(sceneJs).not.toContain('play-scene__weed');
    for (const c of ['#153E50', '#438C89', '#E4AA46', '#D97C4F']) {
      expect(sceneJs, c).toContain(c);
    }
  });

  it('قهرمان هر نوع‌بازی — هویت صحنهٔ آموزش از بازی می‌آید (پوستهٔ اختصاصی)', () => {
    expect(sceneJs).toContain('export function kindHero');
    for (const k of ['gonogo', 'numline', 'scan', 'stroop', 'flanker', 'nback']) {
      expect(sceneJs, k).toContain(k + ':');
    }
  });
});

describe('گیت هنری M2 — تک‌منبع شخصیت و هویت محرک', () => {
  it('ماهی/خرچنگ آزمون از HERO_VECTORS می‌آیند — وکتور حالت آرام، هویت محرک دست‌نخورده', () => {
    expect(gonogoJs).toContain("import { HERO_VECTORS, sceneMarkup, kindHero } from '../scene.js'");
    expect(gonogoJs).toContain('SHAPES.fish = HERO_VECTORS.fish');
    expect(gonogoJs).toContain('SHAPES.crab = HERO_VECTORS.crab');
    // وکتور آرامِ صحنه = محرک آزمون — یک هویت، دو مصرف
    expect(sceneJs).toContain('export const HERO_VECTORS = { fish: FISH.idle, crab: CRAB.idle }');
  });

  it('تمرین تعاملی صحنهٔ پس‌زمینه می‌گیرد — ولی محرک همان stimSvg سرور می‌ماند', () => {
    expect(gonogoJs).toContain('decoratePractice');
    expect(gonogoJs.match(/decoratePractice\(stage\)/g)?.length).toBeGreaterThanOrEqual(5);
    // محرک تمرین همچنان از راهنمای سرور — هویت عوض نمی‌شود
    expect(gonogoJs.match(/stimSvg\(hint\./g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe('گیت هنری M2 — مرز اندازه‌گیری (RT پاک)', () => {
  it('صحنه فقط در چهار لحظهٔ تشریفاتی session.js می‌آید — نه در هیچ شاخهٔ آزمون', () => {
    expect(sessionJs).toContain("import { sceneMarkup, kindHero } from '../scene.js'");
    expect(sessionJs).toContain('decorateScene');
    // شاخه‌های آزمون (پنج شاخهٔ خاص + touch_report) هیچ ردی از صحنه ندارند
    const trialBranches = sessionJs.split("item.type === ").slice(1);
    expect(trialBranches.length).toBeGreaterThanOrEqual(5);
    for (const src of trialBranches) {
      const body = src.split('continue;')[0];
      expect(body, 'شاخهٔ آزمون نباید صحنه ببیند').not.toMatch(/decorateScene|sceneMarkup|fishPuppet|crabPuppet/);
    }
    // مسیر touch_report (runTrial تا بازخورد) هم بی‌صحنه — تا پایان حلقهٔ مأموریت
    const tail = (sessionJs.split('runTrial(')[1] ?? '').split('─── ۴)')[0];
    expect(tail).not.toMatch(/decorateScene|sceneMarkup|fishPuppet|crabPuppet/);
  });

  it('کمربند‌وبند CSS: صحنه در شِمال اجرای اصلی خاموش است و pointer-events ندارد', () => {
    expect(playCss).toMatch(/\.play-scene\s*\{[^}]*pointer-events:\s*none/);
    expect(playCss).toContain('.play-stage--main .play-scene { display: none; }');
    // ترتیب لایه‌ها: صحنه زیر محتوا — صفر اختلاط با لمس
    expect(playCss).toMatch(/\.play-stage--teach > \.play-scene, \.play-stage--end > \.play-scene/);
  });

  it('جنبش صحنه فقط از fx با گارد کاهش‌جنبش — CSS صحنه هیچ انیمیشنی ندارد', () => {
    expect(fxJs).toContain('sceneAmbient');
    expect(fxJs).toMatch(/prefers-reduced-motion/);
    // بلوک صحنهٔ play.css بدون @keyframes و بدون animation:
    const sceneBlock = playCss.slice(playCss.indexOf('دکور مینیمال'));
    expect(sceneBlock).not.toMatch(/@keyframes/);
    expect(sceneBlock).not.toMatch(/animation:/);
  });
});
