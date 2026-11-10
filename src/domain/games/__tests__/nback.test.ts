// golden tests ۱.۲۵.۴۰ — بازی هفتم «آلبوم خرچنگ» (nback / ن‌پشت همسانی دیداری) — پلهٔ ۱ سمت سرور
// قراردادها این‌جا قفل می‌شوند: دوگزینه‌ای «همان است/فرق دارد» با نمره‌دهی سرور، سد نشتی کلید
// همسانی (match) در هر عمق، چرخش لنگر-مقید ضدحفظ و قاعدهٔ دامنهٔ صفر در فرمول‌ها.
import { describe, expect, it } from 'vitest';
import {
  answerDisplayOf,
  computeMetricValue,
  nbackFaPctOf,
  nbackMatchPctOf,
  nbackMissPctOf,
  nbackNonmatchPctOf,
  scoreAttempt,
  stripAnswerKeys,
  toItemView,
  type ScoredAttempt
} from '../pure';
import {
  GAME_KIND_IDS,
  GAME_KINDS,
  NBACK_THRESHOLDS,
  NBACK_STAGE_LEVELS,
  nbackItemInStage
} from '../registry';
import { ENGINE_METRICS } from '../registry-extra';
import { itemInStageFor, gameKindOf, stageOutcomeFor } from '../stages';
import {
  NBACK_PARAMS,
  NBACK_PROTOCOL_ID,
  NBACK_PROTOCOL_VERSION,
  applyNbackProtocol,
  nbackParamsOf,
  protocolForAge,
  protocolSnapshotOf
} from '../protocol';
import {
  nbackOrderedItems,
  nbackRotationOffsetOf,
  parseNbackRotation,
  parseSequenceRecord,
  serializeNbackRotation,
  serializeSequence,
  generateSequence
} from '../stimulus';
import { summarizeAttempts } from '../scoring';
import { buildEvidenceDossier } from '../evidence';
import type { MissionConfig, MissionItem } from '../types';

const MISSION: MissionConfig = { id: 'm1', game: 'nback', goal: 'nback_working_memory', metric: 'accuracy_nback', items: [] };

// ─── بانک کوچک دوگزینه‌ای — ۰=«همان است» / ۱=«فرق دارد» ───

const matchItem: MissionItem = {
  id: 'nb1', phase: 'probe', type: 'nback',
  prompt: 'اگر شکل با دوتا عقب‌تر یکی بود «همان است» را لمس کن.',
  options: [{ label: 'همان است' }, { label: 'فرق دارد' }],
  correct: 0,
  stim: { shape: 'crab', color: 'orange', n: 2, match: true, window_ms: 3800 }
};
const nonmatchItem: MissionItem = {
  ...matchItem, id: 'nb2', correct: 1,
  stim: { shape: 'boat', color: 'blue', n: 2, match: false, window_ms: 3800 }
};

