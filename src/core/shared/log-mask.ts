/**
 * log-mask (۱.۲۷.۷۸ — موج B1 «هاردن کردن لاگ» sdt155، بستن security-005): ماسک‌کردن segmentهای
 * اعتبار-حاملِ مسیر پیش از لاگ. توکنِ لینک عمومی بازی (/m/:token و /api/m/:token/* — تنها اعتبارِ
 * زنجیرهٔ عمومی) و سکرت وب‌هوک (/webhook/bale/:secret) هرگز به لاگ observability نمی‌روند؛
 * لاگ خامِ path در requestLogger تنها بردار ماندگاری است (تاریخچهٔ مرورگر و Referrer هم‌مبدأ با
 * Referrer-Policy: strict-origin-when-cross-origin بسته شده‌اند). قرارداد: هر مسیری که لاگ می‌شود
 * از این تابع می‌گذرد — دامنهٔ الگوها عمداً به همین سه قراردادِ شناخته‌شده محدود است تا مسیرهای
 * عادی (شامل شناسه‌های داخلی محتوایی که راز نیستند) دست‌نخورده بمانند.
 */
const MASKED = ':masked';

/** صفحهٔ عمومی بازی — توکن تنها اعتبارِ لینک است (مرز segment: / یا ?) */
const PAGE_TOKEN = /^(\/m\/)[^/?]+/;
/** API زنجیرهٔ عمومی — state/next-item با توکن لینک */
const API_TOKEN = /^(\/api\/m\/)[^/?]+/;
/** وب‌هوک پیام‌رسان — سکرت در segment سوم */
const WEBHOOK_SECRET = /^(\/webhook\/bale\/)[^/?]+/;

/** مسیر را برای لاگ امن می‌کند: segmentهای اعتبار-حامل با :masked جایگزین می‌شوند */
export function maskSensitivePath(path: string): string {
  let out = String(path ?? '');
  out = out.replace(PAGE_TOKEN, `$1${MASKED}`);
  out = out.replace(API_TOKEN, `$1${MASKED}`);
  out = out.replace(WEBHOOK_SECRET, `$1${MASKED}`);
  return out;
}
