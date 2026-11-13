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
 *  • rust-f12-A — نگاشت نمایشی: payload اطلاعیهٔ مرکز بلافاصله پس از استقرار موفق در صندوق
 *    با UPSERT به synced_announcements (مایگریشن 0112) می‌رود؛ جدول اصلی announcements (0008)
 *    created_by NOT NULL REFERENCES staff(id) دارد و payload چون FK محلی ندارد، درج در آن
 *    دروغ FK است — جدول نمایشی جدا؛ صندوق transport log و منبع حقیقت می‌ماند.
 * قرارداد پاکت: هم‌الگوی node-sync (data/error envelope) و آزمون‌پذیر.
 */
import { z } from 'zod';
import { NODE_PULL_DOMAIN_SET } from '../node-sync'; // هم‌سطح — آینهٔ فهرست سفید سمت ابر
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';

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

/**
 * نگاشت نمایشی rust-f12-A — payload اطلاعیهٔ مرکز را با UPSERT به synced_announcements (0112)
 * می‌نویسد؛ فقط برای دامنهٔ announcements و بلافاصله پس از استقرار موفق آیتم در صندوق.
 *  • payload بدون title معتبر → نگاشت نرم رد می‌شود (false) — صندوق دست‌نخورده می‌ماند؛
 *    صندوق منبع حقیقت است و این فقط «نمایش» می‌سازد.
 *  • مُهر انتشار: published_at اگر در payload بود؛ وگرنه created_at پروژektion فعلی ابر؛ وگرنه NULL.
 *  • duplicate هم نگاشت می‌شود (upsert همان مقادیر — بی‌ضرر) تا ردیف synced همیشه بازتاب
 *    payload صندوق باشد؛ received_at در هر نگاشت تازه می‌شود.
 *  • هیچ خطایی به مسیر ingest نشتی نمی‌کند (حکم م۲۱۰) — خطا فقط warn می‌شود.
 */
export async function projectSyncedAnnouncement(
  db: DbClient,
  id: string,
  payload: Record<string, unknown>,
  log?: Logger
): Promise<boolean> {
  try {
    const title = typeof payload.title === 'string' ? payload.title : '';
    if (title.trim().length === 0) return false; // نگاشت نرم — صندوق دست‌نخورده می‌ماند
    const body = typeof payload.body === 'string' ? payload.body : '';
    const publishedAt =
      typeof payload.published_at === 'string' && payload.published_at.length > 0
        ? payload.published_at
        : (typeof payload.created_at === 'string' && payload.created_at.length > 0 ? payload.created_at : null);
    const active = payload.active === false || payload.active === 0 ? 0 : 1; // پیش‌فرض نمایش فعال
    await db.query(
      `INSERT INTO synced_announcements (id, title, body, published_at, active, received_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         body = excluded.body,
         published_at = excluded.published_at,
         active = excluded.active,
         received_at = datetime('now')`,
      [id, title, body, publishedAt, active]
    );
    return true;
  } catch (err) {
    // نگاشت نمایشی هرگز ingest را نمی‌شکند — صندوق درست نوشته شده و منبع حقیقت است
    log?.warn('internal_sync.announcement_projection_failed', { id, error: String(err) });
    return false;
  }
}

/** نگاشت فقط برای دامنهٔ اطلاعیه‌ها — دامنه‌های دیگر (packages/library) مسیر قبلی خود را دارند */
async function projectIfAnnouncement(db: DbClient, item: IngestItem, log?: Logger): Promise<void> {
  if (item.domain !== 'announcements') return;
  await projectSyncedAnnouncement(db, item.id, item.payload, log);
}

/** آیتم تازه؟ (updated_at/payload با رکورد موجود یکسان نیست) */
export async function ingestInboxItem(db: DbClient, item: IngestItem, log?: Logger): Promise<IngestResult> {
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
    await projectIfAnnouncement(db, item, log);
    return 'inserted';
  }
  if (existing.updated_at === item.updated_at && existing.payload === payloadJson) {
    await projectIfAnnouncement(db, item, log); // duplicate — نگاشت نمایشی هم‌چنان تضمین می‌شود
    return 'duplicate';
  }
  await db.query(
    'UPDATE node_sync_inbox SET updated_at = ?, payload = ?, received_at = datetime(\'now\') WHERE domain = ? AND id = ?',
    [item.updated_at, payloadJson, item.domain, item.id]
  );
  await projectIfAnnouncement(db, item, log);
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

/** rust-f12-A — شمارش جدول نمایشی اطلاعیه‌ها — فیلد synced_announcements در GET /status */
export async function syncedAnnouncementsCount(db: DbClient): Promise<number> {
  const row = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM synced_announcements');
  return Number(row?.n ?? 0);
}
