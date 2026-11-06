// registry-extra.ts — سنجه‌های موتورمحور گو/نوگو (فاز ۱ بازطراحی / ۱.۲۵.۱۱)
//
// تصمیم طراحی (به‌جای بازسازی جدول game_metrics برای بازکردن CHECK فرمول):
// بازسازی جدول والد با ارجاع game_goals.metric_id در D1 نیازمند defer_foreign_keys و
// در node:sqlite (شِم آزمون، autocommit) شکننده است — ریسک تولید بی‌مقایسه.
// سنجه‌های درصدی، سنجه‌های موتورند: با نسخهٔ موتور می‌آیند، دستی upsert نمی‌شوند و
// در game_sessions.metrics_json عیناً مثل بقیه ثبت می‌شوند. تعریف‌های شمارشیِ DB دست‌نخورده.
// دفترچهٔ وظیفه §۵: Commission% = CE/کل نوگو×۱۰۰ · Omission% = OE/کل گو×۱۰۰ —
// قاعدهٔ دامنهٔ صفر در فرمول‌ها (pure.ts): مخرج صفر = null، نه صفرِ ساختگی.

import type { RegistryMetric } from './types';

/** فرمول‌هایی که فقط از موتور می‌آیند — upsert دستی ممنوع (CHECK دیتابیس می‌پذیرد اما کد اجازه نمی‌دهد) */
export const ENGINE_ONLY_FORMULAS: readonly string[] = [
  'correct_go_pct',
  'correct_nogo_pct',
  'commission_pct',
  'omission_pct'
];

/** سنجه‌های درصدی موتورمحور — با listMetrics به رجیستری اضافه می‌شوند */
export const ENGINE_METRICS: readonly RegistryMetric[] = [
  { id: 'correct_go_pct_gonogo', title_fa: 'درصد گوهای درست', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'correct_go_pct' },
  { id: 'correct_nogo_pct_gonogo', title_fa: 'درصد بازداری درست نوگو', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'correct_nogo_pct' },
  { id: 'commission_pct_gonogo', title_fa: 'درصد خطای پاسخ به غیرهدف', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'commission_pct' },
  { id: 'omission_pct_gonogo', title_fa: 'درصد از دست‌دادن هدف', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'omission_pct' }
] as const;

/** ادغام سنجه‌های موتور با رجیستری DB — سنجهٔ موتور همیشه حاضر است؛ تکرار ممکن نیست (ids متمایز) */
export function mergeEngineMetrics(dbRows: RegistryMetric[]): RegistryMetric[] {
  const ids = new Set(dbRows.map((m) => m.id));
  const extra = ENGINE_METRICS.filter((m) => !ids.has(m.id));
  return [...dbRows, ...extra].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
