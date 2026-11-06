// stage-visual.test.ts — آزمون طلایی درون‌مایهٔ دیداری مرحله‌ها (۱.۲۵.۲۳)
// قواعد: گو همیشه گرم · نوگو همیشه سرد · فقط نمایش · شناسهٔ ناشناخته = محرک authored
import { describe, expect, it } from 'vitest';
import { STAGE_VISUALS, stageVisualFor, stageStimViewOf } from '../stages';
import { stimLabelOf } from '../pure';

const WARM = ['yellow', 'red', 'orange'];
const COOL = ['blue', 'purple', 'green'];

describe('امضای دیداری مرحله‌ها', () => {
  it('پنج مرحله هم‌خوان با شناسه‌های StageDef (s1..s5) امضا دارند', () => {
    expect(Object.keys(STAGE_VISUALS).sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
    for (const v of Object.values(STAGE_VISUALS)) {
      expect(v.go.shape).toBeTruthy();
      expect(v.nogo.shape).not.toBe(v.go.shape); // دو دسته دیداری متمایز
      expect(WARM).toContain(v.go.color);        // قاعدهٔ رنگ: گو گرم
      expect(COOL).toContain(v.nogo.color);      // نوگو سرد — پشتوانهٔ کوررنگ‌ها دو نشانه‌ای
    }
  });

  it('مرحلهٔ ۵ (قهرمان) جفت کلاسیک آموزش است — ستارهٔ زرد/مربع آبی', () => {
    expect(STAGE_VISUALS.s5).toEqual({ go: { shape: 'star', color: 'yellow' }, nogo: { shape: 'square', color: 'blue' } });
  });

  it('شناسهٔ ناشناخته/تهی = null — محرک authored عیناً نمایش داده می‌شود', () => {
    expect(stageVisualFor(null)).toBeNull();
    expect(stageVisualFor(undefined)).toBeNull();
    expect(stageVisualFor('')).toBeNull();
    expect(stageVisualFor('hack')).toBeNull();
    expect(stageVisualFor('s3')).toEqual(STAGE_VISUALS.s3);
  });

  it('نمای محرک: شکل/رنگ مرحله روی stim authored می‌نشیند و بقیهٔ فیلدها می‌مانند', () => {
    const authored = { shape: 'star', color: 'yellow', note: 'x' };
    const goView = stageStimViewOf(authored, true, 's4');
    expect(goView).toEqual({ shape: 'rocket', color: 'orange', note: 'x' });
    const nogoView = stageStimViewOf(authored, false, 's4');
    expect(nogoView).toEqual({ shape: 'ufo', color: 'purple', note: 'x' });
  });

  it('بی‌مرحله: کپیِ محرک authored — هیچ دست‌کاری‌ای؛ با مرحله: امضا حتی روی stim تهی می‌نشیند', () => {
    const authored = { shape: 'star', color: 'yellow' };
    expect(stageStimViewOf(authored, true, null)).toEqual(authored);
    expect(stageStimViewOf(undefined, false, 's2')).toEqual({ shape: 'butterfly', color: 'purple' });
    // برگشتِ کپی — دست‌کاری خروجی به مرحله آسیب نمی‌زند
    const v = stageStimViewOf(authored, true, 's1') as { shape: string };
    v.shape = 'hack';
    expect(STAGE_VISUALS.s1.go.shape).not.toBe('hack');
  });

  it('برچسب فارسی امضاها — قدم آموزش با همین برچسب هم‌خوان است', () => {
    expect(stimLabelOf(STAGE_VISUALS.s1.go)).toBe('ماهی نارنجی');
    expect(stimLabelOf(STAGE_VISUALS.s1.nogo)).toBe('خرچنگ آبی');
    expect(stimLabelOf(STAGE_VISUALS.s2.go)).toBe('گل قرمز');
    expect(stimLabelOf(STAGE_VISUALS.s2.nogo)).toBe('پروانه بنفش');
    expect(stimLabelOf(STAGE_VISUALS.s3.go)).toBe('بادکنک زرد');
    expect(stimLabelOf(STAGE_VISUALS.s3.nogo)).toBe('ابر آبی');
    expect(stimLabelOf(STAGE_VISUALS.s4.go)).toBe('موشک نارنجی');
    expect(stimLabelOf(STAGE_VISUALS.s4.nogo)).toBe('بشقاب‌پرنده بنفش');
    expect(stimLabelOf(STAGE_VISUALS.s5.go)).toBe('ستاره زرد');
    expect(stimLabelOf(STAGE_VISUALS.s5.nogo)).toBe('مربع آبی');
  });
});
