/**
 * موج ۲ (۲-۴) — نگاشت خطای توکن Cloudflare به راهنمای عملی فارسی
 *
 * ورودی نگاشت سه‌منبعی است (همه اختیاری — هر کدام که باشد کافی است):
 *   • status — کد HTTP پاسخ کلادفلر (۴۰۱/۴۰۳) یا کد داخل پیام فرمان پوسته
 *   • message — متن خطا (پاسخ JSON کلادفلر، پیام فارسی cf_deploy.rs، یا خطای fetch)
 *   • outcome — نتیجهٔ verifyCloudToken در verify.ts (invalid_token)
 *
 * محدوده‌های لازم «دقیقاً» همان درگاه‌هایی‌اند که استقرار می‌زند (desktop/src-tauri/src/cf_deploy.rs):
 *   GET  /client/v4/accounts                                   → Account Settings:Read
 *   PUT  /client/v4/accounts/{id}/workers/scripts/{name}       → Workers Scripts:Edit
 *   GET/PUT …/workers/subdomain                                → Workers Scripts:Edit
 *   POST/GET …/d1/database، …/d1/database/{id}/query           → D1:Edit
 * لینک مستقیم صفحهٔ ساخت توکن: https://dash.cloudflare.com/profile/api-tokens
 *
 * هیچ throwی نیست — ورودی خالی/ناآشنا = null (نگاشت ندارد، پیام اصلی سر جایش می‌ماند).
 */

import type { CloudVerifyOutcome } from './state.js';

/** صفحهٔ رسمی توکن‌های API کلادفلر — مستقیم و بدون واسطه */
export const CF_TOKEN_GUIDE_URL = 'https://dash.cloudflare.com/profile/api-tokens';

/** محدوده‌های لازم توکن — عین درگاه‌های واقعی استقرار (بالا را ببینید) */
export const CF_TOKEN_SCOPES: readonly string[] = [
  'Workers Scripts:Edit',
  'D1:Edit',
  'Account Settings:Read'
];

/** کلاس‌های نگاشت — آزمون به تفکیک کلاس (هر کلاس یک راهنمای خودش را دارد) */
export type CfTokenErrorKind = 'unauthorized' | 'insufficient_scope' | 'invalid_token';

export interface CfTokenGuide {
  kind: CfTokenErrorKind;
  /** «چه اتفاقی افتاده» — یک جملهٔ فارسی ساده */
  whatHappened: string;
  /** «کار شما» — ساخت توکن تازه با محدوده‌های صریح + لینک مستقیم */
  action: string;
  /** متن کامل یک‌خطی برای ناحیهٔ وضعیت ویزار (چه‌اتفاقی + کار شما + محدوده‌ها + لینک) */
  text: string;
  url: string;
  scopes: readonly string[];
}

/** جدول نگاشت — الگوی OUTCOME_FA در dom-build.ts؛ افزودنی و مرتب‌شده بر درستی، نه ترتیب */
const KIND_GUIDES: Record<CfTokenErrorKind, { whatHappened: string }> = {
  unauthorized: {
    whatHappened: 'کلادفلر توکن را نشناخت (۴۰۱) — توکن حذف شده، باطل شده یا ناقص کپی شده است.'
  },
  insufficient_scope: {
    whatHappened: 'توکن پذیرفته شد ولی اجازهٔ کار لازم را ندارد (۴۰۳) — محدوده‌های توکن ناقص است.'
  },
  invalid_token: {
    whatHappened: 'توکن نامعتبر است (رد اعتبارسنجی) — باید از نو ساخته شود.'
  }
};

function guideOf(kind: CfTokenErrorKind): CfTokenGuide {
  const what = KIND_GUIDES[kind].whatHappened;
  const scopesFa = CF_TOKEN_SCOPES.map((s) => `«${s}»`).join(' و ');
  const action = `در صفحهٔ توکن‌های API کلادفلر یک توکن تازه بسازید و همین‌جا وارد کنید — محدوده‌های لازم: ${scopesFa}.`;
  return {
    kind,
    whatHappened: what,
    action,
    text: `${what} ${action} لینک مستقیم: ${CF_TOKEN_GUIDE_URL}`,
    url: CF_TOKEN_GUIDE_URL,
    scopes: CF_TOKEN_SCOPES
  };
}

/** الگوی عددی کد HTTP داخل متن — «HTTP 403» / «(403)» / «خطا (401)»؛ کد ۴۰۱۰ نه ۴۰۱ */
function textHasStatus(message: string, status: 401 | 403): boolean {
  const re = new RegExp(`(^|[^0-9])${status}([^0-9]|$)`);
  return re.test(message);
}

const UNAUTHORIZED_WORDS = ['unauthorized', 'authentication', 'missing auth'];
const FORBIDDEN_WORDS = ['forbidden', 'permission', 'not allowed', 'authorization'];
const INVALID_WORDS = ['invalid', '9109', 'token is not valid', 'نامعتبر'];
// «پذیرفته نشد» عمداً در جدول نیست — cf_deploy.rs آن را برای خطای شبکه هم می‌نویسد و
// نگاشت اشتباه قطعیِ شبکه به «توکن بسازید» راهنمای گمراه‌کننده می‌دهد (۴۰۱/۴۰۳ صریح اول می‌آیند).

/**
 * نگاشت خطای توکن → راهنمای عملی؛ ناآشنا/بی‌خطا = null.
 * ترتیب: وضعیت صریح HTTP → واژه‌های پیام → نتیجهٔ آزمونگر توکن.
 */
export function mapCloudflareTokenError(input: {
  status?: number | null;
  message?: string | null;
  outcome?: CloudVerifyOutcome | null;
}): CfTokenGuide | null {
  const message = (input.message ?? '').toLowerCase();
  const status = typeof input.status === 'number' ? input.status : null;

  // ۱) وضعیت صریح ۴۰۱/۴۰۳ — یا در status یا داخل متن (پیام فرمان پوسته کد را حمل می‌کند)
  if (status === 401 || textHasStatus(message, 401) || UNAUTHORIZED_WORDS.some((w) => message.includes(w))) {
    return guideOf('unauthorized');
  }
  if (status === 403 || textHasStatus(message, 403) || FORBIDDEN_WORDS.some((w) => message.includes(w))) {
    return guideOf('insufficient_scope');
  }

  // ۲) توکن نامعتبر — از آزمونگر توکن (verify) یا متن پاسخ کلادفلر
  if (input.outcome === 'invalid_token') return guideOf('invalid_token');
  if (INVALID_WORDS.some((w) => message.includes(w))) return guideOf('invalid_token');

  return null;
}
