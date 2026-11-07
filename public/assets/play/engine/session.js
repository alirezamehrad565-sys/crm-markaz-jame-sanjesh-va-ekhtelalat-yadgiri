/* ═══════════════════════════════════════════════════════════════
   engine/session.js — مدیر جلسه (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
   پنج‌شِمال دفترچهٔ وظیفه §۲: معرفی/آموزش/تمرین/اجرای اصلی/پایان —
   دو حالت مستقل از یک موتور با تنظیمات پروتکل:
     · training  — آموزش بازی‌گوش، بازخورد آموزشی، سبد ستاره، استراحت
     · assessment — دستورالعمل ثابت کوتاه، اجرای بی‌بازخورد/بی‌نمره/بی‌سبد
   هیچ پارامتری هاردکد نیست — همه از اسنپ‌شات پروتکل سرور می‌آید.
   ═══════════════════════════════════════════════════════════════ */

import { STATES, createMachine } from './machine.js';
import { createSleeper } from './timing.js';
import { runTrial } from './trials.js';
import { summarizeSession } from './scoring.js';
import * as fx from '../fx.js';

const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

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
      preview_step_ms: n(p.preview_step_ms, 2000)
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
  const { root, stage, bubble, bar, basketEl, countEl, api, protocol: rawProtocol, kind, hint, stageMeta, onNetworkFail } = ctx;
  const protocol = safeProtocol(rawProtocol);
  const isAssessment = protocol.mode === 'assessment';
  const P = protocol.params;
  const B = protocol.behavior;

  /* پروتکل → صفحه: مقیاس محرک، حالت، سبد */
  root.dataset.mode = protocol.mode === 'assessment' ? 'assessment' : 'training';
  root.style.setProperty('--stim-scale', String(P.stimulus_scale_vmin));
  if (B.star_basket && !isAssessment && basketEl) root.dataset.basket = 'on';
  else if (basketEl) root.removeAttribute('data-basket');

  /* ماشین حالت + ساعت‌ها + گیره‌های مکث آزمون در جریان + ردیابی مکث برگه (فاز ۷) */
  const trialHooks = { pause: null, resume: null };
  const pauseTracker = { count: 0, total_ms: 0, since: null };
  const machine = createMachine((state, from) => {
    const inMain = state === STATES.FIXATION || state === STATES.STIMULUS ||
      state === STATES.RESPONSE_WINDOW || state === STATES.INTER_TRIAL_INTERVAL;
    stage.classList.toggle('play-stage--main', inMain && machine.practiceMode !== true);
  });
  const sleeper = createSleeper();

  /* ─── مکث بر پنهان‌شدن برگه — ماشین به PAUSED می‌رود و برمی‌گردد؛ ساعت آزمون هم مکث می‌کند ─── */
  let pausedFrom = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const s = machine.state;
      if ([STATES.FIXATION, STATES.STIMULUS, STATES.RESPONSE_WINDOW, STATES.INTER_TRIAL_INTERVAL, STATES.PRACTICE, STATES.READY].includes(s)) {
        pausedFrom = s;
        sleeper.pause();
        if (trialHooks.pause) trialHooks.pause();
        if (pauseTracker.since === null) pauseTracker.since = performance.now();
        machine.to(STATES.PAUSED, { from: s });
      }
    } else if (machine.state === STATES.PAUSED && pausedFrom) {
      if (pauseTracker.since !== null) {
        pauseTracker.count += 1;
        pauseTracker.total_ms += performance.now() - pauseTracker.since;
        pauseTracker.since = null;
      }
      if (trialHooks.resume) trialHooks.resume();
      sleeper.resume();
      machine.resumeTo(pausedFrom, { resumed: true });
      pausedFrom = null;
    }
  });

  /* ─── ۱) معرفی — شروع با نخستین لمس ─── */
  machine.to(STATES.INSTRUCTION);
  stage.className = 'play-stage';
  stage.classList.add(isAssessment ? 'play-stage--main' : 'play-stage--teach');
  stage.innerHTML = isAssessment
    ? card('سلام! به دستورالعمل گوش کن.', 'برای شروع، صفحه را لمس کن')
    : card('سلام!', 'برای شروع، صفحه را لمس کن');
  fx.revealStage(stage);
  await tapToContinue(stage);
  stage.className = 'play-stage';

  /* ─── ۲) آموزش/دستورالعمل ─── */
  machine.to(STATES.DEMONSTRATION);
  if (isAssessment) {
    /* ارزیابی: دستورالعمل ثابت کوتاه — بدون شُشی، بدون پیش‌نمایش بازی‌گوش */
    stage.classList.add('play-stage--teach');
    stage.innerHTML = card('وقتی شکل آمد، صفحه را لمس کن؛ وقتیش نیامد، دست نزن.', 'قسمت‌های تمرینی کوتاه اول می‌آیند');
    await sleeper.sleep(P.preview_step_ms);
  } else {
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
      fx.revealStage(stage);
      await sleeper.sleep(Math.min(P.break_min_ms, 2000));
      await tapToContinue(stage);
      stage.className = 'play-stage';
      machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_break: true });
    }

    /* ورود به حلقهٔ آزمون — از READY/PRACTICE */
    await sleeper.sleep(rand(P.isi_min_ms, P.isi_max_ms));

    /* آیتم خط عددی — «جادهٔ عددها» (۱.۲۵.۲۸): نمایش از kinds/numline.js؛ RT از نمایش جاده؛
       پاسخ {chosen} سرور نمره می‌دهد (آستانهٔ authored)؛ شواهد همان قرارداد فاز ۴؛
       بازخورد دو-سطحی + نشان حقیقت فقط در تمرین — ارزیابی بی‌بازخورد/بی‌ستاره/بی‌استریک */
    if (item.type === 'numline' && Array.isArray(item.range) && typeof kind.numlineMarkup === 'function') {
      machine.to(STATES.FIXATION, { item: item.id, numline: true }); // مسیر اجباری ماشین: READY/PRACTICE → FIXATION → STIMULUS
      stage.classList.remove('play-stage--quiet');
      stage.innerHTML = kind.numlineMarkup(item);
      fx.popIn(stage.querySelector('.play-numline__chip'), 240, false);
      machine.to(STATES.STIMULUS, { item: item.id, numline: true });
      const shownAt = performance.now(); // RT از همین لحظه — نه از شروع حلقه
      const pick = await new Promise((resolve) => {
        const road = stage.querySelector('.play-numline__road');
        const onTap = (ev) => {
          ev.preventDefault(); // جادهٔ لمسی — اسکرول اشتباه نمی‌سازد
          road.removeEventListener('pointerdown', onTap);
          resolve({ value: kind.numlineValueFromTap(item, stage, ev), at: performance.now() });
        };
        road.addEventListener('pointerdown', onTap);
      });
      if (pick.value !== null) {
        const guessEl = kind.numlinePlaceGuess(item, stage, pick.value);
        fx.popIn(guessEl, 240, false);
      }
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, numline: true });
      const recordNum = {
        item_id: item.id,
        go: null,
        touched: true,
        rt_ms: Math.round(pick.at - shownAt),
        touch_count: 1,
        premature_count: 0,
        multiple_count: 0,
        out_of_surface_count: 0,
        presented_at: shownAt,
        frame_drops: 0,
        window_ms: null,
        isi_ms: 0,
        events: []
      };
      trials.push(recordNum);
      doneCount += 1;
      let fbN = null;
      try {
        fbN = await api.submit({
          item_id: item.id,
          response: {
            chosen: pick.value,
            presented_at: Math.round(shownAt),
            frame_drops: 0,
            touch_count: 1,
            premature_count: 0,
            multiple_count: 0,
            out_of_surface_count: 0
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
      stage.classList.remove('play-stage--quiet');
      stage.classList.add('play-stage--scan'); // پوستهٔ عدی: شب، حاشیهٔ آژیر، اسکادران
      await sleeper.sleep(400); // تثبیت کوتاه خنثی پیش از موج — بدون فلاش (§۹)
      stage.innerHTML = kind.scanMarkup(item);
      machine.to(STATES.STIMULUS, { item: item.id, scan: true });
      const shownAt = performance.now(); // RT از لحظهٔ نمایش موج — نه از شروع حلقه
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
          freezeBar();
        };
        trialHooks.resume = () => {
          if (wavePausedAt !== null) {
            waveRemain = Math.max(0, waveRemain - (performance.now() - wavePausedAt));
            wavePausedAt = null;
            unfreezeBar(waveRemain);
          }
        };
        const finishWave = () => {
          if (settled) return;
          settled = true;
          sleeper.cancel(); // موج با «گزارش بده!» تمام شد — خواب یدکی یدک نمی‌ماند تا خواب موج بعد را زودرس نبرد (همان قاعدهٔ پنجرهٔ گو/نوگو)
          trialHooks.pause = null;
          trialHooks.resume = null;
          tiles.forEach((b) => b.removeEventListener('pointerdown', onTile));
          if (confirmBtn) confirmBtn.removeEventListener('pointerdown', onConfirm);
          resolve({ hits: [...hits], firstAt, tapCount });
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
      const sortedHits = result.hits.slice().sort((a, b) => a - b);
      const usedMs = Math.round(performance.now() - shownAt);
      const recordScan = {
        item_id: item.id,
        go: null,
        touched: sortedHits.length > 0,
        rt_ms: result.firstAt !== null ? Math.round(result.firstAt - shownAt) : null,
        touch_count: result.tapCount,
        premature_count: 0,
        multiple_count: 0,
        out_of_surface_count: 0,
        presented_at: shownAt,
        frame_drops: 0,
        window_ms: null,
        isi_ms: 0,
        events: [],
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
            frame_drops: 0,
            touch_count: result.tapCount,
            premature_count: 0,
            multiple_count: 0,
            out_of_surface_count: 0
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

    /* آیتم انتخاب زمان‌دار — «حقه‌باز رنگ‌ها» و «گلهٔ فریبکار» (۱.۲۵.۳۲):
       استروپ/فلانکر با پنجرهٔ پاسخ از stim.window_ms؛ بی‌لمس تا پایان پنجره = بی‌پاسخ
       (اُمیشن سمت سرور). نمایش از kinds/<kind>.js (markupFor) و در نبودش قالب عام؛
       RT از لحظهٔ نمایش محرک؛ شواهد همان قرارداد فاز ۴؛ حس عدی در پوستهٔ صحنه —
       گفتار روبه‌کودک آرام (§۲)؛ ارزیابی بی‌بازخورد/بی‌ستاره */
    if ((item.type === 'stroop' || item.type === 'flanker') &&
        (typeof kind.markupFor?.[item.type] === 'function' || (Array.isArray(item.options) && item.options.length > 0))) {
      machine.to(STATES.FIXATION, { item: item.id, timedchoice: true }); // مسیر اجباری ماشین: READY/PRACTICE → FIXATION → STIMULUS
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
        trialHooks.pause = () => { winPausedAt = performance.now(); freezeBar(); };
        trialHooks.resume = () => {
          if (winPausedAt !== null) {
            winRemain = Math.max(0, winRemain - (performance.now() - winPausedAt));
            winPausedAt = null;
            unfreezeBar(winRemain);
          }
        };
        const finishWindow = (val) => {
          if (settled) return;
          settled = true;
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
          finishWindow({ option: Number(btn.dataset.option), at: performance.now() });
        };
        buttons.forEach((b) => b.addEventListener('pointerdown', onTap));
        unfreezeBar(winMs);
        sleeper.sleep(winMs).then(() => finishWindow({ option: null, at: null }));
      });
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, timedchoice: true });
      const recordTc = {
        item_id: item.id,
        go: null,
        touched: pickTc.option !== null,
        rt_ms: pickTc.option !== null ? Math.round(pickTc.at - shownAtTc) : null,
        touch_count: pickTc.option !== null ? 1 : 0,
        premature_count: 0,
        multiple_count: 0,
        out_of_surface_count: 0,
        presented_at: shownAtTc,
        frame_drops: 0,
        window_ms: winMs,
        isi_ms: 0,
        events: [],
        choice_response: { option: pickTc.option, timed_out: pickTc.option === null }
      };
      trials.push(recordTc);
      doneCount += 1;
      let fbT = null;
      try {
        fbT = await api.submit({
          item_id: item.id,
          response: {
            option: pickTc.option,
            timed_out: pickTc.option === null,
            presented_at: Math.round(shownAtTc),
            frame_drops: 0,
            touch_count: recordTc.touch_count,
            premature_count: 0,
            multiple_count: 0,
            out_of_surface_count: 0,
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

    /* آیتم دنباله‌ای — «رد پای دزد» (۱.۲۵.۳۲): ردپاهای شماره‌دار؛ لمس به ترتیب برچسب‌ها.
       ترتیب برچسب‌ها (seq) دانش عمومی خود بازی است (عددهای روبه‌کودک)؛ نگاشت گره→جایگاه
       کلید سروری است و هرگز به کلاینت نمی‌رسد. لمس ترتیب اشتباه = رد همان‌جا قطع می‌شود
       (پایان بی‌سرزنش، §۲)؛ RT از نخستین لمس؛ RT هر گره هم در response می‌ماند */
    if (item.type === 'trail' && typeof kind.markupFor?.[item.type] === 'function' &&
        item.stim && Array.isArray(item.stim.nodes)) {
      machine.to(STATES.FIXATION, { item: item.id, sequence: true }); // مسیر اجباری ماشین
      stage.classList.remove('play-stage--quiet');
      stage.classList.add('play-stage--' + item.type); // پوستهٔ عدی: شب کوچه، دزد فراری
      await sleeper.sleep(250);
      stage.innerHTML = kind.markupFor[item.type](item);
      machine.to(STATES.STIMULUS, { item: item.id, sequence: true });
      const shownAtSq = performance.now(); // RT از لحظهٔ نمایش رد
      const stimSq = item.stim;
      const seqSq = Array.isArray(stimSq.seq) ? stimSq.seq.map((v) => String(v)) : null;
      const resultSq = await new Promise((resolve) => {
        const nodes = stage.querySelectorAll('.play-trail__node');
        const timerBar = stage.querySelector('[class*="__timer"] > span');
        const winSq = typeof stimSq.window_ms === 'number' && Number.isFinite(stimSq.window_ms)
          ? Math.min(30000, Math.max(2000, Math.round(stimSq.window_ms)))
          : 15000;
        const order = [];
        const nodeRts = [];
        let firstAt = null;
        let tapCount = 0;
        let settled = false;
        let winRemain = winSq;
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
        trialHooks.pause = () => { winPausedAt = performance.now(); freezeBar(); };
        trialHooks.resume = () => {
          if (winPausedAt !== null) {
            winRemain = Math.max(0, winRemain - (performance.now() - winPausedAt));
            winPausedAt = null;
            unfreezeBar(winRemain);
          }
        };
        const finishTrail = (timedOut) => {
          if (settled) return;
          settled = true;
          sleeper.cancel(); // رد قطع/کامل شد — خواب یدکی یتیم نمی‌ماند (قاعدهٔ پنجره)
          trialHooks.pause = null;
          trialHooks.resume = null;
          nodes.forEach((b) => b.removeEventListener('pointerdown', onNode));
          resolve({ order, nodeRts, firstAt, tapCount, timedOut, usedMs: Math.round(performance.now() - shownAtSq) });
        };
        const onNode = (ev) => {
          const btn = ev.target.closest('.play-trail__node');
          if (!btn || btn.disabled) return;
          ev.preventDefault();
          tapCount += 1;
          if (firstAt === null) firstAt = performance.now();
          const idx = Number(btn.dataset.idx);
          const nd = stimSq.nodes[idx];
          const expected = seqSq ? seqSq[order.length] : null;
          const okTap = seqSq === null || (expected !== undefined && nd && String(nd.n) === expected);
          if (okTap) {
            order.push(idx);
            nodeRts.push(Math.round(performance.now() - shownAtSq));
            btn.classList.add('play-trail__node--step');
            if (nodes.length > 0 && order.length >= nodes.length) finishTrail(false); // رد کامل شد
          } else {
            finishTrail(false); // رد قطع شد — پایان بی‌سرزنش؛ نمره سرور است
          }
        };
        nodes.forEach((b) => b.addEventListener('pointerdown', onNode));
        unfreezeBar(winSq);
        sleeper.sleep(winSq).then(() => finishTrail(true));
      });
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, sequence: true });
      const recordSq = {
        item_id: item.id,
        go: null,
        touched: resultSq.order.length > 0,
        rt_ms: resultSq.firstAt !== null ? Math.round(resultSq.firstAt - shownAtSq) : null,
        touch_count: resultSq.tapCount,
        premature_count: 0,
        multiple_count: 0,
        out_of_surface_count: 0,
        presented_at: shownAtSq,
        frame_drops: 0,
        window_ms: null,
        isi_ms: 0,
        events: [],
        trail_order: resultSq.order.slice()
      };
      trials.push(recordSq);
      doneCount += 1;
      let fbQ = null;
      try {
        fbQ = await api.submit({
          item_id: item.id,
          response: {
            order: resultSq.order,
            node_rts_ms: resultSq.nodeRts,
            used_ms: resultSq.usedMs,
            timed_out: resultSq.timedOut,
            presented_at: Math.round(shownAtSq),
            frame_drops: 0,
            touch_count: resultSq.tapCount,
            premature_count: 0,
            multiple_count: 0,
            out_of_surface_count: 0
          },
          rt_ms: recordSq.rt_ms,
          idem_key: crypto.randomUUID()
        });
      } catch (err) {
        machine.to(STATES.INTERRUPTED, { reason: 'network', item: item.id });
        onNetworkFail();
        return;
      }
      const okQ = fbQ !== null && typeof fbQ === 'object' && fbQ.correct === true;
      const canFeedbackQ = !isAssessment && fbQ && fbQ.phase === 'train' && fbQ.message && B.feedback_in_main;
      if (canFeedbackQ) {
        fx.popBubble(bubble, fbQ.message, okQ ? 'ok' : 'calm', P.feedback_ms);
        if (!okQ && fbQ.answer_display != null && typeof kind.revealFor?.[item.type] === 'function') {
          // نشان حقیقت — ترتیب درست رد از CSV بازخورد سرور می‌آید؛ فقط تمرین
          kind.revealFor[item.type](item, stage, String(fbQ.answer_display));
          await sleeper.sleep(P.feedback_ms + 600);
        } else {
          if (okQ && typeof kind.pointFor?.[item.type] === 'function') {
            const ptQ = kind.pointFor[item.type](stage);
            if (ptQ) fx.burstAt(ptQ.x, ptQ.y);
          }
          await sleeper.sleep(P.feedback_ms);
        }
      } else {
        await sleeper.sleep(Math.max(400, 600));
      }
      stage.classList.remove('play-stage--' + item.type);
      stage.innerHTML = ''; // صحنه خالی پیش از ISI بعدی — رد شبح نمی‌ماند
      /* سبد ستاره و استریک — همان حلقهٔ گو/نوگو؛ ارزیابی هرگز */
      if (!isAssessment && B.star_basket && fbQ && fbQ.phase === 'train' && okQ) {
        starCount += 1;
        if (countEl) countEl.textContent = faNum(starCount);
        fx.flyStar(stage, basketEl);
        window.setTimeout(() => fx.popCount(countEl), 560);
        if (starCount % 5 === 0) {
          fx.popBubble(bubble, faNum(starCount) + ' ستاره جمع شد!', 'ok', P.feedback_ms);
          await sleeper.sleep(P.feedback_ms);
        }
      }
      if (okQ) streak += 1; else if (fbQ && fbQ.correct === false) streak = 0;
      const streakMsgQ = streakLine(streak);
      if (canFeedbackQ && streakMsgQ) fx.pillShow(streakMsgQ);
      if (machine.state === STATES.INTER_TRIAL_INTERVAL) {
        machine.to(practiceMode ? STATES.PRACTICE : STATES.READY, { after_items: doneCount });
      }
      continue;
    }

    /* آیتم انتخابی (choice) — بدون پنجرهٔ زمانی؛ کف ۲۰۰ms سروری (§۸)؛
       همان کلاس‌های CSS پخش‌کننده؛ پاسخ از کلید گزینه، RT از نمایش هر آیتم
       (۱.۲۵.۲۸ رفع: ساعت قبلاً یک‌بار بیرون حلقه گرفته می‌شد و RT آیتم‌های بعدی تورم داشت) */
    if (item.type === 'choice' && Array.isArray(item.options) && item.options.length > 0) {
      machine.to(STATES.FIXATION, { item: item.id, choice: true }); // مسیر اجباری ماشین (رفع باگ خام)
      stage.classList.remove('play-stage--quiet');
      stage.innerHTML = (item.prompt ? '<p class="play-line">' + esc(item.prompt) + '</p>' : '') +
        '<div class="play-options">' +
        item.options.map((o, i) => '<button type="button" class="play-option" data-option="' + i + '">' + esc(o.label) + '</button>').join('') +
        '</div>';
      machine.to(STATES.STIMULUS, { item: item.id, choice: true });
      const pickStart = performance.now(); // RT از لحظهٔ نمایش همین گزینه‌ها
      const pickAt = await new Promise((resolve) => {
        const buttons = stage.querySelectorAll('.play-option');
        const onTap = (ev) => {
          const btn = ev.target.closest('.play-option');
          if (!btn) return;
          buttons.forEach((b) => b.removeEventListener('pointerdown', onTap));
          resolve({ option: Number(btn.dataset.option), at: performance.now() });
        };
        buttons.forEach((b) => b.addEventListener('pointerdown', onTap));
      });
      machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, choice: true });
      stage.innerHTML = '';
      const recordChoice = {
        item_id: item.id,
        go: null,
        touched: true,
        rt_ms: Math.round(pickAt.at - pickStart),
        touch_count: 1,
        premature_count: 0,
        multiple_count: 0,
        out_of_surface_count: 0,
        presented_at: pickStart,
        frame_drops: 0,
        window_ms: null,
        isi_ms: 0,
        events: [],
        choice_response: { option: pickAt.option }
      };
      trials.push(recordChoice);
      doneCount += 1;
      let fbC = null;
      try {
        fbC = await api.submit({
          item_id: item.id,
          response: recordChoice.choice_response,
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
  fx.revealStage(stage);
  if (!isAssessment && starCount > 0) fx.burstCenter(stage, 10);
  const finishBtn = document.createElement('button');
  finishBtn.type = 'button';
  finishBtn.className = 'play-btn';
  finishBtn.textContent = isAssessment ? 'اتمام جلسه' : 'امروز تمام شد!';
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
