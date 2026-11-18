/**
 * فاز C (A1) — کلاینت ساخت خودکار ورکر ابری (docs/rust/first-run-and-cloud.md §۳ — جدول گام‌های CF API)
 *
 * جای اجرا: دو مسیر فقط-مدیر در desktop-routes روی موتور محلی. دارایی‌ها (باندل مرکزی +
 * schema.sql) از binding CLOUD_PROVISION می‌آید (adapter/server.mjs — makeCloudProvision) و
 * این فایل هیچ خواندن فایلی ندارد؛ فقط به api.cloudflare.com و خودِ ورکر تازه درخواست می‌زند.
 *
 * قراردادهای قطعی مأموریت فاز C:
 *   • زنجیرهٔ گام‌ها دقیقاً سند §۳: وارسی توکن → حساب → D1 (موجود = استفاده) → اسکیما
 *     قطعه‌قطعه → (فاز D1: گام ۵‌الف دارایی‌های وب — Static Assets) آپلود ورکر (multipart) →
 *     دامنهٔ workers.dev → سلامت + وارسی state با Bearer (+ فاز D1: چک وب GET /).
 *   • راز سشن ابر = binding AUTH_SECRET ورکر (runtime-secret — حداقل ۱۶ کاراکتر) → گام پایانی
 *     GET /api/instance-sync/state با Bearer همین راز و هدر X-Device-Id قراردادی.
 *   • نام ورکر فقط انگلیسی ^[a-z][a-z0-9-]{1,61}$ — پیشوند «markaz-» خودکار (تصمیم §۵-۶:
 *     کد پیچیده نشود؛ نام فارسی → خطای فارسی روشن، بدون تبدیل اسلاگ). D1 = نام ورکر + «-db».
 *   • قطعه‌بندی schema در مرز «;» با سقف ۶۴KB — پورت الگوی scripts/check-d1-compat.mjs
 *     (جداکنندهٔ cf_deploy.rs: نقل‌قول تک، کامنت خطی و بلوکی). خطای هر قطعه با شمارهٔ قطعه
 *     توقف می‌شود، بدون محتوای قطعه.
 *   • secretها: crypto.getRandomValues ۳۲بایت base64url — وابستگی صفر (فقط fetch/WebCrypto
 *     استاندارد). ساعت/تصادفی تزریقی‌اند تا آزمون بی‌شبکه باشد.
 *   • redaction: در steps و log هرگز توکن/secret نمی‌آید — جایی که راز موضوع است فقط «***».
 */

// ─── ثابت‌های قرارداد ───

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
/** سقف هر قطعهٔ POST /d1/query — قرارداد مأموریت: قطعه‌های ≤۶۴KB در مرز «;» */
export const SCHEMA_CHUNK_BYTES = 64 * 1024;
/** نشان تجمیع مایگریشن‌ها در schema.sql (الگوی build-installer-runtime) — مبنای schema_match */
const MIGRATION_MARKER = '-- ===== migration: ';
/** بودجهٔ سلامت ورکر تازه — ~۳۰ ثانیه retry (گام ۷ سند) */
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_RETRY_MS = 1_000;
/** شناسهٔ قراردادی برای فراخوانی state پس از provision — با DEVICE_ID_PATTERN هستهٔ سرویس سازگار است */
const PROVISION_DEVICE_ID = 'provision-check';
/** نام ماژول ورودی باندل مرکزی — هم نام فایل multipart، هم main_module در metadata */
const CENTRAL_MODULE_NAME = 'central-worker.js';
/** تاریخ سازگاری قطعی آپلود ورکر (گام ۵ سند) */
const COMPATIBILITY_DATE = '2025-01-01';
/** الگوی نام ورکر — قرارداد کلادفلر + پیشوند اجباری markaz- (تصمیم §۵-۶) */
export const WORKER_NAME_PATTERN = /^[a-z][a-z0-9-]{1,61}$/;
export const WORKER_NAME_PREFIX = 'markaz-';

import { uploadWebAssets } from './assets';
import type { WebAssetFile } from './assets';

// ─── پل دارایی‌ها (binding CLOUD_PROVISION) ───

/**
 * شکل binding CLOUD_PROVISION (adapter/server.mjs — makeCloudProvision). دو خوانندهٔ
 * بی‌آرگومان روی دو فایل ثابت نصب؛ هر دو غایب → null → مسیر provision «۵۰۱» می‌دهد.
 * فاز D1 — readWebAssets اختیاری است (makeWebAssetsReader): غایب/null/خالی = ساخت بدون
 * دارایی وب (سازگار عقب — خطا نیست).
 */
export interface CloudProvisionIO {
  readCentralWorker(): Promise<string | null>;
  readSchemaSql(): Promise<string | null>;
  readWebAssets?(): Promise<WebAssetFile[] | null>;
}

// ─── شکل‌های قرارداد ───

