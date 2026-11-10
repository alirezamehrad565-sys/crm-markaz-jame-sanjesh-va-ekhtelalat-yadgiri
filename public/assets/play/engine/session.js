/* ═══════════════════════════════════════════════════════════════
   engine/session.js — مدیر جلسه (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
   پنج‌شِمال دفترچهٔ وظیفه §۲: معرفی/آموزش/تمرین/اجرای اصلی/پایان —
   دو حالت مستقل از یک موتور با تنظیمات پروتکل:
     · training  — آموزش بازی‌گوش، بازخورد آموزشی، سبد ستاره، استراحت
     · assessment — دستورالعمل ثابت کوتاه، اجرای بی‌بازخورد/بی‌نمره/بی‌سبد
   هیچ پارامتری هاردکد نیست — همه از اسنپ‌شات پروتکل سرور می‌آید.
   ═══════════════════════════════════════════════════════════════ */

import { STATES, createMachine } from './machine.js';
import { createSleeper, createPausableClock } from './timing.js';
import { runTrial } from './trials.js';
import { createTouchLedger, attachTouchEvidence, observeDisplayFrames } from './observe.js';
import { summarizeSession, medianOf } from './scoring.js';
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

/* صحنهٔ دریایی برای لحظه‌های تشریفاتی (M2/۱.۲۵.۳۶ — راه A): فقط تمرین؛ ارزیابی هرگز
   صحنهٔ هنر نمی‌بیند (C1 دستورالعمل ثابت، خنثی). جنبش همه از fx.sceneAmbient؛
   شاخه‌های آزمون عیناً به‌صورت امروز می‌مانند — CSS صحنه در شِمال اجرای اصلی هم خاموش است */
function decorateScene(stage, variant, hero) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup(variant, hero));
  fx.sceneAmbient(stage);
}

const HERO_FISH_COLOR = '#E8925A'; /* نارنجی ماهی — امضای مرحلهٔ اول (s1) */

/* نوع‌بازی از کلاف (data-kind) — کلید قهرمان صحنهٔ آموزش (پوستهٔ اختصاصی ۱.۲۵.۴۱) */
function kindOf(root) {
  return root && typeof root.dataset === 'object' && typeof root.dataset.kind === 'string'
    ? root.dataset.kind.trim() : '';
}

/* نام بازی برای کارت INTRO — نام مأموریت از سرور (data-title مأموریت بسته)؛
   نبود = نام ماژول نوع‌بازی (ممیزی ۱.۲۵.۴۱: کارت معرفی دیگر نام عام نمی‌بیند) */
