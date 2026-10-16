/**
 * ماژول غربالگری — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منطق خالص سنجش روزانه (بدون I/O) — همتای lib/screening در دموی Next.js
// پارس «نام + #برچسب»، پاک‌سازی برچسب‌ها، و محاسبهٔ KPI مدیر.

import {
  SCREENING_PREDEFINED_TAGS,
  SCREENING_REFERRAL_TAGS
} from './types';
import type {
  ScreeningDayCount,
  ScreeningEntry,
  ScreeningListFilters,
  ScreeningStats,
  ScreeningTagCount,
  ScreeningTagKind
} from './types';

const PREDEFINED_LABELS = new Set<string>(SCREENING_PREDEFINED_TAGS.map((t) => t.label));
const KIND_BY_LABEL = new Map<string, ScreeningTagKind>(
  SCREENING_PREDEFINED_TAGS.map((t) => [t.label, t.kind as ScreeningTagKind])
);

/** سقف‌های ورودی — عمداً کوچک؛ این ماژول پروفایل ندارد */
export const SCREENING_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  tagsMax: 12,
  tagMax: 60,
  listTake: 2000
} as const;

// ─────────────── پارس ورودی «نام و فامیل + #برچسب‌ها» ───────────────

/** «مهدکودک_ستاره» → «مهدکودک ستاره» — خط‌زیر/خط‌تیره = فاصله */
export function normalizeTagToken(token: string): string {
  return token.replace(/[_\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface ParsedEntryInput {
  name: string;
  hashTags: string[];
}

/**
 * هر توکن #واحد از متن جدا و برچسب می‌شود؛ باقیِ متن = نام و فامیل.
 * «آوا محمدی #مهدکودک_ستاره #بینایی» → { name: 'آوا محمدی', hashTags: ['مهدکودک ستاره', 'بینایی'] }
 */
export function parseEntryInput(raw: string): ParsedEntryInput {
  const hashTags: string[] = [];
  const name = String(raw ?? '')
    .replace(/[#＃]([\p{L}\p{N}][\p{L}\p{N}_\-–]*)/gu, (_m, t: string) => {
      const label = normalizeTagToken(t);
      if (label && !hashTags.includes(label)) hashTags.push(label);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { name, hashTags };
}

/**
 * اگر برچسب # با نام یک برچسب ثابت بخواند (تطابق کامل یا «شامل» برای اسم کوتاه
 * مثل «بینایی»)، همان برچسب ثابت برمی‌گردد — وگرنه برچسب آزاد باقی می‌ماند.
 */
export function resolveHashTag(label: string): string {
  if (PREDEFINED_LABELS.has(label)) return label;
  for (const p of SCREENING_PREDEFINED_TAGS) {
    if (label.length >= 3 && p.label.includes(label)) return p.label;
  }
  return label;
}

/** پاک‌سازی آرایهٔ برچسب ورودی کاربر (ثابت + آزاد) — trim، dedupe، سقف */
export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== 'string') continue;
    const label = t.trim().slice(0, SCREENING_LIMITS.tagMax);
    if (!label || out.includes(label)) continue;
    out.push(label);
    if (out.length >= SCREENING_LIMITS.tagsMax) break;
  }
  return out;
}

/** ترکیب برچسب‌های پارس‌شده از متن + برچسب‌های تاگل‌شده — بدون تکرار، همگی resolve می‌شوند */
export function mergeTags(parsed: ParsedEntryInput, toggled: string[]): string[] {
  const out: string[] = [];
  for (const t of [...parsed.hashTags, ...sanitizeTags(toggled)]) {
    const resolved = resolveHashTag(t);
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/** نام نرمال‌شده یا خطای اعتبار — نام باید ۲ تا ۸۰ نویسه باشد */
export function normalizeName(raw: unknown): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < SCREENING_LIMITS.nameMin || name.length > SCREENING_LIMITS.nameMax) {
    return '';
  }
  return name;
}

// ─────────────── فیلترها ───────────────

/** فیلتر برچسب با معنای OR — ورودی که «هر یک» از برچسب‌های خواسته‌شده را دارد */
export function applyTagFilter(entries: ScreeningEntry[], tags: string[]): ScreeningEntry[] {
  if (tags.length === 0) return entries;
  return entries.filter((e) => e.tags.some((t) => tags.includes(t)));
}

// ─────────────── KPI مدیر (pure) ───────────────

function tagKind(label: string): ScreeningTagCount['kind'] {
  return KIND_BY_LABEL.get(label) ?? 'custom';
}

/** آیا ورودی «برچسب ثابت» (ارجاع یا وضعیت) دارد؟ برچسب‌های آزاد # (کارمند/مهدکودک) شمرده نمی‌شوند */
export function hasPredefinedTag(tags: string[]): boolean {
  return tags.some((t) => PREDEFINED_LABELS.has(t));
}

/**
 * KPI روی همان ورودی‌های فیلترشده:
 * total / normal (بدون برچسب ثابت — برچسب کارمند/مهدکودک او را از عادی خارج نمی‌کند)
 * referrals (حداقل یک برچسب ارجاع) / referralRate٪
 * noCoop، noReg، perTag (نزولی) و byDay (صعودی)
 */
export function screeningStats(entries: ScreeningEntry[]): ScreeningStats {
  let normal = 0;
  let referrals = 0;
  let noCoop = 0;
  let noReg = 0;
  const perTagMap = new Map<string, number>();
  const byDayMap = new Map<string, number>();

  for (const e of entries) {
    if (!hasPredefinedTag(e.tags)) normal += 1;
    if (e.tags.some((t) => SCREENING_REFERRAL_TAGS.includes(t))) referrals += 1;
    if (e.tags.includes('عدم همکاری')) noCoop += 1;
    if (e.tags.includes('نداشتن ثبت‌نام')) noReg += 1;
    for (const t of e.tags) perTagMap.set(t, (perTagMap.get(t) ?? 0) + 1);
    byDayMap.set(e.day, (byDayMap.get(e.day) ?? 0) + 1);
  }

  const perTag: ScreeningTagCount[] = [...perTagMap.entries()]
    .map(([label, count]) => ({ label, count, kind: tagKind(label) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fa'));

  const byDay: ScreeningDayCount[] = [...byDayMap.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const total = entries.length;
  return {
    total,
    normal,
    referrals,
    referralRate: total === 0 ? 0 : Math.round((referrals / total) * 100),
    noCoop,
    noReg,
    perTag,
    byDay
  };
}
