/**
 * rust-f7 — وضعیت اتصال ابر و ماشین حالت ویزار راه‌اندازی نخست
 *
 * دو دستهٔ داده با دو سطح حساسیت:
 *   ۱) فرادادهٔ اتصال (worker_url / node_code / وضعیت‌ها) → localStorage کلید cloud_conn_v1
 *   ۲) رازها (کلید نود node_key و توکن Cloudflare cf_token) → هرگز در localStorage؛
 *      فقط در SecureStore (در پوستهٔ دسکتاپ: Credential Manager ویندوز از طریق
 *      فرمان Rust desktop_secure_store). اگر پوسته مخزن امن نداد، fallback محلی
 *      با نشان صریح insecure_fallback=true ست می‌شود تا در تنظیمات هشدار ببینیم.
 *
 * ماشین حالت ویزار: welcome → cloud → token → done  (+ خروج skip از هر گام)
 * انبار و مخزن امن هر دو تزریق‌پذیرند تا آزمون‌ها بدون مرورگر/OS اجرا شوند.
 */

export type CloudVerifyOutcome =
  | 'never'
  | 'ok'
  | 'auth_error'
  | 'network_error'
  | 'bad_url'
  | 'server_error'
  | 'invalid_token';

export interface VerifyStamp {
  at: string;
  outcome: CloudVerifyOutcome;
}

export interface CloudConnRecord {
  version: 1;
  /** ویزار به پایان رسید یا کاربر رد کرد — تکرارش فقط از تنظیمات */
  setup_done: boolean;
  /** آدرس پایهٔ ورکر ابری، بدون اسلش انتهایی */
  worker_url: string | null;
  /** هویت نود میز: DESKTOP:<install-id> — از جریان ثبت فقط-مدیر اپ ابری */
  node_code: string | null;
  node_key_set: boolean;
  cf_token_set: boolean;
  /** true یعنی رازها در fallback ناامن محلی‌اند — هشدار در تنظیمات */
  insecure_fallback: boolean;
  last_node_verify: VerifyStamp | null;
  last_cf_verify: VerifyStamp | null;
  updatedAt: string | null;
}

/** کلید ثابت فراداده — تغییرش یعنی شکستن سازگاری، ممنوع */
export const CLOUD_CONN_KEY = 'cloud_conn_v1';
/** کلیدهای راز در مخزن امن */
export const SECRET_NODE_KEY = 'node_key';
export const SECRET_CF_TOKEN = 'cf_token';

/** قرارداد حداقلی انبار همگام — عین TutorialStore در src/tutorial/state.ts */
export interface CloudStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** قرارداد مخزن امن رازها — پیاده‌سازی واقعی: فرمان Rust desktop_secure_store */
export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** انبار پیش‌فرض: localStorage با گارد کامل تا در هر محیطی بی‌خطر باشد */
export const localStorageStore: CloudStore = {
  getItem(key) {
    try {
      const ls = (globalThis as { localStorage?: CloudStore }).localStorage;
      return ls ? ls.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const ls = (globalThis as { localStorage?: CloudStore }).localStorage;
      if (ls) ls.setItem(key, value);
    } catch {
      /* حافظهٔ غیرفعال — اتصال ابر نباید به‌خاطرش سامانه را بشکند */
    }
  },
  removeItem(key) {
    try {
      const ls = (globalThis as { localStorage?: CloudStore }).localStorage;
      if (ls) ls.removeItem(key);
    } catch {
      /* بی‌اثر */
    }
  }
};

let activeStore: CloudStore = localStorageStore;

/** جای‌گذاری انبار برای آزمون‌ها (الگوی setTutorialStore)؛ null = بازگشت به پیش‌فرض */
export function setCloudStore(store: CloudStore | null): void {
  activeStore = store ?? localStorageStore;
}

export function emptyCloudRecord(): CloudConnRecord {
  return {
    version: 1,
    setup_done: false,
    worker_url: null,
    node_code: null,
    node_key_set: false,
    cf_token_set: false,
    insecure_fallback: false,
    last_node_verify: null,
    last_cf_verify: null,
    updatedAt: null
  };
}

function parseRecord(raw: string | null): CloudConnRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CloudConnRecord>;
    if (!parsed || parsed.version !== 1) return null;
    return { ...emptyCloudRecord(), ...parsed, version: 1 };
  } catch {
    return null;
  }
}

