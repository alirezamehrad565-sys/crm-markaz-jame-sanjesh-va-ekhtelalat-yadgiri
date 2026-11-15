// adaptive.ts — سازگاری خودکار سختی — فقط حالت تمرین (فاز ۶ بازطراحی گو/نوگو / ۱.۲۵.۱۶)
// دفترچهٔ وظیفه §۶:
//   · بر پایهٔ CE/OE/RT/پراکندگی/پایداری/درک — هرگز بر یک خطای تکی
//   · در هر تصمیم فقط «یک تغییر کنترل‌شده»؛ همهٔ ورودی‌ها ثبت می‌شوند
//   · درمانگر می‌تواند خاموشش کند (کلید خاموشی) — خاموشی هم ثبت می‌شود
//   · فقط Training History؛ ارزیابی هرگز سازگار نمی‌شود (C1)
// موتور خالص — بدون DB/UI؛ تاریخچه‌ها با آزمون طلایی پوشش داده شده‌اند.

export interface AdaptiveSessionInput {
  /** شناسهٔ جلسه — ثبت ردیابی */
  session_id: string;
  /** فقط جلسه‌های معتبر در تصمیم شرکت می‌کنند (partial/invalid نادیده) */
  validity: 'valid' | 'partial' | 'invalid';
  correct_go_pct: number | null;
  correct_nogo_pct: number | null;
  commission_pct: number | null;
  omission_pct: number | null;
  median_rt: number | null;
  rt_cv: number | null;
  premature_total: number;
}

export interface AdaptiveLevel {
  /** پنجرهٔ پاسخ گو فعال (ms) — تنها پارامتر کنترل نسخهٔ ۱ */
  response_window_go_ms: number;
  /** سطح گام — ثبت روایت، نه سنجه */
  level: number;
}

export type AdaptiveAction = 'hold' | 'easier' | 'harder';

export interface AdaptiveDecision {
  action: AdaptiveAction;
  /** یک تغییر کنترل‌شده — hold: null */
  change: { param: string; from: number; to: number } | null;
  reason: string;
  /** ورودی‌های تصمیم — همه‌چیز ثبت می‌شود (شفافیت برای درمانگر) */
  evidence: {
    sessions_considered: number;
    latest: AdaptiveSessionInput[];
    enabled: boolean;
  };
}

// ─── ثابت‌های قاعده (شفاف و قابل‌تنظیم — تغییرش = بامپ نسخهٔ پروتکل) ───

/** تعداد جلسهٔ معتبر پیاپی لازم برای هر تغییر — «هرگز بر یک خطا/یک جلسه» */
export const ADAPTIVE_MIN_SESSIONS = 2;
/** آستانهٔ سخت‌ترشدن: بازداری عالی + کمیسیون پایین + گوهای درست خوب */
export const HARDER_NOGO_PCT = 85;
export const HARDER_COMMISSION_PCT = 10;
export const HARDER_GO_PCT = 80;
/** آستانهٔ آسان‌ترشدن: بازداری زیرنصف یا کمیسیون بالا */
export const EASIER_COMMISSION_PCT = 25;
export const EASIER_NOGO_PCT = 50;
/** گام‌های پنجره (ms) — محافظه‌کارانه */
export const HARDER_STEP_MS = -100;
export const EASIER_STEP_MS = 150;
/** کران‌های پنجره پاسخ (ms) — بیرون این بازه یعنی بازی دیگری است */
export const WINDOW_MIN_MS = 800;
export const WINDOW_MAX_MS = 3000;
/** پایداری RT برای سخت‌ترشدن — جهش RT یعنی فشار ناشناخته */
export const STABLE_RT_DELTA_MS = 150;

function clampWindow(ms: number): number {
  return Math.min(WINDOW_MAX_MS, Math.max(WINDOW_MIN_MS, Math.round(ms)));
}

function pctOk(v: number | null, threshold: number, direction: 'below' | 'above'): boolean {
  if (v === null || !Number.isFinite(v)) return false;
  return direction === 'below' ? v < threshold : v >= threshold;
}

/**
 * تصمیم سازگاری — ورودی: تاریخچهٔ جلسه‌های معتبر (قدیمی→جدید) + سطح فعلی + کلید خاموشی.
 * تضمین‌ها:
 *   · هیچ تصمیمی با کمتر از ADAPTIVE_MIN_SESSIONS جلسهٔ معتبر پیاپی گرفته نمی‌شود
 *   · حداکثر یک تغییر در هر تصمیم (پنجرهٔ پاسخ)
 *   · خروجی همیشه در کران‌ها؛ تصمیم‌ها صرفاً از جلسه‌های «معتبر» می‌آیند
 */
