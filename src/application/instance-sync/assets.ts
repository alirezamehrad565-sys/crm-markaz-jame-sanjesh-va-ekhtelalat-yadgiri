/**
 * فاز D1 (B2) — دارایی‌های وب ورکر ابری: Workers Static Assets Direct Upload
 *
 * هدف: همان نرم‌افزار مرورگری (public/ — index.html + sw.js + assets/dist + css + فونت‌ها) روی
 * workers.dev سرو شود؛ مسیرهای غیراستاتیک (/api/*، /healthz، هم‌گامی) به اسکریپت می‌روند.
 * قرارداد سه‌تماسی مستند رسمی direct-upload:
 *   ① POST /accounts/{aid}/workers/scripts/{name}/assets-upload-session — بدنهٔ JSON با manifest
 *     {«/مسیر»: {hash, size}}؛ کلید = مسیر نسبی با اسلش آغازین و hash = ۳۲ کاراکتر نخست hex رمزنگاری
 *     SHA-256 بایت فایل. پاسخ result = {jwt, buckets: [[hash,...],...]}.
 *   ② برای هر bucket: POST /accounts/{aid}/workers/assets/upload?base64=true — multipart/form-data
 *     با هدر Authorization: Bearer jwt سشن؛ هر part به نام hash و مقدار base64 محتوا.
 *   ③ توکن پایانی: buckets خالی → همان jwt سشن؛ وگرنه jwt در پاسخ ۲۰۱ِ آخرین آپلود.
 *   ④ provision.ts این توکن را در متادیتای PUT اسکریپت می‌گذارد (assets.config = SPA) — بدون binding
 *     ASSETS؛ workers.dev خودش دارایی‌ها را سرو می‌کند.
 *   ⑤ هیچ فایلی که hash آن در buckets نیست دوباره آپلود نمی‌شود — هر مسیر باید در manifest باشد.
 *
 * جای اجرا: گام «۵‌الف» provision.ts روی موتور محلی. فایل‌ها از binding CLOUD_PROVISION
 * (makeWebAssetsReader — adapter/server.mjs) می‌آید و این فایل هیچ خواندن فایلی ندارد؛
 * وابستگی صفر — فقط crypto.subtle و fetch استاندارد. redaction: jwt سشن/توکن پایانی هرگز در
 * steps یا log نمی‌آید؛ مسیر فایل‌ها بی‌خطرند و مجازند.
 */

// ─── ثابت‌های قرارداد ───

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
/** سقف مجموع دارایی‌های وب — آینهٔ سد adapter/server.mjs (makeWebAssetsReader) */
export const WEB_ASSETS_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
/** سقف هر فایل دارایی — آینهٔ سد adapter/server.mjs (makeWebAssetsReader) */
export const WEB_ASSETS_MAX_FILE_BYTES = 8 * 1024 * 1024;

// ─── شکل‌های قرارداد ───

/** یک فایل وب — مسیر نسبی نرمال (به اسلش آغازین) + بایت محتوا */
export interface WebAssetFile {
  path: string;
  bytes: Uint8Array;
}

/** ردیف manifest — کلید = مسیر با اسلش آغازین */
export interface AssetManifestEntry {
  hash: string;
  size: number;
}

export type AssetManifest = Record<string, AssetManifestEntry>;

/** جزئیات خطای CF — همان شکل CloudflareError provision.ts (بدون وابستگی به آن) */
export interface WebAssetsCfError {
  code?: number;
  message?: string;
}

/** گام متوقف‌شدهٔ آپلود دارایی — size پیش از هر تماس CF، session/upload روی تماس‌ها */
export type UploadWebAssetsStep = 'assets-size' | 'assets-session' | 'assets-upload';

export type UploadWebAssetsResult =
  | { ok: true; jwt: string; manifest: AssetManifest; fileCount: number; uploadedCount: number }
  | {
      ok: false;
      step: UploadWebAssetsStep;
      kind: 'network' | 'cf_api' | 'assets_error';
      message: string;
      errors?: WebAssetsCfError[];
    };

export interface UploadWebAssetsDeps {
  /** تزریق آزمون — پیش‌فرض fetch سراسری */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  /** توکن API کلادفلر — فقط به api.cloudflare.com می‌رود و هرگز در خروجی/لاگ نمی‌آید */
  token: string;
  accountId: string;
  scriptName: string;
  /** null/خالی = بدون دارایی — سبز با manifest تهی و بدون هیچ تماس با کلادفلر */
  files: WebAssetFile[] | null | undefined;
  log?: (message: string) => void;
  /** تزریق آزمون ساعت — فقط برای مدت‌سنجی log؛ پیش‌فرض Date.now */
  now?: () => number;
}

