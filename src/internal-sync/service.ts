/**
 * rust-f9 — منطق استقرار سینک نود در میز (سمت موتور محلی)
 *
 * صندوق ورودی (node_sync_inbox — مایگریشن 0110) انبارِ آیتم‌های pullشده از ابر است.
 * اصول:
 *  • فهرست سفید سمت سرورِ میز هم اعمال می‌شود (دفاع سوم در عمق): ابر پالایش می‌کند،
 *    کلاینت پیش‌فیلتر می‌کند و اینجا دوباره — دامنهٔ بیرون NODE_PULL_DOMAIN_SET هرگز
 *    وارد صندوق نمی‌شود (NODE_DOMAIN_FORBIDDEN، هم‌کد سمت ابر).
 *  • idempotency با جفت (domain, id) — آیتم یکسان = duplicate؛ تازه‌تر/متفاوت = updated.
 *  • payload projection است نه ردیف کامل — این ماژول هرگز به جدول‌های اصلی نمی‌نویسد.
 * قرارداد پاکت: هم‌الگوی node-sync (data/error envelope) و آزمون‌پذیر.
 */
import { z } from 'zod';
import { NODE_PULL_DOMAIN_SET } from '../node-sync'; // هم‌سطح — آینهٔ فهرست سفید سمت ابر
import type { DbClient } from '@core/db';

export const SYNC_INGEST_MAX_ITEMS = 100;

export const IngestItemSchema = z.object({
  id: z.string().min(1).max(120),
  domain: z.string().min(1).max(40),
  updated_at: z.string().min(4).max(40),
  payload: z.record(z.string(), z.unknown()) // zod4 — کلید صریح
});

export const IngestBodySchema = z.object({
  items: z.array(IngestItemSchema).min(1).max(SYNC_INGEST_MAX_ITEMS)
});

export type IngestItem = z.infer<typeof IngestItemSchema>;

/** نتیجهٔ هر آیتم — duplicate یعنی (updated_at, payload) عیناً همان قبلی است */
export type IngestResult = 'inserted' | 'updated' | 'duplicate';

export interface IngestCounts {
  inserted: number;
  updated: number;
  duplicates: number;
  by_domain: Record<string, number>;
}

/** آیتم تازه؟ (updated_at/payload با رکورد موجود یکسان نیست) */
export async function ingestInboxItem(db: DbClient, item: IngestItem): Promise<IngestResult> {
  const payloadJson = JSON.stringify(item.payload);
  const existing = await db.queryOne<{ updated_at: string; payload: string }>(
    'SELECT updated_at, payload FROM node_sync_inbox WHERE domain = ? AND id = ?',
    [item.domain, item.id]
  );
  if (!existing) {
    await db.query(
      'INSERT INTO node_sync_inbox (domain, id, updated_at, payload) VALUES (?, ?, ?, ?)',
      [item.domain, item.id, item.updated_at, payloadJson]
    );
    return 'inserted';
  }
  if (existing.updated_at === item.updated_at && existing.payload === payloadJson) return 'duplicate';
  await db.query(
    'UPDATE node_sync_inbox SET updated_at = ?, payload = ?, received_at = datetime(\'now\') WHERE domain = ? AND id = ?',
    [item.updated_at, payloadJson, item.domain, item.id]
  );
  return 'updated';
}

/** پیش‌فیلتر فهرست سفید سمت سرور — آیتم ممنوع هرگز به صندوق نمی‌رسد */
export function splitByWhitelist(items: readonly IngestItem[]): { allowed: IngestItem[]; forbiddenDomains: string[] } {
  const allowed = items.filter((it) => NODE_PULL_DOMAIN_SET.has(it.domain));
  const forbiddenDomains = [...new Set(items.filter((it) => !NODE_PULL_DOMAIN_SET.has(it.domain)).map((it) => it.domain))];
  return { allowed, forbiddenDomains };
}

/** شمارش صندوق بر حسب دامنه — برای نشانگر وضعیت و drill */
export async function inboxStatusCounts(db: DbClient): Promise<{ total: number; by_domain: Record<string, number> }> {
  const rows = await db.query<{ domain: string; n: number }>(
    'SELECT domain, COUNT(*) AS n FROM node_sync_inbox GROUP BY domain ORDER BY domain'
  );
  const by_domain: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    by_domain[r.domain] = Number(r.n);
    total += Number(r.n);
  }
  return { total, by_domain };
}
