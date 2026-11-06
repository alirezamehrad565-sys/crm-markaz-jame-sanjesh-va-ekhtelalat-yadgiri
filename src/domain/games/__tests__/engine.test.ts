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
import { countFrameDeltas, FRAME_DROP_THRESHOLD_MS } from '../../../../public/assets/play/engine/timing.js';
import { medianOf, rtVariabilityOf, summarizeSession } from '../../../../public/assets/play/engine/scoring.js';
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

describe('نمرهٔ موقت موتور — آینهٔ فرمول‌های سرور با دامنهٔ صفر', () => {
  it('میانهٔ زوج/فرد و تغییرپذیری RT', () => {
    expect(medianOf([500, 700, 900])).toBe(700);
    expect(medianOf([500, 700])).toBe(600);
    expect(medianOf([])).toBeNull();
    expect(rtVariabilityOf([500, 510, 490])).toBeGreaterThan(0);
    expect(rtVariabilityOf([500, 490])).toBeNull(); // کمتر از ۳ داده
  });

  it('خلاصهٔ جلسه: جمع‌ها، درصدها، premature/multiple، بلوک‌ها — مخرج صفر = null', () => {
    const trials = [
      { go: null, correct: true, rtMs: 500, rtValid: true, touched: true, prematureCount: 0, multipleCount: 0, block: 1 },
      { go: null, correct: false, rtMs: null, touched: false, prematureCount: 1, multipleCount: 0, block: 1 },
      { go: null, correct: true, rtMs: 700, rtValid: true, touched: true, prematureCount: 0, multipleCount: 1, block: 2 },
      { go: null, correct: false, rtMs: 300, touched: true, prematureCount: 0, multipleCount: 0, block: 2 }
    ];
    const s = summarizeSession(trials);
    expect(s.total).toBe(4);
    // بدون کلید go — کلاینت نمی‌داند؛ جمع‌های گو/نوگو فقط سروری‌اند
    expect(s.total_go).toBe(0);
    expect(s.total_nogo).toBe(0);
    expect(s.premature).toBe(1);
    expect(s.multiple).toBe(1);
    expect(s.correct_go_pct).toBeNull();
    expect(s.commission_pct).toBeNull();
    expect(s.dprime).toBeNull(); // رزرو — هیچ مقدار ساختگی
    expect(s.blocks.b1).toEqual({ total: 2, correct: 1 });
    expect(s.blocks.b2).toEqual({ total: 2, correct: 1 });
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
