// golden tests ۱.۲۵.۴۰ — آلبوم خرچنگ (ن‌پشت هم‌سانی دیداری):
//  ۱) چرخش قطعی و لنگر-مقید (سر جریان همیشه لنگر است؛ پرچم همسانی پس از چرخش راست می‌ماند)
//  ۲) نمره‌دهی دوگزینه‌ای با کلید stim.match سرور
//  ۳) سد نشتی — match/correct هرگز در نمای کلاینت نمی‌آیند (ANSWER_KEYS)
//  ۴) رجیستری نوع-محور: آستانه‌های proposed، نردبان دو باند، اهرم n، سنجه‌های موتور
//  ۵) پروتکل مستقل nback-standard + خلاصهٔ جلسه با قاعدهٔ دامنهٔ صفر
import { describe, expect, it } from 'vitest';
import {
  answerDisplayOf,
  nbackFalseAlarmPctOf,
  nbackMatchPctOf,
  nbackMissPctOf,
  nbackNonmatchPctOf,
  scoreAttempt,
  stripAnswerKeys,
  toItemView,
  type ScoredAttempt
} from '../pure';
import {
  gameKindOf,
  nbackItemInStage,
  NBACK_STAGE_LEVELS,
  NBACK_STAGE_THRESHOLDS,
  stageOutcomeNback
} from '../stages';
import { GAME_KINDS } from '../registry';
import { ENGINE_METRICS } from '../registry-extra';
import { summarizeAttempts } from '../scoring';
import {
  nbackOrderedItems,
  nbackRotationOffsetOf,
  parseNbackRotation,
  serializeNbackRotation
} from '../stimulus';
import {
  applyNbackProtocol,
  NBACK_PROTOCOL_ID,
  NBACK_PROTOCOL_VERSION,
  nbackParamsOf,
  protocolForAge,
  protocolSnapshotOf
} from '../protocol';
import type { MissionConfig, MissionItem } from '../types';

const MISSION: MissionConfig = { id: 'm1', game: 'nback', goal: 'nback_working_memory', metric: 'accuracy_nback', items: [] };

/** آیتم ن‌پشت آزمونی — match فقط سرور می‌بیند؛ options دو گزینهٔ ثابت */
function nItem(id: string, fish: string, match: boolean, n = 1): MissionItem {
  return {
    id, phase: 'probe', type: 'nback',
    prompt: 'همان ماهیِ عکسِ قبل است؟',
    options: [{ label: 'همان است' }, { label: 'فرق دارد' }],
    correct: match ? 0 : 1,
    stim: { fish, n, match, window_ms: 4200 }
  };
}

// ─── نمره‌دهی دوگزینه‌ای — کلید stim.match سرور ───

describe('نمره‌دهی ن‌پشت (۱.۲۵.۴۰)', () => {
  const same = nItem('nb1', 'blue', true);
  const diff = nItem('nb2', 'red', false);

  it('«همان است» روی محرک همسان درست؛ match از stim سرور می‌آید', () => {
    const s = scoreAttempt(same, MISSION, { option: 0 }, 1450);
    expect(s.correct).toBe(true);
    expect(s.match).toBe(true);
    expect(s.nbackFa).toBe(false);
    expect(s.nbackMissed).toBe(false);
    expect(s.omission).toBe(false);
    expect(s.rtValid).toBe(true);
  });

  it('«فرق دارد» روی ناهمسان درست؛ خطای نگاشت و جاانداختن جدا شمار می‌شوند', () => {
    const ok = scoreAttempt(diff, MISSION, { option: 1 }, 1600);
    expect(ok.correct).toBe(true);
    expect(ok.match).toBe(false);
    const fa = scoreAttempt(diff, MISSION, { option: 0 }, 1700); // «همان است» روی ناهمسان
    expect(fa.correct).toBe(false);
    expect(fa.nbackFa).toBe(true);
    const missed = scoreAttempt(same, MISSION, { option: 1 }, 1800); // «فرق دارد» روی همسان
    expect(missed.correct).toBe(false);
    expect(missed.nbackMissed).toBe(true);
  });

  it('بی‌لمس تا پایان پنجره = اُمیشن و timedOut (انتخاب زمان‌دار)', () => {
    const s = scoreAttempt(same, MISSION, {}, 4200);
    expect(s.correct).toBe(false);
    expect(s.omission).toBe(true);
    expect(s.timedOut).toBe(true);
  });

  it('برچسب گزینهٔ درست فقط برای تمرین — «همان است»/«فرق دارد»', () => {
    expect(answerDisplayOf(same)).toBe('همان است');
    expect(answerDisplayOf(diff)).toBe('فرق دارد');
  });
});