describe('نمره‌دهی دوگزینه‌ای ن‌پشت (۱.۲۵.۴۰)', () => {
  it('حکم درست برای همسان و ناهمسان — FA/جاخوردن صفر', () => {
    const hit = scoreAttempt(matchItem, MISSION, { option: 0 }, 900);
    expect(hit.correct).toBe(true);
    expect(hit.match).toBe(true);
    expect(hit.nbackFa).toBe(false);
    expect(hit.nbackMissed).toBe(false);
    expect(hit.omission).toBe(false);
    expect(hit.timedOut).toBe(false);
    const rejection = scoreAttempt(nonmatchItem, MISSION, { option: 1 }, 1100);
    expect(rejection.correct).toBe(true);
    expect(rejection.match).toBe(false);
    expect(rejection.nbackFa).toBe(false);
  });

  it('گفتن «فرق دارد» برای همسان = جاخوردن؛ «همان است» برای ناهمسان = هشدار کاذب', () => {
    const missed = scoreAttempt(matchItem, MISSION, { option: 1 }, 1200);
    expect(missed.correct).toBe(false);
    expect(missed.nbackMissed).toBe(true);
    expect(missed.nbackFa).toBe(false);
    const fa = scoreAttempt(nonmatchItem, MISSION, { option: 0 }, 1500);
    expect(fa.correct).toBe(false);
    expect(fa.nbackFa).toBe(true);
    expect(fa.nbackMissed).toBe(false);
  });

  it('بی‌لمسِ پنجره = اُمیشن سروری؛ FA/جاخوردن فقط روی پاسخِ داده‌شده تعریف است', () => {
    const miss = scoreAttempt(matchItem, MISSION, { option: null, timed_out: true }, null);
    expect(miss.correct).toBe(false);
    expect(miss.omission).toBe(true);
    expect(miss.timedOut).toBe(true);
    expect(miss.nbackFa).toBe(false);
    expect(miss.nbackMissed).toBe(false);
    const empty = scoreAttempt(nonmatchItem, MISSION, {}, 700);
    expect(empty.omission).toBe(true);
  });

  it('کف ۲۰۰ms و گزینهٔ کج — ناسالم امن', () => {
    expect(scoreAttempt(matchItem, MISSION, { option: 0 }, 120).rtValid).toBe(false);
    expect(scoreAttempt(matchItem, MISSION, { option: 0 }, 900).rtValid).toBe(true);
    expect(scoreAttempt(matchItem, MISSION, { option: 5 }, 900).correct).toBe(false);
    expect(scoreAttempt(matchItem, MISSION, { option: 'همان است' }, 900).omission).toBe(true);
  });

  it('برچسب نمایشی دوگزینه‌ای — فقط تمرین', () => {
    expect(answerDisplayOf(matchItem)).toBe('همان است');
    expect(answerDisplayOf(nonmatchItem)).toBe('فرق دارد');
    expect(answerDisplayOf({ ...matchItem, correct: 7 })).toBeNull();
  });
});

// ─── سد نشتی — کلید همسانی هرگز به ItemView/راهنما نمی‌رود (C1) ───

describe('سد نشتی کلید همسانی (۱.۲۵.۴۰)', () => {
  it('toItemView بدون match/correct — ولی n و محرک دیداری می‌ماند', () => {
    const view = toItemView(matchItem);
    expect(view.type).toBe('nback');
    expect(view.stim?.match).toBeUndefined();
    expect((view as unknown as Record<string, unknown>).correct).toBeUndefined();
    expect((view.stim as Record<string, unknown>)['n']).toBe(2);
    expect((view.stim as Record<string, unknown>).shape).toBe('crab');
    expect(view.options?.length).toBe(2);
  });

  it('stripAnswerKeys کلید match را در هر عمق می‌خواند', () => {
    const out = stripAnswerKeys({
      match: 'x',
      a: { match: true, keep: 1 },
      b: [{ match: false, c: { match: 1, d: [{ match: true }] } }]
    }) as Record<string, unknown>;
    expect('match' in out).toBe(false);
    expect((out.a as Record<string, unknown>).keep).toBe(1);
    expect('match' in (out.a as Record<string, unknown>)).toBe(false);
    const deep = (out.b as Record<string, unknown>[])[0];
    expect('match' in deep).toBe(false);
    expect('match' in (deep.c as Record<string, unknown>)).toBe(false);
    expect('match' in ((deep.c as Record<string, unknown>).d as Record<string, unknown>[])[0]).toBe(false);
  });
});

// ─── چرخش لنگر-مقید ضدحفظ ───
// زنجیره‌های مستقل n-back: هر زنجیره با لنگر (rot_start) آغاز می‌شود؛ سومین آیتم هر
// زنجیره همسانِ سرِ زنجیره است — چرخشِ سالم باید این حکم‌ها را در هر آفستِ مجاز نگه دارد.

const nb = (id: string, match: boolean, rotStart: boolean, shape: string): MissionItem => ({
  id, phase: 'probe', type: 'nback',
  correct: match ? 0 : 1,
  stim: { shape, n: 2, match, ...(rotStart ? { rot_start: true } : {}) }
});
const chainOf = (p: string): MissionItem[] => [
  nb(p + 'a', false, true, p + '-head'),  // لنگر — سر زنجیره
  nb(p + 'b', false, false, p + '-mid'),  // n قدم کامل ندارد — همسان نیست
  nb(p + 'c', true, false, p + '-head')   // همسان با سر زنجیره (۲ قدم عقب‌تر)
];
const bank: MissionItem[] = [
  { id: 't1', phase: 'train', type: 'nback', correct: 1, stim: { shape: 'fish', n: 2, match: false } },
  { id: 't2', phase: 'train', type: 'nback', correct: 1, stim: { shape: 'shark', n: 2, match: false } },
  { id: 't3', phase: 'train', type: 'nback', correct: 0, stim: { shape: 'fish', n: 2, match: true } }, // همسان با t۱ (۲ قدم عقب‌تر)
  ...chainOf('c1'), ...chainOf('c2'), ...chainOf('c3')
];
const ANCHORS = [0, 3, 6]; // اندیس سرِ زنجیره‌ها درون پسوند پروب

