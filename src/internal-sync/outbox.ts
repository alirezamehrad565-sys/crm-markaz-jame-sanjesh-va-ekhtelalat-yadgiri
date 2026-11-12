/**
 * rust-f11 — صندوق خروج (outbox) موتور محلی برای push نود به ابر
 *
 * قرارداد ثابت (مشترک با کلاینت فرانت‌اند — سمت کلاینت جدا ساخته می‌شود):
 *   GET /api/internal/sync/outbox?since=<ISO-UTC اختیاری>
 *   پاسخ 200: { data: { items: [{ id, domain, at, payload }], generated_at } }
 *
 * دامنه‌ها فقط از NODE_PUSH_DOMAIN_SET (src/node-sync/service.ts) با منبع محلی واقعی:
 *  • client_errors — جدول 0057/0106؛ نویسندهٔ آن src/application/client-errors/service.ts است
 *  • health_ping  — ساخت لحظه‌ای (جدول ندارد)؛ دقیقاً یک آیتم با شناسهٔ ساعت‌بکت
 * usage_summary: skip مستند — منبع محلی واقعی برای شمارنده‌های تجمیعی نود در این فاز سیم
 * نشده است؛ کلاینت به نبودش تحمل دارد (قرارداد). هرگز هیچ دادهٔ بالینی به این صندوق راه
 * ندارد — فهرست سفید push سه‌لایه است و اینجا فقط دو دامنهٔ تله‌متری بی‌نام خوانده می‌شود.
 *
 * نگاشت ستون‌های جدول client_errors → ClientErrorPayloadSchema (اسکیمای مرجع ابر در
 * src/node-sync/service.ts) — هم‌شکل لولهٔ خطای مرورگر خود سامانه:
 *   id (TEXT PK از 0057)          → id آیتم (رشته؛ پایدار/idempotent برای جفت (node_code,id) ابر)
 *   occurred_at (datetime('now')، UTC، فرمت 'YYYY-MM-DD HH:MM:SS')
 *                                 → at آیتم (نرمال ISO ثانیه‌ای با strftime — هم‌الگوی ISO_NORM سمت ابر)
 *   message                       → message            (NOT NULL؛ برش record() ≤۵۰۰ ≤ سقف اسکیما ۲۰۰۰)
 *   source                        → source             (≤۳۰۰ = سقف اسکیما)
 *   line_no                       → line               (INTEGER — قرارداد نام‌گذاری recent() سرویس)
 *   col_no                        → col
 *   stack                         → stack              (برش record() ≤۲۰۰۰ ≤ سقف اسکیما ۸۰۰۰)
 *   url                           → url                (≤۳۰۰ = سقف اسکیما)
 *   app_version (از 0106)         → app_version
 *   user_agent                    → هرگز خوانده/فرستاده نمی‌شود (قانون PII مایگریشن 0106)
 * payload هر ردیف با safeParse اسکیمای مرجع اعتبارسنجی می‌شود؛ ردیف ناسازگار (دادهٔ کهنه/
 * خراب) مسیر را نمی‌شکند و فقط از صفحه حذف می‌شود (حکم م۲۱۰: خروجی مقدار است نه throw).
 *
 * since روی همهٔ آیتم‌ها از جمله health_ping اعمال می‌شود (at > since اکید)؛ بدون since
 * پاسخ همیشه دقیقاً یک health_ping دارد. id ساعت‌بکت یعنی در ابر با dedup جفت
 * (node_code,id) هر ساعت UTC حداکثر یک ping می‌گذرد — تکرار در همان ساعت بی‌اثر است.
 */
import { z } from 'zod';
import { APP_VERSION } from '@core/version';
import type { DbClient } from '@core/db';
import { ValidationError } from '@core/errors';
import { NODE_PUSH_DOMAIN_SET, ClientErrorPayloadSchema, HealthPingPayloadSchema } from '../node-sync';
import type { NodePushDomain } from '../node-sync';

// ─── سقف و اعتبارسنجی since ───

/** سقف آیتم پاسخ outbox — قرارداد کلاینت (۲ برابر سقف یک push ابر NODE_PUSH_MAX_ITEMS=۱۰۰؛
 *  چانک‌بندی سمت کلاینت است) */
export const OUTBOX_MAX_ITEMS = 200;

// zod4 — z.iso.datetime با پیش‌فرض offset:false فقط شکل Z-دار UTC را می‌پذیرد (قرارداد ISO-UTC)
export const OutboxSinceSchema = z.iso.datetime();

/** اعتبارسنجی since اختیاری — غایب/خالی = بدون صافی؛ نامعتبر = ValidationError (۴۰۰ در روت) */
export function parseOutboxSince(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const parsed = OutboxSinceSchema.safeParse(s);
  if (!parsed.success) throw new ValidationError('پارامتر since باید ISO-UTC معتبر باشد (پسوند Z)');
  return parsed.data;
}

// ─── شکل خروجی — عین قرارداد کلاینت ───

export interface OutboxItem {
  id: string;
  domain: NodePushDomain;
  at: string;
  payload: Record<string, unknown>;
}

export interface OutboxPage {
  items: OutboxItem[];
  /** ISO لحظهٔ تولید صفحه */
  generated_at: string;
}

// ─── دامنهٔ client_errors — خواندن جدول 0057/0106 ───

