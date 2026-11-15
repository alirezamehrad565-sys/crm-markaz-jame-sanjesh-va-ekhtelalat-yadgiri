/**
 * داور زمانی هم‌گامی دوسویه instance-sync (فاز B — تصمیم قطعی کارفرما ۱۴۰۴/۰۸/۲۴)
 * سند: docs/rust/server-cloud-update-design.md §۲-۴ — «دیتای زودترتشکیل‌شده برندهٔ تداخل»
 * (first-write-wins) با تفکیک قطعیِ تساوی. هم‌ریتم سبک pull/push گیت‌هاب.
 *
 * قراردادهای سراسری این داور:
 *  • متقارن — rowWinner(a,b) و rowWinner(b,a) روی همان ورودی به همان ردیف می‌رسند (برچسب a/b جابه‌جا).
 *  • قطعی — هیچ وابستگی به ترتیب رسیدن پیام، ساعت گیرنده یا device_id؛ تساوی کامل فقط با هش باز می‌شود.
 *  • مُهر گم‌شده (NULL/undefined) «بزرگ‌ترین» فرض می‌شود: ردیفِ بی‌مُهر برندهٔ هیچ ردیف مُهر‌داری
 *    نمی‌شود و به آن هم نمی‌بازد — از خطای «مُهر تهی = کهن‌ترین» جلوگیری می‌کند که ردیف‌های ناقص را
 *    بر همه‌چیز مقدم می‌کرد؛ دو مُهرِ هر دو تهی = مساوی → مرحلهٔ بعد.
 *  • hash بزرگ‌تر فقط برای شکستن تساویِ کامل است — بزرگ‌تر بودن هش هیچ برتری معنایی ندارد،
 *    فقط «قطعی و یکسان در هر دو سو» را تضمین می‌کند.
 */
import { EPOCH_STAMP } from './tables';

/** JSON قطعی: کلیدها در همهٔ عمق مرتب‌شده — دو سو روی همان ردیف به همین رشته می‌رسند */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => {
      const v = (value as Record<string, unknown>)[k];
      return `${JSON.stringify(k)}:${canonicalJson(v)}`;
    })
    .join(',');
  return `{${body}}`;
}

/** هش هم‌گامی: SHA-256 روی canonicalJson — هم‌الگوی hashApiKey (@core/auth) با crypto.subtle تا
 *  در Workers و Node هر دو سبز بماند؛ خروجی hex کوچک‌شده برای مقایسهٔ رشته‌ای. */
export async function syncHash(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** شکل حداقلی ردیف برای داوری — بقیهٔ فیلدها فقط وارد هش می‌شوند */
export interface WinnerRow {
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

/** COALESCE(created_at, updated_at) — مُهر تشکیل؛ هر دو گم‌شده → null (بزرگ‌ترین) */
function formationStampOf(row: WinnerRow): string | null {
  return row.created_at ?? row.updated_at ?? null;
}

/** مقایسهٔ مُهر رشته‌ای ISO — کوچک‌تر = زودتر؛ null = بزرگ‌ترین (مُهر گم‌شده نمی‌برد) */
function compareStamps(a: string | null, b: string | null): number {
  if (a === b) return 0; // شامل هر دو تهی
  if (a === null) return 1; // a بزرگ‌تر (بازنده در مرحلهٔ مُهر)
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export type WinnerSide = 'a' | 'b';

/**
 * داور ردیف↔ردیف (قرار §۲-۴ بند ۱):
 *   kA = COALESCE(a.created_at, a.updated_at) · kB به همان شکل؛
 *   kA کوچک‌تر → a (زودترتشکیل‌شده) · بزرگ‌تر → b؛
 *   برابر → updated_at کوچک‌تر برنده؛ برابر → syncHash بزرگ‌تر برنده.
 * برنده فقط «برچسب» است؛ محتوا را فراخوان از ردیف برنده برمی‌دارد.
 */
export async function rowWinner(a: WinnerRow, b: WinnerRow): Promise<WinnerSide> {
  const formation = compareStamps(formationStampOf(a), formationStampOf(b));
  if (formation !== 0) return formation < 0 ? 'a' : 'b';
  const updated = compareStamps(a.updated_at ?? null, b.updated_at ?? null);
  if (updated !== 0) return updated < 0 ? 'a' : 'b';
  const [hashA, hashB] = await Promise.all([syncHash(a), syncHash(b)]);
  if (hashA === hashB) return 'a'; // محتوای یکسان — برنده هر دو سو همان است
  return hashA > hashB ? 'a' : 'b';
}

/** یک موجودیت سمت داور: مُهر + هش canonical خودش (تومب‌استون: deleted_at؛ ردیف: updated_at) */
export interface StampHashEntity {
  stamp: string | null;
  hash: string;
}

/**
 * داور مُهر↔مُهر (تومب‌استون در برابر ردیف، یا تومب‌استون در برابر تومب‌استون):
 *   مُهر کوچک‌تر برنده (زودترتشکیل‌شده — قرارداد FWW)؛ تساوی → hash بزرگ‌تر برنده.
 * سمت گیرنده با همین تابع هم «حذف همتا را می‌پذیرد» و هم «باززنده‌سازی پس از حذف» —
 * نتیجه در هر دو سو یکسان است (الزام همگرایی §۲-۴).
 */
export function stampHashWinner(a: StampHashEntity, b: StampHashEntity): WinnerSide {
  const cmp = compareStamps(a.stamp, b.stamp);
  if (cmp !== 0) return cmp < 0 ? 'a' : 'b';
  if (a.hash === b.hash) return 'a';
  return a.hash > b.hash ? 'a' : 'b';
}

/**
 * متقارنی سازندهٔ تومب‌استون برای داوری: canonical تومب‌استون = {table_name, pk, deleted_at}
 * — هر دو سو روی رکورد یکسان _sync_deleted به همین JSON می‌رسند.
 */
export function tombstoneCanonical(table: string, pk: string, deletedAt: string): Record<string, string> {
  return { deleted_at: deletedAt, pk, table_name: table };
}

/** خوانش cursor دو-محوره از _sync_state (TEXT = JSON {rows, deleted}) — خرابی/غیبت → اپوک */
export function parseCursorPair(raw: string | null | undefined): { rows: string; deleted: string } {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { rows?: unknown; deleted?: unknown };
      if (typeof parsed.rows === 'string' && typeof parsed.deleted === 'string') {
        return { rows: parsed.rows, deleted: parsed.deleted };
      }
    } catch {
      // رکورد خراب = از اپوک شروع کن (هیچ‌چیز بی‌سروصدا نمی‌افتد؛ pull از سرِ امن است)
    }
  }
  return { rows: EPOCH_STAMP, deleted: EPOCH_STAMP };
}
