// src/core/human-events — صفٔ رویدادهای انسانی فارسی (۴-۳ طرح ارتقا — سمت اپ/ورکر)
//
// هم‌قرارداد scripts/engine/human-log.mjs (سمت ناظر node): رویدادها به‌صورت آرایهٔ JSON در
// جدول settings زیر کلید sys_human_events نگه‌داری می‌شوند (سقف ۲۰۰ — قدیمی‌ترها بیرون) تا:
//   ① ناظر موتور آن‌ها را در فایل گردش‌پذیر events-fa.log بریزد،
//   ② بستهٔ خطا (GET /api/support/error-package) دم همین صف را حمل کند.
// متن پیام‌ها فارسیِ کاربر-رو است و پوشش رویدادهای تازه در همان نگاشت ۱.۲۶.۱
// (src/core/errors/human-messages.ts) گسترش یافته — ماژول نگاشت دومی ساخته نمی‌شود.
import type { DbClient } from '@core/db';

/** کلید صف — هم‌قرارداد سمت node (engine/human-log.mjs) */
export const HUMAN_EVENTS_QUEUE_KEY = 'sys_human_events';

/** سقف صف — قدیمی‌ترها بی‌صدا بیرون می‌ریزند */
export const HUMAN_EVENTS_MAX = 200;

/** یک رویداد انسانی — ts به ISO UTC؛ msg فارسی کاربر-رو */
export interface HumanEvent {
  ts: string;
  source: string;
  msg: string;
}

/** افزودن رویداد به صف — best-effort؛ شکست هیچ مسیری را نمی‌شکند */
export async function pushHumanEvent(db: DbClient, msg: string, source: string): Promise<void> {
  try {
    let list: HumanEvent[] = [];
    const row = await db.queryOne<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [
      HUMAN_EVENTS_QUEUE_KEY
    ]);
    if (row?.value) {
      const parsed: unknown = JSON.parse(row.value);
      if (Array.isArray(parsed)) list = parsed as HumanEvent[];
    }
    list.push({ ts: new Date().toISOString(), source, msg });
    while (list.length > HUMAN_EVENTS_MAX) list.shift();
    await db.execute(
      `INSERT INTO settings (key, value, updated_by) VALUES (?, ?, 'system')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = 'system', updated_at = datetime('now')`,
      [HUMAN_EVENTS_QUEUE_KEY, JSON.stringify(list)]
    );
  } catch {
    // ثبت رویداد هرگز جریان اصلی را نمی‌شکند
  }
}

/** خواندن دم صف (تازه‌ترین آخر) — خرابی = آرایهٔ خالی */
export async function readHumanEvents(db: DbClient, limit: number = HUMAN_EVENTS_MAX): Promise<HumanEvent[]> {
  try {
    const row = await db.queryOne<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [
      HUMAN_EVENTS_QUEUE_KEY
    ]);
    if (!row?.value) return [];
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as HumanEvent[]).slice(-limit) : [];
  } catch {
    return [];
  }
}
