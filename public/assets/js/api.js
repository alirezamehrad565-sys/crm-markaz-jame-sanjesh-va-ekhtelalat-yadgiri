const STAFF_ID_KEY = 'cs.staffId';
const TOKEN_KEY = 'cs.token';

export function getDevStaffId() {
  return localStorage.getItem(STAFF_ID_KEY) || '';
}

export function setDevStaffId(id) {
  if (id) localStorage.setItem(STAFF_ID_KEY, id);
  else localStorage.removeItem(STAFF_ID_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STAFF_ID_KEY);
}

export const ERROR_TEXT = {
  VALIDATION_ERROR: 'ورودی نامعتبر است',
  AUTH_ERROR: 'احراز هویت ناموفق بود',
  FORBIDDEN: 'دسترسی مجاز نیست',
  NOT_FOUND: 'موردی پیدا نشد',
  CONFLICT: 'تعارض در وضعیت فعلی',
  INTERNAL_ERROR: 'خطای داخلی سرور',
  NETWORK: 'ارتباط با سرور برقرار نشد'
};

/* ── لایهٔ داده ─────────────────────────────────────────────────────
   ۱) AbortController به عمرِ هر نما: روتر با setViewSignal سیگنال نما را می‌دهد؛
      GETهای نما خودکار با آن لغو می‌شوند (ناوبری بعدی = لغو کارِ مرده).
      فراخوانِ سطح پوسته (badgeها، احراز، بنر) از getDetached استفاده می‌کند — بی‌سیگنال.
   ۲) dedup درخواست‌های GET هم‌زمان (دو کامپوننت یک مسیر = یک رفت‌وبرگشت).
   ۳) کش SWR سبک نشست‌محور برای مراجع کم‌تغییر (مدارس/کارکنان/بانک تمرین) — TTL ۴ دقیقه؛
      کلید = مسیر کامل با query (باست‌باستینگ ?v= خودکار رعایت می‌شود)؛ هر موتاسیون موفق کش را خالی می‌کند. */
let viewSignal = null;
export function setViewSignal(signal) {
  viewSignal = signal ?? null;
}

const SWR_BASES = ['/api/schools', '/api/staff', '/api/exercises'];
const SWR_TTL_MS = 240000; // ۴ دقیقه — میانهٔ بازهٔ ۲–۵ دقیقهٔ نقشه
const swrCache = new Map(); // «GET path?query» → { at, payload }
const inflight = new Map(); // «GET path?query» → Promise در جریان

function swrAllowed(path) {
  const p = path.split('?')[0];
  return SWR_BASES.some((b) => p === b || p.startsWith(`${b}/`));
}

function abortError() {
  const err = new Error('درخواست نما لغو شد');
  err.code = 'ABORTED';
  err.aborted = true;
  return err;
}

async function doRequest(method, path, body, signal) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const staffId = getDevStaffId();
  if (staffId) headers['X-Dev-Staff-Id'] = staffId;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal ?? undefined
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw abortError();
    const err = new Error(ERROR_TEXT.NETWORK);
    err.code = 'NETWORK';
    throw err;
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
  }

  if (!res.ok) {
    const err = new Error(payload?.message || ERROR_TEXT[payload?.error] || `خطا (${res.status})`);
    err.status = res.status;
    err.code = payload?.error;
    err.details = payload?.details;
    err.currentVersion = payload?.current_version;
    throw err;
  }

  return payload ?? {};
}

async function request(method, path, body) {
  if (method !== 'GET') {
    const data = await doRequest(method, path, body, null);
    swrCache.clear(); // هر موتاسیون موفق، کش مراجع را باطل می‌کند
    return data;
  }
  const key = `GET ${path}`;
  if (inflight.has(key)) return inflight.get(key);
  const cached = swrCache.get(key);
  if (cached && Date.now() - cached.at < SWR_TTL_MS) return cached.payload;
  const p = doRequest(method, path, body, viewSignal)
    .then((payload) => {
      if (swrAllowed(path)) swrCache.set(key, { at: Date.now(), payload });
      return payload;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/* فراخوانِ بیرون از عمر نما (badge سایدبار، احراز، بنر اعلان) — بدون سیگنال/dedup/SWR */
function requestDetached(path) {
  return doRequest('GET', path, undefined, null);
}

export const api = {
  get: (path) => request('GET', path),
  getDetached: (path) => requestDetached(path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  del: (path) => request('DELETE', path)
};

async function requestForm(method, path, formData) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const staffId = getDevStaffId();
  if (staffId) headers['X-Dev-Staff-Id'] = staffId;

  let res;
  try {
    res = await fetch(path, { method, headers, body: formData });
  } catch {
    const err = new Error(ERROR_TEXT.NETWORK);
    err.code = 'NETWORK';
    throw err;
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
  }
  if (!res.ok) {
    const err = new Error(payload?.message || ERROR_TEXT[payload?.error] || `خطا (${res.status})`);
    err.status = res.status;
    err.code = payload?.error;
    err.details = payload?.details;
    throw err;
  }
  return payload ?? {};
}

api.postForm = (path, formData) => requestForm('POST', path, formData);

// دانلود فایل باینری/JSON با توکن احراز هویت (برای پشتیبان‌گیری)
api.downloadBlob = async (path) => {
  const headers = { Accept: '*/*' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const staffId = getDevStaffId();
  if (staffId) headers['X-Dev-Staff-Id'] = staffId;
  let res;
  try {
    res = await fetch(path, { headers });
  } catch {
    const err = new Error(ERROR_TEXT.NETWORK);
    err.code = 'NETWORK';
    throw err;
  }
  if (!res.ok) {
    let payload = null;
    try { payload = await res.json(); } catch { /* متن خام */ }
    const err = new Error(payload?.message || ERROR_TEXT[payload?.error] || `خطا (${res.status})`);
    err.status = res.status;
    err.code = payload?.error;
    throw err;
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const utf8Name = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
  const asciiName = /filename="?([^";]+)"?/.exec(disposition)?.[1];
  let filename = asciiName ?? 'download';
  if (utf8Name) { try { filename = decodeURIComponent(utf8Name); } catch { filename = utf8Name; } }
  return { blob: await res.blob(), filename };
};

api.putRaw = (path, arrayBuffer) => requestRaw('PUT', path, arrayBuffer);

async function requestRaw(method, path, arrayBuffer) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/octet-stream' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const staffId = getDevStaffId();
  if (staffId) headers['X-Dev-Staff-Id'] = staffId;

  let res;
  try {
    res = await fetch(path, { method, headers, body: arrayBuffer });
  } catch {
    const err = new Error(ERROR_TEXT.NETWORK);
    err.code = 'NETWORK';
    throw err;
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
  }
  if (!res.ok) {
    const err = new Error(payload?.message || ERROR_TEXT[payload?.error] || `خطا (${res.status})`);
    err.status = res.status;
    err.code = payload?.error;
    err.details = payload?.details;
    throw err;
  }
  return payload ?? {};
}

export function qs(params) {
  const pairs = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}
