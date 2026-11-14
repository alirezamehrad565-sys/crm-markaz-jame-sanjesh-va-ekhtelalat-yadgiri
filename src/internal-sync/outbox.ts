/**
 * rust-f11/f12-B — صندوق خروج (outbox) موتور محلی برای push نود به ابر
 *
 * قرارداد ثابت (مشترک با کلاینت فرانت‌اند — سمت کلاینت جدا ساخته می‌شود):
 *   GET /api/internal/sync/outbox?since=<ISO-UTC اختیاری>
 *   پاسخ 200: { data: { items: [{ id, domain, at, payload }], generated_at } }
 *
 * دامنه‌ها فقط از NODE_PUSH_DOMAIN_SET (src/node-sync/service.ts) با منبع محلی واقعی:
 *  • client_errors — جدول 0057/0106؛ نویسندهٔ آن src/application/client-errors/service.ts است
 *  • health_ping  — ساخت لحظه‌ای (جدول ندارد)؛ دقیقاً یک آیتم با شناسهٔ ساعت‌بکت
 *  • usage_summary (rust-f12-B) — اسنپ‌شات روزانهٔ شمارنده‌های تجمیعی نود از جدول‌های محلی
 *    واقعی (توضیح کامل در بخش خودش پایین)
 * هرگز هیچ دادهٔ بالینی به این صندوق راه ندارد — فهرست سفید push سه‌لایه است و اینجا فقط
 * سه دامنهٔ تله‌متری بی‌نام خوانده می‌شود (قانون طلایی «تجمیع در نود، فقط عدد در ابر»:
 * شمارنده‌ها فقط COUNTاند — هیچ id/نام/ایمیل/متن به payload راه ندارد).
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
 * usage_summary (rust-f12-B) — اسنپ‌شات روزانهٔ شمارنده‌های تجمیعی نود؛ منبع = COUNTهای سادهٔ
 * بی‌PII روی جدول‌های واقعی محلی:
 *   students_active    — students با active=1 (ثبت‌نام زندهٔ مرکز)
 *   appointments_total — همهٔ appointments (حجم کل برنامه‌ریزی)
 *   appointments_7d    — appointments ۷ روز اخیر بر created_at (پویایی هفتهٔ جاری)
 *   day_notes_total    — day_notes مایگریشن 0012 (نزدیک‌ترین جدول واقعی به «session_notes»
 *                        پیشنهادی؛ جدولی به آن نام وجود ندارد و ساخت جدول جدید ممنوع است)
 *   audit_events_24h   — audit_log در ۲۴ ساعت اخیر (نبض فعالیت پرسنل، بی‌نام)
 *   inbox_items_total  — node_sync_inbox مایگریشن 0110 (حجم دادهٔ دریافتی از ابر)
 * هر شمارنده یک COUNT ساده است؛ اگر جدول وجود نداشت/کوئری خطا خورد یا مقدار متناهی نبود
 * (NaN/Infinity) فقط همان شمارنده حذف می‌شود (نرم) و خود آیتم می‌ماند. payload رکورد تخت
 * «نام‌متریک snake ≤۶۴ → عدد» با UsageSummaryPayloadSchema (اسکیمای مرجع ابر) safeParse
 * می‌شود؛ ناسازگار = حذف آیتم از صفحه (حکم م۲۱۰، هم‌الگوی بقیهٔ outbox).
 *
 * id بکت روزانهٔ UTC `usage-<YYYY-MM-DD>` و at = ابتدای همان بکت است — هم‌الگوی ping
 * ساعت‌بکت که at آن ابتدای ساعت است نه لحظهٔ واقعی ساخت. این بکت‌شدن عمدی است: بکتِ روز
 * همیشه ≤ «اکنون» است، پس فیلتر since اکید (at > since) رفتار قطعی دارد (با since=اکنون
 * مثل بقیه فیلتر می‌شود) و در روز بعد با at تازه می‌گذرد؛ ارسال دوبارهٔ همان روز هم id یکی
 * می‌ماند و ابر با dedup جفت (node_code,id) حداکثر یک اسنپ‌شات روز می‌گذراند.
 *
 * since روی همهٔ آیتم‌ها اعمال می‌شود (at > since اکید)؛ بدون since پاسخ همیشه دقیقاً یک
 * health_ping و یک usage_summary دارد. id ساعت‌بکت ping یعنی در ابر با dedup جفت
 * (node_code,id) هر ساعت UTC حداکثر یک ping می‌گذرد — تکرار در همان ساعت بی‌اثر است؛ بکت
 * روزانهٔ usage_summary همین قرارداد را در مقیاس روز دارد.
 */