// ─── سد نشتی — قرارداد §۴.۲ MIGRATION_PLAN ───

describe('سد نشتی ن‌پشت — کلید هرگز به کلاینت نمی‌رود', () => {
  it('toItemView نه match و نه correct و نه answer را نگه می‌دارد', () => {
    const view = toItemView(nItem('nb3', 'green', true, 2));
    const raw = JSON.stringify(view);
    expect(raw).not.toContain('"match"');
    expect(raw).not.toContain('correct');
    expect(raw).not.toContain('answer');
    expect(view.stim).toBeDefined();
    expect((view.stim as Record<string, unknown>).fish).toBe('green');
    expect((view.stim as Record<string, unknown>).n).toBe(2);
  });

  it('stripAnswerKeys کلید match را در هر عمق درخت می‌بُرد', () => {
    const stripped = stripAnswerKeys({ a: { match: true, fish: 'red' }, list: [{ match: false }] }) as {
      a: { match?: boolean; fish: string };
      list: Array<{ match?: boolean }>;
    };
    expect(stripped.a.match).toBeUndefined();
    expect(stripped.a.fish).toBe('red');
    expect(stripped.list[0].match).toBeUndefined();
  });
});

// ─── چرخش لنگر-مقید — قلب صحت بانک authored ───

describe('چرخش جریان ن‌پشت — قطعی و لنگر-مقید (۱.۲۵.۴۰)', () => {
  /** بازسازی کوچک‌شدهٔ جریان بانک: تمرین t1..t3 + پروب با لنگر در سرِ هر گروه */
  function bank(): MissionItem[] {
    const mk = (id: string, phase: 'train' | 'probe', fish: string, match: boolean, n = 1): MissionItem => ({
      id, phase, type: 'nback', correct: match ? 0 : 1,
      options: [{ label: 'همان است' }, { label: 'فرق دارد' }],
      stim: { fish, n, match, window_ms: 4200, ...(match === false && ['teal', 'pink', 'lime', 'indigo'].includes(fish) ? { anchor: true, ...(phase === 'probe' && ['a0', 'b0', 'c0'].includes(id) ? { rot_start: true } : {}) } : {}) }
    });
    return [
      mk('t1', 'train', 'yellow', false), mk('t2', 'train', 'yellow', true), mk('t3', 'train', 'red', false),
      mk('a0', 'probe', 'teal', false), mk('a1', 'probe', 'blue', false), mk('a2', 'probe', 'blue', true), mk('a3', 'probe', 'green', false),
      mk('b0', 'probe', 'pink', false), mk('b1', 'probe', 'orange', false), mk('b2', 'probe', 'orange', true), mk('b3', 'probe', 'green', false),
      mk('c0', 'probe', 'lime', false, 2), mk('c1', 'probe', 'indigo', false, 2), mk('c2', 'probe', 'blue', false, 2), mk('c3', 'probe', 'orange', false, 2)
    ];
  }

  const rotStarts = [0, 4, 8]; // جایگاه‌های a0/b0/c0 در پسوند پروب

  it('آفست چرخش قطعی است و همیشه روی لنگر می‌افتد؛ بانک بی‌لنگر = صفر', () => {
    for (const seed of ['s1', 's2', 'abc-def']) {
      const off = nbackRotationOffsetOf(seed, rotStarts);
      expect(rotStarts).toContain(off);
      expect(nbackRotationOffsetOf(seed, rotStarts)).toBe(off); // همان seed → همان آفست
    }
    expect(nbackRotationOffsetOf('x', [])).toBe(0);
    expect(nbackRotationOffsetOf('x', undefined as unknown as number[])).toBe(0);
  });

  it('پس از هر سرِ چرخش مجاز، پرچم همسانی ایستا با حقیقتِ ترتیب نمایشی برابر می‌ماند', () => {
    const items = bank();
    const train = items.filter((it) => it.phase === 'train');
    const probe = items.filter((it) => it.phase === 'probe');
    for (const offset of [0, ...rotStarts]) {
      const stream = nbackOrderedItems(items, { train_count: train.length, offset });
      // پیشوند تمرین دست‌نخورده
      expect(stream.slice(0, train.length).map((it) => it.id)).toEqual(train.map((it) => it.id));
      for (let i = 0; i < stream.length; i++) {
        const it = stream[i];
        const stim = (it.stim ?? {}) as Record<string, unknown>;
        const n = typeof stim.n === 'number' ? stim.n : 1;
        const back = i - n >= 0 ? stream[i - n] : null;
        const backStim = (back?.stim ?? {}) as Record<string, unknown>;
        const truth = back === null ? false : backStim.fish === stim.fish;
        expect(stim.match, `سرِ چرخش ${offset} — آیتم ${it.id}`).toBe(truth);
      }
      void probe;
    }
  });

  it('رکورد چرخش گرد می‌شود و سرِ جریانِ چرخیده لنگر است', () => {
    const rec = { kind: 'nback' as const, v: 1 as const, seed: 'sess-1', train_count: 3, probe_count: 12, offset: 4 };
    const parsed = parseNbackRotation(serializeNbackRotation(rec));
    expect(parsed).toEqual(rec);
    const stream = nbackOrderedItems(bank(), { train_count: rec.train_count, offset: rec.offset });
    const head = stream[rec.train_count];
    expect(head.id).toBe('b0');
    expect(((head.stim ?? {}) as Record<string, unknown>).anchor).toBe(true); // سرِ جریانِ چرخیده همیشه لنگر است
  });
});

