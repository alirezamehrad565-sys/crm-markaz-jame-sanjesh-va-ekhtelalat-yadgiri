/* ۱.۲۷.۸۵ (sdt162 — performance-003): session از state.js به api.js ادغام شد —
   همهٔ مصرف‌کنندگان session از قبل api.js را import می‌کردند؛ شیم ۳۴ بایتیِ چانک مشترک از گراف بوت حذف می‌شود */
export const session = {
  user: null // {staffId, email, role, displayName}
};

const STAFF_ID_KEY = 'cs.staffId';
const TOKEN_KEY = 'cs.token'; // میراث — فقط برای پاک‌سازی نشست‌های قدیمی (ADR-005، ۱.۲۷.۸۲)

export function getDevStaffId() {
  return localStorage.getItem(STAFF_ID_KEY) || '';
}

export function setDevStaffId(id) {
  if (id) localStorage.setItem(STAFF_ID_KEY, id);
  else localStorage.removeItem(STAFF_ID_KEY);
}

/* ۱.۲۷.۸۲ (security-009/ADR-005): توکن نشست در کوکی httpOnly است و اسکریپت آن را نمی‌خواند؛
   fetch هم‌مبدأ کوکی را خودکار می‌فرستد. getToken/setToken حذف شدند — هیچ نقطه‌ای از فرانت
   دیگر توکن را ذخیره یا ارسال نمی‌کند. */
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY); // پاک‌سازی میراث نشست‌های پیش از مهاجرت در همان خروج اول
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
const inflightMut = new Map(); // ۱.۱۲.۰ «M method path body» → Promise در جریان (ضدِ دوبارسپاری)

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
    /* نرم — بدنهٔ خالی/غیر-JSON → payload null می‌ماند */
  }

  if (!res.ok) {
    const err = new Error(payload?.message || ERROR_TEXT[payload?.error] || `خطا (${res.status})`);
    err.status = res.status;
    err.code = payload?.error;
    err.details = payload?.details;
    err.currentVersion = payload?.current_version;
    /* B1 — ۴۲۹: بازهٔ تلاش دوباره روی خطا می‌آید (هدر استاندارد Retry-After یا بدنه) تا
       فراخوان — مثل صفحهٔ ورود — شمارش معکوس بدهد. Retry-After تاریخ‌محور/ناموجود → نادیده. */
    if (res.status === 429) {
      const headerS = Number(res.headers.get('retry-after'));
      const bodyS = Number(payload?.details?.retryAfterSeconds);
      const waitS = Number.isFinite(headerS) && headerS > 0 ? headerS : Number.isFinite(bodyS) && bodyS > 0 ? Math.ceil(bodyS) : null;
      if (waitS !== null) err.retryAfterSeconds = waitS;
    }
    throw err;
  }

  return payload ?? {};
}

async function request(method, path, body) {
  if (method !== 'GET') {
    /* ۱.۱۲.۰ — ضدِ دوبارسپاری سراسری (گلایهٔ «اسپم دکمه»):
       دو کلیک پشت‌سرهم روی یک دکمه = دو فراخوانی یکسانِ هم‌زمان؛ دومی به همان
       Promise اول می‌پیوندد → فقط یک نوشتن واقعی رخ می‌دهد حتی اگر نماها
       خودشان قفل دکمه نداشته باشند. قفل UI در ui.lockBtn است؛ این تورِ ایمنی لایهٔ داده. */
    const mkey = `M ${method} ${path} ${JSON.stringify(body ?? null)}`;
    if (inflightMut.has(mkey)) return inflightMut.get(mkey);
    const mp = doRequest(method, path, body, null)
      .finally(() => inflightMut.delete(mkey))
      .then((data) => {
        swrCache.clear(); // هر موتاسیون موفق، کش مراجع را باطل می‌کند
        return data;
      });
    inflightMut.set(mkey, mp);
    return mp;
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
  /* ۱.۱۲.۰ — ضدِ دوبارسپاری آپلود: دوبارکلیک روی «بارگذاری» (شاهد واقعی در تولید:
     دو ردیف یکسان با یک‌ثانیه اختلاف در docs_files) → کلید از نام+حجم+lastModified فایل‌ها
     ساخته می‌شود؛ همان فایل‌های همان File object = همان کلید = یک رفت‌وبرگشت. */
  const sig = [];
  for (const [k, v] of formData.entries()) {
    sig.push(v instanceof File ? `${k}:${v.name}:${v.size}:${v.lastModified}` : `${k}:${v}`);
  }
  const mkey = `F ${method} ${path} ${sig.join('|')}`;
  if (inflightMut.has(mkey)) return inflightMut.get(mkey);
  const p = (async () => {
  const headers = { Accept: 'application/json' };
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
    /* نرم — بدنهٔ خالی/غیر-JSON → payload null می‌ماند */
  }
  if (!res.ok) {
    const err = new Error(payload?.message || ERROR_TEXT[payload?.error] || `خطا (${res.status})`);
    err.status = res.status;
    err.code = payload?.error;
    err.details = payload?.details;
    throw err;
  }
  return payload ?? {};
  })();
  inflightMut.set(mkey, p);
  try {
    return await p;
  } finally {
    inflightMut.delete(mkey);
  }
}

api.postForm = (path, formData) => requestForm('POST', path, formData);

// دانلود فایل باینری/JSON (احراز با کوکی نشست — برای پشتیبان‌گیری)
api.downloadBlob = async (path) => {
  const headers = { Accept: '*/*' };
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
    /* نرم — بدنهٔ خالی/غیر-JSON → payload null می‌ماند */
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