import { z } from 'zod';
import { APP_VERSION } from '@core/version';
import type { DbClient } from '@core/db';
import { ValidationError } from '@core/errors';
import {
  NODE_PUSH_DOMAIN_SET,
  ClientErrorPayloadSchema,
  HealthPingPayloadSchema,
  UsageSummaryPayloadSchema
} from '../node-sync';
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

// ─── دامنهٔ usage_summary — اسنپ‌شات روزانهٔ شمارنده‌های تجمیعی نود (rust-f12-B) ───

interface UsageCounterQuery {
  /** نام متریک در payload — snake_case ≤۶۴ کاراکتر (سقف کلید UsageSummaryPayloadSchema) */
  key: string;
  /** COUNT سادهٔ بی‌PII — فقط عدد تجمیعی؛ هیچ id/نام/ایمیل/متن انتخاب نمی‌شود */
  sql: string;
}

/**
 * شمارنده‌های usage_summary — هر کدام یک COUNT ساده روی جدول واقعی محلی؛ همه فقط عدد و
 * بی‌PII (قانون طلایی «تجمیع در نود، فقط عدد در ابر»):
 *  • students_active    — students فعال (active=1): ثبت‌نام زندهٔ مرکز
 *  • appointments_total — کل قرارها: حجم کل برنامه‌ریزی
 *  • appointments_7d    — قرارهای ۷ روز اخیر بر created_at (DEFAULT datetime('now') جدول —
 *                         مقایسهٔ هم‌فرمت در SQL درست می‌ماند)
 *  • day_notes_total    — یادداشت‌های روز کاری (0012) — نزدیک‌ترین جدول واقعی به
 *                         «session_notes» پیشنهادی؛ جدولی به آن نام وجود ندارد و ساخت
 *                         مایگریشن جدید ممنوع است، پس همین جایگزین شده (تصمیم نرم)
 *  • audit_events_24h   — رویدادهای audit_log در ۲۴ ساعت اخیر: نبض فعالیت پرسنل، بی‌نام
 *  • inbox_items_total  — آیتم‌های صندوق ورودی سینک (0110): حجم دادهٔ دریافتی از ابر
 */
const USAGE_COUNTERS: readonly UsageCounterQuery[] = [
  { key: 'students_active', sql: 'SELECT COUNT(*) AS n FROM students WHERE active = 1' },
  { key: 'appointments_total', sql: 'SELECT COUNT(*) AS n FROM appointments' },
  {
    key: 'appointments_7d',
    sql: "SELECT COUNT(*) AS n FROM appointments WHERE created_at >= datetime('now', '-7 days')"
  },
  { key: 'day_notes_total', sql: 'SELECT COUNT(*) AS n FROM day_notes' },
  {
    key: 'audit_events_24h',
    sql: "SELECT COUNT(*) AS n FROM audit_log WHERE created_at >= datetime('now', '-24 hours')"
  },
  { key: 'inbox_items_total', sql: 'SELECT COUNT(*) AS n FROM node_sync_inbox' }
];

/**
 * آیتم usage_summary — بکت روزانهٔ UTC: id = usage-<YYYY-MM-DD> و at = ابتدای همان روز
 * (`<روز>T00:00:00Z`). هم‌الگوی ping ساعت‌بکت، at بکت‌شده است نه لحظهٔ واقعی ساخت؛ با این
 * انتخاب فیلتر since اکید رفتار قطعی دارد (بکت روز همیشه ≤ اکنون → since=اکنون آن را مثل
 * بقیه فیلتر می‌کند) و آیتم همان روز id/payload ثابت دارد — idempotent برای dedup جفت
 * (node_code,id) ابر.
 *
 * خواندن شمارنده‌ها نرم است: خطا/جدول غایب/مقدار غیرمتناهی = فقط همان شمارنده حذف و بقیهٔ
 * payload می‌ماند؛ خروجی سپس با UsageSummaryPayloadSchema safeParse می‌شود و ناسازگار =
 * حذف کل آیتم از صفحه، نه شکستن مسیر (حکم م۲۱۰: خروجی مقدار است نه throw).
 */
