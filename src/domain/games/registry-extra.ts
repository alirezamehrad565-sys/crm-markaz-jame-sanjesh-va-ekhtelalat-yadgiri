// registry-extra.ts — سنجه‌های موتورمحور گو/نوگو (فاز ۱ بازطراحی / ۱.۲۵.۱۱)
//
// تصمیم طراحی (به‌جای بازسازی جدول game_metrics برای بازکردن CHECK فرمول):
// بازسازی جدول والد با ارجاع game_goals.metric_id در D1 نیازمند defer_foreign_keys و
// در node:sqlite (شِم آزمون، autocommit) شکننده است — ریسک تولید بی‌مقایسه.
// سنجه‌های درصدی، سنجه‌های موتورند: با نسخهٔ موتور می‌آیند، دستی upsert نمی‌شوند و
// در game_sessions.metrics_json عیناً مثل بقیه ثبت می‌شوند. تعریف‌های شمارشیِ DB دست‌نخورده.
// دفترچهٔ وظیفه §۵: Commission% = CE/کل نوگو×۱۰۰ · Omission% = OE/کل گو×۱۰۰ —
// قاعدهٔ دامنهٔ صفر در فرمول‌ها (pure.ts): مخرج صفر = null، نه صفرِ ساختگی.
//
// G4الف (رفع P3-4): تعریف هر سنجه به ورودیِ نوع خودش در رجیستری (registry.ts) منتقل شد؛
// این ماژول فقط ترکیب نقشه را می‌سازد — ترتیب آرایه عیناً پیشین است چون ترتیب
// GAME_KIND_IDS قطعی و ترتیب درون هر نوع دست‌نخورده مانده.

import { GAME_KIND_IDS, GAME_KINDS, type GameKind } from './registry';
import type { RegistryMetric } from './types';

export { ENGINE_ONLY_FORMULAS } from './registry';

/** سنجه‌های موتورمحور — با listMetrics به رجیستری اضافه می‌شوند؛ ترتیب = ترتیب قطعی نوع‌ها */
export const ENGINE_METRICS: readonly RegistryMetric[] = (GAME_KIND_IDS as readonly GameKind[]).flatMap(
  (kind) => GAME_KINDS[kind].engine_metrics
);

/** ادغام سنجه‌های موتور با رجیستری DB — سنجهٔ موتور همیشه حاضر است؛ تکرار ممکن نیست (ids متمایز) */
export function mergeEngineMetrics(dbRows: RegistryMetric[]): RegistryMetric[] {
  const ids = new Set(dbRows.map((m) => m.id));
  const extra = ENGINE_METRICS.filter((m) => !ids.has(m.id));
  return [...dbRows, ...extra].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