function missionTitleOf(root, fallback) {
  const t = root && typeof root.dataset === 'object' && typeof root.dataset.title === 'string'
    ? root.dataset.title.trim() : '';
  return t !== '' ? t : fallback;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function card(line, muted) {
  return '<p class="play-line">' + esc(line) + '</p>' + (muted ? '<p class="play-muted">' + esc(muted) + '</p>' : '');
}

/** پروتکل امن: هر پارامتر با پیش‌فرض هم‌نسخه؛ اسنپ‌شات خراب جلسه را نمی‌شکند */
function safeProtocol(snap) {
  const p = snap && snap.params ? snap.params : {};
  const n = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
  return {
    ...snap,
    params: {
      response_window_go_ms: n(p.response_window_go_ms, 1500),
      response_window_nogo_ms: n(p.response_window_nogo_ms, n(p.response_window_go_ms, 1500)),
      isi_min_ms: n(p.isi_min_ms, 800),
      isi_max_ms: n(p.isi_max_ms, 1200),
      go_ratio: n(p.go_ratio, 75) / 100,
      max_consecutive_same: n(p.max_consecutive_same, 3),
      block_size: n(p.block_size, 24),
      break_min_ms: n(p.break_min_ms, 3500),
      assessment_blocks: n(p.assessment_blocks, 3),
      stimulus_scale_vmin: n(p.stimulus_scale_vmin, 33),
      feedback_ms: n(p.feedback_ms, 1400),
      preview_step_ms: n(p.preview_step_ms, 2000),
      /* مدت نمایش محرک — نگاشت stimulus_duration بستهٔ jsPsych (۱.۲۵.۳۴):
         null = نمایش تا پاسخ/پایان پنجره (رفتار امروز)؛ سمت machine.stimulusHideMsFor بسته‌بندی می‌شود */
      stimulus_duration_ms: typeof p.stimulus_duration_ms === 'number' && Number.isFinite(p.stimulus_duration_ms)
        ? p.stimulus_duration_ms : null,
      /* پنجرهٔ پاسخ گسترده برای شاخه‌های بی‌پنجرهٔ شمارشی — خط عددی/انتخاب (G1 / ۱.۲۵.۳۵):
         کودکِ بی‌پاسخ حلقه را تا بی‌نهایت نگه نمی‌دارد (P2-1 ممیزی M0)؛
         پیش‌فرض ۳۰ ثانیه — سرور-آگاه: مقدار در response با window_ms ثبت می‌شود */
      response_window_extended_ms: n(p.response_window_extended_ms, 30000)
    },
    behavior: {
      feedback_in_main: false,
      star_basket: false,
      adaptive: false,
      progress_visible: true,
      instruction_style: 'standard',
      ...((snap && snap.behavior) || {})
    }
  };
}

/**
 * اجرای جلسه — ورودی ctx:
 *   root/stage/bubble/bar/basketEl/countEl: عناصر صفحه
 *   api: { nextItem, submit, finish } — تک‌نقطهٔ شبکه (requestJson پخش‌کننده)
 *   protocol: اسنپ‌شات سرور (data-protocol)
 *   kind: ماژول نوع‌بازی (kinds/*.js) — stimSvg/previewSteps/…
 *   hint: راهنمای آموزشی سرور (فقط از آیتم‌های train)
 *   onNetworkFail(abort): پنل آرام شبکه
 */
export async function runSession(ctx) {
  const { root, stage, bubble, bar, basketEl, countEl, api, protocol: rawProtocol, kind, hint, stageMeta, resume, onNetworkFail } = ctx;
  const protocol = safeProtocol(rawProtocol);
  const isAssessment = protocol.mode === 'assessment';
  const P = protocol.params;
  const B = protocol.behavior;

  /* پروتکل → صفحه: مقیاس محرک، حالت، سبد */
  root.dataset.mode = protocol.mode === 'assessment' ? 'assessment' : 'training';
  root.style.setProperty('--stim-scale', String(P.stimulus_scale_vmin));
  if (B.star_basket && !isAssessment && basketEl) root.dataset.basket = 'on';
  else if (basketEl) root.removeAttribute('data-basket');

  /* پوستهٔ اختصاصی نوع‌بازی (G7/۱.۲۵.۴۳) — کلاس ماندگار از INTRO تا پایان روی #play-root؛
     برخلاف play-stage--<type> سطری که فقط در جریان آیتم می‌ماند. نام از data-kind سرور
     می‌آید و صفحه skins/<kind>.css را سرو می‌کند — موتور نوع-آگنوست می‌ماند (بدون فهرست) */
  const KIND_NAME = root.dataset.kind || '';
  if (KIND_NAME && /^[a-z][a-z0-9]*$/.test(KIND_NAME)) root.classList.add('play-skin--' + KIND_NAME);

  /* ماشین حالت + ساعت‌ها + گیره‌های مکث آزمون در جریان + ردیابی مکث برگه (فاز ۷) */
  const trialHooks = { pause: null, resume: null };
  const pauseTracker = { count: 0, total_ms: 0, since: null };
  const machine = createMachine((state, from) => {
    const inMain = state === STATES.FIXATION || state === STATES.STIMULUS ||
      state === STATES.RESPONSE_WINDOW || state === STATES.INTER_TRIAL_INTERVAL;
    stage.classList.toggle('play-stage--main', inMain && machine.practiceMode !== true);
  });
  const sleeper = createSleeper();

  /* ─── مکث برگه (فاز ۷) — پنهان‌شدن برگه = مکث کامل: ماشین به PAUSED،
     خواب/ساعت/پنجرهٔ پاسخ فریز؛ برگشت به همان نقطه. (۱.۲۵.۴۵) قفل جهت حذف شد:
     عمودی و افقی هر دو اجرای واقعی‌اند و جهت دیگر مکث نمی‌سازد — پوشش «بچرخان»
     روی موبایل جواب نداد و از مدار خارج شد؛ کیفیت داده حالا فقط از مکث برگه پاس می‌شود ─── */
  let pausedFrom = null;
  const pausableStates = [STATES.FIXATION, STATES.STIMULUS, STATES.RESPONSE_WINDOW, STATES.INTER_TRIAL_INTERVAL, STATES.PRACTICE, STATES.READY];
  const gatePause = () => {
    const s = machine.state;
    if (!pausableStates.includes(s) || pausedFrom !== null) return;
    pausedFrom = s;
    sleeper.pause();
    if (trialHooks.pause) trialHooks.pause();
    if (pauseTracker.since === null) pauseTracker.since = performance.now();
    machine.to(STATES.PAUSED, { from: s });
  };
  const gateResume = () => {
    if (machine.state !== STATES.PAUSED || pausedFrom === null) return;
    if (pauseTracker.since !== null) {
      pauseTracker.count += 1;
      pauseTracker.total_ms += performance.now() - pauseTracker.since;
      pauseTracker.since = null;
    }
    if (trialHooks.resume) trialHooks.resume();
    sleeper.resume();
    machine.resumeTo(pausedFrom, { resumed: true });
    pausedFrom = null;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) gatePause();
    else gateResume();
  });

  /* ─── ۱) INTRO — بسته‌بندی معرفی بازی (G3/۱.۲۵.۳۷): نام/قانون/دکمهٔ بزرگ + ادامهٔ نرم (U7) ───
     نام و قانون از ماژول نوع‌بازی (intro.rule از راهنمای سرور می‌آید — فقط آیتم‌های train)؛
     ادامهٔ نرم جلسهٔ نیمه‌تمام: پیام خوش‌برگشتی بی‌سرزنش + «چند قدم مانده» به زبان کودک (U7).
     ارزیابی عیناً دستورالعمل ثابت کوتاه قبلی — هیچ نام/صحنه/دکمهٔ بازی‌گوش نمی‌بیند (C1). */
  machine.to(STATES.INSTRUCTION);
  stage.className = 'play-stage';
  stage.classList.add(isAssessment ? 'play-stage--main' : 'play-stage--teach');
  const intro = kind && typeof kind.intro === 'object' && kind.intro && typeof kind.intro.name === 'string'
    && kind.intro.name.trim() !== '' && typeof kind.intro.rule === 'function' ? kind.intro : null;
  if (isAssessment) {
    stage.innerHTML = card('سلام! به دستورالعمل گوش کن.', 'برای شروع، صفحه را لمس کن');
    fx.revealStage(stage);
    await tapToContinue(stage);
  } else if (intro) {
    const ruleLine = intro.rule(hint);
    const introName = missionTitleOf(root, intro.name);
    const remainN = resume && Number.isFinite(resume.total) && Number.isFinite(resume.done)
      ? Math.max(0, resume.total - resume.done) : null;
    stage.innerHTML =
      '<span class="play-step-badge">مأموریت امروز</span>' +
      '<p class="play-intro__name">' + esc(introName) + '</p>' +
      (ruleLine ? '<p class="play-line">' + esc(ruleLine) + '</p>' : '') +
      (resume && Number.isFinite(resume.done) && resume.done > 0
        ? '<p class="play-muted">این مأموریت نیمه‌تمام مونده بود؛ از همین‌جا ادامه می‌دهیم.</p>' +
          (remainN !== null
            ? '<p class="play-intro__remain">' + (remainN > 0
              ? faNum(remainN) + ' قدم مانده؛ بی‌عجله!'
              : 'همین قدم‌های آخر باقی مانده؛ بی‌عجله!') + '</p>'
            : '')
        : '<p class="play-muted">دکمهٔ بزرگ را لمس کن تا شروع کنیم.</p>') +
      '<button type="button" class="play-btn play-btn--intro">شروع!</button>';
    decorateScene(stage, 'teach', { svg: kindHero(kindOf(root)) }); // قهرمان این بازی — پوستهٔ اختصاصی (۱.۲۵.۴۱)
    fx.revealStage(stage);
    fx.popIn(stage.querySelector('.play-intro__name'));
    await bigButtonContinue(stage); // تنها راه ادامه: دکمهٔ بزرگ معرفی
  } else {
    /* مدار قدیمی — نوع‌بازی بدون intro (پخش‌کنندهٔ عام) */
    stage.innerHTML = card('سلام!', 'برای شروع، صفحه را لمس کن');
    decorateScene(stage, 'teach', { svg: kindHero(kindOf(root)) });
    fx.revealStage(stage);
    await tapToContinue(stage);
  }
  stage.className = 'play-stage';
  stage.innerHTML = ''; // صحنهٔ معرفی هم جمع می‌شود — محرک اول در صحنهٔ خالی می‌آید

  /* ─── ۲) آموزش/دستورالعمل ─── */
  machine.to(STATES.DEMONSTRATION);
  /* تمرین تعاملی «تا موفقیت» — اقتباس بستهٔ jsPsych-timelines/go-nogo (۱.۲۵.۳۴):
     فقط اگر ماژول نوع‌بازی آن را دارد (گونوگو) و راهنمای آموزشی سرور آماده باشد؛
     سایر بازی‌ها و ارزیابی همان مدار قبلی را می‌بینند — صفر تغییر رفتار برای آن‌ها */
  let practiceRetries = null;
  if (isAssessment) {
    /* ارزیابی: دستورالعمل ثابت کوتاه — بدون شُشی، بدون پیش‌نمایش بازی‌گوش */
    stage.classList.add('play-stage--teach');
    stage.innerHTML = card('وقتی شکل آمد، صفحه را لمس کن؛ وقتیش نیامد، دست نزن.', 'قسمت‌های تمرینی کوتاه اول می‌آیند');
    await sleeper.sleep(P.preview_step_ms);
  } else if (typeof kind.practiceInteractive === 'function') {
    const practiced = await kind.practiceInteractive({ stage, sleeper, hint });
    if (practiced && practiced.applied) {
      /* retries جمع تلاش‌های تمرین نوع‌های بدون گو/نوگو (ن‌پشت ۱.۲۵.۴۰) — کلیدهای گو/نوگو برایشان صفر می‌ماند */
      practiceRetries = { go_retries: practiced.go_retries, nogo_retries: practiced.nogo_retries, retries: practiced.retries };
    } else {
      /* راهنمای سرور آماده نبود — مدار قدیمی گام‌نما برای سازگاری کامل */
      const steps = typeof kind.previewSteps === 'function' ? kind.previewSteps(hint) : [];
      let step = 0;
      for (const s of steps) {
        step++;
        stage.classList.add('play-stage--teach');
        stage.innerHTML = '<span class="play-step-badge">قدم ' + faNum(step) + ' از ' + faNum(steps.length) + '</span>' +
          s.svg + '<p class="play-line">' + esc(s.line) + '</p>';
        fx.revealStage(stage);
        fx.popIn(stage.querySelector('.play-svg'));
        await sleeper.sleep(P.preview_step_ms);
      }
    }
  } else {
    /* مدار گام‌نمای قبلی — بازی‌های بدون تمرین تعاملی (خط عددی/اسکن/…) عیناً همین را می‌بینند */
    const steps = typeof kind.previewSteps === 'function' ? kind.previewSteps(hint) : [];
    let step = 0;
    for (const s of steps) {
      step++;
      stage.classList.add('play-stage--teach');
      stage.innerHTML = '<span class="play-step-badge">قدم ' + faNum(step) + ' از ' + faNum(steps.length) + '</span>' +
        s.svg + '<p class="play-line">' + esc(s.line) + '</p>';
      fx.revealStage(stage);
      fx.popIn(stage.querySelector('.play-svg'));
      await sleeper.sleep(P.preview_step_ms);
    }
  }
  stage.className = 'play-stage';

  /* ─── ۲٫۵) کارت مرحله (۱.۲۵.۲۲) — فقط تمرین؛ فراداده فقط از سرور (data-stage) ───
     مسیر پیشرفت پنج‌مرحله‌ای با بهترین ستارهٔ همین مرحله؛ لحن §۲ بی‌رقارت،
     ارزیابی هرگز این کارت را نمی‌بیند (C1 — دستورالعمل ثابت) */
  if (!isAssessment && stageMeta && typeof stageMeta.index === 'number' && stageMeta.title_fa) {
    stage.className = 'play-stage';
    stage.classList.add('play-stage--teach');
    stage.innerHTML =
      '<span class="play-step-badge">مرحلهٔ ' + faNum(stageMeta.index) + ' از ' + faNum(stageMeta.total || 5) + '</span>' +
      '<p class="play-line">' + esc(stageMeta.title_fa) + '</p>' +
      (stageMeta.goal_fa ? '<p class="play-muted">' + esc(stageMeta.goal_fa) + '</p>' : '') +
      fx.starRow(stageMeta.best_stars);
    decorateScene(stage, 'teach'); // صحنهٔ آرام پشت کارت مرحله — بدون قهرمان؛ ستاره‌ها نقش اصلی‌اند
    fx.revealStage(stage);
    fx.popStars(stage);
    await tapToContinue(stage);
    stage.className = 'play-stage';
    stage.innerHTML = ''; // صحنه خالی پیش از ISI — ردیف ستاره حواس‌پرتی/کاشف محرک اشتباه نمی‌سازد
  }

  /* ─── ۳) حلقهٔ مأموریت — تمرین/اجرای اصلی از یک موتور ─── */
  machine.to(isAssessment ? STATES.READY : STATES.PRACTICE);
  const trials = [];
  let starCount = 0;
  let streak = 0;
  let doneCount = 0;
  let stepsLeftShown = false; // نشانهٔ «چند قدم مانده» یک‌بار در جلسه — نه فشار تکراری (U7)
  /* خلاصهٔ پایان فقط از دادهٔ مجاز کلاینت (۱.۲۵.۳۴): کلید پاسخ (گو بودن) هرگز به کلاینت
     نمی‌رسد — درستی فقط از بازخورد سرور می‌آید (فقط آیتم‌های train نمره برمی‌گردانند؛
     پروب‌ها بی‌نمره‌اند و در نسبت دقت کارت پایان نمی‌آیند — ملاک همیشه سرور است) */
  let scoredTotal = 0;
  let scoredCorrect = 0;
  let spanBest = 0; // بلندترین دنبالهٔ کاملِ درست (G8) — از طول محرک عمومی؛ کلید از سرور می‌آید
  let practiceMode = true; // تا نخستین آیتم اصلی (فاز پروب/آیتم‌های جاری در ارزیابی)
  machine.practiceMode = practiceMode;

  for (;;) {
    let next;
    try {
      next = await api.nextItem();
    } catch (err) {
      machine.to(STATES.INTERRUPTED, { reason: 'network' });
      onNetworkFail();
      return;
    }
    const item = next.item;
    if (B.progress_visible && bar) setProgress(bar, next.progress.done, next.progress.total);
    if (!item) break;

    /* نشانهٔ کودک‌زبان «چند قدم مانده» (U7/G3) — یک‌بار در جلسه، فقط تمرین؛
       پیل آرام جای نوار خام؛ ارزیابی هرگز نشانهٔ جریان نمی‌بیند (C1) */
    if (!isAssessment && !stepsLeftShown && next.progress && Number.isFinite(next.progress.total) && next.progress.total > 0) {
      const remainN = Math.max(0, next.progress.total - next.progress.done);
      if (remainN > 0 && remainN <= 3) {
        stepsLeftShown = true;
        fx.pillShow(remainN === 1 ? 'فقط یک قدم مانده!' : faNum(remainN) + ' قدم مانده؛ داریم به پایان می‌رسیم!');
      }
    }

    /* تمرین ↔ اجرای اصلی — از فاز آیتم سرور (ادعای کلاینت نیست) */
    const isPractice = item.phase === 'train';
    if (isPractice !== practiceMode) {
      practiceMode = isPractice;
      machine.practiceMode = practiceMode;
    }

    /* استراحت بلوکی — هر block_size آیتم؛ ارزیابی هم استراحت دارد اما بی‌شُشی */
    if (doneCount > 0 && P.block_size > 0 && doneCount % P.block_size === 0) {
      machine.to(STATES.BREAK, { after_items: doneCount });
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = card('استراحت کوچولو', isAssessment
        ? 'هر وقت آماده بودی لمس کن.'
        : 'یک نفس عمیق بکش؛ هر وقت آماده بودی لمس کن.');
      if (!isAssessment) decorateScene(stage, 'teach', { svg: kindHero(kindOf(root)) }); // قهرمان این بازی در استراحت — پوستهٔ اختصاصی
      fx.revealStage(stage);
      await sleeper.sleep(Math.min(P.break_min_ms, 2000));
      await tapToContinue(stage);
      stage.className = 'play-stage';
      stage.innerHTML = ''; // صحنهٔ استراحت جمع می‌شود — ISI بعدی در صحنهٔ خالی می‌آید
      machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_break: true });
    }

    /* ورود به حلقهٔ آزمون — از READY/PRACTICE */
    await sleeper.sleep(rand(P.isi_min_ms, P.isi_max_ms));

    /* آیتم خط عددی — «جادهٔ عددها» (۱.۲۵.۲۸): نمایش از kinds/numline.js؛ RT از نمایش جاده؛
       پاسخ {chosen} سرور نمره می‌دهد (آستانهٔ authored)؛ شواهد همان قرارداد فاز ۴؛
       بازخورد دو-سطحی + نشان حقیقت فقط در تمرین — ارزیابی بی‌بازخورد/بی‌ستاره/بی‌استریک */
    if (item.type === 'numline' && Array.isArray(item.range) && typeof kind.numlineMarkup === 'function') {
      machine.to(STATES.FIXATION, { item: item.id, numline: true }); // مسیر اجباری ماشین: READY/PRACTICE → FIXATION → STIMULUS
      /* شواهد مشترک G1 — از همین‌جا (حتی پیش از محرک): premature لمس حین تثبیت،
         out_of_surface لمس بیرون صحنه — همان قرارداد فاز ۴، به‌جای صفر هاردکد (P1-2) */
      const ledgerN = createTouchLedger();
      ledgerN.start();
      let answeredN = false;
      const stopTouchN = attachTouchEvidence(stage, ledgerN, () => machine.state, () => answeredN);
      stage.classList.remove('play-stage--quiet');
      stage.innerHTML = kind.numlineMarkup(item);
      const stopFramesN = observeDisplayFrames();
      fx.popIn(stage.querySelector('.play-numline__chip'), 240, false);
      machine.to(STATES.STIMULUS, { item: item.id, numline: true });
      const shownAt = performance.now(); // RT از همین لحظه — نه از شروع حلقه
      /* ساعت RT مکث‌پذیر (P1-1) — مکث برگه دیگر rt_ms را نمی‌ترکاند؛
         گیره‌ها پیش از await نصب می‌شوند تا visibilitychange در میانهٔ آیتم ساعت را فریز کند */
      const clockN = createPausableClock();
      clockN.start();
      trialHooks.pause = () => clockN.pause();
      trialHooks.resume = () => { if (!clockN.running) clockN.resume(); };
      /* پنجرهٔ پاسخ پروتکل‌محور (P2-1) — کودکِ بی‌پاسخ حلقه را تا بی‌نهایت نگه نمی‌دارد؛
         بی‌پاسخ = اُمیشن سمت سرور (chosen=null)، همان قرارداد شاخهٔ انتخاب زمان‌دار */
      const winN = Math.min(60000, Math.max(5000, P.response_window_extended_ms));
      const pick = await new Promise((resolve) => {
        const road = stage.querySelector('.play-numline__road');
        const onTap = (ev) => {
          ev.preventDefault(); // جادهٔ لمسی — اسکرول اشتباه نمی‌سازد
          road.removeEventListener('pointerdown', onTap);
          answeredN = true;
          const rt = clockN.peek(); // RT در نقطهٔ لمس — بدون فریز ساعت (مکث برگه بعدی بی‌اثر)
          clockN.pause();
          resolve({ value: kind.numlineValueFromTap(item, stage, ev), at: performance.now(), rt, timedOut: false });
        };
        road.addEventListener('pointerdown', onTap);
        sleeper.sleep(winN).then(() => resolve({ value: null, at: null, rt: null, timedOut: true }));
      });
      const timedOutN = pick.timedOut === true;
      sleeper.cancel(); // پاسخ آمد یا پنجره بست — خواب یدکی یتیم نمی‌ماند (قاعدهٔ پنجرهٔ گو/نوگو)
      trialHooks.pause = null;
      trialHooks.resume = null;
      stopTouchN();
      const framesN = stopFramesN();
      if (pick.value !== null) {
        const guessEl = kind.numlinePlaceGuess(item, stage, pick.value);
        fx.popIn(guessEl, 240, false);
      }
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, numline: true });
      const recordNum = {
        item_id: item.id,
        go: null,
        touched: !timedOutN,
        rt_ms: timedOutN ? null : (pick.rt !== null && pick.rt >= 0 ? pick.rt : null),
        touch_count: timedOutN ? 0 : 1,
        ...ledgerN.evidenceCounts(),
        presented_at: shownAt,
        frame_drops: framesN.drops,
        max_frame_delta: framesN.maxDelta,
        window_ms: winN,
        isi_ms: 0,
        events: ledgerN.events()
      };
      trials.push(recordNum);
      doneCount += 1;
      let fbN = null;
      try {
        fbN = await api.submit({
          item_id: item.id,
          response: {
            chosen: pick.value,
            timed_out: timedOutN,
            presented_at: Math.round(shownAt),
            frame_drops: framesN.drops,
            max_frame_delta: framesN.maxDelta,
            touch_count: recordNum.touch_count,
            ...ledgerN.evidenceCounts(),
            window_ms: winN
          },
          rt_ms: recordNum.rt_ms,
          idem_key: crypto.randomUUID()
        });
      } catch (err) {
        machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
        onNetworkFail();
        return;
      }
      const okN = fbN !== null && typeof fbN === 'object' && fbN.correct === true;
      const canFeedbackN = !isAssessment && fbN && fbN.phase === 'train' && fbN.message && B.feedback_in_main;
      if (canFeedbackN) {
        fx.popBubble(bubble, fbN.message, okN ? 'ok' : 'calm', P.feedback_ms);
        if (!okN && fbN.answer_display != null && typeof kind.numlineRevealTruth === 'function') {
          // نشان حقیقت — آموزش پس از پاسخ؛ مقدار از بازخورد سرور می‌آید، نه از کلاینت
          const truthEl = kind.numlineRevealTruth(item, stage, Number(fbN.answer_display));
          fx.popIn(truthEl, 300);
          await sleeper.sleep(P.feedback_ms + 600); // کمی وقت برای دیدن جای درست
        } else {
          const pt = okN && typeof kind.numlineGuessPoint === 'function'
            ? kind.numlineGuessPoint(stage)
            : null;
          if (pt) fx.burstAt(pt.x, pt.y);
          await sleeper.sleep(P.feedback_ms);
        }
      } else {
        await sleeper.sleep(Math.max(400, recordNum.isi_ms || 600));
      }
      /* سبد ستاره و استریک — همان حلقهٔ گو/نوگو؛ ارزیابی هرگز */
      if (!isAssessment && B.star_basket && fbN && fbN.phase === 'train' && okN) {
        starCount += 1;
        if (countEl) countEl.textContent = faNum(starCount);
        fx.flyStar(stage, basketEl);
        window.setTimeout(() => fx.popCount(countEl), 560);
        if (starCount % 5 === 0) {
          fx.popBubble(bubble, faNum(starCount) + ' ستاره جمع شد!', 'ok', P.feedback_ms);
          await sleeper.sleep(P.feedback_ms);
        }
      }
      if (okN) streak += 1; else if (fbN && fbN.correct === false) streak = 0;
      const streakMsgN = streakLine(streak);
      if (canFeedbackN && streakMsgN) fx.pillShow(streakMsgN);
      if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
        machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
      }
      continue;
    }

    /* آیتم اسکن — «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰): موج ربات‌ها؛ همهٔ جاسوس‌ها را بگیر و «گزارش بده!» را لمس کن.
       حس عدی در صحنه است (پوستهٔ شب/آژیر) — هرگز در گفتار با کودک (§۲).
       پاسخ {hits} سرور نمره می‌دهد؛ کلید («کدام خانه») هرگز به کلاینت نمی‌رود؛
       RT از نمایش موج (نخستین لمس)؛ شواهد همان قرارداد فاز ۴؛
       بازخورد آموزشی + نشان جاسوس‌های جامانده از answer_display سرور — ارزیابی بی‌بازخورد/بی‌ستاره */
    if (item.type === 'scan' && item.stim && Array.isArray(item.stim.tiles) && typeof kind.scanMarkup === 'function') {
      machine.to(STATES.FIXATION, { item: item.id, scan: true }); // مسیر اجباری ماشین: READY/PRACTICE → FIXATION → STIMULUS
      /* شواهد مشترک G1 — از تثبیت خنثی پیش از موج؛ لمس حین تثبیت = premature (P1-2) */
      const ledgerS = createTouchLedger();
      ledgerS.start();
      let scanAnswered = false;
      const stopTouchS = attachTouchEvidence(stage, ledgerS, () => machine.state, () => scanAnswered);
      stage.classList.remove('play-stage--quiet');
      stage.classList.add('play-stage--scan'); // پوستهٔ عدی: شب، حاشیهٔ آژیر، اسکادران
      await sleeper.sleep(400); // تثبیت کوتاه خنثی پیش از موج — بدون فلاش (§۹)
      stage.innerHTML = kind.scanMarkup(item);
      const stopFramesS = observeDisplayFrames();
      machine.to(STATES.STIMULUS, { item: item.id, scan: true });
      const shownAt = performance.now(); // RT از لحظهٔ نمایش موج — نه از شروع حلقه
      /* ساعت RT مکث‌پذیر (P1-1) — چندلمسی: RT از نخستین لمس با peek بدون فریز؛
         ساعت تا پایان موج زنده می‌ماند تا مکث برگه فقط به «مکث‌ها» اثر کند */
      const clockS = createPausableClock();
      clockS.start();
      const stimRaw = item.stim || {};
      const waveMs = typeof stimRaw.wave_ms === 'number' && Number.isFinite(stimRaw.wave_ms) && stimRaw.wave_ms >= 4000
        ? Math.min(30000, Math.round(stimRaw.wave_ms))
        : 15000;
      const result = await new Promise((resolve) => {
        const tiles = stage.querySelectorAll('.play-scan__tile');
        const confirmBtn = stage.querySelector('.play-scan__confirm');
        const timerBar = stage.querySelector('.play-scan__timer > span');
        const hits = new Set();
        let firstAt = null;
        let tapCount = 0;
        let settled = false;
        // نوار زمان موج — نما با CSS transition؛ مکث برگه از trialHooks نما را هم منجمد می‌کند
        let waveRemain = waveMs;
        let wavePausedAt = null;
        const freezeBar = () => {
          if (!timerBar) return;
          const w = window.getComputedStyle(timerBar).width;
          timerBar.style.transition = 'none';
          timerBar.style.width = w;
        };
        const unfreezeBar = (ms) => {
          if (!timerBar) return;
          window.requestAnimationFrame(() => {
            timerBar.style.transition = 'width ' + Math.max(0, ms) + 'ms linear';
            timerBar.style.width = '0%';
          });
        };
        trialHooks.pause = () => {
          wavePausedAt = performance.now();
          clockS.pause(); // ساعت RT هم با مکث برگه فریز می‌شود (P1-1)
          freezeBar();
        };
        trialHooks.resume = () => {
          if (!clockS.running) clockS.resume();
          if (wavePausedAt !== null) {
            waveRemain = Math.max(0, waveRemain - (performance.now() - wavePausedAt));
            wavePausedAt = null;
            unfreezeBar(waveRemain);
          }
        };
        const finishWave = () => {
          if (settled) return;
          settled = true;
          scanAnswered = true;
          sleeper.cancel(); // موج با «گزارش بده!» تمام شد — خواب یدکی یدک نمی‌ماند تا خواب موج بعد را زودرس نبرد (همان قاعدهٔ پنجرهٔ گو/نوگو)
          trialHooks.pause = null;
          trialHooks.resume = null;
          tiles.forEach((b) => b.removeEventListener('pointerdown', onTile));
          if (confirmBtn) confirmBtn.removeEventListener('pointerdown', onConfirm);
          resolve({ hits: [...hits], firstRt: firstAt !== null ? clockS.peek() : null, tapCount, usedMs: clockS.peek() });
        };
        const onTile = (ev) => {
          const btn = ev.target.closest('.play-scan__tile');
          if (!btn) return;
          ev.preventDefault(); // شبکهٔ لمسی — اسکرول اشتباه نمی‌سازد
          tapCount += 1;
          if (firstAt === null) firstAt = performance.now();
          const idx = Number(btn.dataset.idx);
          if (hits.has(idx)) { hits.delete(idx); btn.classList.remove('play-scan__tile--catch'); }
          else { hits.add(idx); btn.classList.add('play-scan__tile--catch'); }
        };
        const onConfirm = (ev) => {
          ev.preventDefault();
          finishWave();
        };
        tiles.forEach((b) => b.addEventListener('pointerdown', onTile));
        if (confirmBtn) confirmBtn.addEventListener('pointerdown', onConfirm);
        unfreezeBar(waveMs);
        sleeper.sleep(waveMs).then(finishWave);
      });
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, scan: true });
      stopTouchS();
      const framesS = stopFramesS();
      const sortedHits = result.hits.slice().sort((a, b) => a - b);
      const usedMs = result.usedMs; // ساعت مکث‌پذیر — مکث برگه در «مدت استفادهٔ موج» هم حساب نمی‌شود
      const recordScan = {
        item_id: item.id,
        go: null,
        touched: sortedHits.length > 0,
        rt_ms: result.firstRt !== null && result.firstRt >= 0 ? result.firstRt : null,
        touch_count: result.tapCount,
        ...ledgerS.evidenceCounts(),
        presented_at: shownAt,
        frame_drops: framesS.drops,
        max_frame_delta: framesS.maxDelta,
        window_ms: null,
        isi_ms: 0,
        events: ledgerS.events(),
        scan_hits: sortedHits
      };
      trials.push(recordScan);
      doneCount += 1;
      let fbS = null;
      try {
        fbS = await api.submit({
          item_id: item.id,
          response: {
            hits: sortedHits,
            wave_used_ms: usedMs,
            presented_at: Math.round(shownAt),
            frame_drops: framesS.drops,
            max_frame_delta: framesS.maxDelta,
            touch_count: result.tapCount,
            ...ledgerS.evidenceCounts(),
            window_ms: waveMs
          },
          rt_ms: recordScan.rt_ms,
          idem_key: crypto.randomUUID()
        });
      } catch (err) {
        machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
        onNetworkFail();
        return;
      }
      const okS = fbS !== null && typeof fbS === 'object' && fbS.correct === true;
      const canFeedbackS = !isAssessment && fbS && fbS.phase === 'train' && fbS.message && B.feedback_in_main;
      if (canFeedbackS) {
        fx.popBubble(bubble, fbS.message, okS ? 'ok' : 'calm', P.feedback_ms);
        if (!okS && fbS.answer_display != null && typeof kind.scanRevealTruth === 'function') {
          // نشان حقیقت — جاسوس‌های جامانده؛ فهرست از بازخورد سرور می‌آید، نه از کلاینت
          kind.scanRevealTruth(item, stage, String(fbS.answer_display));
          await sleeper.sleep(P.feedback_ms + 600); // وقت دیدن جاسوس‌های جامانده
        } else {
          if (okS) {
            const pt = typeof kind.scanCatchPoint === 'function' ? kind.scanCatchPoint(stage) : null;
            if (pt) fx.burstAt(pt.x, pt.y);
          }
          await sleeper.sleep(P.feedback_ms);
        }
      } else {
        await sleeper.sleep(Math.max(400, 600));
      }
      stage.classList.remove('play-stage--scan');
      stage.innerHTML = ''; // صحنه خالی پیش از ISI بعدی — موج جاسوس‌ها شبح نمی‌ماند
      /* سبد ستاره و استریک — همان حلقهٔ گو/نوگو؛ ارزیابی هرگز */
      if (!isAssessment && B.star_basket && fbS && fbS.phase === 'train' && okS) {
        starCount += 1;
        if (countEl) countEl.textContent = faNum(starCount);
        fx.flyStar(stage, basketEl);
        window.setTimeout(() => fx.popCount(countEl), 560);
        if (starCount % 5 === 0) {
          fx.popBubble(bubble, faNum(starCount) + ' ستاره جمع شد!', 'ok', P.feedback_ms);
          await sleeper.sleep(P.feedback_ms);
        }
      }
      if (okS) streak += 1; else if (fbS && fbS.correct === false) streak = 0;
      const streakMsgS = streakLine(streak);
      if (canFeedbackS && streakMsgS) fx.pillShow(streakMsgS);
      if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
        machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
      }
      continue;
    }

    /* آیتم دنبالهٔ صدف‌ها — «صدف‌های جادویی» (G8/۱.۲۵.۴۸): کرسی بلوک-تپینگ.
       صدف‌ها یکی‌یکی روشن می‌شوند (دنبالهٔ authored از stim.seq) و کودک همان ترتیب را
       لمس می‌کند. دنباله محرک عمومی خود بازی است (کودک می‌بیند)؛ کلید نمره‌دهی
       (item.correct) هرگز به کلاینت نمی‌رود و سرور پاسخ را مقایسه می‌کند.
       فازها: تثبیت → پخش دنباله (لمس در این فاز premature می‌شود و بی‌اثر است) →
       نوبت کودک (پنجره از stim.window_ms) → ثبت/بازخورد آموزشی.
       RT از نخستین لمسِ فاز کودک (ساعت مکث‌پذیر بعد از پخش دنباله) — شواهد همان قرارداد فاز ۴ */
    if (item.type === 'corsi' && item.stim && Array.isArray(item.stim.seq) && typeof kind.corsiMarkup === 'function') {
      machine.to(STATES.FIXATION, { item: item.id, corsi: true }); // مسیر اجباری ماشین
      const ledgerK = createTouchLedger();
      ledgerK.start();
      let corsiAnswered = false;
      const stopTouchK = attachTouchEvidence(stage, ledgerK, () => machine.state, () => corsiAnswered);
      stage.classList.remove('play-stage--quiet');
      stage.classList.add('play-stage--corsi'); // پوستهٔ خلیج مروارید
      await sleeper.sleep(250); // تثبیت کوتاه پیش از دنباله — بدون فلاش (§۹)
      stage.innerHTML = kind.corsiMarkup(item);
      machine.to(STATES.STIMULUS, { item: item.id, corsi: true });
      const shownAtK = performance.now();
      const stimK = item.stim;
      const seqK = stimK.seq.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0);
      const flashMs = typeof stimK.flash_ms === 'number' && Number.isFinite(stimK.flash_ms)
        ? Math.min(1200, Math.max(350, Math.round(stimK.flash_ms))) : 620;
      const gapMs = typeof stimK.gap_ms === 'number' && Number.isFinite(stimK.gap_ms)
        ? Math.min(600, Math.max(120, Math.round(stimK.gap_ms))) : 240;
      /* فاز پخش دنباله — ساعت RT هنوز خاموش؛ هر لمس این‌جا premature دفتر لمس است */
      for (const idx of seqK) {
        const tileEl = stage.querySelector('.play-corsi__tile[data-idx="' + idx + '"]');
        if (tileEl) tileEl.classList.add('play-corsi__tile--lit');
        await sleeper.sleep(flashMs);
        if (tileEl) tileEl.classList.remove('play-corsi__tile--lit');
        await sleeper.sleep(gapMs);
      }
      if (typeof kind.corsiBeginRecall === 'function') kind.corsiBeginRecall(stage, seqK.length);
      const clockK = createPausableClock();
      clockK.start(); // RT فاز کودک از همین‌جا — پخش دنباله در RT نیست
      const stopFramesK = observeDisplayFrames();
      const winK = typeof stimK.window_ms === 'number' && Number.isFinite(stimK.window_ms)
        ? Math.min(60000, Math.max(6000, Math.round(stimK.window_ms))) : 16000;
      const resultK = await new Promise((resolve) => {
        const tiles = stage.querySelectorAll('.play-corsi__tile');
        const timerBar = stage.querySelector('[class*="__timer"] > span');
        const order = [];
        let firstAt = null;
        let tapCount = 0;
        let settled = false;
        let winRemain = winK;
        let winPausedAt = null;
        const freezeBar = () => {
          if (!timerBar) return;
          const w = window.getComputedStyle(timerBar).width;
          timerBar.style.transition = 'none';
          timerBar.style.width = w;
        };
        const unfreezeBar = (ms) => {
          if (!timerBar) return;
          window.requestAnimationFrame(() => {
            timerBar.style.transition = 'width ' + Math.max(0, ms) + 'ms linear';
            timerBar.style.width = '0%';
          });
        };
        trialHooks.pause = () => { winPausedAt = performance.now(); clockK.pause(); freezeBar(); };
        trialHooks.resume = () => {
          if (!clockK.running) clockK.resume();
          if (winPausedAt !== null) {
            winRemain = Math.max(0, winRemain - (performance.now() - winPausedAt));
            winPausedAt = null;
            unfreezeBar(winRemain);
          }
        };
        const finishRecall = (timedOut) => {
          if (settled) return;
          settled = true;
          corsiAnswered = true;
          sleeper.cancel(); // دنباله کامل شد یا پنجره بست — خواب یدکی یتیم نمی‌ماند
          trialHooks.pause = null;
          trialHooks.resume = null;
          tiles.forEach((b) => b.removeEventListener('pointerdown', onTile));
          resolve({ order: order.slice(), firstRt: firstAt !== null ? clockK.peek() : null, tapCount, timedOut, usedMs: clockK.peek() });
        };
        const onTile = (ev) => {
          const btn = ev.target.closest('.play-corsi__tile');
          if (!btn || btn.classList.contains('play-corsi__tile--picked')) return;
          ev.preventDefault(); // شبکهٔ لمسی — اسکرول اشتباه نمی‌سازد
          tapCount += 1;
          if (firstAt === null) firstAt = performance.now();
          btn.classList.add('play-corsi__tile--picked');
          order.push(Number(btn.dataset.idx));
          if (seqK.length > 0 && order.length >= seqK.length) finishRecall(false); // دنبالهٔ کامل شد
        };
        tiles.forEach((b) => b.addEventListener('pointerdown', onTile));
        unfreezeBar(winK);
        sleeper.sleep(winK).then(() => finishRecall(true));
      });
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, corsi: true });
      stopTouchK();
      const framesK = stopFramesK();
      const recordK = {
        item_id: item.id,
        go: null,
        touched: resultK.order.length > 0,
        rt_ms: resultK.firstRt !== null && resultK.firstRt >= 0 ? resultK.firstRt : null,
        touch_count: resultK.tapCount,
        ...ledgerK.evidenceCounts(),
        presented_at: shownAtK,
        frame_drops: framesK.drops,
        max_frame_delta: framesK.maxDelta,
        window_ms: winK,
        isi_ms: 0,
        events: ledgerK.events(),
        corsi_order: resultK.order.slice()
      };
      trials.push(recordK);
      doneCount += 1;
      let fbK = null;
      try {
        fbK = await api.submit({
          item_id: item.id,
          response: {
            order: resultK.order,
            used_ms: resultK.usedMs,
            timed_out: resultK.timedOut,
            presented_at: Math.round(shownAtK),
            frame_drops: framesK.drops,
            max_frame_delta: framesK.maxDelta,
            touch_count: resultK.tapCount,
            ...ledgerK.evidenceCounts(),
            window_ms: winK
          },
          rt_ms: recordK.rt_ms,
          idem_key: crypto.randomUUID()
        });
      } catch (err) {
        machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
        onNetworkFail();
        return;
      }
      const okK = fbK !== null && typeof fbK === 'object' && fbK.correct === true;
      if (okK && seqK.length > spanBest) spanBest = seqK.length; // بازهٔ واقعی — فقط دنبالهٔ کاملِ درست
      const canFeedbackK = !isAssessment && fbK && fbK.phase === 'train' && fbK.message && B.feedback_in_main;
      if (canFeedbackK) {
        fx.popBubble(bubble, fbK.message, okK ? 'ok' : 'calm', P.feedback_ms);
        if (!okK && fbK.answer_display != null && typeof kind.corsiRevealTruth === 'function') {
          // نشان حقیقت — دنبالهٔ درست صدف‌ها از بازخورد سرور می‌آید، نه از کلاینت
          kind.corsiRevealTruth(item, stage, String(fbK.answer_display));
          await sleeper.sleep(P.feedback_ms + 800); // وقت دیدن دنبالهٔ درست
        } else {
          if (okK && typeof kind.corsiResponsePoint === 'function') {
            const ptK = kind.corsiResponsePoint(stage);
            if (ptK) fx.burstAt(ptK.x, ptK.y);
          }
          await sleeper.sleep(P.feedback_ms);
        }
      } else {
        await sleeper.sleep(Math.max(400, 600));
      }
      stage.classList.remove('play-stage--corsi');
      stage.innerHTML = ''; // صحنه خالی پیش از ISI بعدی — دنباله شبح نمی‌ماند
      /* سبد ستاره و استریک — همان حلقهٔ گو/نوگو؛ ارزیابی هرگز */
      if (!isAssessment && B.star_basket && fbK && fbK.phase === 'train' && okK) {
        starCount += 1;
        if (countEl) countEl.textContent = faNum(starCount);
        fx.flyStar(stage, basketEl);
        window.setTimeout(() => fx.popCount(countEl), 560);
        if (starCount % 5 === 0) {
          fx.popBubble(bubble, faNum(starCount) + ' ستاره جمع شد!', 'ok', P.feedback_ms);
          await sleeper.sleep(P.feedback_ms);
        }
      }
      if (okK) streak += 1; else if (fbK && fbK.correct === false) streak = 0;
      const streakMsgK = streakLine(streak);
      if (canFeedbackK && streakMsgK) fx.pillShow(streakMsgK);
      if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
        machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
      }
      continue;
    }

    /* آیتم بازهٔ عدد — «حباب‌های عدد» (G8/۱.۲۵.۴۸): بازهٔ عدد رو به جلو.
       عددها یکی‌یکی در حباب بالا می‌آیند (دنبالهٔ authored از stim.seq) و کودک همان
       عددها را با صفحه‌کلید بزرگ به ترتیب وارد می‌کند و ✓ می‌زند. عددها محرک عمومی
       خود بازی‌اند؛ کلید نمره‌دهی (item.correct) هرگز به کلاینت نمی‌رود.
       فازها: تثبیت → نمایش عددها (لمس premature می‌شود) → ورود با صفحه‌کلید
       (پنجره از stim.window_ms؛ ✓ یا پایان پنجره) → ثبت/بازخورد آموزشی.
       RT از نخستین لمس صفحه‌کلید (زمان واکنش نیست — فقط توصیفی) */
    if (item.type === 'span' && item.stim && Array.isArray(item.stim.seq) && typeof kind.spanMarkup === 'function') {
      machine.to(STATES.FIXATION, { item: item.id, span: true }); // مسیر اجباری ماشین
      const ledgerD = createTouchLedger();
      ledgerD.start();
      let spanAnswered = false;
      const stopTouchD = attachTouchEvidence(stage, ledgerD, () => machine.state, () => spanAnswered);
      stage.classList.remove('play-stage--quiet');
      stage.classList.add('play-stage--span'); // پوستهٔ شبِ فانوس
      await sleeper.sleep(250);
      stage.innerHTML = kind.spanMarkup(item);
      machine.to(STATES.STIMULUS, { item: item.id, span: true });
      const shownAtD = performance.now();
      const stimD = item.stim;
      const seqD = stimD.seq.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0);
      const paceMs = typeof stimD.pace_ms === 'number' && Number.isFinite(stimD.pace_ms)
        ? Math.min(1400, Math.max(450, Math.round(stimD.pace_ms))) : 760;
      const gapMsD = typeof stimD.gap_ms === 'number' && Number.isFinite(stimD.gap_ms)
        ? Math.min(600, Math.max(150, Math.round(stimD.gap_ms))) : 340;
      /* فاز نمایش عددها — ساعت RT هنوز خاموش؛ لمس در این فاز premature دفتر لمس است */
      for (const d of seqD) {
        const bubbleEl = stage.querySelector('.play-span__bubble');
        if (bubbleEl) {
          bubbleEl.textContent = faNum(d);
          bubbleEl.classList.add('play-span__bubble--show');
        }
        await sleeper.sleep(paceMs);
        if (bubbleEl) bubbleEl.classList.remove('play-span__bubble--show');
        await sleeper.sleep(gapMsD);
      }
      if (typeof kind.spanBeginInput === 'function') kind.spanBeginInput(stage, seqD.length);
      const clockD = createPausableClock();
      clockD.start();
      const stopFramesD = observeDisplayFrames();
      const winD = typeof stimD.window_ms === 'number' && Number.isFinite(stimD.window_ms)
        ? Math.min(60000, Math.max(8000, Math.round(stimD.window_ms))) : 24000;
      const resultD = await new Promise((resolve) => {
        const pad = stage.querySelector('.play-span__pad');
        const timerBar = stage.querySelector('[class*="__timer"] > span');
        const entryEl = stage.querySelector('.play-span__entry');
        const digits = [];
        let firstAt = null;
        let tapCount = 0;
        let settled = false;
        let winRemain = winD;
        let winPausedAt = null;
        const freezeBar = () => {
          if (!timerBar) return;
          const w = window.getComputedStyle(timerBar).width;
          timerBar.style.transition = 'none';
          timerBar.style.width = w;
        };
        const unfreezeBar = (ms) => {
          if (!timerBar) return;
          window.requestAnimationFrame(() => {
            timerBar.style.transition = 'width ' + Math.max(0, ms) + 'ms linear';
            timerBar.style.width = '0%';
          });
        };
        const renderEntry = () => {
          if (!entryEl) return;
          const slots = Math.max(seqD.length, digits.length);
          let html = '';
          for (let i = 0; i < slots; i++) {
            html += '<span class="play-span__slot' + (digits[i] !== undefined ? ' play-span__slot--filled' : '') + '">' +
              (digits[i] !== undefined ? faNum(digits[i]) : '') + '</span>';
          }
          entryEl.innerHTML = html;
        };
        trialHooks.pause = () => { winPausedAt = performance.now(); clockD.pause(); freezeBar(); };
        trialHooks.resume = () => {
          if (!clockD.running) clockD.resume();
          if (winPausedAt !== null) {
            winRemain = Math.max(0, winRemain - (performance.now() - winPausedAt));
            winPausedAt = null;
            unfreezeBar(winRemain);
          }
        };
        const finishInput = (timedOut) => {
          if (settled) return;
          settled = true;
          spanAnswered = true;
          sleeper.cancel(); // ✓ آمد یا پنجره بست — خواب یدکی یتیم نمی‌ماند
          trialHooks.pause = null;
          trialHooks.resume = null;
          if (pad) pad.removeEventListener('pointerdown', onPad);
          resolve({ digits: digits.slice(), firstRt: firstAt !== null ? clockD.peek() : null, tapCount, timedOut, usedMs: clockD.peek() });
        };
        const onPad = (ev) => {
          const key = ev.target.closest('[data-key]');
          if (!key) return;
          ev.preventDefault(); // صفحه‌کلید لمسی — اسکرول اشتباه نمی‌سازد
          tapCount += 1;
          if (firstAt === null) firstAt = performance.now();
          const k = key.getAttribute('data-key');
          if (k === 'back') { digits.pop(); renderEntry(); return; }
          if (k === 'go') { finishInput(false); return; }
          const d = Number(k);
          if (!Number.isInteger(d) || digits.length >= Math.max(seqD.length, 3) + 2) return; // سقف ورود — خطای لمس بی‌نهایت نمی‌شود
          digits.push(d);
          renderEntry();
        };
        if (pad) pad.addEventListener('pointerdown', onPad);
        renderEntry();
        unfreezeBar(winD);
        sleeper.sleep(winD).then(() => finishInput(true));
      });
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, span: true });
      stopTouchD();
      const framesD = stopFramesD();
      const recordD = {
        item_id: item.id,
        go: null,
        touched: resultD.digits.length > 0,
        rt_ms: resultD.firstRt !== null && resultD.firstRt >= 0 ? resultD.firstRt : null,
        touch_count: resultD.tapCount,
        ...ledgerD.evidenceCounts(),
        presented_at: shownAtD,
        frame_drops: framesD.drops,
        max_frame_delta: framesD.maxDelta,
        window_ms: winD,
        isi_ms: 0,
        events: ledgerD.events(),
        span_digits: resultD.digits.slice()
      };
      trials.push(recordD);
      doneCount += 1;
      let fbD = null;
      try {
        fbD = await api.submit({
          item_id: item.id,
          response: {
            digits: resultD.digits,
            used_ms: resultD.usedMs,
            timed_out: resultD.timedOut,
            presented_at: Math.round(shownAtD),
            frame_drops: framesD.drops,
            max_frame_delta: framesD.maxDelta,
            touch_count: resultD.tapCount,
            ...ledgerD.evidenceCounts(),
            window_ms: winD
          },
          rt_ms: recordD.rt_ms,
          idem_key: crypto.randomUUID()
        });
      } catch (err) {
        machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
        onNetworkFail();
        return;
      }
      const okD = fbD !== null && typeof fbD === 'object' && fbD.correct === true;
      if (okD && seqD.length > spanBest) spanBest = seqD.length; // بازهٔ واقعی — فقط دنبالهٔ کاملِ درست
      const canFeedbackD = !isAssessment && fbD && fbD.phase === 'train' && fbD.message && B.feedback_in_main;
      if (canFeedbackD) {
        fx.popBubble(bubble, fbD.message, okD ? 'ok' : 'calm', P.feedback_ms);
        if (!okD && fbD.answer_display != null && typeof kind.spanRevealTruth === 'function') {
          // نشان حقیقت — دنبالهٔ عدد درست از بازخورد سرور می‌آید، نه از کلاینت
          kind.spanRevealTruth(item, stage, String(fbD.answer_display));
          await sleeper.sleep(P.feedback_ms + 800);
        } else {
          if (okD && typeof kind.spanResponsePoint === 'function') {
            const ptD = kind.spanResponsePoint(stage);
            if (ptD) fx.burstAt(ptD.x, ptD.y);
          }
          await sleeper.sleep(P.feedback_ms);
        }
      } else {
        await sleeper.sleep(Math.max(400, 600));
      }
      stage.classList.remove('play-stage--span');
      stage.innerHTML = ''; // صحنه خالی پیش از ISI بعدی — حباب‌ها شبح نمی‌مانند
      /* سبد ستاره و استریک — همان حلقهٔ گو/نوگو؛ ارزیابی هرگز */
      if (!isAssessment && B.star_basket && fbD && fbD.phase === 'train' && okD) {
        starCount += 1;
        if (countEl) countEl.textContent = faNum(starCount);
        fx.flyStar(stage, basketEl);
        window.setTimeout(() => fx.popCount(countEl), 560);
        if (starCount % 5 === 0) {
          fx.popBubble(bubble, faNum(starCount) + ' ستاره جمع شد!', 'ok', P.feedback_ms);
          await sleeper.sleep(P.feedback_ms);
        }
      }
      if (okD) streak += 1; else if (fbD && fbD.correct === false) streak = 0;
      const streakMsgD = streakLine(streak);
      if (canFeedbackD && streakMsgD) fx.pillShow(streakMsgD);
      if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
        machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
      }
      continue;
    }

    /* آیتم انتخاب زمان‌دار — «حقه‌باز رنگ‌ها»، «گلهٔ فریبکار» (۱.۲۵.۳۲) و «آلبوم خرچنگ» (۱.۲۵.۴۰):
       استروپ/فلانکر/ن‌پشت با پنجرهٔ پاسخ از stim.window_ms؛ بی‌لمس تا پایان پنجره = بی‌پاسخ
       (اُمیشن سمت سرور). نمایش از kinds/<kind>.js (markupFor) و در نبودش قالب عام؛
       RT از لحظهٔ نمایش محرک؛ شواهد همان قرارداد فاز ۴؛ حس عدی در پوستهٔ صحنه —
       گفتار روبه‌کودک آرام (§۲)؛ ارزیابی بی‌بازخورد/بی‌ستاره */
    if ((item.type === 'stroop' || item.type === 'flanker' || item.type === 'nback') &&
        (typeof kind.markupFor?.[item.type] === 'function' || (Array.isArray(item.options) && item.options.length > 0))) {
      machine.to(STATES.FIXATION, { item: item.id, timedchoice: true }); // مسیر اجباری ماشین: READY/PRACTICE → FIXATION → STIMULUS
      /* شواهد مشترک G1 — از تثبیت پوسته پیش از محرک (P1-2) */
      const ledgerT = createTouchLedger();
      ledgerT.start();
      let answeredT = false;
      const stopTouchT = attachTouchEvidence(stage, ledgerT, () => machine.state, () => answeredT);
      stage.classList.remove('play-stage--quiet');
      stage.classList.add('play-stage--' + item.type); // پوستهٔ عدی نوع‌بازی (شب/حاشیهٔ هشدار)
      await sleeper.sleep(250); // تثبیت کوتاه پوسته پیش از محرک — بدون فلاش (§۹)
      stage.innerHTML = typeof kind.markupFor?.[item.type] === 'function'
        ? kind.markupFor[item.type](item)
        : (item.prompt ? '<p class="play-line">' + esc(item.prompt) + '</p>' : '') +
          '<div class="play-options">' +
          item.options.map((o, i) => '<button type="button" class="play-option" data-option="' + i + '">' + esc(o.label ?? o) + '</button>').join('') +
          '</div>';
      machine.to(STATES.STIMULUS, { item: item.id, timedchoice: true });
      const shownAtTc = performance.now(); // RT از لحظهٔ نمایش محرک — نه از شروع حلقه
      /* ساعت RT مکث‌پذیر (P1-1) — گیره‌ها پیش از await نصب می‌شوند */
      const clockT = createPausableClock();
      clockT.start();
      const stopFramesT = observeDisplayFrames();
      const stimTc = item.stim && typeof item.stim === 'object' ? item.stim : {};
      const winMs = typeof stimTc.window_ms === 'number' && Number.isFinite(stimTc.window_ms)
        ? Math.min(8000, Math.max(800, Math.round(stimTc.window_ms)))
        : 3000;
      const pickTc = await new Promise((resolve) => {
        const buttons = stage.querySelectorAll('.play-option');
        const timerBar = stage.querySelector('[class*="__timer"] > span');
        let settled = false;
        let winRemain = winMs;
        let winPausedAt = null;
        const freezeBar = () => {
          if (!timerBar) return;
          const w = window.getComputedStyle(timerBar).width;
          timerBar.style.transition = 'none';
          timerBar.style.width = w;
        };
        const unfreezeBar = (ms) => {
          if (!timerBar) return;
          window.requestAnimationFrame(() => {
            timerBar.style.transition = 'width ' + Math.max(0, ms) + 'ms linear';
            timerBar.style.width = '0%';
          });
        };
        trialHooks.pause = () => { winPausedAt = performance.now(); clockT.pause(); freezeBar(); }; // ساعت RT هم فریز (P1-1)
        trialHooks.resume = () => {
          if (!clockT.running) clockT.resume();
          if (winPausedAt !== null) {
            winRemain = Math.max(0, winRemain - (performance.now() - winPausedAt));
            winPausedAt = null;
            unfreezeBar(winRemain);
          }
        };
        const finishWindow = (val) => {
          if (settled) return;
          settled = true;
          answeredT = val && val.option !== null ? true : answeredT; // پاسخ اصلی ثبت شد (اُمیشن پاسخ نیست)
          sleeper.cancel(); // پنجره تمام شد — خواب یدکی یتیم نمی‌ماند (قاعدهٔ پنجرهٔ گو/نوگو)
          trialHooks.pause = null;
          trialHooks.resume = null;
          buttons.forEach((b) => b.removeEventListener('pointerdown', onTap));
          resolve(val);
        };
        const onTap = (ev) => {
          const btn = ev.target.closest('.play-option');
          if (!btn) return;
          ev.preventDefault();
          const rt = clockT.peek(); // RT در نقطهٔ لمس — بدون فریز ساعت (P1-1)
          finishWindow({ option: Number(btn.dataset.option), at: performance.now(), rt });
        };
        buttons.forEach((b) => b.addEventListener('pointerdown', onTap));
        unfreezeBar(winMs);
        sleeper.sleep(winMs).then(() => finishWindow({ option: null, at: null, rt: null }));
      });
      const timedOutTc = pickTc.option === null;
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, timedchoice: true });
      stopTouchT();
      const framesTc = stopFramesT();
      const recordTc = {
        item_id: item.id,
        go: null,
        touched: !timedOutTc,
        rt_ms: !timedOutTc && pickTc.rt !== null && pickTc.rt >= 0 ? pickTc.rt : null,
        touch_count: pickTc.option !== null ? 1 : 0,
        ...ledgerT.evidenceCounts(),
        presented_at: shownAtTc,
        frame_drops: framesTc.drops,
        max_frame_delta: framesTc.maxDelta,
        window_ms: winMs,
        isi_ms: 0,
        events: ledgerT.events(),
        choice_response: { option: pickTc.option, timed_out: timedOutTc }
      };
      trials.push(recordTc);
      doneCount += 1;
      let fbT = null;
      try {
        fbT = await api.submit({
          item_id: item.id,
          response: {
            option: pickTc.option,
            timed_out: timedOutTc,
            presented_at: Math.round(shownAtTc),
            frame_drops: framesTc.drops,
            max_frame_delta: framesTc.maxDelta,
            touch_count: recordTc.touch_count,
            ...ledgerT.evidenceCounts(),
            window_ms: winMs
          },
          rt_ms: recordTc.rt_ms,
          idem_key: crypto.randomUUID()
        });
      } catch (err) {
        machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
        onNetworkFail();
        return;
      }
      const okT = fbT !== null && typeof fbT === 'object' && fbT.correct === true;
      const canFeedbackT = !isAssessment && fbT && fbT.phase === 'train' && fbT.message && B.feedback_in_main;
      if (canFeedbackT) {
        fx.popBubble(bubble, fbT.message, okT ? 'ok' : 'calm', P.feedback_ms);
        if (!okT && fbT.answer_display != null && typeof kind.revealFor?.[item.type] === 'function') {
          // نشان حقیقت — آموزش پس از پاسخ؛ برچسب درست از بازخورد سرور می‌آید، نه از کلاینت
          kind.revealFor[item.type](item, stage, fbT.answer_display);
          await sleeper.sleep(P.feedback_ms + 600);
        } else {
          if (okT && typeof kind.pointFor?.[item.type] === 'function') {
            const ptT = kind.pointFor[item.type](stage);
            if (ptT) fx.burstAt(ptT.x, ptT.y);
          }
          await sleeper.sleep(P.feedback_ms);
        }
      } else {
        await sleeper.sleep(Math.max(400, 600));
      }
      stage.classList.remove('play-stage--' + item.type);
      stage.innerHTML = ''; // صحنه خالی پیش از ISI بعدی — محرک شبح نمی‌ماند
      /* سبد ستاره و استریک — همان حلقهٔ گو/نوگو؛ ارزیابی هرگز */
      if (!isAssessment && B.star_basket && fbT && fbT.phase === 'train' && okT) {
        starCount += 1;
        if (countEl) countEl.textContent = faNum(starCount);
        fx.flyStar(stage, basketEl);
        window.setTimeout(() => fx.popCount(countEl), 560);
        if (starCount % 5 === 0) {
          fx.popBubble(bubble, faNum(starCount) + ' ستاره جمع شد!', 'ok', P.feedback_ms);
          await sleeper.sleep(P.feedback_ms);
        }
      }
      if (okT) streak += 1; else if (fbT && fbT.correct === false) streak = 0;
      const streakMsgT = streakLine(streak);
      if (canFeedbackT && streakMsgT) fx.pillShow(streakMsgT);
      if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
        machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
      }
      continue;
    }


    /* آیتم انتخابی (choice) — پنجرهٔ پاسخ پروتکل‌محور (P2-1): بی‌پاسخ = اُمیشن؛
       کف ۲۰۰ms سروری (§۸)؛ همان کلاس‌های CSS پخش‌کننده؛ RT از نمایش هر آیتم؛
       ساعت مکث‌پذیر + شواهد مشترک G1 (P1-1/P1-2) */
    if (item.type === 'choice' && Array.isArray(item.options) && item.options.length > 0) {
      machine.to(STATES.FIXATION, { item: item.id, choice: true }); // مسیر اجباری ماشین (رفع باگ خام)
      const ledgerC = createTouchLedger();
      ledgerC.start();
      let answeredC = false;
      const stopTouchC = attachTouchEvidence(stage, ledgerC, () => machine.state, () => answeredC);
      stage.classList.remove('play-stage--quiet');
      stage.innerHTML = (item.prompt ? '<p class="play-line">' + esc(item.prompt) + '</p>' : '') +
        '<div class="play-options">' +
        item.options.map((o, i) => '<button type="button" class="play-option" data-option="' + i + '">' + esc(o.label) + '</button>').join('') +
        '</div>';
      const stopFramesC = observeDisplayFrames();
      machine.to(STATES.STIMULUS, { item: item.id, choice: true });
      const pickStart = performance.now(); // RT از لحظهٔ نمایش همین گزینه‌ها
      const clockC = createPausableClock();
      clockC.start();
      trialHooks.pause = () => clockC.pause();
      trialHooks.resume = () => { if (!clockC.running) clockC.resume(); };
      const winC = Math.min(60000, Math.max(5000, P.response_window_extended_ms));
      const pickAt = await new Promise((resolve) => {
        const buttons = stage.querySelectorAll('.play-option');
        const onTap = (ev) => {
          const btn = ev.target.closest('.play-option');
          if (!btn) return;
          buttons.forEach((b) => b.removeEventListener('pointerdown', onTap));
          answeredC = true;
          const rt = clockC.peek(); // RT در نقطهٔ لمس — بدون فریز ساعت (P1-1)
          clockC.pause();
          resolve({ option: Number(btn.dataset.option), at: performance.now(), rt, timedOut: false });
        };
        buttons.forEach((b) => b.addEventListener('pointerdown', onTap));
        sleeper.sleep(winC).then(() => resolve({ option: null, at: null, rt: null, timedOut: true }));
      });
      const timedOutC = pickAt.timedOut === true;
      sleeper.cancel(); // پاسخ آمد یا پنجره بست — خواب یدکی یتیم نمی‌ماند
      trialHooks.pause = null;
      trialHooks.resume = null;
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, choice: true });
      stopTouchC();
      const framesC = stopFramesC();
      stage.innerHTML = '';
      const recordChoice = {
        item_id: item.id,
        go: null,
        touched: !timedOutC,
        rt_ms: timedOutC ? null : (pickAt.rt !== null && pickAt.rt >= 0 ? pickAt.rt : null),
        touch_count: timedOutC ? 0 : 1,
        ...ledgerC.evidenceCounts(),
        presented_at: pickStart,
        frame_drops: framesC.drops,
        max_frame_delta: framesC.maxDelta,
        window_ms: winC,
        isi_ms: 0,
        events: ledgerC.events(),
        choice_response: { option: pickAt.option, timed_out: timedOutC }
      };
      trials.push(recordChoice);
      doneCount += 1;
      let fbC = null;
      try {
        fbC = await api.submit({
          item_id: item.id,
          response: {
            option: pickAt.option,
            timed_out: timedOutC,
            presented_at: Math.round(pickStart),
            frame_drops: framesC.drops,
            max_frame_delta: framesC.maxDelta,
            touch_count: recordChoice.touch_count,
            ...ledgerC.evidenceCounts(),
            window_ms: winC
          },
          rt_ms: recordChoice.rt_ms,
          idem_key: crypto.randomUUID()
        });
      } catch (err) {
        machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
        onNetworkFail();
        return;
      }
      const canFeedbackC = !isAssessment && fbC && fbC.phase === 'train' && fbC.message && B.feedback_in_main;
      if (canFeedbackC) {
        fx.popBubble(bubble, fbC.message, fbC.correct === true ? 'ok' : 'calm', P.feedback_ms);
        await sleeper.sleep(P.feedback_ms);
      } else {
        await sleeper.sleep(Math.max(400, recordChoice.isi_ms || 600));
      }
      if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
        machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
      }
      continue;
    }

    /* نوع‌های هنوز نساخته (خط عددی و…) — همان تمامِ آرام نسخهٔ قبل */
    if (item.type !== 'touch_report') {
      machine.to(STATES.COMPLETED, { reason: 'unsupported_kind', item: item.id });
      break;
    }

    const record = await runTrial({
      stage, machine, item, kind, protocol, sleeper, rand,
      hooks: trialHooks
    });
    trials.push(record);
    doneCount += 1;

    /* ثبت پاسخ — زنجیرهٔ توکن‌دار؛ idem_key یگانه */
    let fb = null;
    try {
      fb = await api.submit({
        item_id: item.id,
        response: {
          touched: record.touched,
          touch_count: record.touch_count,
          premature_count: record.premature_count,
          multiple_count: record.multiple_count,
          out_of_surface_count: record.out_of_surface_count,
          presented_at: record.presented_at,
          frame_drops: record.frame_drops,
          window_ms: record.window_ms
        },
        rt_ms: record.rt_ms,
        idem_key: crypto.randomUUID()
      });
    } catch (err) {
      machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
      onNetworkFail();
      return;
    }

    /* بازخورد — فقط تمرین؛ ارزیابی هرگز (behavior.feedback_in_main=false و آیتم پروب سرور هم بی‌بازخورد است) */
    /* لایهٔ حسی ۱.۲۵.۲۱: حباب شناور درست‌جای + انفجار ذره‌ای + ستارهٔ پران به سبد + پیل استریک؛
       همهٔ جنبش در fx.js با گارد کاهش‌جنبش — ارزیابی هرگز از این لایه نمی‌بیند (شرطِ isAssessment پایین) */
    const canFeedback = !isAssessment && fb && fb.phase === 'train' && fb.message && B.feedback_in_main;
    const trialOk = fb !== null && typeof fb === 'object' && fb.correct === true;
    /* خلاصهٔ پایان — فقط آزمون نمره‌خوردهٔ سرور (بازخورد train با correct صریح)؛ پروب هرگز */
    if (fb && typeof fb === 'object' && typeof fb.correct === 'boolean') {
      scoredTotal += 1;
      if (trialOk) scoredCorrect += 1;
    }
    if (canFeedback) {
      fx.popBubble(bubble, fb.message, trialOk ? 'ok' : 'calm', P.feedback_ms);
      if (trialOk) fx.burstCenter(stage);
      await sleeper.sleep(P.feedback_ms);
    } else {
      await sleeper.sleep(record.isi_ms);
    }

    /* سبد ستاره — فقط تمرین؛ هر ۵ ستاره یک تشویق آرام */
    if (!isAssessment && B.star_basket && fb && fb.phase === 'train' && fb.correct === true) {
      starCount += 1;
      if (countEl) countEl.textContent = faNum(starCount);
      fx.flyStar(stage, basketEl);
      window.setTimeout(() => fx.popCount(countEl), 560);
      if (starCount % 5 === 0) {
        fx.popBubble(bubble, faNum(starCount) + ' ستاره جمع شد!', 'ok', P.feedback_ms);
        await sleeper.sleep(P.feedback_ms);
      }
    }

    /* استریک — تشویق پشت‌سرهم بی‌رقارت؛ هرگز سرزنش/فشار ندارد (لحن §۲) */
    if (trialOk) streak += 1; else if (fb && fb.correct === false) streak = 0;
    const streakMsg = streakLine(streak);
    if (canFeedback && streakMsg) fx.pillShow(streakMsg);

    /* بازگشت به حالت انتظار — تمرین می‌ماند، اصلی به READY */
    if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
      machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
    }
  }

  /* ─── ۴) پایان محترمانه — هیچ «یک دور دیگر» وجود ندارد (§۲) ─── */
  machine.to(STATES.COMPLETED);
  const summary = summarizeSession(trials);
  stage.className = 'play-stage';
  stage.classList.add('play-stage--end');
  stage.classList.remove('play-stage--main');
  stage.innerHTML = isAssessment
    ? card('تمام شد. ممنون از توجهت!', 'فردا هم یک جلسهٔ تازه داری.')
    : (stageMeta && typeof stageMeta.title_fa === 'string'
        ? card('مرحلهٔ «' + esc(stageMeta.title_fa) + '» تمام شد. آفرین!', 'فردا یک مأموریت تازه در راه است.')
        : card('مأموریت امروز تمام شد. خسته نباشی!', 'فردا هم یک مأموریت تازه داری.')) +
      (B.star_basket && starCount > 0
        ? '<p class="play-muted">' + faNum(starCount) + ' ستاره در سبد تو جمع شد.</p>' : '');
  /* صحنهٔ پایان (M2) — ماهی خوشحال + خرچنگ آرام کنار هم؛ فقط تمرین؛ ارزیابی همان پایان آرام قبلی */
  if (!isAssessment) decorateScene(stage, 'end', { svg: kindHero(kindOf(root)) }); // قهرمان این بازی در پایان — پوستهٔ اختصاصی
  /* خلاصهٔ پایان — نگاشت debrief بستهٔ jsPsych (۱.۲۵.۳۴): فقط تمرین؛ ارزیابی هرگز عدد نمی‌بیند؛
     ورودی فقط دادهٔ مجاز کلاینت: نمره از بازخورد سرور (train)، میانهٔ RT از رکوردهای موتور؛
     قاعدهٔ دامنهٔ صفر داخل ماژول نوع‌بازی است — جلسهٔ بی‌آزمون نمره‌خورده هیچ کارتی نمی‌سازد */
  if (!isAssessment && typeof kind.debriefMarkup === 'function') {
    const touchedRts = trials.filter((x) => x.touched === true && Number.isFinite(x.rt_ms)).map((x) => x.rt_ms);
    const debriefHtml = kind.debriefMarkup({
      scored_total: scoredTotal,
      scored_correct: scoredCorrect,
      median_rt: medianOf(touchedRts),
      span_best: spanBest
    }, practiceRetries);
    if (debriefHtml) {
      const debriefEl = document.createElement('div');
      debriefEl.innerHTML = debriefHtml;
      stage.appendChild(debriefEl.firstElementChild);
    }
  }
  fx.revealStage(stage);
  if (!isAssessment && starCount > 0) fx.burstCenter(stage, 10);
  const finishBtn = document.createElement('button');
  finishBtn.type = 'button';
  finishBtn.className = 'play-btn';
  finishBtn.textContent = isAssessment ? 'اتمام جلسه' : 'اتمام مأموریت'; // بدون تکرار «تمام شد» با تیتر کارت (ممیزی فازها)
  finishBtn.addEventListener('click', async () => {
    finishBtn.disabled = true;
    try {
      await api.finish({ session_evidence: { pause_count: pauseTracker.count, pause_total_ms: Math.round(pauseTracker.total_ms) } });
      location.reload(); // سرور حالت child_done را رندر می‌کند
    } catch (err) {
      onNetworkFail();
    }
  });
  stage.appendChild(finishBtn);
  return { summary, starCount, machine };
}

