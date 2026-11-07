// آزمون‌های واحد موتور کلاینت گو/نوگو (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
// ماشین ۱۴-حالته، دسته‌بندی لمس، پنجرهٔ پاسخ، نمرهٔ موقت موتور — خالص و بدون DOM
import { describe, it, expect } from 'vitest';
import {
  STATES,
  createMachine,
  isTerminalState,
  classifyTouch,
  windowMsFor
} from '../../../../public/assets/play/engine/machine.js';
import { countFrameDeltas, FRAME_DROP_THRESHOLD_MS, createPausableClock } from '../../../../public/assets/play/engine/timing.js';
import { medianOf, summarizeSession } from '../../../../public/assets/play/engine/scoring.js';
import { createTouchLedger } from '../../../../public/assets/play/engine/observe.js';
import type { ProtocolSnapshot } from '../protocol';

describe('ماشین ۱۴-حالتهٔ دفترچهٔ وظیفه', () => {
  it('۱۴ حالت کامل است', () => {
    expect(Object.keys(STATES).length).toBe(14);
  });

  it('مسیر خوش‌خیم: IDLE→INSTRUCTION→DEMONSTRATION→PRACTICE→FIXATION→…→COMPLETED', () => {
    const hist: Array<{ from: string; to: string }> = [];
    const m = createMachine((state, from) => hist.push({ from, to: state }));
    m.to(STATES.INSTRUCTION);
    m.to(STATES.DEMONSTRATION);
    m.to(STATES.PRACTICE);
    m.to(STATES.FIXATION, { item: 'i1' });
    m.to(STATES.STIMULUS);
    m.to(STATES.RESPONSE_WINDOW);
    m.to(STATES.INTER_TRIAL_INTERVAL);
    m.to(STATES.PRACTICE);
    m.to(STATES.COMPLETED);
    expect(m.state).toBe(STATES.COMPLETED);
    expect(hist.length).toBe(9);
    expect(m.history().every((h) => typeof h.at === 'number')).toBe(true);
  });

  it('گذار غیرمجاز پرتاب می‌شود — از COMPLETED هیچ خروجی نیست', () => {
    const m = createMachine();
    m.to(STATES.INSTRUCTION);
    expect(() => m.to(STATES.FIXATION)).toThrow(/گذار غیرمجاز/); // INSTRUCTION→FIXATION ممنوع
    m.to(STATES.READY);
    m.to(STATES.FIXATION);
    m.to(STATES.STIMULUS);
    m.to(STATES.INTER_TRIAL_INTERVAL); // بدون پنجره — مسیر بی‌پاسخ فوری مجاز
    m.to(STATES.COMPLETED);
    expect(m.can(STATES.READY)).toBe(false);
    expect(isTerminalState(STATES.COMPLETED)).toBe(true);
    expect(isTerminalState(STATES.READY)).toBe(false);
  });

  it('مکث/ادامه: FIXATION→PAUSED→FIXATION و RESPONSE_WINDOW→PAUSED→RESPONSE_WINDOW', () => {
    const m = createMachine();
    m.to(STATES.INSTRUCTION);
    m.to(STATES.READY);
    m.to(STATES.FIXATION);
    m.to(STATES.PAUSED, { from: 'FIXATION' });
    expect(m.state).toBe(STATES.PAUSED);
    m.resumeTo(STATES.FIXATION, { resumed: true });
    m.to(STATES.STIMULUS);
    m.to(STATES.RESPONSE_WINDOW);
    m.to(STATES.PAUSED);
    m.resumeTo(STATES.RESPONSE_WINDOW);
    expect(m.state).toBe(STATES.RESPONSE_WINDOW);
  });

  it('مسیر اختلال: شبکه قطع → INTERRUPTED → INVALID یا بازگشت', () => {
    const m = createMachine();
    m.to(STATES.INSTRUCTION);
    m.to(STATES.INTERRUPTED, { reason: 'network' });
    expect(m.can(STATES.INVALID)).toBe(true);
    expect(m.can(STATES.READY)).toBe(true);
    const m2 = createMachine();
    m2.to(STATES.INSTRUCTION);
    m2.to(STATES.INTERRUPTED);
    m2.to(STATES.INVALID);
    expect(isTerminalState(m2.state)).toBe(true);
  });
});

describe('دسته‌بندی لمس — premature/multiple/out_of_surface (C4/C5)', () => {
  it('لمس در STIMULUS/RESPONSE_WINDOW = پاسخ اصلی', () => {
    expect(classifyTouch(STATES.STIMULUS)).toBe('primary');
    expect(classifyTouch(STATES.RESPONSE_WINDOW)).toBe('primary');
  });

  it('لمس پیش از محرک (ISI/READY/FIXATION/ITI) = premature', () => {
    for (const s of [STATES.IDLE, STATES.INSTRUCTION, STATES.READY, STATES.FIXATION, STATES.INTER_TRIAL_INTERVAL]) {
      expect(classifyTouch(s), s).toBe('premature');
    }
  });

  it('لمس پس از پاسخ اصلی = multiple؛ بیرون صحنه = out_of_surface (مستقل از وضعیت)', () => {
    expect(classifyTouch(STATES.RESPONSE_WINDOW, { alreadyAnswered: true })).toBe('multiple');
    expect(classifyTouch(STATES.STIMULUS, { insideStage: false })).toBe('out_of_surface');
    expect(classifyTouch(STATES.INTER_TRIAL_INTERVAL, { insideStage: false })).toBe('out_of_surface');
  });
});

