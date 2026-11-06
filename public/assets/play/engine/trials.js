/* ═══════════════════════════════════════════════════════════════
   engine/trials.js — مدیر آزمون (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
   یک آزمون کامل با ماشین حالت: FIXATION → STIMULUS (نمایش واقعی با rAF) →
   RESPONSE_WINDOW → INTER_TRIAL_INTERVAL. مُهر نمایش، افت فریم، premature
   و multiple — همه مستقل از UI ثبت می‌شوند.
   امنیت: کلید پاسخ (گو بودن آیتم) هرگز به کلاینت نمی‌رسد (stripAnswerKeys
   سمت سرور) — موتور فقط نمایش و ثبت می‌کند؛ «درستی» را سرور می‌گوید.
   ═══════════════════════════════════════════════════════════════ */

import { STATES, windowMsFor } from './machine.js';
import { afterPaint, createFrameMonitor, createPausableClock } from './timing.js';
import { collectResponse } from './response.js';

const FIXATION_FALLBACK_MS = 400; /* فقط وقتی پروتکل فاقد fixation_ms باشد — پیش‌فرض امن */

/**
 * اجرای یک آزمون — ورودی ctx:
 *   stage, machine, item, kind, protocol, sleeper, rand, onEvent
 * خروجی: رکورد خام آزمون (مبنای response سرور و گزارش خام فاز ۸)
 */
export async function runTrial(ctx) {
  const { stage, machine, item, kind, protocol, sleeper, rand, hooks, onEvent } = ctx;
  const p = protocol && protocol.params ? protocol.params : {};
  const windowMs = windowMsFor(item, protocol);
  const fixationMs = typeof p.fixation_ms === 'number' && p.fixation_ms > 100 && p.fixation_ms < 2000 ? p.fixation_ms : FIXATION_FALLBACK_MS;

  const events = [];
  const ev = (name, meta) => {
    events.push({ name, at: Math.round(performance.now()), meta: meta ?? null });
    if (onEvent) onEvent(name, meta);
  };

  /* FIXATION — صحنهٔ خالی خنثی (محرک قبلی پاک می‌شود) */
  machine.to(STATES.FIXATION, { item: item.id });
  ev('fixation_start');
  stage.classList.add('play-stage--quiet');
  stage.innerHTML = '';
  await sleeper.sleep(fixationMs);

  /* STIMULUS — نمایش واقعی: paint + دو فریم + پایش افت فریم */
  machine.to(STATES.STIMULUS, { item: item.id });
  stage.classList.remove('play-stage--quiet');
  stage.innerHTML = kind.stimSvg ? kind.stimSvg(item.stim) : '<div class="play-svg"></div>';
  const monitor = createFrameMonitor();
  monitor.start();
  const paintAt = await afterPaint();
  const frameStats = monitor.stop();
  ev('stimulus_presented', { presented_at: Math.round(paintAt), frame_drops: frameStats.drops });

  /* ساعت واکنش از مبنای نمایشِ تأییدشده — گیره‌های مکث visibility */
  const clock = createPausableClock();
  clock.start();
  if (hooks) {
    hooks.pause = () => clock.pause();
    hooks.resume = () => { if (!clock.running) clock.resume(); };
  }

  /* RESPONSE_WINDOW */
  machine.to(STATES.RESPONSE_WINDOW, { window_ms: windowMs });
  ev('response_window_open', { window_ms: windowMs });
  const collector = collectResponse(stage, () => machine.state, clock, {
    canAnswer: () => machine.state === STATES.STIMULUS || machine.state === STATES.RESPONSE_WINDOW,
    onTouch: (kindTouch, ts) => {
      if (kindTouch === 'premature') ev('touch_premature', { at: ts });
      else if (kindTouch === 'multiple') ev('touch_multiple', { at: ts });
      else if (kindTouch === 'out_of_surface') ev('touch_out_of_surface', { at: ts });
    }
  });
  sleeper.sleep(windowMs).then(() => collector.resolveNoResponse()).catch(() => undefined);
  const outcome = await collector.promise;
  sleeper.cancel(); // پاسخ آمد یا پنجره بسته شد — شمارندهٔ پنجره یتیم نمی‌ماند
  if (hooks) { hooks.pause = null; hooks.resume = null; }

  /* INTER_TRIAL_INTERVAL */
  machine.to(STATES.INTER_TRIAL_INTERVAL, { item: item.id, touched: outcome.touched });
  ev('iti_start');

  const isi = rand(
    typeof p.isi_min_ms === 'number' ? p.isi_min_ms : 800,
    typeof p.isi_max_ms === 'number' ? p.isi_max_ms : 1200
  );

  return {
    item_id: item.id,
    go: null, // کلید پاسخ سمت کلاینت نمی‌آید — سرور از آیتم ذخیره‌شده می‌داند
    touched: outcome.touched,
    rt_ms: outcome.rt_ms,
    touch_count: outcome.touch_count,
    premature_count: events.filter((e) => e.name === 'touch_premature').length,
    multiple_count: events.filter((e) => e.name === 'touch_multiple').length,
    out_of_surface_count: events.filter((e) => e.name === 'touch_out_of_surface').length,
    presented_at: Math.round(paintAt),
    frame_drops: frameStats.drops,
    max_frame_delta: frameStats.maxDelta,
    window_ms: windowMs,
    isi_ms: isi,
    events
  };
}