/* ─── کمک‌های UI ─── */

function tapToContinue(stage) {
  return new Promise((resolve) => {
    const onTap = () => {
      stage.removeEventListener('pointerdown', onTap);
      resolve();
    };
    stage.addEventListener('pointerdown', onTap);
  });
}

/** ادامه از INTRO با دکمهٔ بزرگ معرفی — تنها دکمهٔ صفحه؛ لمس و کلیک هر دو (G3/۱.۲۵.۳۷).
 *  اگر دکمه نبود (مدار قدیمی)، ادامه بی‌درنگ — رفتار قبلی محفوظ می‌ماند. */
function bigButtonContinue(stage) {
  return new Promise((resolve) => {
    const btn = stage.querySelector('.play-btn--intro');
    if (!btn) { resolve(); return; }
    const onGo = () => {
      btn.removeEventListener('click', onGo);
      resolve();
    };
    btn.addEventListener('click', onGo);
  });
}

/* خط استریک — فقط نقاط عطف؛ متن بی‌رقارت لحن §۲ */
function streakLine(n) {
  if (n === 3) return faNum(3) + ' تا پشت سر هم!';
  if (n === 5) return faNum(5) + ' تا پشت سر هم! چه تمرکزی!';
  if (n === 10) return faNum(10) + ' تا پشت سر هم! فوق‌العاده‌ای!';
  if (n > 10 && n % 10 === 0) return faNum(n) + ' تا پشت سر هم! می‌درخشی!';
  return null;
}

function setProgress(bar, done, total) {
  if (!bar || !total) return;
  const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  bar.style.width = pct + '%';
}
