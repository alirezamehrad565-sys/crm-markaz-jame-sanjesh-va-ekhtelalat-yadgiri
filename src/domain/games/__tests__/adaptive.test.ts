// آزمون طلایی سازگاری فقط-تمرین (فاز ۶ بازطراحی / ۱.۲۵.۱۶)
import { describe, it, expect } from 'vitest';
import {
  decideAdaptive,
  applyAdaptiveLevel,
  serializeDecision,
  ADAPTIVE_MIN_SESSIONS,
  WINDOW_MIN_MS,
  WINDOW_MAX_MS
} from '../adaptive';
import type { AdaptiveSessionInput, AdaptiveLevel } from '../adaptive';

const L1500: AdaptiveLevel = { response_window_go_ms: 1500, level: 3 };

function sess(over: Partial<AdaptiveSessionInput>): AdaptiveSessionInput {
  return {
    session_id: 's',
    validity: 'valid',
    correct_go_pct: 85,
    correct_nogo_pct: 88,
    commission_pct: 8,
    omission_pct: 12,
    median_rt: 600,
    rt_cv: 0.2,
    premature_total: 0,
    ...over
  };
}

describe('قاعدهٔ «هرگز بر یک خطا/یک جلسه»', () => {
  it('کمتر از دو جلسهٔ معتبر: hold با دلیل شفاف', () => {
    const d = decideAdaptive([sess({})], L1500, { adaptiveEnabled: true });
    expect(d.action).toBe('hold');
    expect(d.change).toBeNull();
    expect(d.evidence.sessions_considered).toBe(1);
    expect(d.reason).toContain('دادهٔ کافی نیست');
    expect(ADAPTIVE_MIN_SESSIONS).toBe(2);
  });

  it('جلسهٔ partial/invalid در تصمیم شرکت نمی‌کند', () => {
    const hist = [sess({ session_id: 'p1', validity: 'partial' }), sess({ session_id: 'v1' })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    expect(d.evidence.sessions_considered).toBe(1);
    expect(d.action).toBe('hold');
  });
});

describe('سخت‌ترشدن — تسلط پایدار دو جلسه + RT پایدار', () => {
  it('دو جلسهٔ عالی پیاپی → پنجره −۱۰۰ms، تک‌تغییر ثبت‌شده', () => {
    const hist = [sess({ session_id: 's1' }), sess({ session_id: 's2', median_rt: 640 })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    expect(d.action).toBe('harder');
    expect(d.change).toEqual({ param: 'response_window_go_ms', from: 1500, to: 1400 });
    expect(d.reason).toContain('پنجره تنگ‌تر شد');
    expect(d.evidence.latest.length).toBe(2);
  });

  it('تسلط اما RT ناپایدار (جهش >۱۵۰ms) → hold', () => {
    const hist = [sess({ median_rt: 500 }), sess({ median_rt: 800 })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    expect(d.action).toBe('hold');
  });

  it('تسلط اما کمیسیون بالای سقف در جلسهٔ دوم → hold', () => {
    const hist = [sess({}), sess({ commission_pct: 15 })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    expect(d.action).toBe('hold');
  });
});

describe('آسان‌ترشدن — فشار بیش از ظرفیت دو جلسهٔ پیاپی', () => {
  it('دو جلسهٔ کمیسیون بالا → پنجره +۱۵۰ms', () => {
    const hist = [
      sess({ commission_pct: 30, correct_nogo_pct: 70, correct_go_pct: 75 }),
      sess({ session_id: 's2', commission_pct: 28, correct_nogo_pct: 65, correct_go_pct: 70 })
    ];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    expect(d.action).toBe('easier');
    expect(d.change).toEqual({ param: 'response_window_go_ms', from: 1500, to: 1650 });
  });

  it('بازداری زیرنصف در دو جلسه → آسان‌ترشدن', () => {
    const hist = [sess({ correct_nogo_pct: 40, commission_pct: 5 }), sess({ session_id: 's2', correct_nogo_pct: 45, commission_pct: 6 })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    expect(d.action).toBe('easier');
  });

  it('تک‌جلسهٔ بد هرگز آسان‌تر نمی‌کند — هرگز بر یک خطا', () => {
    const hist = [sess({ commission_pct: 60 }), sess({ session_id: 'ok2' })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    expect(d.action).toBe('hold');
  });
});

describe('کلید خاموشی درمانگر و کران‌ها', () => {
  it('خاموشی → hold با ثبت صریح — حتی با تاریخچهٔ عالی', () => {
    const hist = [sess({}), sess({ session_id: 's2' })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: false });
    expect(d.action).toBe('hold');
    expect(d.reason).toContain('کلید خاموشی درمانگر');
    expect(d.evidence.enabled).toBe(false);
  });

  it('پنجره در کران پایین: سخت‌ترشدن نمی‌شکند — hold با دلیل', () => {
    const d = decideAdaptive([sess({}), sess({ session_id: 's2' })], { response_window_go_ms: WINDOW_MIN_MS, level: 9 }, { adaptiveEnabled: true });
    expect(d.action).toBe('hold');
    expect(d.reason).toContain('کران');
  });

  it('پنجره در کران بالا: آسان‌ترشدن نمی‌شکند', () => {
    const hist = [sess({ commission_pct: 40, correct_nogo_pct: 30 }), sess({ session_id: 's2', commission_pct: 35, correct_nogo_pct: 35 })];
    const d = decideAdaptive(hist, { response_window_go_ms: WINDOW_MAX_MS, level: 0 }, { adaptiveEnabled: true });
    expect(d.action).toBe('hold');
    expect(d.reason).toContain('کران');
  });
});

describe('سریالی‌سازی و اعمال سطح', () => {
  it('serializeDecision شفاف است: قواعد + ورودی‌ها همه در رکورد', () => {
    const hist = [sess({ session_id: 's1' }), sess({ session_id: 's2' })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    const rec = JSON.parse(serializeDecision(d, 'sess-9', 'training')) as Record<string, unknown>;
    expect(rec.action).toBe('harder');
    expect((rec.rules as Record<string, unknown>).min_sessions).toBe(2);
    expect((rec.latest as unknown[]).length).toBe(2);
    expect(rec.session_id).toBe('sess-9');
    expect(rec.purpose).toBe('training');
  });

  it('applyAdaptiveLevel: تک‌تغییر زنجیره‌ای و گام‌شمار', () => {
    const hist = [sess({}), sess({ session_id: 's2' })];
    const d = decideAdaptive(hist, L1500, { adaptiveEnabled: true });
    const next = applyAdaptiveLevel(L1500, d);
    expect(next.response_window_go_ms).toBe(1400);
    expect(next.level).toBe(4);
    // بدون تصمیم → بی‌تغییر
    expect(applyAdaptiveLevel(L1500, null)).toEqual(L1500);
    // زنجیرهٔ آسان‌ترشدن بعد از سخت‌ترشدن
    const back = applyAdaptiveLevel(next, decideAdaptive(
      [sess({ commission_pct: 40, correct_nogo_pct: 30 }), sess({ session_id: 's2', commission_pct: 35, correct_nogo_pct: 35 })],
      next, { adaptiveEnabled: true }
    ));
    expect(back.response_window_go_ms).toBe(1550);
    expect(back.level).toBe(3);
  });
});