interface ClientErrorQueryRow {
  id: string;
  at: string;
  message: string;
  source: string | null;
  line: number | null;
  col: number | null;
  stack: string | null;
  url: string | null;
  app_version: string | null;
}

/** نگاشت ستون‌ها در خود SELECT — line_no/col_no با قرارداد line/col سرویس client-errors */
const CLIENT_ERROR_COLUMNS = `id,
  COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', occurred_at), occurred_at) AS at,
  message, source, line_no AS line, col_no AS col, stack, url, app_version`;

/**
 * occurred_at جدول 0057 با DEFAULT datetime('now') در فرمت 'YYYY-MM-DD HH:MM:SS' (UTC) است؛
 * since ISO-UTC را به همان فرمت می‌بریم تا مقایسهٔ لغوی در SQL درست بماند — فرمت‌های دوگانه
 * (' ' در برابر 'T' در جایگاه ۱۰) مقایسهٔ مستقیم را می‌شکنند (دام سند node-sync §۵؛
 * هم‌الگوی recent/pruneOld در src/application/client-errors/service.ts).
 */
function sinceToSqlCutoff(sinceIso: string): string {
  return sinceIso.slice(0, 19).replace('T', ' ');
}

async function clientErrorItems(db: DbClient, since: string | null): Promise<OutboxItem[]> {
  const sql = `SELECT ${CLIENT_ERROR_COLUMNS}
                 FROM client_errors
                 ${since ? 'WHERE occurred_at > ?' : ''}
                ORDER BY occurred_at ASC, id ASC
                LIMIT ?`;
  const params = since ? [sinceToSqlCutoff(since), OUTBOX_MAX_ITEMS] : [OUTBOX_MAX_ITEMS];
  const rows = await db.query<ClientErrorQueryRow>(sql, params);
  // گارد دامنه — دفاع دوم لایه؛ این ماژول هرگز دامنهٔ بیرون فهرست سفید push تولید نمی‌کند
  if (!NODE_PUSH_DOMAIN_SET.has('client_errors')) return [];
  const items: OutboxItem[] = [];
  for (const r of rows) {
    const parsed = ClientErrorPayloadSchema.safeParse({
      message: r.message,
      source: r.source,
      line: r.line,
      col: r.col,
      stack: r.stack,
      url: r.url,
      app_version: r.app_version
    });
    if (!parsed.success) continue; // ردیف ناسازگار = حذف از صفحه، نه شکستن مسیر (حکم م۲۱۰)
    items.push({ id: String(r.id), domain: 'client_errors', at: String(r.at), payload: parsed.data as Record<string, unknown> });
  }
  return items;
}

// ─── دامنهٔ health_ping — ساخت لحظه‌ای، همیشه دقیقاً یک آیتم ───

/**
 * ping سلامت موتور محلی — id ساعت‌بکت `ping-<YYYY-MM-DD>THH` (UTC).
 * counters فقط عدد تجمیعی محلی است (قانون طلایی «تجمیع در نود، فقط عدد در ابر»):
 * client_errors_24h همان COUNT بی‌نام هم‌سایهٔ src/application/health/service.ts —
 * هیچ رشتهٔ خطا یا دادهٔ مشخصی عبور نمی‌کند.
 */
async function healthPingItem(db: DbClient, now: Date): Promise<OutboxItem> {
  const errs24h = await db.queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM client_errors WHERE occurred_at >= datetime('now', '-24 hours')"
  );
  const hour = now.toISOString().slice(0, 13); // '2026-11-12T13'
  const payload = HealthPingPayloadSchema.parse({
    ok: true,
    version: APP_VERSION, // نسخهٔ اپ از @core/version — فیلد version اسکیما
    counters: { client_errors_24h: Number(errs24h?.n ?? 0) }
  });
  return {
    id: `ping-${hour}`,
    domain: 'health_ping',
    at: `${hour}:00:00Z`,
    payload: payload as Record<string, unknown>
  };
}

// ─── ساخت صفحهٔ outbox ───

/**
 * صفحهٔ outbox — آیتم‌های قابل‌پوش برای کلاینت فرانت‌اند:
 *  • since (اعتبارسنجی‌شده با parseOutboxSince) روی همهٔ آیتم‌ها اکید است: at > since؛
 *    ping ساعت‌بکت در لحظه‌های مرزی با مقایسهٔ لحظه‌ای (Date.parse) سنجیده می‌شود نه لغوی،
 *    چون since ممکن است میلی‌ثانیه‌دار باشد و at ثانیه‌ای.
 *  • مرتب ASC بر حسب at (خروجی هر دو دامنه ISO ثانیه‌ای یکدست است)؛ تیراز id برای قطعیت.
 *  • سقف ۲۰۰ آیتم روی کل صفحه — ping چون تازه‌ترین at را دارد در پس‌انداز شلوغ جا می‌ماند
 *    و در دورهٔ بعد (با watermark پیش‌رفتهٔ کلاینت) می‌گذرد.
 */
export async function buildOutboxPage(
  db: DbClient,
  since: string | null,
  now: Date = new Date()
): Promise<OutboxPage> {
  const [errors, ping] = await Promise.all([clientErrorItems(db, since), healthPingItem(db, now)]);
  const includePing = !since || Date.parse(ping.at) > Date.parse(since);
  const items = includePing ? [...errors, ping] : errors;
  items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { items: items.slice(0, OUTBOX_MAX_ITEMS), generated_at: now.toISOString() };
}