// ─── رجیستری نوع-محور + نردبان مرحله ───

describe('رجیستری ن‌پشت — آستانه‌ها، نردبان، اهرم n، سنجه‌ها', () => {
  it('ورودی رجیستری ن‌پشت با آستانه‌های proposed و انتخاب زمان‌دار', () => {
    const entry = GAME_KINDS.nback;
    expect(entry.timedChoice).toBe(true);
    expect(entry.thresholds.pass).toMatchObject({ value: 65, status: 'proposed' });
    expect(entry.thresholds.star3).toMatchObject({ value: 88, status: 'proposed' });
    expect(gameKindOf('nback')).toBe('nback');
  });

  it('نتیجهٔ مرحله از دقت — ۶۵/۷۸/۸۸ با شکل StageOutcome', () => {
    expect(stageOutcomeNback(64).passed).toBe(false);
    expect(stageOutcomeNback(65)).toMatchObject({ passed: true, stars: 1 });
    expect(stageOutcomeNback(78).stars).toBe(2);
    expect(stageOutcomeNback(88).stars).toBe(3);
    expect(NBACK_STAGE_THRESHOLDS).toEqual({ pass: 65, star2: 78, star3: 88 });
  });

  it('اهرم مرحله = سطح n — s1/s2 فقط n=1، s3/s4/s5 فقط n=2؛ بی‌مرحله = همه', () => {
    expect(NBACK_STAGE_LEVELS).toEqual({ s1: [1], s2: [1], s3: [2], s4: [2], s5: [2] });
    const n1 = nItem('x1', 'blue', true, 1);
    const n2 = nItem('x2', 'blue', false, 2);
    expect(nbackItemInStage(n1, 's1')).toBe(true);
    expect(nbackItemInStage(n2, 's1')).toBe(false);
    expect(nbackItemInStage(n2, 's3')).toBe(true);
    expect(nbackItemInStage(n1, 's3')).toBe(false);
    expect(nbackItemInStage(n1, null)).toBe(true); // بی‌مرحله/ارزیابی = همه
    expect(nbackItemInStage(n1, 's9')).toBe(true); // مرحلهٔ ناشناخته = همه (قرارداد سازگاری)
  });

  it('سنجه‌های موتور ن‌پشت — چهار سنجهٔ درصدی با قاعدهٔ دامنهٔ صفر', () => {
    const nbackIds = ENGINE_METRICS.filter((m) => m.id.startsWith('nback_')).map((m) => m.id);
    expect(nbackIds).toEqual([
      'nback_match_pct', 'nback_nonmatch_pct', 'nback_false_alarm_pct', 'nback_miss_pct'
    ]);
    const rows: ScoredAttempt[] = [
      { id: '1', correct: true, match: true } as unknown as ScoredAttempt,
      { id: '2', correct: false, match: true, nbackMissed: true } as unknown as ScoredAttempt,
      { id: '3', correct: true, match: false } as unknown as ScoredAttempt,
      { id: '4', correct: false, match: false, nbackFa: true } as unknown as ScoredAttempt
    ];
    expect(nbackMatchPctOf(rows)).toBe(50);
    expect(nbackNonmatchPctOf(rows)).toBe(50);
    expect(nbackFalseAlarmPctOf(rows)).toBe(50);
    expect(nbackMissPctOf(rows)).toBe(50);
    // بدون دامنه = null نه صفرِ ساختگی
    expect(nbackMatchPctOf([{ id: '9', correct: true, match: false } as unknown as ScoredAttempt])).toBeNull();
    expect(nbackMissPctOf([])).toBeNull();
  });
});