describe('چرخش لنگر-مقید (۱.۲۵.۴۰)', () => {
  it('آفست قطعی از میان لنگرها؛ بانک بی‌لنگر = صفر', () => {
    const off = nbackRotationOffsetOf('seed-آلبوم', ANCHORS);
    expect(ANCHORS).toContain(off);
    expect(nbackRotationOffsetOf('seed-آلبوم', ANCHORS)).toBe(off);
    expect(nbackRotationOffsetOf('سید دیگر', ANCHORS)).toBe(nbackRotationOffsetOf('سید دیگر', ANCHORS));
    expect(nbackRotationOffsetOf('هرچی', [])).toBe(0);
    expect(nbackRotationOffsetOf('هرچی', [Number.NaN, -1])).toBe(0);
  });

  it('راستیِ حکم‌ها در هر سرِ چرخش مجاز — پیشوند تمرین ثابت، زنجیره‌ها سالم', () => {
    for (const a of ANCHORS) {
      const ordered = nbackOrderedItems(bank, { train_count: 3, offset: a });
      // پیشوند تمرین عیناً — چرخش فقط پسوند پروب
      expect(ordered.slice(0, 3).map((it) => it.id)).toEqual(['t1', 't2', 't3']);
      // سرِ جریان چرخیده همیشه لنگر است
      expect(((ordered[3].stim ?? {}) as Record<string, unknown>).rot_start).toBe(true);
      expect(ordered[3].id).toBe(bank[3 + a].id);
      // همان مجموعه — جای‌به‌جا، نه کم‌وزیاد
      expect([...ordered].sort((x, y) => x.id.localeCompare(y.id)).map((it) => it.id))
        .toEqual([...bank].sort((x, y) => x.id.localeCompare(y.id)).map((it) => it.id));
      // هر حکم «همسان» واقعاً به محرکِ ۲ قدم عقب‌تر می‌خورد — حکم‌ها در چرخش سالم مانده‌اند
      for (let i = 2; i < ordered.length; i++) {
        const s = (ordered[i].stim ?? {}) as Record<string, unknown>;
        if (s.match !== true) continue;
        const back = (ordered[i - 2].stim ?? {}) as Record<string, unknown>;
        expect(back.shape).toBe(s.shape);
      }
    }
    // آفست صفر = ترتیب authored عیناً
    expect(nbackOrderedItems(bank, { train_count: 3, offset: 0 }).map((it) => it.id)).toEqual(bank.map((it) => it.id));
  });

  it('رکورد چرخش — رفت‌وبرگشت قطعی و ردِ ناخوانا؛ دو پارسر به‌هم نمی‌خورند', () => {
    const rec = { kind: 'nback' as const, v: 1 as const, seed: 's1', train_count: 2, probe_count: 9, offset: 3 };
    expect(parseNbackRotation(serializeNbackRotation(rec))).toEqual(rec);
    expect(parseNbackRotation(null)).toBeNull();
    expect(parseNbackRotation('چرت‌وپرت')).toBeNull();
    expect(parseNbackRotation(JSON.stringify({ ...rec, v: 2 }))).toBeNull();
    expect(parseNbackRotation(JSON.stringify({ ...rec, offset: 10 }))).toBeNull(); // بیرون پسوند
    // پارسر گونوگو رکورد ن‌پشت را نمی‌خورد و برعکس — ترتیب session_json ابهام ندارد
    expect(parseSequenceRecord(serializeNbackRotation(rec))).toBeNull();
    const gng = serializeSequence(generateSequence({ seed: 'x', count: 6, goRatio: 0.75, maxConsecutiveSame: 3, blockSize: 4 }));
    expect(parseNbackRotation(gng)).toBeNull();
    expect(parseSequenceRecord(gng)).not.toBeNull();
  });
});

// ─── ورودی رجیستری، نردبان مراحل و اهرم n ───