/** بارگذاری وضعیت؛ خرابی/گم‌شدن = رکورد خالی، هرگز throw */
export function loadCloudRecord(store: CloudStore = activeStore): CloudConnRecord {
  return parseRecord(store.getItem(CLOUD_CONN_KEY)) ?? emptyCloudRecord();
}

/** ذخیرهٔ وضعیت با مُهر زمان؛ هرگز throw نمی‌کند */
export function saveCloudRecord(record: CloudConnRecord, store: CloudStore = activeStore): void {
  const next: CloudConnRecord = { ...record, version: 1, updatedAt: new Date().toISOString() };
  try {
    store.setItem(CLOUD_CONN_KEY, JSON.stringify(next));
  } catch {
    /* بی‌اثر */
  }
}

/** مُهر نتیجهٔ آزمون اتصال/توکن روی رکورد */
export function stampVerify(
  record: CloudConnRecord,
  which: 'last_node_verify' | 'last_cf_verify',
  outcome: CloudVerifyOutcome,
  at: string = new Date().toISOString()
): CloudConnRecord {
  return { ...record, [which]: { at, outcome } };
}

/** پایان ویزار: با skip هم setup_done می‌شود — تور مستقل از اتصال است */
export function completeCloudSetup(
  record: CloudConnRecord,
  skipped: boolean,
  extra?: Partial<CloudConnRecord>
): CloudConnRecord {
  return { ...record, ...extra, setup_done: true, updatedAt: new Date().toISOString() };
}

/** پاک‌سازی کامل اتصال (فراداده + رازها) — از تنظیمات */
export function resetCloudRecord(store: CloudStore = activeStore): CloudConnRecord {
  store.removeItem(CLOUD_CONN_KEY);
  return emptyCloudRecord();
}

/* ─── مخزن امن رازها ─── */

/** fallback محلی صریح: فقط وقتی پوسته مخزن امن نداد؛ با پیشوند نشان‌دار */
export function insecureFallbackStore(base: CloudStore = activeStore): SecureStore {
  const prefixed = (key: string) => `__CLOUD_INSECURE__:${key}`;
  return {
    async get(key) {
      return base.getItem(prefixed(key));
    },
    async set(key, value) {
      base.setItem(prefixed(key), value);
    },
    async delete(key) {
      base.removeItem(prefixed(key));
    }
  };
}

/** پل Tauri: __TAURI_INTERNALS__.invoke که پوستهٔ Tauri 2 به صفحه تزریق می‌کند */
interface TauriInternals {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function tauriInvoke(): TauriInternals['invoke'] | null {
  const internals = (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] as
    | TauriInternals
    | undefined;
  return internals && typeof internals.invoke === 'function' ? internals.invoke : null;
}

/** مخزن امن واقعی از طریق فرمان Rust desktop_secure_store (Credential Manager ویندوز) */
export function tauriSecureStore(
  invoke?: TauriInternals['invoke'] | null
): SecureStore | null {
  const real = invoke ?? tauriInvoke();
  if (!real) return null;
  return {
    async get(key) {
      const out = await real('desktop_secure_store', { action: 'get', key });
      return typeof out === 'string' ? out : null;
    },
    async set(key, value) {
      await real('desktop_secure_store', { action: 'set', key, value });
    },
    async delete(key) {
      await real('desktop_secure_store', { action: 'delete', key });
    }
  };
}

export interface ResolvedSecureStore {
  store: SecureStore;
  insecure: boolean;
}

/**
 * انتخاب مخزن: اولویت با مخزن امن پوسته؛ نبود → fallback محلی با نشان صریح.
 * هیچ مسیری throw نمی‌کند — خطای مخزن امن = fallback ناامن + هشدار.
 */
export async function resolveSecureStore(base: CloudStore = activeStore): Promise<ResolvedSecureStore> {
  const tauri = tauriSecureStore();
  if (tauri) {
    try {
      await tauri.get('__probe__');
      return { store: tauri, insecure: false };
    } catch {
      /* فرمان پوسته شکست → fallback */
    }
  }
  return { store: insecureFallbackStore(base), insecure: true };
}

/** خواندن یک راز؛ هر خطا = null (برای نمایش وضعیت در تنظیمات کافی است) */
export async function readSecret(secure: SecureStore, key: string): Promise<string | null> {
  try {
    return await secure.get(key);
  } catch {
    return null;
  }
}