// ─── پروتکل مستقل + خلاصهٔ جلسه ───

describe('پروتکل nback-standard و خلاصهٔ جلسه', () => {
  it('اسنپ‌شات ن‌پشت هویت و پارامترهای خودش را دارد؛ ISI دو باند متفاوت', () => {
    const base = protocolSnapshotOf(protocolForAge('training', 6));
    const snap = applyNbackProtocol(base, '4-6');
    expect(snap.protocol_id).toBe(NBACK_PROTOCOL_ID);
    expect(snap.version).toBe(NBACK_PROTOCOL_VERSION);
    expect(snap.params.isi_min_ms).toBe(2200);
    const older = applyNbackProtocol(base, '7-12');
    expect(older.params.isi_min_ms).toBe(1800);
    expect(nbackParamsOf('9-12' as never)).toEqual(nbackParamsOf('7-12')); // باند ناشناخته → مدرسه
  });

  it('خلاصهٔ جلسهٔ ن‌پشت از آزمون‌های match-دار؛ بدون آیتم ن‌پشت = null (دامنهٔ صفر)', () => {
    const mk = (id: string, fish: string, match: boolean, opt: number | null, rt: number | null): ScoredAttempt =>
      scoreAttempt(nItem(id, fish, match), MISSION, opt === null ? {} : { option: opt }, rt);
    const rows = [
      mk('r1', 'blue', true, 0, 1200),
      mk('r2', 'red', false, 1, 1400),
      mk('r3', 'red', false, 0, 1600), // false alarm
      mk('r4', 'green', true, 1, null) // missed
    ];
    const sum = summarizeAttempts(rows);
    expect(sum.nback).not.toBeNull();
    expect(sum.nback?.trials).toBe(4);
    expect(sum.nback?.matches).toBe(2);
    expect(sum.nback?.correct_matches).toBe(1);
    expect(sum.nback?.match_pct).toBe(50);
    expect(sum.nback?.nonmatch_pct).toBe(50);
    expect(sum.nback?.false_alarm_pct).toBe(50);
    expect(sum.nback?.miss_pct).toBe(50);
    expect(sum.nback?.median_rt_match_ms).toBe(1200);
    const empty = summarizeAttempts([{ id: 'z9', itemId: 'z9', phase: 'probe', rtMs: null, rtValid: false, correct: true } as unknown as ScoredAttempt]); // بدون آیتم ن‌پشت
    expect(empty.nback).toBeNull();
    expect(empty.zero_denominator).toBeDefined();
  });
});
