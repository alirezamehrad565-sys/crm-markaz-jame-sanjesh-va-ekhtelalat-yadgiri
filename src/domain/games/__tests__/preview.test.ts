// نگاشت بی‌حالت پیش‌نمایش (۱.۲۵.۲۰) — هم‌ترازی انتخاب جلسهٔ واقعی با دنبالهٔ seed-دار
// و ترتیب authored برای بستهٔ بی‌پروتکل؛ نمونهٔ طلایی روی همان مولد stimulus.ts.
import { describe, it, expect } from 'vitest';
import { previewItemAt, previewMissionOf } from '../pure';
import { generateSequence, parseSequenceRecord, serializeSequence } from '../stimulus';
import type { MissionConfig, PackageBody } from '../types';

function missionOf(): MissionConfig {
  return {
    id: 'm1', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo', title: 'مأموریت آزمون',
    items: [
      { id: 'g1', phase: 'train', type: 'touch_report', stim: { shape: 'star' }, correct_touch: true },
      { id: 'g2', phase: 'train', type: 'touch_report', stim: { shape: 'circle' }, correct_touch: true },
      { id: 'g3', phase: 'train', type: 'touch_report', stim: { shape: 'heart' }, correct_touch: true },
      { id: 'n1', phase: 'train', type: 'touch_report', stim: { shape: 'square' }, correct_touch: false },
      { id: 'n2', phase: 'probe', type: 'touch_report', stim: { shape: 'square' }, correct_touch: false }
    ]
  };
}

function seqFor(count = 5, goCount = 3): { trials: Array<{ kind: 'go' | 'nogo' }> } {
  const seq = generateSequence({
    seed: 'golden-preview', count, goRatio: goCount / count,
    maxConsecutiveSame: 2, blockSize: 5
  });
  expect(seq.trials.filter((t) => t.kind === 'go')).toHaveLength(goCount); // نسبت دقیق مولد
  const parsed = parseSequenceRecord(serializeSequence(seq));
  if (!parsed) throw new Error('بازتولید دنبالهٔ طلایی ناموفق بود');
  return parsed;
}

describe('previewMissionOf — انتخاب مأموریت پیش‌نمایش', () => {
  it('نخستین مأموریت دارای آیتم لمسی را برمی‌دارد', () => {
    const body = { missions: [
      { id: 'no-touch', game: 'x', goal: 'g', metric: 'm', items: [{ id: 'c1', phase: 'train', type: 'choice', options: [{ label: 'الف' }], correct: 0 }] },
      missionOf()
    ] } as unknown as PackageBody;
    expect(previewMissionOf(body)?.id).toBe('m1');
  });

  it('بدون مأموریت = null', () => {
    expect(previewMissionOf({ missions: [] } as unknown as PackageBody)).toBeNull();
  });
});

describe('previewItemAt — هم‌ترازی با انتخاب جلسهٔ واقعی', () => {
  it('بدون دنباله = ترتیب authored عیناً', () => {
    const m = missionOf();
    expect(previewItemAt(m, null, 0).item?.id).toBe('g1');
    expect(previewItemAt(m, null, 3).item?.id).toBe('n1');
    expect(previewItemAt(m, null, 4).item?.id).toBe('n2');
    expect(previewItemAt(m, null, 4).progress).toEqual({ done: 4, total: 5 });
  });

  it('پایان دنباله = آیتم null با همان total', () => {
    const m = missionOf();
    expect(previewItemAt(m, null, 5).item).toBeNull();
    expect(previewItemAt(m, null, 99).item).toBeNull();
    expect(previewItemAt(m, null, -1).item).toBeNull();
    expect(previewItemAt(m, null, NaN).item).toBeNull();
  });

  it('با دنبالهٔ seed-دار: دستهٔ جایگاه n تعیین‌کننده است و k-مین هم‌دستهٔ authored برمی‌آید — برای همهٔ جایگاه‌ها', () => {
    const m = missionOf();
    const seq = seqFor(5, 3);
    const goSeen: string[] = [];
    const nogoSeen: string[] = [];
    for (let n = 0; n < seq.trials.length; n++) {
      const kind = seq.trials[n].kind;
      const at = previewItemAt(m, seq, n);
      expect(at.item, `جایگاه ${n}`).toBeTruthy();
      expect((at.item!.correct_touch === true) === (kind === 'go'), `دستهٔ جایگاه ${n} باید ${kind} باشد`).toBe(true);
      (kind === 'go' ? goSeen : nogoSeen).push(at.item!.id);
    }
    // هر دسته به ترتیب authored همان دسته مصرف می‌شود — بدون تکرار
    expect(goSeen).toEqual(['g1', 'g2', 'g3'].slice(0, goSeen.length));
    expect(nogoSeen).toEqual(['n1', 'n2'].slice(0, nogoSeen.length));
    expect(new Set([...goSeen, ...nogoSeen]).size).toBe(goSeen.length + nogoSeen.length);
  });

  it('قطعی است — دو فراخوانی مستقل همان نگاشت را می‌دهند', () => {
    const m = missionOf();
    const seq = seqFor(5, 3);
    for (let n = 0; n < 5; n++) {
      expect(previewItemAt(m, seq, n).item?.id).toBe(previewItemAt(m, seq, n).item?.id);
    }
  });
});
