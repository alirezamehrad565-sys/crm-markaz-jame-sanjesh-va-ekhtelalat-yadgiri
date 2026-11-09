// golden tests ۱۴۰۵/۰۸/۱۹ — کولهٔ مرواریدها (corsi — حافظهٔ کاری فضایی/کورسی):
//  ۱) رجیستری نوع-محور: قرارداد آستانهٔ {value,rationale,status}، نردبان s1..s5، اهرم سقف طول دنباله
//  ۲) سنجه‌های موتور (corsi_seq/corsi_span) در flatten ENGINE_METRICS با فرمول‌های گیت‌دار
//  ۳) حذف «رد پای دزد»: trail دیگر نوع شناخته‌شده نیست؛ مراحل/اهرم/سنجه‌های آن از رجیستری خارج شد
//  ۴) بانک authored (مولد) — همان تخت صدف ثابت با kinds/corsi.js؛ دنبالهٔ بی‌تکرار ۲..۶
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_KINDS, GAME_KIND_IDS } from '../registry';
import { ENGINE_METRICS, ENGINE_ONLY_FORMULAS } from '../registry-extra';
import { CORSI_STAGE_BANDS, CORSI_STAGE_MAX_LEN, corsiItemInStage } from '../stages';

// ─── رجیستری ───

describe('رجیستری کولهٔ مرواریدها (۱۴۰۵/۰۸/۱۹)', () => {
  it('corsi نوع هفتم بعد از ن‌پشت است — ترتیب قطعی نوع‌ها حفظ شد', () => {
    expect(GAME_KIND_IDS).toEqual(['gonogo', 'numline', 'scan', 'stroop', 'flanker', 'nback', 'corsi']);
    expect(GAME_KIND_IDS).not.toContain('trail'); // رد بازنشسته شد
  });

  it('آستانه‌های corsi قرارداد {value, rationale, status} دارند و صادقانه proposedند', () => {
    const t = GAME_KINDS.corsi.thresholds as unknown as Record<string, { value: number; rationale: string; status: string }>;
    for (const key of ['pass', 'star2', 'star3']) {
      expect(t[key].value, key).toBeGreaterThanOrEqual(0);
      expect(t[key].rationale.length, key).toBeGreaterThan(10);
      expect(t[key].status, key).toBe('proposed'); // تا پیلوت مرکز
    }
    expect([t.pass.value, t.star2.value, t.star3.value]).toEqual([65, 78, 88]);
  });

  it('نردبان پنج‌مرحله‌ای با اهرم سقف طول دنباله — s1:۲ … s4:۵ · s5 همهٔ بانک', () => {
    const stages = GAME_KINDS.corsi.stageList('7-12');
    expect(stages.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(CORSI_STAGE_MAX_LEN).toEqual({ s1: 2, s2: 3, s3: 4, s4: 5, s5: null });
    expect(CORSI_STAGE_BANDS).toEqual({ s1: ['a'], s2: ['a', 'b'], s3: ['a', 'b', 'c'], s4: ['a', 'b', 'c', 'd'], s5: null });
  });

  it('تک‌اهرم ثابت قصه: سقف طول دنباله با بانک گروه‌دار هم‌راستاست — پروب به مراحل اولیه درز نمی‌کند', () => {
    expect(corsiItemInStage({ stim: { sequence: [1, 2], band: 'a' } }, 's1')).toBe(true);
    expect(corsiItemInStage({ stim: { sequence: [1, 2, 3, 4], band: 'p' } }, 's3')).toBe(false);
    expect(corsiItemInStage({ stim: { sequence: [1, 2, 3, 4, 5, 6], band: 'e' } }, 's5')).toBe(true);
  });

  it('سنجه‌های موتور corsi با فرمول‌های گیت‌دار حاضرند — ترتیب flatten دست‌نخورده', () => {
    const ids = ENGINE_METRICS.map((m) => m.id);
    expect(ids).toContain('corsi_seq_acc_pct');
    expect(ids).toContain('corsi_span_max');
    expect(ids).not.toContain('trail_prefix_pct'); // سنجهٔ رد با بازی‌اش حذف شد
    expect(ENGINE_ONLY_FORMULAS).toContain('corsi_seq');
    expect(ENGINE_ONLY_FORMULAS).toContain('corsi_span');
    expect(ENGINE_ONLY_FORMULAS).not.toContain('trail_prefix');
    const corsiRows = GAME_KINDS.corsi.engineMetrics;
    expect(corsiRows.map((m) => m.formula)).toEqual(['corsi_seq', 'corsi_span']);
  });

  it('کف RT سرور corsi = ۱۵۰ms و بازتولید انتخاب زمان‌دار نیست (پیش‌ماند نمره می‌گیرد)', () => {
    expect(GAME_KINDS.corsi.rtFloorMs).toBe(150);
    expect(GAME_KINDS.corsi.timedChoice).toBe(false);
    expect(GAME_KINDS.corsi.waveMsCapOf).toBeNull();
  });
});

// ─── هم‌خوانی بانک authored با ماژول نمایش ───

describe('تخت صدف ثابت — بانک authored و ماژول نمایش یک تختند', () => {
  const seedSrc = readFileSync(join(__dirname, '../../../../scripts/make-corsi-seed-sql.mjs'), 'utf8');
  const kindSrc = readFileSync(join(__dirname, '../../../../public/assets/play/kinds/corsi.js'), 'utf8');

  it('SHELL_SPOTS ۹ جایگاه نامنظم — در هر دو فایل عیناً یکی؛ جای صدف‌ها authored است', () => {
    const spotsOf = (src: string) => {
      const m = src.match(/const SHELL_SPOTS = \[([\s\S]*?)\];/);
      return m ? m[1].replace(/\s+/g, '') : '';
    };
    expect(spotsOf(seedSrc)).toBe(spotsOf(kindSrc));
    expect(spotsOf(kindSrc).match(/\{x:/g)?.length).toBe(9);
  });

  it('ماژول نمایش بی‌کلید و بی‌شبکه — بازتولید از خود stim.sequence می‌آید', () => {
    expect(kindSrc).toContain("Array.isArray(s.sequence)");
    expect(kindSrc).not.toMatch(/fetch\(|XMLHttpRequest|eval\(|\.animate\(|https?:\/\//);
    // کلیدهای سروری هرگز در ماژول نمایش نیستند
    expect(kindSrc).not.toMatch(/correct_touch|answer_display|tolerance/);
  });
});
