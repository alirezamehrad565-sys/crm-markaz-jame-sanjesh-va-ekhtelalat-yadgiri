/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — متن روایت بالینی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// قواعد نوشتار «لحن ساده» (پلن §۶) — سه‌بخشی «چه دیدیم / یعنی چه / گام بعدی»
// قواعد هاردکد و تست‌پذیر:
// ۱. هر فرضیه سه بخش ثابت دارد؛ ۲. اصطلاح فنی یک خط «به زبان ساده» دارد؛
// ۳. عدد فقط فارسی و در قالب «۱۸ از ۴۰ — ناحیهٔ بالینی»؛ ۴. جمله ≤ دو خط، بدون قطعیت کاذب؛
// ۵. متن‌های خانواده/معلم از دفترها می‌آید؛ متن موتور فقط برای پنل درمانگر/مدیر است.

import type { InferenceOutput, RankedHypothesis } from './types';
import { targetOf } from './targets';

// ───────── قواعد نوشتار ─────────

/** ارقام لاتین/عرب → فارسی (قالب عددی §۶ قاعدهٔ ۳) */
export function faNum(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** حذف قطعیت کاذب — واژه‌های ممنوع در متن موتور (تست‌پذیر) */
const CERTAINTY_WORDS = ['قطعاً', 'بلاشک', 'حتماً تشخیص', 'صد در صد', '۱۰۰٪'];

export function assertPlainTone(text: string): void {
  for (const w of CERTAINTY_WORDS) {
    if (text.includes(w)) throw new Error(`لحن ساده: واژهٔ ممنوع «${w}» در متن موتور`);
  }
}

/** برش جمله‌های بلندتر از دو خط (≈۱۲۰ نویسه) — قاعدهٔ ۴ */
function shortLine(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return Array.from(clean).length <= max ? clean : `${Array.from(clean).slice(0, max - 1).join('').trim()}…`;
}

// ───────── سه‌بخشی هر فرضیه ─────────

export interface HypothesisNarrative {
  targetKey: string;
  /** «چه دیدیم» — داده، بدون اصطلاح، با اعداد فارسی */
  saw: string;
  /** «یعنی چه» — یک پاراگراف ساده از متون هدف (دفتر آموزشی) */
  means: string;
  /** «گام بعدی» — یک اقدام مشخص */
  next: string;
}

function sawOf(h: RankedHypothesis): string {
  const parts: string[] = [];
  const evidence = h.evidenceFa.slice(0, 3);
  if (evidence.length > 0) {
    parts.push(shortLine(evidence.map((e) => e.replace(/\.$/, '')).join('؛ ') + '.'));
  }
  const counts = h.criteriaSummary;
  if (counts.met > 0 || counts.partial > 0) {
    parts.push(
      shortLine(`در جدول ملاک‌ها: ${faNum(counts.met)} ملاک برآورده، ${faNum(counts.partial)} ناقص از مجموع ملاک‌های DSM.`)
    );
  }
  if (parts.length === 0) parts.push('شواهد کمی ثبت شده است — برای قوی‌شدن فرضیه دادهٔ بیشتری لازم است.');
  return parts.join(' ');
}

function meansOf(h: RankedHypothesis): string {
  // متن «یعنی چه» از دانش‌نامهٔ هدف (دفتر آموزشی) می‌آید — لحن خود مرکز
  const target = targetOf(h.targetKey);
  return shortLine(target ? `شواهد به «${target.title}» اشاره می‌کند. ${target.texts.means}` : `شواهد به هدف «${h.targetTitle}» اشاره می‌کند.`);
}

function nextOf(h: RankedHypothesis): string {
  const target = targetOf(h.targetKey);
  const gap = h.missingFa.length > 0 ? ` ${h.missingFa[0]}` : '';
  return shortLine(target ? `${target.texts.next}${gap}` : `${h.missingFa[0] ?? 'دادهٔ بیشتری جمع کنید.'}`);
}

export function narrativeOfHypothesis(h: RankedHypothesis): HypothesisNarrative {
  const n = { targetKey: h.targetKey, saw: sawOf(h), means: meansOf(h), next: nextOf(h) };
  assertPlainTone(`${n.saw} ${n.means} ${n.next}`);
  return n;
}

// ───────── روایت کامل خروجی موتور ─────────

export interface FullNarrative {
  /** سه‌بخشی فرضیهٔ برتر — وقتی فرضیه نیست null */
  top: HypothesisNarrative | null;
  /** متن پیوسته برای بات/کپی — با پانویس خط قرمز */
  text: string;
}

export function narrativeOf(result: InferenceOutput): FullNarrative {
  const top = result.ranked.length > 0 ? narrativeOfHypothesis(result.ranked[0]) : null;

  const lines: string[] = [];
  if (top) {
    lines.push(`فرضیهٔ برتر: ${result.ranked[0].targetTitle} (اطمینان ${result.ranked[0].confidence})`, '');
    lines.push('چه دیدیم:', top.saw, '', 'یعنی چه:', top.means, '', 'گام بعدی:', top.next);
  } else {
    lines.push('هنوز فرضیهٔ روشنی ساخته نشده است.', 'گام بعدی:', result.nextActions[0] ?? 'دادهٔ بیشتری جمع کنید.');
  }
  if (result.discrepancies.length > 0) {
    lines.push('', 'نیاز به بررسی:', ...result.discrepancies.slice(0, 2).map(shortLine));
  }
  if (result.ranked.length > 1) {
    lines.push(
      '',
      'فرضیه‌های دیگر:',
      ...result.ranked.slice(1).map((h) => `• ${h.targetTitle} — اطمینان ${h.confidence}`)
    );
  }
  lines.push('', `— ${result.disclaimer}`);

  const text = lines.join('\n');
  assertPlainTone(text);
  return { top, text };
}