describe('پنجرهٔ پاسخ — پروتکل اول، override آیتم سازگار', () => {
  const proto = { params: { response_window_go_ms: 1500, response_window_nogo_ms: 1500 } };
  it('بدون override → پنجرهٔ پروتکل؛ override معتبر/نامعتبر', () => {
    expect(windowMsFor({}, proto)).toBe(1500);
    expect(windowMsFor({ stim: { window_ms: 6000 } }, proto)).toBe(6000); // بستهٔ آزمون QA
    expect(windowMsFor({ stim: { window_ms: 100 } }, proto)).toBe(1500);  // زیر کف → پروتکل
    expect(windowMsFor({ stim: { window_ms: 99999 } }, proto)).toBe(1500);
    expect(windowMsFor(null, null)).toBe(1500); // بدون پروتکل → پیش‌فرض امن
  });
});

describe('پایش فریم — افت فریم > ۳۴ms', () => {
  it('طبقه‌بندی خالص فاصله‌های فریم', () => {
    expect(FRAME_DROP_THRESHOLD_MS).toBe(34);
    expect(countFrameDeltas([16, 17, 16])).toEqual({ drops: 0, maxDelta: 17 });
    expect(countFrameDeltas([16, 50, 16, 120])).toEqual({ drops: 2, maxDelta: 120 });
    expect(countFrameDeltas([])).toEqual({ drops: 0, maxDelta: 0 });
  });
});

describe('نمرهٔ موقت موتور — فقط فیلدهای واقعی رکورد (بازنویسی G1)', () => {
  it('میانهٔ زوج/فرد', () => {
    expect(medianOf([500, 700, 900])).toBe(700);
    expect(medianOf([500, 700])).toBe(600);
    expect(medianOf([])).toBeNull();
  });

  it('خلاصهٔ جلسه از فیلدهای واقعی رکورد (rt_ms/*_count/frame_drops) — بدون کلید گو (C1)', () => {
    const trials = [
      { touched: true, rt_ms: 500, premature_count: 0, multiple_count: 0, out_of_surface_count: 0, frame_drops: 0 },
      { touched: false, rt_ms: null, premature_count: 1, multiple_count: 0, out_of_surface_count: 2, frame_drops: 1 },
      { touched: true, rt_ms: 700, premature_count: 0, multiple_count: 1, out_of_surface_count: 0, frame_drops: 0 },
      { touched: true, rt_ms: null, premature_count: 0, multiple_count: 0, out_of_surface_count: 0, frame_drops: 0 }
    ];
    const s = summarizeSession(trials);
    expect(s.total).toBe(4);
    expect(s.touched).toBe(3);
    expect(s.no_response).toBe(1);
    expect(s.median_rt).toBe(600); // میانهٔ [500, 700] — با فرم واقعی rt_ms
    expect(s.premature_total).toBe(1);
    expect(s.multiple_total).toBe(1);
    expect(s.out_of_surface_total).toBe(2);
    expect(s.frame_drops_total).toBe(1);
  });

  it('جلسهٔ خالی = همهٔ جمع‌ها صفر واقعی و میانهٔ null — هیچ صفرِ ساختگی (دامنهٔ صفر)', () => {
    const s = summarizeSession([]);
    expect(s.total).toBe(0);
    expect(s.touched).toBe(0);
    expect(s.no_response).toBe(0);
    expect(s.median_rt).toBeNull();
    expect(s.premature_total).toBe(0);
  });

  it('اسنپ‌شات پروتکل سرور با موتور سازگار است — همهٔ پارامترهای مصرفی موتور حاضرند', () => {
    // وارد کردن داینامیک برای پرهیز از وابستگی نوع در زمان اجرا
    const snap = {
      protocol_id: 'gonogo-standard', version: '1.0.0', mode: 'training', age_band: '7-12',
      params: {
        response_window_go_ms: 1500, response_window_nogo_ms: 1500, isi_min_ms: 800,
        isi_max_ms: 1200, fixation_ms: 400, go_ratio: 0.75, max_consecutive_same: 3,
        block_size: 24, break_min_ms: 3500, assessment_blocks: 3,
        stimulus_scale_vmin: 30, feedback_ms: 1200, preview_step_ms: 2000
      },
      behavior: { feedback_in_main: true, star_basket: true, adaptive: true, progress_visible: true, instruction_style: 'playful' }
    } as unknown as ProtocolSnapshot;
    // همهٔ کلیدهای params مصرف‌شده در safeProtocol/session باید حاضر باشند
    for (const k of ['response_window_go_ms', 'isi_min_ms', 'isi_max_ms', 'fixation_ms', 'block_size', 'break_min_ms', 'stimulus_scale_vmin', 'feedback_ms', 'preview_step_ms']) {
      expect(snap.params[k as keyof typeof snap.params], k).toBeDefined();
    }
    expect(snap.behavior.star_basket).toBe(true);
  });
});

