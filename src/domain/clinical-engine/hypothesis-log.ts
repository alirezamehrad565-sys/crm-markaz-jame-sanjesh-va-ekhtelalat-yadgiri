// لج فرضیه: اسنپ‌شاتِ هر محاسبهٔ موتور در رویداد پرونده (case_events با نوع
// سیستمی ce-hypothesis-log-v1) ذخیره می‌شود تا تغییر رتبه‌ها در زمان دیده شود.
// قاعدهٔ کم‌نویس: فقط وقتی اثرانگشت رتبه‌بندی عوض شده باشد رکورد جدید می‌نشیند —
// باز کردن مکرر تب تفسیر، لج را شلوغ نمی‌کند.
import type { RankedHypothesis } from './types';

export const HYPOTHESIS_LOG_EVENT_KEY = 'ce-hypothesis-log-v1';

export const HYPOTHESIS_LOG_TITLE = 'لج فرضیهٔ بالینی (خودکار)';

export interface HypothesisLogEntry {
  targetKey: string;
  targetTitle: string;
  score: number;
  confidence: string;
  needsExclusionRuling: boolean;
}

export function hypothesisLogEntriesOf(ranked: RankedHypothesis[]): HypothesisLogEntry[] {
  return ranked.map((h) => ({
    targetKey: h.targetKey,
    targetTitle: h.targetTitle,
    score: h.score,
    confidence: h.confidence,
    needsExclusionRuling: Boolean(h.needsExclusionRuling)
  }));
}

// اثرانگشت رتبه‌بندی: کلید، امتیاز، اطمینان و ترتیب — هر تغییری یعنی رکورد جدید
export function hypothesisLogFingerprint(ranked: RankedHypothesis[]): string {
  return hypothesisLogEntriesOf(ranked)
    .map((e) => `${e.targetKey}:${e.score}:${e.confidence}`)
    .join('|');
}

export function hypothesisLogPayload(ranked: RankedHypothesis[], generatedAt: string): {
  fingerprint: string;
  generatedAt: string;
  ranked: HypothesisLogEntry[];
} {
  return { fingerprint: hypothesisLogFingerprint(ranked), generatedAt, ranked: hypothesisLogEntriesOf(ranked) };
}

function faDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

// خط خلاصهٔ تایم‌لاین — سقف ۳۰۰ کاراکتر (قرارداد ستون summary)
export function hypothesisLogSummary(ranked: RankedHypothesis[]): string {
  const head = ranked
    .slice(0, 3)
    .map((h, i) => `${faDigits(i + 1)}. ${h.targetTitle} (امتیاز ${faDigits(h.score)}، اطمینان ${h.confidence})`)
    .join(' · ');
  return `لج فرضیه: ${head}`.slice(0, 300);
}

export type RankMovement = 'up' | 'down' | 'same' | 'new';

// جابه‌جایی رتبهٔ هر هدف نسبت به اسنپ‌شات قبلی — «new» یعنی تازه وارد فهرست شده
export function rankMovementsOf(current: RankedHypothesis[], previous: RankedHypothesis[]): Record<string, RankMovement> {
  const prevRank = new Map<string, number>();
  previous.forEach((h, i) => prevRank.set(h.targetKey, i));
  const out: Record<string, RankMovement> = {};
  current.forEach((h, i) => {
    const p = prevRank.get(h.targetKey);
    if (p === undefined) out[h.targetKey] = 'new';
    else if (i < p) out[h.targetKey] = 'up';
    else if (i > p) out[h.targetKey] = 'down';
    else out[h.targetKey] = 'same';
  });
  return out;
}
