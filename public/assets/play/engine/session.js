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
  const { root, stage, bubble, bar, basketEl, countEl, api, protocol: rawProtocol, kind, hint, onNetworkFail } = ctx;
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

  /* ─── ۳) حلقهٔ مأموریت — تمرین/اجرای اصلی از یک موتور ─── */
  machine.to(isAssessment ? STATES.READY : STATES.PRACTICE);
  const trials = [];
  let starCount = 0;
  let streak = 0;
  let doneCount = 0;
  let practiceMode = true; // تا نخستین آیتم اصلی (فاز پروب/آیتم‌های جاری در ارزیابی)
  machine.practiceMode = practiceMode;

  /* ساعت شروع آزمون انتخابی — RT از لحظهٔ نمایش گزینه‌ها */
  const pickStart = performance.now();

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

    /* آیتم انتخابی (choice) — بدون پنجرهٔ زمانی؛ کف ۲۰۰ms سروری (§۸)؛
       همان کلاس‌های CSS پخش‌کننده؛ پاسخ از کلید گزینه، RT از نمایش */
    if (item.type === 'choice' && Array.isArray(item.options) && item.options.length > 0) {
      machine.to(STATES.STIMULUS, { item: item.id, choice: true });
      stage.classList.remove('play-stage--quiet');
      stage.innerHTML = (item.prompt ? '<p class="play-line">' + esc(item.prompt) + '</p>' : '') +
        '<div class="play-options">' +
        item.options.map((o, i) => '<button type="button" class="play-option" data-option="' + i + '">' + esc(o.label) + '</button>').join('') +
        '</div>';
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
    : card('مأموریت امروز تمام شد. خسته نباشی!', 'فردا هم یک مأموریت تازه داری.') +
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
