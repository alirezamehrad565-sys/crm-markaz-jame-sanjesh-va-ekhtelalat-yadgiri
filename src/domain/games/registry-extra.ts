// registry-extra.ts — لایهٔ تجمیع سنجه‌های موتورمحور (فاز ۱ بازطراحی / ۱.۲۵.۱۱)
//
// تصمیم طراحی (به‌جای بازسازی جدول game_metrics برای بازکردن CHECK فرمول):
// بازسازی جدول والد با ارجاع game_goals.metric_id در D1 نیازمند defer_foreign_keys و
// در node:sqlite (شِم آزمون، autocommit) شکننده است — ریسک تولید بی‌مقایسه.
// سنجه‌های درصدی، سنجه‌های موتورند: با نسخهٔ موتور می‌آیند، دستی upsert نمی‌شوند و
// در game_sessions.metrics_json عیناً مثل بقیه ثبت می‌شوند. تعریف‌های شمارشیِ DB دست‌نخورده.
// دفترچهٔ وظیفه §۵: Commission% = CE/کل نوگو×۱۰۰ · Omission% = OE/کل گو×۱۰۰ —
// قاعدهٔ دامنهٔ صفر در فرمول‌ها (pure.ts): مخرج صفر = null، نه صفرِ ساختگی.
// تعریف per-kind سنجه‌ها از G4الف (۱.۲۵.۳۹) در ورودی نوع‌محور registry.ts زندگی می‌کند —
// این فایل فقط flatten می‌کند و گیت upsert دستی را نگه می‌دارد.
import { GAME_KINDS, GAME_KIND_IDS } from './registry';
import type { GameKind } from './registry';
import type { RegistryMetric } from './types';

/** فرمول‌هایی که فقط از موتور می‌آیند — upsert دستی ممنوع (CHECK دیتابیس می‌پذیرد اما کد اجازه نمی‌دهد) */
export const ENGINE_ONLY_FORMULAS: readonly string[] = [
  'correct_go_pct',
  'correct_nogo_pct',
  'commission_pct',
  'omission_pct',
  'scan_fa',
  'scan_miss',
  'congruent_acc',
  'incongruent_acc',
  'interference_ms',
  'nback_match',
  'nback_nonmatch',
  'nback_false_alarm',
  'nback_miss',
  'corsi_seq',
  'corsi_span'
];

/** سنجه‌های درصدی موتورمحور — flatten ورودی‌های per-kind رجیستری به ترتیب قطعی نوع‌ها؛
 *  ترتیب: گونوگو ۴ · اسکن ۲ · استروپ ۳ · فلانکر ۳ · ن‌پشت ۴ · کولهٔ مرواریدها ۲ */
export const ENGINE_METRICS: readonly RegistryMetric[] = (GAME_KIND_IDS as readonly GameKind[])
  .flatMap((kind) => GAME_KINDS[kind].engineMetrics);

/** ادغام سنجه‌های موتور با رجیستری DB — سنجهٔ موتور همیشه حاضر است؛ تکرار ممکن نیست (ids متمایز) */
export function mergeEngineMetrics(dbRows: RegistryMetric[]): RegistryMetric[] {
  const ids = new Set(dbRows.map((m) => m.id));
  const extra = ENGINE_METRICS.filter((m) => !ids.has(m.id));
  return [...dbRows, ...extra].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