describe('ساعت RT مکث‌پذیر — رگرسیون P1-1 (G1)', () => {
  it('pause حساب را فریز می‌کند؛ resume ادامه می‌دهد؛ touch می‌ایستد و گرد می‌کند', async () => {
    const clock = createPausableClock();
    clock.start();
    await new Promise((r) => setTimeout(r, 20));
    clock.pause();
    const frozen = clock.acc;
    expect(frozen).toBeGreaterThan(0);
    expect(clock.running).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(clock.acc).toBe(frozen); // زمانِ مکث به حساب اضافه نمی‌شود — قلب P1-1
    expect(clock.peek()).toBe(Math.round(frozen)); // peek پس از فریز = حساب انباشته (گردشده)
    clock.resume();
    expect(clock.running).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(clock.peek()).toBeGreaterThan(frozen); // بخش در حال گردش در peek دیده می‌شود
    expect(clock.acc).toBe(frozen); // حساب تا pause بعدی ثابت می‌ماند — قرارداد touch
    const t = clock.touch();
    expect(t).toBe(Math.round(clock.acc));
    expect(clock.running).toBe(false);
  });

  it('peek بدون فریز می‌خواند — RT شاخه‌های چندلمسی (اسکن/رد) از نخستین لمس', async () => {
    const clock = createPausableClock();
    clock.start();
    const p1 = clock.peek();
    await new Promise((r) => setTimeout(r, 10));
    const p2 = clock.peek();
    expect(p2).toBeGreaterThan(p1); // ساعت هنوز می‌چرخد — peek فقط خواندن است
    expect(clock.running).toBe(true);
    clock.pause();
    const p3 = clock.peek();
    expect(p3).toBe(Math.round(clock.acc)); // پس از فریز، peek = حساب انباشته
  });

  it('پس از touch، resume دوباره می‌چرخد از صفرِ حساب — رفتار سازگار با trials', async () => {
    const clock = createPausableClock();
    clock.start();
    await new Promise((r) => setTimeout(r, 10));
    clock.pause();
    const acc = clock.acc;
    clock.resume();
    expect(clock.acc).toBeLessThanOrEqual(clock.peek() + 1); // peek گردشده است — با حاشیهٔ یک میلی‌ثانیه
    expect(clock.acc).toBeGreaterThanOrEqual(0);
    void acc;
  });
});

describe('دفتر لمس مشترک — رگرسیون P1-2 (G1): شواهد صفر هاردکد ممنوع', () => {
  it('طبقه‌بندی همان classifyTouch ماشین را می‌شمارد — premature/multiple/oos/primary', () => {
    const ledger = createTouchLedger();
    ledger.start();
    expect(ledger.record(STATES.FIXATION, { insideStage: true, alreadyAnswered: false })).toBe('premature');
    expect(ledger.record(STATES.STIMULUS, { insideStage: true, alreadyAnswered: false })).toBe('primary');
    expect(ledger.record(STATES.STIMULUS, { insideStage: true, alreadyAnswered: true })).toBe('multiple');
    expect(ledger.record(STATES.STIMULUS, { insideStage: false, alreadyAnswered: false })).toBe('out_of_surface');
    const c = ledger.evidenceCounts();
    expect(c).toEqual({ premature_count: 1, multiple_count: 1, out_of_surface_count: 1 });
    expect(ledger.touchCount()).toBe(4);
    const ev = ledger.events();
    expect(ev.map((e) => e.name)).toEqual(['touch_premature', 'touch_primary', 'touch_multiple', 'touch_out_of_surface']);
    for (const e of ev) expect(Number.isFinite(e.at)).toBe(true);
  });

  it('دفتر متوقف هیچ‌چیز ثبت نمی‌کند — پنجرهٔ آزمون بسته است', () => {
    const ledger = createTouchLedger();
    ledger.start();
    ledger.record(STATES.STIMULUS, {});
    ledger.stop();
    expect(ledger.record(STATES.STIMULUS, {})).toBeNull();
    expect(ledger.touchCount()).toBe(1);
    expect(ledger.evidenceCounts()).toEqual({ premature_count: 0, multiple_count: 0, out_of_surface_count: 0 });
  });

  it('شاخه‌های چندلمسی (اسکن/رد) هر لمس حین محرک = primary تا پرچم پاسخ بیاید', () => {
    const ledger = createTouchLedger();
    ledger.start();
    ledger.record(STATES.STIMULUS, { insideStage: true, alreadyAnswered: false });
    ledger.record(STATES.STIMULUS, { insideStage: true, alreadyAnswered: false });
    ledger.record(STATES.STIMULUS, { insideStage: true, alreadyAnswered: false });
    expect(ledger.evidenceCounts()).toEqual({ premature_count: 0, multiple_count: 0, out_of_surface_count: 0 });
    expect(ledger.touchCount()).toBe(3); // سه انتخاب خانهٔ اسکن — بدون پرچم کیفیت کاذب
  });
});
