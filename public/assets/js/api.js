/**
 * کلاینت HTTP فرانت — fetch با خطای یکدست و هدر احراز
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// api.js — thin fetch wrapper for the Worker API
//: احراز هویت صفحه ورود — توکن نشست در localStorage + هدر Authorization
// (در محیط توسعه هم X-Dev-Staff-Id فرستاده می‌شود؛ در production نادیده گرفته می‌شود)

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

/** خروج کامل — توکن و هویت توسعه پاک می‌شوند */
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

async function request(method, path, body) {
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
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    const err = new Error(ERROR_TEXT.NETWORK);
    err.code = 'NETWORK';
    throw err;
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // 204 و پاسخ‌های بدون بدنه
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

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  del: (path) => request('DELETE', path)
};

/**
 * — ارسال FormData (multipart) — Content-Type دستی ست نمی‌شود تا مرورگر
 * boundary بسازد؛ همان مرز خطا/توکن request اصلی
 */
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
    // 204 و پاسخ‌های بدون بدنه
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

/** — POST فرم چندبخشی (بارگذاری چندفایلی بانک تمرین) */
api.postForm = (path, formData) => requestForm('POST', path, formData);

/** — PUT بدنهٔ باینری خام (تکه‌های بارگذاری پیوستهٔ فایل بزرگ) */
api.putRaw = (path, arrayBuffer) => requestRaw('PUT', path, arrayBuffer);

/**
 * — درخواست با بدنهٔ باینری خام — Content-Type: application/octet-stream
 */
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
    // پاسخ بدون بدنه
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

/** ساخت query string از object (فیلدهای null/undefined حذف می‌شوند) */
export function qs(params) {
  const pairs = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}