async function usageSummaryItem(db: DbClient, now: Date): Promise<OutboxItem | null> {
  // گارد دامنه — دفاع دوم لایه؛ این ماژول هرگز دامنهٔ بیرون فهرست سفید push تولید نمی‌کند
  if (!NODE_PUSH_DOMAIN_SET.has('usage_summary')) return null;
  const counters: Record<string, number> = {};
  for (const c of USAGE_COUNTERS) {
    try {
      const row = await db.queryOne<{ n: number }>(c.sql);
      const n = Number(row?.n ?? 0); // COUNT از D1/node:sqlite عدد است؛ coercion گارد اضافه
      if (Number.isFinite(n)) counters[c.key] = n; // NaN/Infinity → حذف نرم همان شمارنده
    } catch {
      // جدول وجود ندارد/کوئری خطا خورد → شمارنده حذف (نرم)؛ آیتم و بقیهٔ شمارنده‌ها می‌مانند
    }
  }
  const parsed = UsageSummaryPayloadSchema.safeParse(counters);
  if (!parsed.success) return null; // ناسازگار = حذف آیتم از صفحه، نه شکستن مسیر (حکم م۲۱۰)
  const day = now.toISOString().slice(0, 10); // بکت روز UTC — '2026-11-13'
  return {
    id: `usage-${day}`,
    domain: 'usage_summary',
    at: `${day}T00:00:00Z`, // ابتدای همان بکت روز UTC — هم‌الگوی at بکت‌شدهٔ ping
    payload: parsed.data as Record<string, unknown>
  };
}

// ─── ساخت صفحهٔ outbox ───

/**
 * صفحهٔ outbox — آیتم‌های قابل‌پوش برای کلاینت فرانت‌اند:
 *  • since (اعتبارسنجی‌شده با parseOutboxSince) روی همهٔ آیتم‌ها اکید است: at > since؛
 *    ping ساعت‌بکت در لحظه‌های مرزی با مقایسهٔ لحظه‌ای (Date.parse) سنجیده می‌شود نه لغوی،
 *    چون since ممکن است میلی‌ثانیه‌دار باشد و at ثانیه‌ای. usage_summary با at بکت روزِ خود
 *    دقیقاً همین قاعده و همان Date.parse را دارد.
 *  • مرتب ASC بر حسب at (خروجی هر سه دامنه ISO ثانیه‌ای یکدست است)؛ تیراز id برای قطعیت.
 *  • سقف ۲۰۰ آیتم روی کل صفحه — ping/usage چون تازه‌ترین آیتم‌ها هستند در پس‌انداز شلوغ جا
 *    می‌مانند و در دورهٔ بعد (با watermark پیش‌رفتهٔ کلاینت) می‌گذرند.
 */
export async function buildOutboxPage(
  db: DbClient,
  since: string | null,
  now: Date = new Date()
): Promise<OutboxPage> {
  const [errors, ping, usage] = await Promise.all([
    clientErrorItems(db, since),
    healthPingItem(db, now),
    usageSummaryItem(db, now)
  ]);
  const includePing = !since || Date.parse(ping.at) > Date.parse(since);
  const includeUsage = usage !== null && (!since || Date.parse(usage.at) > Date.parse(since));
  // usage_summary یک آیتم عادی صفحه است (rust-f12-B): مثل بقیه وارد sort ASC بر حسب at می‌شود
  // و سقف ۲۰۰ شامل آن هم هست — at بکت روزِ آن بین خطاهای کهنه‌تر و ping تازه‌تر می‌نشیند.
  // ترتیب الحاق در آرایه اهمیت ترتیب نهایی را ندارد (sort تعیین می‌کند)؛ رفتار f11 — ASC و
  // سقف ۲۰۰ و ماندن ping/usage در پس‌انداز شلوغ — عیناً حفظ می‌شود.
  const items: OutboxItem[] = [...errors];
  if (includeUsage && usage) items.push(usage);
  if (includePing) items.push(ping);
  items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { items: items.slice(0, OUTBOX_MAX_ITEMS), generated_at: now.toISOString() };
}