export function decideAdaptive(
  history: AdaptiveSessionInput[],
  current: AdaptiveLevel,
  opts: { adaptiveEnabled: boolean }
): AdaptiveDecision {
  const evidence = {
    sessions_considered: history.filter((h) => h.validity === 'valid').length,
    latest: history.slice(-ADAPTIVE_MIN_SESSIONS),
    enabled: opts.adaptiveEnabled
  };

  if (!opts.adaptiveEnabled) {
    return { action: 'hold', change: null, reason: 'کلید خاموشی درمانگر — سازگاری غیرفعال است', evidence };
  }

  const valid = history.filter((h) => h.validity === 'valid');
  if (valid.length < ADAPTIVE_MIN_SESSIONS) {
    return { action: 'hold', change: null, reason: `دادهٔ کافی نیست — حداقل ${ADAPTIVE_MIN_SESSIONS} جلسهٔ معتبر پیاپی لازم است`, evidence };
  }
  const recent = valid.slice(-ADAPTIVE_MIN_SESSIONS);

  // ─── آسان‌ترشدن: فشار بیش از ظرفیت (دو جلسهٔ پیاپی) ───
  const struggling = recent.every((h) =>
    pctOk(h.commission_pct, EASIER_COMMISSION_PCT, 'above') ||
    pctOk(h.correct_nogo_pct, EASIER_NOGO_PCT, 'below')
  );
  if (struggling) {
    const to = clampWindow(current.response_window_go_ms + EASIER_STEP_MS);
    if (to === current.response_window_go_ms) {
      return { action: 'hold', change: null, reason: 'نیاز به آسان‌ترشدن اما پنجره در کران است — بازنگری بالینی لازم', evidence };
    }
    return {
      action: 'easier',
      change: { param: 'response_window_go_ms', from: current.response_window_go_ms, to },
      reason: `دو جلسهٔ پیاپی با کمیسیون ≥${EASIER_COMMISSION_PCT}% یا بازداری <${EASIER_NOGO_PCT}% — پنجرهٔ پاسخ گشادتر شد`,
      evidence
    };
  }

  // ─── سخت‌ترشدن: تسلط پایدار (دو جلسهٔ پیاپی) + RT پایدار ───
  const rtStable = (() => {
    const rts = recent.map((h) => h.median_rt).filter((v): v is number => typeof v === 'number');
    if (rts.length < 2) return false;
    return Math.abs(rts[1] - rts[0]) <= STABLE_RT_DELTA_MS;
  })();
  const mastering = recent.every((h) =>
    pctOk(h.correct_nogo_pct, HARDER_NOGO_PCT, 'above') &&
    pctOk(h.commission_pct, HARDER_COMMISSION_PCT, 'below') &&
    pctOk(h.correct_go_pct, HARDER_GO_PCT, 'above')
  );
  if (mastering && rtStable) {
    const to = clampWindow(current.response_window_go_ms + HARDER_STEP_MS);
    if (to === current.response_window_go_ms) {
      return { action: 'hold', change: null, reason: 'تسلط پایدار اما پنجره در کران است — گام بعدی با پروتکل جدید', evidence };
    }
    return {
      action: 'harder',
      change: { param: 'response_window_go_ms', from: current.response_window_go_ms, to },
      reason: `دو جلسهٔ پیاپی با بازداری ≥${HARDER_NOGO_PCT}%، کمیسیون ≤${HARDER_COMMISSION_PCT}% و RT پایدار (±${STABLE_RT_DELTA_MS}ms) — پنجره تنگ‌تر شد`,
      evidence
    };
  }

  return { action: 'hold', change: null, reason: 'هیچ قاعدهٔ گذار برقرار نیست — سطح حفظ می‌شود', evidence };
}

/** سریالی‌سازی تصمیم برای adaptive_json — شفاف و کامل */
export function serializeDecision(d: AdaptiveDecision, sessionId: string, purpose: string): string {
  return JSON.stringify({
    session_id: sessionId,
    purpose,
    action: d.action,
    change: d.change,
    reason: d.reason,
    sessions_considered: d.evidence.sessions_considered,
    latest: d.evidence.latest,
    enabled: d.evidence.enabled,
    rules: {
      min_sessions: ADAPTIVE_MIN_SESSIONS,
      harder: { nogo_pct: HARDER_NOGO_PCT, commission_pct: HARDER_COMMISSION_PCT, go_pct: HARDER_GO_PCT, rt_stable_ms: STABLE_RT_DELTA_MS },
      easier: { commission_pct: EASIER_COMMISSION_PCT, nogo_pct: EASIER_NOGO_PCT },
      steps_ms: { harder: HARDER_STEP_MS, easier: EASIER_STEP_MS },
      window_clamp: [WINDOW_MIN_MS, WINDOW_MAX_MS]
    }
  });
}

/** اعمال آخرین تصمیم روی سطح فعال — برای اسنپ‌شات پروتکل جلسهٔ بعد */
export function applyAdaptiveLevel(current: AdaptiveLevel, decision: AdaptiveDecision | null): AdaptiveLevel {
  if (!decision || !decision.change || decision.change.param !== 'response_window_go_ms') return { ...current };
  return { response_window_go_ms: clampWindow(decision.change.to), level: current.level + (decision.action === 'harder' ? 1 : decision.action === 'easier' ? -1 : 0) };
}
