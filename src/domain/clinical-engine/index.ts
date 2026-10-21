/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// + — موتور بالینی مرکز: لایهٔ دانش + موتور شناسایی + پروتکل قضاوت
// ملاک DSM-5-TR + باتری ابزار + ۱۸ هدف + قواعد شواهد + تفسیر زنده + مسیر مداخله

export * from './types';
export * from './instruments';
export * from './dsm-criteria';
export * from './targets';
export * from './rules';
export * from './wechsler-link';
export * from './infer';
export * from './narrative';
export * from './service';
export * from './routes';
// T1 (m146) — لایهٔ سیگنال: قرارداد ClinicalSignal + جدول بازه‌های FSIQ (افزودنی)
export * from './signals';
// T6 (m148-b) — هم‌گرایی چندمنبعی: جدول منابع + سه حالت خوانا (افزودنی)
export * from './convergence';
// T3 (m147) — پیشنهادگر چک‌لیست: ۱۴ قاعدهٔ §۲.۴ + سناریوی دیرآموز §۳.۱ (افزودنی)
export * from './recommender';
