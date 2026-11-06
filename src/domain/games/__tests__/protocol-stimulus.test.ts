// آزمون‌های فاز ۱ بازطراحی گو/نوگو (۱.۲۵.۱۱) — پروتکل، مولد محرک seed-دار، فرمول‌های درصدی
import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  PROTOCOL_ID,
  bandForAge,
  protocolFor,
  protocolForAge,
  protocolSnapshotOf,
  isProtocolVersionSupported
} from '../protocol';
import { TONE_RULES_BASE } from '../pure';
import {
  generateSequence,
  reproduceSequence,
  serializeSequence,
  mulberry32,
  seedToNumber
} from '../stimulus';
import {
  correctGoPctOf,
  correctNogoPctOf,
  commissionPctOf,
  omissionPctOf,
  computeMetricValue,
  runPublishGates,
  scoreAttempt
} from '../pure';
import type { MissionConfig, MissionItem, PackageBody } from '../types';
import type { ScoredAttempt } from '../pure';

// ─── پروتکل ───

describe('پروتکل نسخه‌دار گو/نوگو', () => {
  it('نسخهٔ پروتکل semver و شناسهٔ ثابت دارد', () => {
    expect(/^\d+\.\d+\.\d+$/.test(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_ID).toBe('gonogo-standard');
    expect(isProtocolVersionSupported(PROTOCOL_VERSION)).toBe(true);
    expect(isProtocolVersionSupported('9.9.9')).toBe(false);
    expect(isProtocolVersionSupported(undefined)).toBe(false);
    expect(isProtocolVersionSupported('خراب')).toBe(false);
  });

  it('باند سنی: ۴–۶ و ۷–۱۲ — بیرون از باند با پرچم clamp، بی‌سن پیش‌فرض ۷–۱۲', () => {
    expect(bandForAge(4).band).toBe('4-6');
    expect(bandForAge(6).band).toBe('4-6');
    expect(bandForAge(7).band).toBe('7-12');
    expect(bandForAge(12).band).toBe('7-12');
    expect(bandForAge(3)).toEqual({ band: '4-6', clamped: true });
    expect(bandForAge(13)).toEqual({ band: '7-12', clamped: true });
    expect(bandForAge(null)).toEqual({ band: '7-12', clamped: false });
    expect(bandForAge(undefined).clamped).toBe(false);
  });

  it('هر پارامتر در هر (حالت×باند) مقدار + مبنا + وضعیت تأیید دارد — هیچ خانهٔ تهی', () => {
    for (const mode of ['training', 'assessment'] as const) {
      for (const band of ['4-6', '7-12'] as const) {
        const p = protocolFor(mode, band);
        expect(p.version).toBe(PROTOCOL_VERSION);
        const entries = Object.entries(p.params);
        expect(entries.length).toBeGreaterThanOrEqual(10);
        for (const [key, v] of entries) {
          expect(Number.isFinite(v.value), `${mode}/${band}/${key} عدد نیست`).toBe(true);
          expect(v.value > 0, `${mode}/${band}/${key} صفر است`).toBe(true);
          expect(v.rationale.length >= 10, `${mode}/${band}/${key} بی‌مبناست`).toBe(true);
          expect(['validated', 'pilot', 'proposed']).toContain(v.status);
        }
      }
    }
  });

  it('رفتار دو حالت مستقل: ارزیابی بی‌بازخورد/بی‌ستاره/بی‌سازگار — تمرین هر سه دارد', () => {
    const a = protocolFor('assessment', '7-12');
    const t = protocolFor('training', '7-12');
    expect(a.behavior.feedback_in_main).toBe(false);
    expect(a.behavior.star_basket).toBe(false);
    expect(a.behavior.adaptive).toBe(false);
    expect(a.behavior.progress_visible).toBe(false);
    expect(t.behavior.feedback_in_main).toBe(true);
    expect(t.behavior.star_basket).toBe(true);
    expect(t.behavior.adaptive).toBe(true);
    expect(a.behavior.instruction_style).toBe('standard');
    expect(t.behavior.instruction_style).toBe('playful');
  });

  it('باند ۴–۶ پنجرهٔ پاسخ بلندتر و مقیاس محرک بزرگ‌تر از ۷–۱۲ دارد', () => {
    const y = protocolFor('training', '4-6').params;
    const o = protocolFor('training', '7-12').params;
    expect(y.response_window_go_ms.value).toBeGreaterThan(o.response_window_go_ms.value);
    expect(y.stimulus_scale_vmin.value).toBeGreaterThan(o.stimulus_scale_vmin.value);
    expect(y.block_size.value).toBeLessThan(o.block_size.value);
  });

  it('ارزیابی بلوک‌های استاندارد و پنجرهٔ ثابت دارد؛ سازگاری در ارزیابی ممنوع', () => {
    const a = protocolFor('assessment', '7-12');
    expect(a.params.assessment_blocks.value).toBeGreaterThanOrEqual(2);
    expect(a.behavior.adaptive).toBe(false);
  });

  it('protocolForAge باند + پرچم clamp می‌دهد؛ snapshot فقط اعداد عملیاتی', () => {
    const p = protocolForAge('training', 5);
    expect(p.age_band).toBe('4-6');
    expect(p.age_clamped).toBe(false);
    const snap = protocolSnapshotOf(p);
    expect(snap.params.response_window_go_ms).toBe(2000);
    expect(snap.behavior.star_basket).toBe(true);
    expect(JSON.stringify(snap).length).toBeLessThan(600);
    // بدون مبنا در snapshot — صرفهٔ ذخیره‌سازی
    expect(JSON.stringify(snap).includes('rationale')).toBe(false);
  });
});

// ─── مولد محرک ───

describe('مولد محرک seed-دار', () => {
  const OPTS = { seed: 'جلسه-۱۲۳', count: 72, goRatio: 0.75, maxConsecutiveSame: 3, blockSize: 24 };

  it('قطعیت: همان seed → عین همان دنباله (آزمون طلایی)', () => {
    const a = generateSequence(OPTS);
    const b = generateSequence(OPTS);
    expect(a.trials).toEqual(b.trials);
    expect(a.go_count).toBe(b.go_count);
    // طلایی: نخستین ۱۲ دسته با seed ثابت — بازتولید آیندهٔ همین خروجی را الزام می‌کند
    expect(a.trials.slice(0, 12).map((t) => t.kind)).toEqual([
      'go', 'go', 'go', 'nogo', 'go', 'go', 'go', 'nogo', 'go', 'go', 'nogo', 'go'
    ]);
    expect(a.go_count).toBe(54);
  });

  it('seed متفاوت → دنبالهٔ متفاوت (ریتم قابل حفظ‌کردن نمی‌سازد)', () => {
    const a = generateSequence(OPTS);
    const b = generateSequence({ ...OPTS, seed: 'جلسه-۱۲۴' });
    expect(JSON.stringify(a.trials.map((t) => t.kind))).not.toBe(JSON.stringify(b.trials.map((t) => t.kind)));
  });

  it('نسبت: شمارش گو دقیقاً round(count×ratio)', () => {
    expect(generateSequence(OPTS).go_count).toBe(Math.round(72 * 0.75));
    expect(generateSequence({ ...OPTS, count: 40, goRatio: 0.75 }).go_count).toBe(30);
    expect(generateSequence({ ...OPTS, count: 33, goRatio: 0.5 }).go_count).toBe(17);
    expect(generateSequence({ ...OPTS, count: 20, goRatio: 0.8, maxConsecutiveSame: 4 }).go_count).toBe(16);
  });

  it('سقف تکرار پیاپی: هیچ اجرایی از max بلندتر نیست — در چند seed', () => {
    for (const seed of ['a', 'ب', 'cc-7', 'seed-طولانی-۱۲۳', 'x']) {
      const seq = generateSequence({ ...OPTS, seed });
      let run = 1;
      for (let i = 1; i < seq.trials.length; i++) {
        run = seq.trials[i].kind === seq.trials[i - 1].kind ? run + 1 : 1;
        expect(run <= seq.max_consecutive_same, `seed=${seed} اجرای ${run} تایی در ${i}`).toBe(true);
      }
    }
  });

  it('بلوک‌بندی: اندیس و بلوک درست', () => {
    const seq = generateSequence(OPTS);
    expect(seq.trials[0].block).toBe(1);
    expect(seq.trials[23].block).toBe(1);
    expect(seq.trials[24].block).toBe(2);
    expect(seq.trials[71].block).toBe(3);
    expect(seq.trials.map((t) => t.index)).toEqual(Array.from({ length: 72 }, (_, i) => i + 1));
  });

  it('بازتولید از رکورد ذخیره‌شده + سریالی‌سازی فشرده', () => {
    const seq = generateSequence(OPTS);
    const json = serializeSequence(seq);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const again = reproduceSequence({
      seed: parsed.seed as string,
      count: parsed.count as number,
      goRatio: parsed.go_ratio as number,
      maxConsecutiveSame: parsed.max_consecutive_same as number,
      blockSize: parsed.block_size as number
    });
    expect(again.trials).toEqual(seq.trials);
    expect(parsed.kinds).toBe(seq.trials.map((t) => (t.kind === 'go' ? 'g' : 'n')).join(''));
  });

  it('حالت‌های مرزی: ratio صفر/یک و پیکربندی ناممکن به نزدیک‌ترین نسبت ممکن می‌نشیند', () => {
    const allGo = generateSequence({ ...OPTS, goRatio: 1, count: 10 });
    expect(allGo.go_count).toBe(10);
    const allNogo = generateSequence({ ...OPTS, goRatio: 0, count: 10 });
    expect(allNogo.go_count).toBe(0);
    // ۹ گو و ۱ نوگو با سقف ۳ ناممکن است — نسبت به سقف امکان قطعی می‌نشیند (هرگز دنبالهٔ شکسته نمی‌سازد)
    const tight = generateSequence({ ...OPTS, count: 10, goRatio: 0.9, maxConsecutiveSame: 3 });
    let run = 1;
    for (let i = 1; i < tight.trials.length; i++) {
      run = tight.trials[i].kind === tight.trials[i - 1].kind ? run + 1 : 1;
      expect(run <= 3).toBe(true);
    }
    expect(tight.go_count).toBeLessThanOrEqual(6); // (۱ نوگو+۱)×۳ سقف گو
  });

  it('PRNG پایه قطعی است', () => {
    const a = mulberry32(seedToNumber('s'));
    const b = mulberry32(seedToNumber('s'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

// ─── فرمول‌های درصدی ───

function s(partial: Partial<ScoredAttempt>): ScoredAttempt {
  return {
    itemId: 'x', phase: 'probe', correct: false, rtMs: null, rtValid: true,
    ...partial
  };
}

describe('فرمول‌های درصدی گو/نوگو با قاعدهٔ دامنهٔ صفر', () => {
  // سناریوی مرجع: ۱۰ گو (۸ درست، ۲ اُمیشن) + ۶ نوگو (۵ بازداری درست، ۱ کمیسیون)
  const REF: ScoredAttempt[] = [
    s({ isGo: true, correct: true }), s({ isGo: true, correct: true, rtMs: 500 }),
    s({ isGo: true, correct: true, rtMs: 700 }), s({ isGo: true, correct: true, rtMs: 900 }),
    s({ isGo: true, correct: true, rtMs: 1100 }), s({ isGo: true, correct: true, rtMs: 1300 }),
    s({ isGo: true, correct: true, rtMs: 1500 }), s({ isGo: true, correct: true, rtMs: 1700 }),
    s({ isGo: true, correct: false, omission: true }), s({ isGo: true, correct: false, omission: true }),
    s({ isGo: false, correct: true }), s({ isGo: false, correct: true }),
    s({ isGo: false, correct: true }), s({ isGo: false, correct: true }),
    s({ isGo: false, correct: true }), s({ isGo: false, correct: false, commission: true })
  ];

  it('مقادیر طلایی سناریوی مرجع', () => {
    expect(correctGoPctOf(REF)).toBe(80);
    expect(correctNogoPctOf(REF)).toBe(83.33);
    expect(commissionPctOf(REF)).toBe(16.67);
    expect(omissionPctOf(REF)).toBe(20);
    // شمارش‌های قدیمی دست‌نخورده
    expect(computeMetricValue('commission', REF)).toBe(1);
    expect(computeMetricValue('omission', REF)).toBe(2);
  });

  it('دامنهٔ صفر → null، نه صفرِ ساختگی', () => {
    const onlyGo = [s({ isGo: true, correct: true })];
    const onlyNogo = [s({ isGo: false, correct: true })];
    expect(commissionPctOf(onlyGo)).toBeNull();
    expect(omissionPctOf(onlyNogo)).toBeNull();
    expect(correctNogoPctOf(onlyGo)).toBeNull();
    expect(correctGoPctOf(onlyNogo)).toBeNull();
    expect(computeMetricValue('commission_pct', onlyGo)).toBeNull();
    expect(computeMetricValue('omission_pct', onlyNogo)).toBeNull();
  });

  it('آیتم‌های غیرگو/نوگو (choice/numline) به هیچ جمع گو/نوگو وارد نمی‌شوند', () => {
    const mixed = [s({ isGo: true, correct: true }), s({ correct: true }), s({ correct: true })];
    expect(correctGoPctOf(mixed)).toBe(100);
    expect(correctNogoPctOf(mixed)).toBeNull();
    expect(commissionPctOf(mixed)).toBeNull();
  });

  it('scoreAttempt اکنون isGo را برای touch_report پر می‌کند', () => {
    const m = { id: 'm', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo', items: [] } as unknown as MissionConfig;
    const go: MissionItem = { id: 'g1', phase: 'probe', type: 'touch_report', correct_touch: true };
    const nogo: MissionItem = { id: 'n1', phase: 'probe', type: 'touch_report', correct_touch: false };
    expect(scoreAttempt(go, m, { touched: true }, 500).isGo).toBe(true);
    expect(scoreAttempt(nogo, m, { touched: true }, 500).isGo).toBe(false);
    expect(scoreAttempt(nogo, m, { touched: true }, 500).commission).toBe(true);
  });
});

// ─── گیت انتشار حالت ارزیابی ───

function bodyOf(over: Partial<PackageBody>): PackageBody {
  return {
    package_id: 'gonogo-std',
    goals: ['inhibition'],
    tone_rules: [...TONE_RULES_BASE],
    missions: [{
      id: 'm1', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
      mastery: { threshold: 80, sessions: 2 },
      items: [
        { id: 't1', phase: 'train', type: 'touch_report', correct_touch: true },
        { id: 'p1', phase: 'probe', type: 'touch_report', correct_touch: true }
      ]
    }],
    ...over
  };
}

const GATE_CTX = { metricIds: new Set(['accuracy_gonogo']), goalIds: new Set(['inhibition']) };
const DOSE = { days_per_week: 3, minutes: 10, max_missions_per_day: 1, min_weeks: 4 };

describe('گیت انتشار دو حالت مستقل', () => {
  it('تمرین بدون mode (بستهٔ قدیمی) همچنان سبز می‌گذرد — سازگاری کامل', () => {
    expect(runPublishGates(bodyOf({}), DOSE, 'B', GATE_CTX)).toEqual([]);
  });

  it('ارزیابی بدون پروتکل رد می‌شود', () => {
    const errs = runPublishGates(bodyOf({ mode: 'assessment' }), DOSE, 'B', GATE_CTX);
    expect(errs.some((e) => e.rule === 'protocol')).toBe(true);
  });

  it('ارزیابی با پروتکل نسخهٔ ناهم‌خوان رد می‌شود', () => {
    const errs = runPublishGates(
      bodyOf({ mode: 'assessment', protocol: { id: PROTOCOL_ID, version: '0.0.1' } }),
      DOSE, 'B', GATE_CTX
    );
    expect(errs.some((e) => e.rule === 'protocol')).toBe(true);
  });

  it('ارزیابی با پروتکل هم‌نسخهٔ جاری سبز می‌گذرد', () => {
    const errs = runPublishGates(
      bodyOf({ mode: 'assessment', protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION } }),
      DOSE, 'B', GATE_CTX
    );
    expect(errs).toEqual([]);
  });

  it('mode ناشناخته رد می‌شود', () => {
    const errs = runPublishGates(bodyOf({ mode: 'hybrid' as never }), DOSE, 'B', GATE_CTX);
    expect(errs.some((e) => e.rule === 'mode')).toBe(true);
  });
});