describe('رجیستری و نردبان ن‌پشت (۱.۲۵.۴۰)', () => {
  it('nback در انتهای GAME_KIND_IDS — ترتیب سنجه‌های بازی‌های پیشین دست‌نخورده؛ trail حذف شد', () => {
    expect(gameKindOf('nback')).toBe('nback');
    expect(GAME_KIND_IDS.slice(0, 5)).toEqual(['gonogo', 'numline', 'scan', 'stroop', 'flanker']);
    expect(GAME_KIND_IDS[5]).toBe('nback'); // trail (رد پای دزد) پس از نقد سه‌گانهٔ ۱.۲۵.۵۱ حذف شد؛ G8 و simon در انتها نشستند
    expect((GAME_KIND_IDS as readonly string[]).includes('trail')).toBe(false);
    expect(GAME_KINDS.nback.rt_floor_ms).toBe(200);
    expect(GAME_KINDS.nback.timed_choice).toBe(true);
    const ids = ENGINE_METRICS.map((m) => m.id);
    expect(ids.length).toBe(19); // G8 — +corsi_span_max +digitspan_span_max − trail_prefix_pct؛ ۱.۲۵.۵۲ +simon_span_max
    expect(ids.slice(12, 16)).toEqual(['nback_match_pct', 'nback_nonmatch_pct', 'nback_false_alarm_pct', 'nback_miss_pct']); // ن‌پشت در جایگاه خودش
    expect(ids.slice(0, 12).some((id) => id.includes('nback'))).toBe(false);
    expect(ids.some((id) => id.includes('trail'))).toBe(false);
    expect(ids.slice(-3)).toEqual(['corsi_span_max', 'digitspan_span_max', 'simon_span_max']); // G8 + simon در انتها
    // آستانه‌ها ۶۵/۷۸/۸۸ — همه proposed
    expect(NBACK_THRESHOLDS.pass.value).toBe(65);
    expect(NBACK_THRESHOLDS.star2.value).toBe(78);
    expect(NBACK_THRESHOLDS.star3.value).toBe(88);
    for (const t of [NBACK_THRESHOLDS.pass, NBACK_THRESHOLDS.star2, NBACK_THRESHOLDS.star3]) {
      expect(t.status).toBe('proposed');
      expect(t.rationale.length).toBeGreaterThan(0);
    }
    // ملاک گذار از همان قاعدهٔ دقت
    const pct = (a: number | null) => ({ correct_go: null, correct_nogo: null, accuracy: a });
    expect(stageOutcomeFor('nback', { pct: pct(64) }).passed).toBe(false);
    expect(stageOutcomeFor('nback', { pct: pct(65) }).passed).toBe(true);
    expect(stageOutcomeFor('nback', { pct: pct(78) }).stars).toBe(2);
    expect(stageOutcomeFor('nback', { pct: pct(88) }).stars).toBe(3);
  });

  it('نردبان دو باند — s1/s2 با n=1 و s3..s5 با n=2؛ overrides فقط ISI/تثبیت؛ فیلتر بانک بر stim.n', () => {
    for (const band of ['4-6', '7-12'] as const) {
      const list = GAME_KINDS.nback.stageList(band);
      expect(list.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
      for (const st of list) {
        for (const key of Object.keys(st.overrides)) {
          expect(['isi_min_ms', 'isi_max_ms', 'fixation_ms']).toContain(key);
        }
      }
    }
    expect(NBACK_STAGE_LEVELS).toEqual({ s1: 1, s2: 1, s3: 2, s4: 2, s5: 2 });
    expect(nbackItemInStage({ stim: { n: 1 } }, 's1')).toBe(true);
    expect(nbackItemInStage({ stim: { n: 2 } }, 's1')).toBe(false);
    expect(nbackItemInStage({ stim: { n: 2 } }, 's3')).toBe(true);
    expect(nbackItemInStage({ stim: { n: 1 } }, 's5')).toBe(false);
    expect(nbackItemInStage({ stim: { n: 2 } }, 's5')).toBe(true);
    // بی‌مرحله/مرحلهٔ ناشناخته = همهٔ آیتم‌ها — و مسیر عمومی itemInStageFor هم همین می‌گوید
    expect(nbackItemInStage({ stim: { n: 1 } }, null)).toBe(true);
    expect(nbackItemInStage({ stim: { n: 1 } }, 's9')).toBe(true);
    expect(itemInStageFor('nback', { stim: { n: 2 } }, 's2')).toBe(false);
    expect(itemInStageFor('nback', { stim: { n: 1 } }, 's2')).toBe(true);
  });
});

// ─── فرمول‌های چهارگانه — قاعدهٔ دامنهٔ صفر ───

describe('فرمول‌های درصدی ن‌پشت با دامنهٔ صفر (۱.۲۵.۴۰)', () => {
  const rows: ScoredAttempt[] = [
    scoreAttempt(matchItem, MISSION, { option: 0 }, 900),     // hit
    scoreAttempt(matchItem, MISSION, { option: 1 }, 1000),    // جاخوردن
    scoreAttempt(nonmatchItem, MISSION, { option: 1 }, 800),  // رد صحیح
    scoreAttempt(nonmatchItem, MISSION, { option: 0 }, 700)   // هشدار کاذب
  ];

  it('چهار درصد از مخرج خودشان — بدون دامنه = null نه صفرِ ساختگی', () => {
    expect(nbackMatchPctOf(rows)).toBe(50);
    expect(nbackNonmatchPctOf(rows)).toBe(50);
    expect(nbackFaPctOf(rows)).toBe(50);
    expect(nbackMissPctOf(rows)).toBe(50);
    expect(computeMetricValue('nback_match', rows)).toBe(50);
    expect(computeMetricValue('nback_nonmatch', rows)).toBe(50);
    expect(computeMetricValue('nback_fa', rows)).toBe(50);
    expect(computeMetricValue('nback_miss', rows)).toBe(50);
  });

  it('ردیف بی‌پرچم match (سایر نوع‌ها) به هیچ جمعی وارد نمی‌شود', () => {
    const foreign: ScoredAttempt = { itemId: 'x', phase: 'probe', correct: true, rtMs: 500, rtValid: true };
    expect(nbackMatchPctOf([foreign])).toBeNull();
    expect(nbackNonmatchPctOf([foreign])).toBeNull();
    expect(nbackFaPctOf([foreign])).toBeNull();
    expect(nbackMissPctOf([foreign])).toBeNull();
    expect(computeMetricValue('nback_fa', [])).toBeNull();
    expect(computeMetricValue('nback_match', rows.filter((r) => r.match === false))).toBeNull();
    expect(computeMetricValue('nback_fa', rows.filter((r) => r.match === true))).toBeNull();
  });
});

// ─── پروتکل دو باند ───

describe('پروتکل ن‌پشت دو باند (۱.۲۵.۴۰)', () => {
  it('پارامترهای مرجع دو باند — همه proposed با مبنا؛ مقادیر قراردادی', () => {
    const p46 = nbackParamsOf('4-6');
    const p712 = nbackParamsOf('7-12');
    expect(p46).toEqual({
      isi_min_ms: 2200, isi_max_ms: 2800, fixation_ms: 400, block_size: 30,
      match_ratio: 0.3, max_consecutive_match: 2, response_window_ms: 3800
    });
    expect(p712).toEqual({
      isi_min_ms: 1800, isi_max_ms: 2400, fixation_ms: 400, block_size: 30,
      match_ratio: 0.3, max_consecutive_match: 2, response_window_ms: 3400
    });
    for (const table of [NBACK_PARAMS['4-6'], NBACK_PARAMS['7-12']]) {
      for (const p of Object.values(table)) {
        expect(p.status).toBe('proposed');
        expect(p.rationale.length).toBeGreaterThan(0);
      }
    }
    expect(NBACK_PROTOCOL_ID).toBe('nback-standard');
    expect(NBACK_PROTOCOL_VERSION).toBe('1.0.0');
  });

  it('applyNbackProtocol — شناسه/نسخه/باند/پارامترها جای می‌نشیند؛ mode/behavior می‌ماند', () => {
    const base = protocolSnapshotOf(protocolForAge('training', 5));
    const nb = applyNbackProtocol(base, '4-6');
    expect(nb.protocol_id).toBe('nback-standard');
    expect(nb.version).toBe('1.0.0');
    expect(nb.age_band).toBe('4-6');
    expect(nb.mode).toBe('training');
    expect(nb.behavior.adaptive).toBe(true);
    expect(nb.params.isi_min_ms).toBe(2200);
    expect(nb.params.response_window_ms).toBe(3800);
    expect(nb.params.match_ratio).toBe(0.3);
    const nb712 = applyNbackProtocol(base, '7-12');
    expect(nb712.params.isi_min_ms).toBe(1800);
    expect(nb712.params.response_window_ms).toBe(3400);
  });
});

// ─── خلاصهٔ جلسه با دامنهٔ صفر + شواهد ───

describe('خلاصهٔ جلسهٔ ن‌پشت و شواهد (۱.۲۵.۴۰)', () => {
  const rows: ScoredAttempt[] = [
    scoreAttempt(matchItem, MISSION, { option: 0 }, 800),
    scoreAttempt(matchItem, MISSION, { option: 0 }, 1000),
    scoreAttempt(matchItem, MISSION, { option: 0 }, 1200),
    scoreAttempt(matchItem, MISSION, { option: 1 }, 900),    // جاخوردن
    scoreAttempt(nonmatchItem, MISSION, { option: 1 }, 700),
    scoreAttempt(nonmatchItem, MISSION, { option: 0 }, 600)  // هشدار کاذب
  ];

  it('جمع‌ها و چهار درصد و میانهٔ RT همسان‌های درست', () => {
    const s = summarizeAttempts(rows, [], 24);
    expect(s.nback).not.toBeNull();
    expect(s.nback!.trials).toBe(6);
    expect(s.nback!.matches).toBe(4);
    expect(s.nback!.correct_matches).toBe(3);
    expect(s.nback!.match_pct).toBe(75);
    expect(s.nback!.miss_pct).toBe(25);
    expect(s.nback!.nonmatch_pct).toBe(50);
    expect(s.nback!.false_alarm_pct).toBe(50);
    expect(s.nback!.median_rt_match_ms).toBe(1000); // میانهٔ ۸۰۰/۱۰۰۰/۱۲۰۰
  });

  it('بدون آیتم ن‌پشت = null؛ دامنهٔ ناقص در zero_denominator صادقانه ثبت می‌شود', () => {
    expect(summarizeAttempts([], [], 24).nback).toBeNull();
    const foreign: ScoredAttempt = { itemId: 'x', phase: 'probe', correct: true, rtMs: 500, rtValid: true };
    expect(summarizeAttempts([foreign], [], 24).nback).toBeNull();
    const matchesOnly = summarizeAttempts(rows.filter((r) => r.match === true), [], 24);
    expect(matchesOnly.nback!.match_pct).toBe(75);
    expect(matchesOnly.nback!.nonmatch_pct).toBeNull();
    expect(matchesOnly.nback!.false_alarm_pct).toBeNull();
    expect(matchesOnly.zero_denominator).toContain('nback: ناهمسان=۰ — nonmatch/fa درصدشان تعریف‌نشده');
    const nonmatchOnly = summarizeAttempts(rows.filter((r) => r.match === false), [], 24);
    expect(nonmatchOnly.nback!.match_pct).toBeNull();
    expect(nonmatchOnly.zero_denominator).toContain('nback: همسان=۰ — match/miss درصدشان تعریف‌نشده');
  });

  it('نشانهٔ بی‌پاسخی پنجره برای ن‌پشت تعریف می‌شود — از پرچم timed_choice رجیستری', () => {
    const withOmission = [
      scoreAttempt(matchItem, MISSION, { option: 0 }, 800),
      scoreAttempt(matchItem, MISSION, { option: null, timed_out: true }, null),
      scoreAttempt(matchItem, MISSION, { option: null, timed_out: true }, null),
      scoreAttempt(nonmatchItem, MISSION, { option: 1 }, 700)
    ];
    const s = summarizeAttempts(withOmission, [], 24);
    const d = buildEvidenceDossier('nback', s, false);
    const miss = d.signals.find((x) => x.id === 'window_miss_pct');
    expect(miss?.value).toBe(50); // ۲ اُمیشن از ۴ آزمون
    expect(d.flags.disengagement).toBe(true);
    // شش نوع غیر زمان‌دار همچنان بدون این نشانه
    const dGo = buildEvidenceDossier('gonogo', summarizeAttempts(rows, [], 24), false);
    expect(dGo.signals.find((x) => x.id === 'window_miss_pct')?.value).toBeNull();
  });
});
