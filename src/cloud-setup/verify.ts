/**
 * rust-f7 — آزمونگرهای اتصال ابر (با fetch تزریق‌پذیر، عین الگوی makeFetch)
 *
 * دو مسیر جدا با دو اعتبار جدا — عمداً با هم قاطی نمی‌شوند:
 *   ۱) verifyCloudNode  — «آیا این ورکر، این نود را می‌شناسد؟»
 *      GET {worker_url}/node/pull?domains=announcements&limit=1
 *      با هدرهای عین پاکت نود m1.2 (X-CP-Node-Code + Bearer node_key).
 *      ۲۰۰ = متصل؛ ۴۰۱/۴۰۳ = کلید بد؛ خطای شبکه = نرم و قابل تلاش دوباره.
 *   ۲) verifyCloudToken — «آیا این توکن Cloudflare معتبر است؟»
 *      POST https://api.cloudflare.com/client/v4/user/tokens/verify
 *      توکن فقط به api.cloudflare.com می‌رود و هیچ‌گاه به ورکر/لاگ ما نمی‌رسد.
 *
 * هیچ مسیری throw خام نمی‌کند — همیشه نتیجهٔ ساختاریافته با پیام فارسی (حکم م۲۱۰).
 */

import type { CloudVerifyOutcome } from './state.js';

export interface VerifyResult {
  ok: boolean;
  outcome: CloudVerifyOutcome;
  message: string;
}

export interface FetchLike {
  (input: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }):
    | Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>
    | Promise<Response>;
}

const NODE_VERIFY_TIMEOUT_MS = 8000;
const CF_VERIFY_TIMEOUT_MS = 8000;

/** اعتبارسنجی و نرمال‌سازی آدرس ورکر — فقط https یا http روی loopback */
export function normalizeWorkerUrl(input: string): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return { ok: false, message: 'آدرس ورکر خالی است.' };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return { ok: true, url: trimmed };
    if (parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')) {
      return { ok: true, url: trimmed };
    }
    return { ok: false, message: 'آدرس ورکر باید https باشد (http فقط برای 127.0.0.1/localhost).' };
  } catch {
    return { ok: false, message: 'آدرس ورکر معتبر نیست.' };
  }
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: { method: string; headers: Record<string, string> },
  timeoutMs: number
): Promise<{ ok: boolean; status: number; body: unknown } | { ok: false; status: 0; body: null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    let body: unknown = null;
    try {
      body = typeof res.json === 'function' ? await res.json() : null;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

export interface NodeVerifyInput {
  workerUrl: string;
  nodeCode: string;
  nodeKey: string;
  timeoutMs?: number;
}

/** آزمون «شناسایی نود» روی ورکر ابری — همان پاکت pull سینک */
export async function verifyCloudNode(fetchImpl: FetchLike, input: NodeVerifyInput): Promise<VerifyResult> {
  const urlCheck = normalizeWorkerUrl(input.workerUrl);
  if (!urlCheck.ok) return { ok: false, outcome: 'bad_url', message: urlCheck.message };
  if (!input.nodeCode.trim()) {
    return { ok: false, outcome: 'bad_url', message: 'کد نود خالی است (مثال: DESKTOP:هویت-نصب).' };
  }
  if (!input.nodeKey.trim()) {
    return { ok: false, outcome: 'auth_error', message: 'کلید نود خالی است.' };
  }
  const target = `${urlCheck.url}/node/pull?domains=announcements&limit=1`;
  const res = await fetchWithTimeout(
    fetchImpl,
    target,
    {
      method: 'GET',
      headers: {
        'X-CP-Node-Code': input.nodeCode.trim(),
        Authorization: `Bearer ${input.nodeKey.trim()}`
      }
    },
    input.timeoutMs ?? NODE_VERIFY_TIMEOUT_MS
  );
  if (res.ok) return { ok: true, outcome: 'ok', message: 'اتصال ابر برقرار است — نود شناسایی شد.' };
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      outcome: 'auth_error',
      message: 'ورکر نود را نشناخت — کد/کلید نود را از پنل ابر بررسی کنید.'
    };
  }
  if (res.status === 0) {
    return {
      ok: false,
      outcome: 'network_error',
      message: 'دسترسی شبکه برقرار نشد — اتصال اینترنت یا آدرس ورکر را بررسی کنید.'
    };
  }
  return {
    ok: false,
    outcome: 'server_error',
    message: `ورکر پاسخ غیرمنتظره داد (کد ${res.status}) — بعداً تلاش کنید.`
  };
}

export interface TokenVerifyInput {
  token: string;
  timeoutMs?: number;
}

interface CfVerifyBody {
  success?: boolean;
  errors?: Array<{ message?: string }>;
}

/** آزمون اعتبار توکن Cloudflare — توکن فقط به api.cloudflare.com می‌رود */
export async function verifyCloudToken(fetchImpl: FetchLike, input: TokenVerifyInput): Promise<VerifyResult> {
  const token = input.token.trim();
  if (!token) return { ok: false, outcome: 'invalid_token', message: 'توکن Cloudflare خالی است.' };
  const res = await fetchWithTimeout(
    fetchImpl,
    'https://api.cloudflare.com/client/v4/user/tokens/verify',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    input.timeoutMs ?? CF_VERIFY_TIMEOUT_MS
  );
  if (res.status === 0) {
    return {
      ok: false,
      outcome: 'network_error',
      message: 'دسترسی به api.cloudflare.com برقرار نشد — اینترنت را بررسی کنید.'
    };
  }
  const body = (res.body ?? {}) as CfVerifyBody;
  if (body.success === true) {
    return { ok: true, outcome: 'ok', message: 'توکن Cloudflare معتبر است.' };
  }
  const detail = body.errors?.[0]?.message ?? 'توکن رد شد.';
  return { ok: false, outcome: 'invalid_token', message: `توکن معتبر نیست: ${detail}` };
}