/** یک گام گزارش‌شده — هیچ مقدار secretی در detail نمی‌آید */
export interface ProvisionStep {
  step: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

export interface CloudAccount {
  id: string;
  name: string;
}

export interface CloudflareError {
  code?: number;
  message?: string;
}

export interface ProvisionSuccess {
  ok: true;
  workerUrl: string;
  /** راز سشن ابر (binding AUTH_SECRET ورکر) — یک‌بار به کاربر نشان داده می‌شود */
  authSecret: string;
  /** توکن یک‌بارمصرف POST /admin/setup مرکز — یک‌بار به کاربر نشان داده می‌شود */
  nodeSetupToken: string;
  workerName: string;
  d1Name: string;
  steps: ProvisionStep[];
  /** فاز D1 — نشان «وب فعال»: GET / پاسخ HTML داد (فقط وقتی دارایی وب آپلود شده بود) */
  webEnabled: boolean;
}

export interface ProvisionFailure {
  ok: false;
  /** گام متوقف‌شده — «name» یعنی رد پیش از هر فراخوانی شبکه */
  step: string;
  kind:
    | 'invalid_name'
    | 'network'
    | 'cf_api'
    | 'no_account'
    | 'multi_account'
    | 'account_mismatch'
    | 'health_timeout'
    | 'worker_error'
    | 'schema_mismatch'
    | 'assets_error';
  message: string;
  /** جزئیات خطای CF (گام verify و…) — بدون هیچ مقدار secret */
  errors?: CloudflareError[];
  steps: ProvisionStep[];
}

export type ProvisionResult = ProvisionSuccess | ProvisionFailure;

export interface ProvisionDeps {
  /** تزریق آزمون — پیش‌فرض fetch سراسری */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  /** باندل مرکزی از binding CLOUD_PROVISION */
  centralWorker: string;
  /** اسکیمای تجمیعی از binding CLOUD_PROVISION */
  schemaSql: string;
  /**
   * فاز D1 — فایل‌های وب (public) از binding CLOUD_PROVISION (makeWebAssetsReader).
   * null/غایب/خالی = بدون دارایی: وب بالا نمی‌آید و چک وب گام ۷ رد می‌شود — خطا نیست
   * (سازگار عقب با نصب‌های بدون public).
   */
  webAssets?: WebAssetFile[] | null;
  name: string;
  /** توکن API کلادفلر — فقط به api.cloudflare.com می‌رود و هرگز در خروجی/لاگ نمی‌آید */
  token: string;
  accountId?: string;
  log?: (message: string) => void;
  now?: () => number;
  /** تزریق آزمون تصادفی — پیش‌فرض crypto.getRandomValues */
  random?: (bytes: number) => Uint8Array;
}

// ─── نام ورکر — نرمال‌سازی و خطای فارسی ───

export type WorkerNameOutcome =
  | { ok: true; workerName: string; d1Name: string }
  | { ok: false; kind: 'invalid_name'; message: string };

/** پیشوند markaz- خودکار (اگر کاربر نداد) + اعتبارسنجی الگوی فقط-انگلیسی */
export function normalizeWorkerName(raw: unknown): WorkerNameOutcome {
  const input = typeof raw === 'string' ? raw.trim() : '';
  // پیشوند تنها یعنی نامی داده نشده — همان خطای «نام خالی» با راهنمای فارسی
  if (!input || input === WORKER_NAME_PREFIX) {
    return {
      ok: false,
      kind: 'invalid_name',
      message: 'نام ورکر خالی است — یک نام انگلیسی بدهید (مثلاً clinic)؛ پیشوند «markaz-» خودکار اضافه می‌شود'
    };
  }
  const candidate = input.startsWith(WORKER_NAME_PREFIX) ? input : `${WORKER_NAME_PREFIX}${input}`;
  if (!WORKER_NAME_PATTERN.test(candidate)) {
    return {
      ok: false,
      kind: 'invalid_name',
      message:
        'نام ورکر فقط حروف انگلیسی کوچک، رقم و خط تیره است (دست‌کم ۳ و حداکثر ۶۲ کاراکتر، آغاز با حرف انگلیسی) — نام فارسی یا نمادهای دیگر پذیرفته نیست'
    };
  }
  return { ok: true, workerName: candidate, d1Name: `${candidate}-db` };
}

// ─── secretها — base64url بدون وابستگی (الگوی toBase64Url نودسینک) ───

function base64urlOf(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomSecret(random?: (bytes: number) => Uint8Array): string {
  const bytes = random ? random(32) : crypto.getRandomValues(new Uint8Array(32));
  return base64urlOf(bytes);
}

// ─── فراخوانی CF API — خطای شبکه/HTTP/بدنه به یک شکل ───

interface CfBody {
  success?: boolean;
  errors?: CloudflareError[];
  result?: unknown;
}

type CfOutcome =
  | { kind: 'ok'; body: CfBody }
  | { kind: 'network'; message: string }
  | { kind: 'cf'; status: number; body: CfBody };

/** شکل شکست — خروجی callCf پس از ناروایی kind !== 'ok' */
type CfFailureOutcome = { kind: 'network'; message: string } | { kind: 'cf'; status: number; body: CfBody };

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function callCf(doFetch: FetchFn, path: string, init: RequestInit): Promise<CfOutcome> {
  let res: Response;
  try {
    res = await doFetch(`${CF_API_BASE}${path}`, init);
  } catch {
    return { kind: 'network', message: 'اتصال به api.cloudflare.com برقرار نشد — اینترنت را بررسی کنید' };
  }
  let body: CfBody = {};
  try {
    body = (await res.json()) as CfBody;
  } catch {
    body = {};
  }
  if (!res.ok || body.success === false) {
    return { kind: 'cf', status: res.status, body };
  }
  return { kind: 'ok', body };
}

function cfErrorList(body: CfBody): CloudflareError[] {
  return Array.isArray(body.errors) ? body.errors.slice(0, 5) : [];
}

/** پیام فارسی شکست CF — پیام پایه + جزئیات errors؛ هرگز شامل توکن/بدنهٔ درخواست نیست */
function cfFailMessage(prefix: string, outcome: CfFailureOutcome): string {
  if (outcome.kind === 'network') return outcome.message;
  const detail = cfErrorList(outcome.body)
    .map((e) => (e.message ? String(e.message) : `کد ${e.code ?? '?'}`))
    .filter(Boolean)
    .join('؛ ');
  return detail ? `${prefix} (HTTP ${outcome.status}) — ${detail}` : `${prefix} (HTTP ${outcome.status})`;
}

// ─── قطعه‌بندی اسکیما — پورت الگوی scripts/check-d1-compat.mjs (جداکنندهٔ cf_deploy.rs) ───

/** جداکنندهٔ دستورها با احترام به نقل‌قول تک، کامنت خطی و بلوکی — عین cf_deploy.rs::split_statements */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inSingle = false;
  let inLineComment = false;
  let inBlock = false;
  const chars = [...sql];
  let i = 0;
  const peek = () => chars[i + 1];
  while (i < chars.length) {
    const ch = chars[i];
    if (inLineComment) {
      cur += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlock) {
      cur += ch;
      if (ch === '*' && peek() === '/') {
        cur += chars[i + 1];
        i += 1;
        inBlock = false;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      cur += ch;
      if (ch === '\'') {
        if (peek() === '\'') {
          cur += chars[i + 1];
          i += 1;
        } else {
          inSingle = false;
        }
      }
      i += 1;
      continue;
    }
    if (ch === '-' && peek() === '-') {
      cur += ch;
      cur += chars[i + 1];
      i += 1;
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && peek() === '*') {
      cur += ch;
      cur += chars[i + 1];
      i += 1;
      inBlock = true;
      i += 1;
      continue;
    }
    if (ch === '\'') {
      inSingle = true;
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === ';') {
      const t = cur.trim();
      if (t.length > 0) out.push(t);
      cur = '';
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  const t = cur.trim();
  if (t.length > 0) out.push(t);
  return out;
}

/**
 * گروه‌بندی دستورها در قطعه‌های ≤۶۴KB (بایت UTF-8) — الگوی cf_deploy.rs::chunk_statements؛
 * دستور منفرد بزرگ‌تر از سقف در قطعهٔ خودش می‌رود (گیت ④ check-d1-compat مانع چنین دستوری است).
 * همیشه دست‌کم یک دستور در هر قطعه — هیچ قطعهٔ خالی تولید نمی‌شود.
 */
export function chunkSchemaSql(sql: string, limitBytes: number = SCHEMA_CHUNK_BYTES): string[] {
  const statements = splitStatements(sql);
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const st of statements) {
    const stBytes = encoder.encode(st).length + 2; // + «;\n»
    if (cur.length > 0 && curBytes + stBytes > limitBytes) {
      chunks.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += `${st};\n`;
    curBytes += stBytes;
  }
  if (cur.trim().length > 0) chunks.push(cur);
  return chunks;
}

/** شمار مایگریشن‌های تجمیع‌شده در schema.sql — نشان «migration:» مونتاژ نصاب؛ مبنای schema_match */
export function schemaMigrationCount(schemaSql: string): number {
  let n = 0;
  let idx = schemaSql.indexOf(MIGRATION_MARKER);
  while (idx !== -1) {
    n += 1;
    idx = schemaSql.indexOf(MIGRATION_MARKER, idx + MIGRATION_MARKER.length);
  }
  return n;
}

// ─── زنجیرهٔ کامل ساخت ───

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function provisionCloudWorker(deps: ProvisionDeps): Promise<ProvisionResult> {
  const now = deps.now ?? Date.now;
  const doFetch: FetchFn = deps.fetchImpl ?? ((input, i) => fetch(input, i));
  const steps: ProvisionStep[] = [];
  const record = (step: string, startedMs: number, ok: boolean, detail?: string): void => {
    const entry: ProvisionStep = { step, ok, ms: Math.max(0, now() - startedMs) };
    if (detail !== undefined) entry.detail = detail;
    steps.push(entry);
    deps.log?.(`گام ${step}: ${ok ? 'سبز' : 'قرمز'}${detail ? ` — ${detail}` : ''}`);
  };
  const fail = (
    step: string,
    kind: ProvisionFailure['kind'],
    message: string,
    errors?: CloudflareError[]
  ): ProvisionFailure => {
    const out: ProvisionFailure = { ok: false, step, kind, message, steps };
    if (errors && errors.length > 0) out.errors = errors;
    deps.log?.(`ساخت ورکر در گام ${step} متوقف شد: ${message}`);
    return out;
  };
  const failFromOutcome = (step: string, t0: number, prefix: string, outcome: CfFailureOutcome): ProvisionFailure => {
    record(step, t0, false, outcome.kind === 'cf' ? `HTTP ${outcome.status}` : undefined);
    return fail(
      step,
      outcome.kind === 'network' ? 'network' : 'cf_api',
      cfFailMessage(prefix, outcome),
      outcome.kind === 'cf' ? cfErrorList(outcome.body) : undefined
    );
  };

  // ─── نام — پیش از هر فراخوانی شبکه ───
  const nameCheck = normalizeWorkerName(deps.name);
  if (!nameCheck.ok) {
    return fail('name', 'invalid_name', nameCheck.message);
  }
  const workerName = nameCheck.workerName;
  const d1Name = nameCheck.d1Name;

  // ─── گام ۱ — وارسی توکن ───
  let t0 = now();
  let outcome = await callCf(doFetch, '/user/tokens/verify', {
    method: 'POST',
    headers: authHeaders(deps.token)
  });
  if (outcome.kind !== 'ok') return failFromOutcome('verify', t0, 'توکن کلادفلر پذیرفته نشد', outcome);
  record('verify', t0, true);

  // ─── گام ۲ — حساب‌ها: تک‌حساب خودکار؛ accountId پاس‌شده باید در فهرست دسترسی باشد ───
  t0 = now();
  outcome = await callCf(doFetch, '/accounts', { headers: authHeaders(deps.token) });
  if (outcome.kind !== 'ok') return failFromOutcome('accounts', t0, 'فهرست حساب‌های کلادفلر گرفته نشد', outcome);
  const accounts: CloudAccount[] = [];
  if (Array.isArray(outcome.body.result)) {
    for (const a of outcome.body.result as Array<Record<string, unknown>>) {
      if (a && typeof a === 'object' && typeof a.id === 'string') {
        accounts.push({ id: a.id, name: typeof a.name === 'string' ? a.name : '' });
      }
    }
  }
  let accountId = deps.accountId;
  if (accountId && !accounts.some((a) => a.id === accountId)) {
    record('accounts', t0, false, `${accounts.length} حساب`);
    return fail(
      'accounts',
      'account_mismatch',
      'حساب انتخاب‌شده در فهرست حساب‌هایی که این توکن به آن‌ها دسترسی دارد نیست — شناسهٔ حساب را از گام وارسی دوباره بگیرید'
    );
  }
  if (!accountId) {
    if (accounts.length === 0) {
      record('accounts', t0, false, '۰ حساب');
      return fail(
        'accounts',
        'no_account',
        'هیچ حساب کلادفلری با این توکن در دسترس نیست — مجوز «Account Settings:Read» را به توکن اضافه کنید'
      );
    }
    if (accounts.length > 1) {
      record('accounts', t0, false, `${accounts.length} حساب`);
      return fail(
        'accounts',
        'multi_account',
        'این توکن به بیش از یک حساب کلادفلر دسترسی دارد — نخست گام وارسی را بزنید و شناسهٔ حساب (accountId) را انتخاب کنید'
      );
    }
    accountId = accounts[0].id;
  }
  record('accounts', t0, true, `${accounts.length} حساب`);

  // ─── گام ۳ — D1: موجود با همین نام = استفاده؛ نه → ساخت ───
  t0 = now();
  outcome = await callCf(doFetch, `/accounts/${accountId}/d1/database?name=${encodeURIComponent(d1Name)}`, {
    headers: authHeaders(deps.token)
  });
  if (outcome.kind !== 'ok') return failFromOutcome('d1', t0, `بررسی پایگاه D1 «${d1Name}» ناموفق بود`, outcome);
  let d1Id: string | null = null;
  let d1Existed = false;
  if (Array.isArray(outcome.body.result)) {
    for (const db of outcome.body.result as Array<Record<string, unknown>>) {
      if (db && typeof db === 'object' && db.name === d1Name && typeof db.uuid === 'string') {
        d1Id = db.uuid;
        d1Existed = true;
        break;
      }
    }
  }
  if (!d1Id) {
    outcome = await callCf(doFetch, `/accounts/${accountId}/d1/database`, {
      method: 'POST',
      headers: authHeaders(deps.token),
      body: JSON.stringify({ name: d1Name })
    });
    if (outcome.kind !== 'ok') return failFromOutcome('d1', t0, `ساخت پایگاه D1 «${d1Name}» ناموفق بود`, outcome);
    const created = outcome.body.result as Record<string, unknown> | undefined;
    if (!created || typeof created.uuid !== 'string') {
      record('d1', t0, false);
      return fail('d1', 'cf_api', `پاسخ ساخت پایگاه D1 «${d1Name}» شناسهٔ دیتابیس نداشت`);
    }
    d1Id = created.uuid;
  }
  record('d1', t0, true, d1Existed ? 'موجود بود — استفاده شد' : 'ساخته شد');

  // ─── گام ۴ — اسکیما: قطعه‌بندی ≤۶۴KB مرز «;» و اعمال به‌ترتیب؛ شکست = توقف با شمارهٔ قطعه ───
  t0 = now();
  const chunks = chunkSchemaSql(deps.schemaSql);
  if (chunks.length === 0) {
    record('schema', t0, false);
    return fail('schema', 'cf_api', 'اسکیمای مرکزی خالی است — دارایی‌های نصب ناقص‌اند');
  }
  for (let i = 0; i < chunks.length; i += 1) {
    outcome = await callCf(doFetch, `/accounts/${accountId}/d1/database/${d1Id}/query`, {
      method: 'POST',
      headers: authHeaders(deps.token),
      body: JSON.stringify({ sql: chunks[i] })
    });
    if (outcome.kind !== 'ok') {
      const prefix = `اعمال اسکیما در قطعهٔ ${i + 1} از ${chunks.length} ناموفق بود`;
      record('schema', t0, false, `قطعهٔ ${i + 1}/${chunks.length}`);
      return fail(
        'schema',
        outcome.kind === 'network' ? 'network' : 'cf_api',
        outcome.kind === 'network' ? `${prefix} — اتصال به api.cloudflare.com برقرار نشد` : cfFailMessage(prefix, outcome),
        outcome.kind === 'cf' ? cfErrorList(outcome.body) : undefined
      );
    }
  }
  record('schema', t0, true, `${chunks.length} قطعه`);

  // ─── گام ۵‌الف (فاز D1) — دارایی‌های وب: Static Assets Direct Upload (سشن → bucketها → توکن) ───
  // webAssets غایب/null/خالی = بدون وب — گام کلاً رد می‌شود (سازگار عقب؛ خطا نیست)
  const webFiles = Array.isArray(deps.webAssets) ? deps.webAssets : [];
  let assetsJwt = '';
  if (webFiles.length > 0) {
    t0 = now();
    const uploaded = await uploadWebAssets({
      fetchImpl: doFetch,
      token: deps.token,
      accountId,
      scriptName: workerName,
      files: webFiles,
      log: deps.log,
      now
    });
    if (!uploaded.ok) {
      record(uploaded.step, t0, false);
      return fail(uploaded.step, uploaded.kind, uploaded.message, uploaded.errors);
    }
    assetsJwt = uploaded.jwt;
    // jwt دارایی هرگز در detail نمی‌آید — فقط نشان ***
    record(
      'assets-upload',
      t0,
      true,
      `${uploaded.uploadedCount} از ${uploaded.fileCount} فایل وب آپلود شد — توکن دارایی به متادیتای گام بعد می‌رود (jwt: ***)`
    );
  }

  // ─── گام ۵ — آپلود ورکر: multipart با metadata + ماژول باندل مرکزی (+ دارایی‌های وب فاز D1) ───
  t0 = now();
  const authSecret = randomSecret(deps.random);
  const nodeSetupToken = randomSecret(deps.random);
  const metadata = {
    main_module: CENTRAL_MODULE_NAME,
    compatibility_date: COMPATIBILITY_DATE,
    bindings: [
      { type: 'd1', name: 'DB', id: d1Id },
      { type: 'secret_text', name: 'AUTH_SECRET', text: authSecret },
      { type: 'secret_text', name: 'NODE_SETUP_TOKEN', text: nodeSetupToken }
    ],
    // فاز D1 — دارایی‌های وب فقط وقتی آپلود شدند الصاق می‌شود (SPA؛ بدون binding ASSETS —
    // workers.dev خودش دارایی‌ها را سرو می‌کند و مسیرهای غیراستاتیک به اسکریپت می‌روند)
    ...(assetsJwt
      ? {
          assets: {
            jwt: assetsJwt,
            config: { html_handling: 'auto-trailing-slash', not_found_handling: 'single-page-application' }
          }
        }
      : {})
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append(CENTRAL_MODULE_NAME, new Blob([deps.centralWorker], { type: 'application/javascript+module' }), CENTRAL_MODULE_NAME);
  outcome = await callCf(doFetch, `/accounts/${accountId}/workers/scripts/${workerName}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${deps.token}` }, // content-type نمی‌آید — مرز multipart خودکار ست می‌شود
    body: form
  });
  if (outcome.kind !== 'ok') return failFromOutcome('worker', t0, 'آپلود ورکر مرکزی ناموفق بود', outcome);
  // رازها هرگز در detail نمی‌آیند — فقط نشان ***
  record(
    'worker',
    t0,
    true,
    assetsJwt
      ? 'باندل مرکزی + دارایی‌های وب آپلود شد — bindingهای DB/AUTH_SECRET/NODE_SETUP_TOKEN ست شدند (رازها: ***)'
      : 'باندل مرکزی آپلود شد — bindingهای DB/AUTH_SECRET/NODE_SETUP_TOKEN ست شدند (رازها: ***)'
  );

  // ─── گام ۶ — دامنه: زیردامنهٔ حساب + فعال‌سازی workers.dev برای همین ورکر ───
  t0 = now();
  outcome = await callCf(doFetch, `/accounts/${accountId}/workers/subdomain`, { headers: authHeaders(deps.token) });
  if (outcome.kind !== 'ok') return failFromOutcome('subdomain', t0, 'زیردامنهٔ workers.dev حساب گرفته نشد', outcome);
  const subdomain = (outcome.body.result as Record<string, unknown> | undefined)?.subdomain;
  if (typeof subdomain !== 'string' || !subdomain) {
    record('subdomain', t0, false);
    return fail('subdomain', 'cf_api', 'پاسخ زیردامنهٔ workers.dev نامعتبر بود — فعال‌سازی workers.dev در حساب کلادفلر لازم است');
  }
  outcome = await callCf(doFetch, `/accounts/${accountId}/workers/scripts/${workerName}/subdomain`, {
    method: 'POST',
    headers: authHeaders(deps.token),
    body: JSON.stringify({ enabled: true, previews_disabled: true })
  });
  if (outcome.kind !== 'ok') return failFromOutcome('subdomain', t0, 'فعال‌سازی دامنهٔ ورکر ناموفق بود', outcome);
  const workerUrl = `https://${workerName}.${subdomain}.workers.dev`;
  record('subdomain', t0, true, workerUrl);

  // ─── گام ۷ — سلامت: GET /healthz با retry تا ~۳۰ ثانیه ───
  t0 = now();
  const healthStarted = now();
  let healthy = false;
  for (;;) {
    try {
      const res = await doFetch(`${workerUrl}/healthz`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // هنوز بالا نیامده — تلاش بعدی تا بودجهٔ ۳۰ ثانیه
    }
    if (now() - healthStarted >= HEALTH_TIMEOUT_MS) break;
    await sleep(HEALTH_RETRY_MS);
  }
  if (!healthy) {
    record('health', t0, false);
    return fail(
      'health',
      'health_timeout',
      `ورکر آپلود شد اما /healthz پس از ۳۰ ثانیه سالم نشد — چند لحظه بعد در پنل سلامت پیگیری کنید (${workerUrl})`
    );
  }
  record('health', t0, true);

  // ─── گام ۷ پی‌گرفته — state با Bearer راز سشن تازه تا schema_match وارسی شود ───
  t0 = now();
  let stateRes: Response;
  try {
    stateRes = await doFetch(`${workerUrl}/api/instance-sync/state`, {
      headers: { authorization: `Bearer ${authSecret}`, 'x-device-id': PROVISION_DEVICE_ID }
    });
  } catch {
    record('state', t0, false);
    return fail('state', 'network', 'ورکر پاسخ state نداد — نشانی ورکر را بررسی کنید');
  }
  if (!stateRes.ok) {
    record('state', t0, false, `HTTP ${stateRes.status}`);
    return fail(
      'state',
      'worker_error',
      `وارسی وضعیت هم‌گامی روی ورکر ناموفق بود (HTTP ${stateRes.status}) — راز سشن به‌تازگی ست شده؛ چند لحظه بعد دوباره وارسی کنید`
    );
  }
  const stateBody = (await stateRes.json().catch(() => null)) as { data?: { applied_migrations?: unknown } } | null;
  const applied = typeof stateBody?.data?.applied_migrations === 'number' ? stateBody.data.applied_migrations : null;
  const expected = schemaMigrationCount(deps.schemaSql);
  if (applied !== null && expected > 0 && applied !== expected) {
    record('state', t0, false, `ابر ${applied} / باندل ${expected}`);
    return fail(
      'state',
      'schema_mismatch',
      `نسخهٔ اسکیما روی ابر (${applied} مایگریشن) با باندل نصب (${expected} مایگریشن) هم‌خوان نیست — نصب دسکتاپ را به‌روزرسانی کنید`
    );
  }
  record('state', t0, true, applied === null ? 'شمارش مایگریشن ابر نامعلوم — پاسخ سبز' : `${applied} مایگریشن`);

  // ─── گام ۷ پی‌گرفته (فاز D1) — چک وب: GET / با Accept text/html → ۲۰۰ + بدنهٔ HTML ───
  // فقط وقتی دارایی وب رفت؛ بدون دارایی skip با یادداشت در log (بدون گام — سازگار عقب)
  let webEnabled = false;
  if (assetsJwt) {
    t0 = now();
    let webRes: Response;
    try {
      webRes = await doFetch(`${workerUrl}/`, {
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout(2_000)
      });
    } catch {
      record('web', t0, false);
      return fail('web', 'network', 'ورکر تازه پاسخ صفحهٔ وب نداد — نشانی ورکر را بررسی کنید');
    }
    const html = (await webRes.text().catch(() => '')).toLowerCase();
    if (!webRes.ok || !(html.includes('<!doctype html') || html.includes('<html'))) {
      record('web', t0, false, `HTTP ${webRes.status}`);
      return fail(
        'web',
        'worker_error',
        `صفحهٔ وب روی ورکر بالا نیامد (HTTP ${webRes.status}) — دارایی‌های وب آپلود شده اما GET / پاسخ HTML نداد؛ چند لحظه بعد در مرورگر بررسی کنید (${workerUrl})`
      );
    }
    record('web', t0, true, 'وب فعال — index.html سرو شد');
    webEnabled = true;
  } else {
    deps.log?.('چک وب رد شد — دارایی وبی برای این ساخت آپلود نشد');
  }

  // خروجی نهایی — رازها یک‌بار به کاربر نشان داده می‌شوند و هیچ‌جا ذخیره/لاگ نمی‌شوند
  return { ok: true, workerUrl, authSecret, nodeSetupToken, workerName, d1Name, steps, webEnabled };
}

// ─── گام وارسی تنها (مسیر verify — بدون هیچ پرویژن) ───

export interface VerifyCloudDeps {
  fetchImpl?: FetchFn;
  token: string;
  log?: (message: string) => void;
  now?: () => number;
}

export type VerifyCloudResult =
  | { ok: true; accounts: CloudAccount[] }
  | {
      ok: false;
      step: 'verify' | 'accounts';
      kind: 'network' | 'cf_api' | 'no_account';
      message: string;
      errors?: CloudflareError[];
    };

/** وارسی توکن + فهرست حساب‌ها — عین گام‌های ۱ و ۲ زنجیره؛ هیچ ساختن‌ای ندارد */
export async function verifyCloudToken(deps: VerifyCloudDeps): Promise<VerifyCloudResult> {
  const doFetch: FetchFn = deps.fetchImpl ?? ((input, i) => fetch(input, i));
  const outcome = await callCf(doFetch, '/user/tokens/verify', {
    method: 'POST',
    headers: authHeaders(deps.token)
  });
  if (outcome.kind !== 'ok') {
    return {
      ok: false,
      step: 'verify',
      kind: outcome.kind === 'network' ? 'network' : 'cf_api',
      message: cfFailMessage('توکن کلادفلر پذیرفته نشد', outcome),
      ...(outcome.kind === 'cf' && cfErrorList(outcome.body).length > 0 ? { errors: cfErrorList(outcome.body) } : {})
    };
  }
  const accountsOutcome = await callCf(doFetch, '/accounts', { headers: authHeaders(deps.token) });
  if (accountsOutcome.kind !== 'ok') {
    return {
      ok: false,
      step: 'accounts',
      kind: accountsOutcome.kind === 'network' ? 'network' : 'cf_api',
      message: cfFailMessage('فهرست حساب‌های کلادفلر گرفته نشد', accountsOutcome),
      ...(accountsOutcome.kind === 'cf' && cfErrorList(accountsOutcome.body).length > 0
        ? { errors: cfErrorList(accountsOutcome.body) }
        : {})
    };
  }
  const accounts: CloudAccount[] = [];
  if (Array.isArray(accountsOutcome.body.result)) {
    for (const a of accountsOutcome.body.result as Array<Record<string, unknown>>) {
      if (a && typeof a === 'object' && typeof a.id === 'string') {
        accounts.push({ id: a.id, name: typeof a.name === 'string' ? a.name : '' });
      }
    }
  }
  if (accounts.length === 0) {
    return {
      ok: false,
      step: 'accounts',
      kind: 'no_account',
      message: 'هیچ حساب کلادفلری با این توکن در دسترس نیست — مجوز «Account Settings:Read» را به توکن اضافه کنید'
    };
  }
  deps.log?.(`وارسی توکن سبز — ${accounts.length} حساب در دسترس`);
  return { ok: true, accounts };
}

// ─── فاز E (۱.۲۷.۱۸ — خواست کارفرما) — کشف استقرار ابری موجود با توکن ───
// «کلون از ابر» تا پیش از این نشانی ورکر را دستی می‌خواست؛ حالا با همان توکنِ provision
// فهرست مرکزهای ابری موجود (ورکر + نشانی‌های عمومی + D1) برمی‌گردد تا ویزار اتصال خودکار
// پر کند. فقط خواندنی — هیچ ساخت/حذف/دیپلویی این‌جا نیست؛ توکن هرگز در پاسخ/لاگ نمی‌آید.

export interface DiscoverDeps {
  token: string;
  fetchImpl?: FetchFn;
  log?: (m: string) => void;
}

/** مرکز ابری کشف‌شده — نام ورکر + نشانی‌های عمومی (workers.dev / دامنه‌های سفارشی) */
export interface CloudWorkerCandidate {
  name: string;
  account_id: string;
  urls: string[];
}

/** پایگاه‌دادهٔ D1 کشف‌شده در همان حساب */
export interface CloudD1Candidate {
  name: string;
  id: string;
  account_id: string;
}

export type DiscoverResult =
  | { ok: true; accounts: CloudAccount[]; workers: CloudWorkerCandidate[]; databases: CloudD1Candidate[] }
  | {
      ok: false;
      step: 'verify' | 'accounts' | 'workers' | 'd1';
      kind: 'network' | 'cf_api' | 'no_account';
      message: string;
      errors?: CloudflareError[];
    };

/**
 * کشف استقرار ابری موجود: وارسی توکن → حساب‌ها → برای هر حساب دامنه‌های عمومی ورکرها
 * (Workers Domains — مجوز Workers Scripts:Read) و پایگاه‌های D1 (مجوز D1:Read).
 * شکست هر شاخهٔ اختیاری (دامنه/D1) کاوش را نمی‌کشد — فقط آن بخش خالی می‌ماند؛ فقط شکست
 * وارسی توکن/حساب‌ها (لازم‌های مشترک با verify) نتیجهٔ ناموفق می‌دهد.
 */
export async function discoverCloudDeployment(deps: DiscoverDeps): Promise<DiscoverResult> {
  const doFetch: FetchFn = deps.fetchImpl ?? ((input, i) => fetch(input, i));
  const verify = await verifyCloudToken({ token: deps.token, fetchImpl: doFetch, log: deps.log });
  if (!verify.ok) {
    return {
      ok: false,
      step: verify.step === 'verify' ? 'verify' : 'accounts',
      kind: verify.kind === 'no_account' ? 'no_account' : verify.kind,
      message: verify.message,
      ...(verify.errors ? { errors: verify.errors } : {})
    };
  }
  const workers: CloudWorkerCandidate[] = [];
  const databases: CloudD1Candidate[] = [];
  for (const account of verify.accounts) {
    const headers = authHeaders(deps.token);
    // دامنه‌های عمومی ورکرها — شکست (مثلاً بدون مجوز Zone/Workers) بخش را خالی می‌گذارد
    const domainsOutcome = await callCf(doFetch, `/accounts/${account.id}/workers/domains`, { headers });
    if (domainsOutcome.kind === 'ok' && Array.isArray(domainsOutcome.body.result)) {
      const byService = new Map<string, string[]>();
      for (const row of domainsOutcome.body.result as Array<Record<string, unknown>>) {
        const service = typeof row.service === 'string' ? row.service : '';
        const hostname = typeof row.hostname === 'string' ? row.hostname : '';
        if (!service || !hostname) continue;
        const urls = byService.get(service) ?? [];
        urls.push(`https://${hostname}`);
        byService.set(service, urls);
      }
      for (const [name, urls] of byService) workers.push({ name, account_id: account.id, urls: urls.sort() });
      deps.log?.(`حساب «${account.name || account.id}»: ${byService.size} ورکر با دامنهٔ عمومی`);
    } else {
      deps.log?.(`دامنه‌های حساب «${account.name || account.id}» خوانده نشد — بخش ورکرها خالی می‌ماند`);
    }
    // پایگاه‌های D1 — شکست بخش را خالی می‌گذارد (پرویژن از این فهرست فقط «نمایش» می‌کند)
    const d1Outcome = await callCf(doFetch, `/accounts/${account.id}/d1/database`, { headers });
    if (d1Outcome.kind === 'ok' && Array.isArray(d1Outcome.body.result)) {
      for (const row of d1Outcome.body.result as Array<Record<string, unknown>>) {
        const id = typeof row.uuid === 'string' ? row.uuid : typeof row.id === 'string' ? row.id : '';
        const name = typeof row.name === 'string' ? row.name : '';
        if (!id || !name) continue;
        databases.push({ name, id, account_id: account.id });
      }
      deps.log?.(`حساب «${account.name || account.id}»: ${databases.length} پایگاه D1`);
    } else {
      deps.log?.(`فهرست D1 حساب «${account.name || account.id}» خوانده نشد — بخش پایگاه‌ها خالی می‌ماند`);
    }
  }
  return { ok: true, accounts: verify.accounts, workers, databases };
}