// ─── ابزارها — بدون وابستگی (عین الگوی provision.ts) ───

/** نرمال مسیر: بک‌اسلش → اسلش + اسلش آغازین */
function normalizeAssetPath(raw: string): string {
  const p = String(raw).replace(/\\/g, '/');
  return p.startsWith('/') ? p : `/${p}`;
}

/** base64 بایت‌ها — قطعه‌بندی ۳۲K برای جلوگیری از سرریز پشتهٔ spread */
function base64Of(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** ۳۲ کاراکتر نخست hex رمزنگاری SHA-256 بایت‌ها — قرارداد manifest کلادفلر */
async function sha256Prefix32(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0');
  return hex.slice(0, 32);
}

function mbOf(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

interface CfResponseBody {
  success?: boolean;
  errors?: WebAssetsCfError[];
  result?: unknown;
}

async function readJsonBody(res: Response): Promise<CfResponseBody> {
  try {
    return (await res.json()) as CfResponseBody;
  } catch {
    return {};
  }
}

/** پیام فارسی شکست CF — پیام پایه + جزئیات errors؛ هرگز شامل توکن/jwt/بدنهٔ درخواست نیست */
function cfFailMessage(prefix: string, status: number, errors?: WebAssetsCfError[]): string {
  const detail = (Array.isArray(errors) ? errors : [])
    .map((e) => (e && typeof e.message === 'string' && e.message ? e.message : e && e.code !== undefined ? `کد ${e.code}` : ''))
    .filter(Boolean)
    .slice(0, 5)
    .join('؛ ');
  return detail ? `${prefix} (HTTP ${status}) — ${detail}` : `${prefix} (HTTP ${status})`;
}

// ─── manifest دارایی‌ها ───

/**
 * ساخت manifest دارایی‌ها — کلید = مسیر نرمال با اسلش آغازین (بک‌اسلش → اسلش)، hash = ۳۲ hex نخست
 * SHA-256 بایت‌ها و size = بایت. مسیر تکراری قطعهٔ جدا نمی‌سازد (آخرین محتوا می‌ماند).
 */
export async function buildAssetManifest(files: WebAssetFile[]): Promise<AssetManifest> {
  const manifest: AssetManifest = {};
  for (const f of files) {
    if (!f || typeof f.path !== 'string' || !(f.bytes instanceof Uint8Array)) continue;
    manifest[normalizeAssetPath(f.path)] = { hash: await sha256Prefix32(f.bytes), size: f.bytes.length };
  }
  return manifest;
}

// ─── آپلود دارایی‌ها — سشن → bucketها → توکن پایانی ───

export async function uploadWebAssets(deps: UploadWebAssetsDeps): Promise<UploadWebAssetsResult> {
  const started = deps.now ?? Date.now;
  const doFetch: (input: string, init?: RequestInit) => Promise<Response> = deps.fetchImpl ?? ((input, i) => fetch(input, i));
  const files = Array.isArray(deps.files) ? deps.files : [];
  if (files.length === 0) {
    // بدون دارایی — هیچ تماسی با کلادفلر نمی‌رود (provision بدون وب ادامه می‌یابد)
    return { ok: true, jwt: '', manifest: {}, fileCount: 0, uploadedCount: 0 };
  }

  // ─── گارد حجم — پیش از هر تماس با کلادفلر؛ آینهٔ سد سخت adapter/server.mjs ───
  let totalBytes = 0;
  for (const f of files) {
    const size = f?.bytes?.length ?? 0;
    if (size > WEB_ASSETS_MAX_FILE_BYTES) {
      return {
        ok: false,
        step: 'assets-size',
        kind: 'assets_error',
        message: `فایل دارایی «${f && typeof f.path === 'string' ? normalizeAssetPath(f.path) : '?'}» ${mbOf(size)} مگابایت است — سقف هر فایل 8 مگابایت است؛ فایل بزرگ را از public حذف کنید`
      };
    }
    totalBytes += size;
  }
  if (totalBytes > WEB_ASSETS_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      step: 'assets-size',
      kind: 'assets_error',
      message: `مجموع دارایی‌های وب ${mbOf(totalBytes)} مگابایت است — سقف کل 20 مگابایت است؛ پوشهٔ public را سبک‌تر کنید`
    };
  }

  // ─── گام ۱ — سشن آپلود با manifest کامل ───
  const manifest = await buildAssetManifest(files);
  const bytesByHash = new Map<string, Uint8Array>();
  for (const f of files) {
    const entry = manifest[normalizeAssetPath(f.path)];
    if (entry) bytesByHash.set(entry.hash, f.bytes);
  }
  let sessionRes: Response;
  try {
    sessionRes = await doFetch(
      `${CF_API_BASE}/accounts/${deps.accountId}/workers/scripts/${deps.scriptName}/assets-upload-session`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${deps.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ manifest })
      }
    );
  } catch {
    return {
      ok: false,
      step: 'assets-session',
      kind: 'network',
      message: 'اتصال به api.cloudflare.com برای سشن آپلود دارایی‌ها برقرار نشد — اینترنت را بررسی کنید'
    };
  }
  const sessionBody = await readJsonBody(sessionRes);
  if (!sessionRes.ok || sessionBody.success === false) {
    return {
      ok: false,
      step: 'assets-session',
      kind: 'cf_api',
      message: cfFailMessage('سشن آپلود دارایی‌های وب ساخته نشد', sessionRes.status, sessionBody.errors),
      ...(sessionBody.errors && sessionBody.errors.length > 0 ? { errors: sessionBody.errors.slice(0, 5) } : {})
    };
  }
  const sessionResult = (sessionBody.result ?? {}) as { jwt?: unknown; buckets?: unknown };
  const sessionJwt = typeof sessionResult.jwt === 'string' && sessionResult.jwt ? sessionResult.jwt : '';
  const buckets = Array.isArray(sessionResult.buckets)
    ? (sessionResult.buckets as unknown[]).filter((b): b is string[] => Array.isArray(b) && b.every((h) => typeof h === 'string' && h.length > 0))
    : null;
  if (!sessionJwt || !buckets || buckets.length !== (sessionResult.buckets as unknown[]).length) {
    return {
      ok: false,
      step: 'assets-session',
      kind: 'cf_api',
      message: 'پاسخ سشن آپلود دارایی‌های وب معتبر نبود — jwt یا buckets غایب است'
    };
  }
  const unknownHash = buckets.flat().filter((h) => !bytesByHash.has(h));
  if (unknownHash.length > 0) {
    return {
      ok: false,
      step: 'assets-session',
      kind: 'cf_api',
      message: 'buckets سشن hash ناشناخته دارد — manifest با buckets کلادفلر هم‌خوان نیست'
    };
  }
  deps.log?.(`سشن آپلود دارایی‌های وب ساخته شد — ${files.length} فایل در manifest، ${buckets.length} bucket`);

  // ─── گام ۲ — آپلود فقط hashهای داخل buckets (فایل هش‌همسان دوباره نمی‌رود) ───
  let finalJwt = sessionJwt;
  let uploadedCount = 0;
  for (let i = 0; i < buckets.length; i += 1) {
    const form = new FormData();
    for (const hash of buckets[i]) {
      form.append(hash, base64Of(bytesByHash.get(hash) as Uint8Array));
    }
    let uploadRes: Response;
    try {
      uploadRes = await doFetch(`${CF_API_BASE}/accounts/${deps.accountId}/workers/assets/upload?base64=true`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sessionJwt}` },
        body: form
      });
    } catch {
      return {
        ok: false,
        step: 'assets-upload',
        kind: 'network',
        message: `اتصال برای آپلود bucket ${i + 1} از ${buckets.length} برقرار نشد — اینترنت را بررسی کنید`
      };
    }
    const uploadBody = await readJsonBody(uploadRes);
    if (!uploadRes.ok || uploadBody.success === false) {
      return {
        ok: false,
        step: 'assets-upload',
        kind: 'cf_api',
        message: cfFailMessage(
          `آپلود دارایی‌های وب در bucket ${i + 1} از ${buckets.length} ناموفق بود`,
          uploadRes.status,
          uploadBody.errors
        ),
        ...(uploadBody.errors && uploadBody.errors.length > 0 ? { errors: uploadBody.errors.slice(0, 5) } : {})
      };
    }
    // توکن پایانی = jwt پاسخ آخرین آپلود (قرارداد ۲۰۱) — jwt سشن هرگز لاگ نمی‌شود
    const uploadJwt = (uploadBody.result as { jwt?: unknown } | undefined)?.jwt;
    if (typeof uploadJwt === 'string' && uploadJwt) finalJwt = uploadJwt;
    uploadedCount += buckets[i].length;
  }
  const ms = Math.max(0, started());
  deps.log?.(`دارایی‌های وب آپلود شد — ${uploadedCount} از ${files.length} فایل در ${buckets.length} bucket (${ms}ms)`);
  return { ok: true, jwt: finalJwt, manifest, fileCount: files.length, uploadedCount };
}
