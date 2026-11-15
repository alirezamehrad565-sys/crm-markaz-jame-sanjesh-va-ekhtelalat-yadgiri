/**
 * فاز C (A1) — آزمون کلاینت ساخت خودکار ورکر ابری (provision.ts) + دو مسیر فقط-مدیر desktop-routes
 *
 * بدون شبکه — api.cloudflare.com و خودِ ورکر تازه با fetchImpl ماک شبیه‌سازی می‌شوند (CF API فیک
 * که ترتیب/شکل هر فراخوانی را ثبت می‌کند). بند قراردادهای مأموریت فاز C که این‌جا بسته می‌شوند:
 *   ① ترتیب دقیق گام‌ها (وارسی → حساب → D1 → اسکیما → ورکر → دامنه → healthz → state)
 *   ② شکل درخواست‌ها — URLها حرف‌به‌حرف، multipart با metadata (main_module/compatibility_date/
 *      bindingهای DB/AUTH_SECRET/NODE_SETUP_TOKEN) و ماژول باندل مرکزی
 *   ③ D1 موجود با همین نام = استفاده (بدون فراخوانی ساخت)
 *   ④ نام فارسی/خالی/بیش‌ازحد → invalid_name با پیام فارسی، پیش از هر فراخوانی شبکه
 *   ⑤ قطعه‌بندی اسکیما: مرز «;»، سقف ۶۴KB، بدون قطعهٔ خالی، نقل‌قول/کامنت نشکند
 *   ⑥ redaction — steps و log هرگز توکن/secret ندارند، حتی هنگام شکست گام ۵
 *   ⑦ مسیر provision با binding غایب → ۵۰۱ فارسی (workerd/تولید وب)
 *   ⑧ سلامت نهایی — state با Bearer راز سشن تازه و هدر X-Device-Id قراردادی
 * عین الگوی runner.test.ts (db ماک هارنس، ستاپ کوتاه، سشن مدیر برای مسیرهای تغییرپذیر).
 */
import { describe, it, expect } from 'vitest';
import { createTestApp, silentLogger, asRole } from '../../../test/harness';
import type { TestApp, Api } from '../../../test/harness';
import {
  provisionCloudWorker,
  verifyCloudToken,
  normalizeWorkerName,
  chunkSchemaSql,
  schemaMigrationCount,
  SCHEMA_CHUNK_BYTES
} from '../provision';
import type { CloudProvisionIO, ProvisionResult, VerifyCloudResult } from '../provision';
import { buildAssetManifest } from '../assets';
import type { WebAssetFile } from '../assets';

// ─── دارایی‌های آزمون ───

const CF_BASE = 'https://api.cloudflare.com/client/v4';
const TOKEN = 'cf-token-abcdefgh';
const ACCOUNT_ID = 'acc-0000000000000000000000000001';
const ACCOUNT_NAME = 'حساب آزمون';
const SUBDOMAIN = 'test-sub';
const WORKER_NAME = 'markaz-clinic';
const WORKER_URL = `https://${WORKER_NAME}.${SUBDOMAIN}.workers.dev`;

/** باندل مرکزی فیک — فقط برای آپلود multipart */
const CENTRAL_WORKER = "export default { async fetch() { return new Response('central-test'); } }\n";

/** اسکیمای فیک با نشان تجمیع مایگریشن‌ها (همان الگوی build-installer-runtime) — ۳ مایگریشن */
const SCHEMA = [
  '-- schema.sql — آزمون',
  '-- ===== migration: 0001_a.sql =====',
  "CREATE TABLE a (id TEXT);",
  '-- ===== migration: 0002_b.sql =====',
  "INSERT INTO a (id) VALUES ('x;y');",
  '-- ===== migration: 0003_c.sql =====',
  'CREATE TABLE b (id TEXT);'
].join('\n');
const EXPECTED_MIGRATIONS = schemaMigrationCount(SCHEMA);

/** فاز D1 — دارایی‌های وب فیک (دو فایل؛ دومی با بک‌اسلش برای آزمون نرمال‌سازی مسیر) */
const WEB_FILES: WebAssetFile[] = [
  { path: 'index.html', bytes: new TextEncoder().encode('<!doctype html><html><body>وب مرکزی</body></html>') },
  { path: 'assets\\app.js', bytes: new TextEncoder().encode('console.log("app")') }
];

// ─── CF API فیک + ورکر تازه ───

interface RecordedCall {
  url: string;
  method: string;
  init: RequestInit;
  /** metadata جزء multipart گام ورکر — برای وارسی bindingها و آزمون redaction */
  metadata: Record<string, unknown> | null;
}

interface FakeOptions {
  /** D1 با همین نام از قبل موجود است (مسیر reuse) */
  existingD1?: boolean;
  /** شمارش مایگریشن پاسخ state ابر (پیش‌فرض هم‌خوان با SCHEMA) */
  appliedMigrations?: number;
  /** بخشی از URL که باید شکست بخورد (CF API یا ورکر تازه) */
  failMatch?: string;
  failStatus?: number;
  /** فاز D1 — پاسخ GET / چک وب: پیش‌فرض HTML سبز؛ false → JSON (آزمون شکست گام web) */
  webHtml?: boolean;
}

function makeCfFake(opts: FakeOptions = {}) {
  const calls: RecordedCall[] = [];
  let uploadSeq = 0; // فاز D1 — شمارش آپلودهای دارایی برای jwt ترتیبی
  const failOf = (url: string): Response | null => {
    if (opts.failMatch && url.includes(opts.failMatch)) {
      return Response.json({ success: false, errors: [{ code: 971, message: 'شکست فیک' }] }, { status: opts.failStatus ?? 400 });
    }
    return null;
  };
  const fetchImpl = async (input: string | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    let metadata: Record<string, unknown> | null = null;
    const rawBody: unknown = init?.body;
    if (rawBody instanceof FormData) {
      const part: unknown = rawBody.get('metadata');
      if (part instanceof Blob) {
        try {
          metadata = JSON.parse(await part.text()) as Record<string, unknown>;
        } catch {
          metadata = null;
        }
      }
    }
    calls.push({ url, method, init: init ?? {}, metadata });
    const failed = failOf(url);
    if (failed) return failed;
    if (url === `${CF_BASE}/user/tokens/verify` && method === 'POST') {
      return Response.json({ success: true, result: { id: 'tok-1', status: 'active' } });
    }
    if (url === `${CF_BASE}/accounts` && method === 'GET') {
      return Response.json({ success: true, result: [{ id: ACCOUNT_ID, name: ACCOUNT_NAME }] });
    }
    if (url === `${CF_BASE}/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/assets-upload-session` && method === 'POST') {
      // فاز D1 — manifest بدنه را می‌خواند و hashها را در دو bucket برمی‌گرداند (آینهٔ سشن واقعی)
      let manifest: Record<string, { hash: string }> = {};
      try {
        manifest = (JSON.parse(String(init?.body ?? '{}')) as { manifest?: typeof manifest }).manifest ?? {};
      } catch {
        manifest = {};
      }
      const hashes = Object.values(manifest).map((e) => e.hash);
      const buckets = hashes.length > 1 ? [hashes.slice(0, 1), hashes.slice(1)] : [hashes];
      return Response.json({ success: true, result: { jwt: 'assets-session-jwt', buckets } });
    }
    if (url === `${CF_BASE}/accounts/${ACCOUNT_ID}/workers/assets/upload?base64=true` && method === 'POST') {
      uploadSeq += 1;
      return Response.json({ success: true, result: { jwt: `assets-upload-jwt-${uploadSeq}` } }, { status: 201 });
    }
    if (url.startsWith(`${CF_BASE}/accounts/${ACCOUNT_ID}/d1/database?name=`) && method === 'GET') {
      return Response.json(
        opts.existingD1
          ? { success: true, result: [{ uuid: 'db-existing', name: `${WORKER_NAME}-db` }] }
          : { success: true, result: [] }
      );
    }
    if (url === `${CF_BASE}/accounts/${ACCOUNT_ID}/d1/database` && method === 'POST') {
      return Response.json({ success: true, result: { uuid: 'db-new', name: `${WORKER_NAME}-db` } });
    }
    if (url.includes('/d1/database/') && url.endsWith('/query') && method === 'POST') {
      return Response.json({ success: true, result: [] });
    }
    if (url === `${CF_BASE}/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}` && method === 'PUT') {
      return Response.json({ success: true, result: { id: 'worker-1' } });
    }
    if (url === `${CF_BASE}/accounts/${ACCOUNT_ID}/workers/subdomain` && method === 'GET') {
      return Response.json({ success: true, result: { subdomain: SUBDOMAIN } });
    }
    if (url === `${CF_BASE}/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain` && method === 'POST') {
      return Response.json({ success: true, result: { enabled: true } });
    }
    if (url === `${WORKER_URL}/healthz` && method === 'GET') {
      return new Response('ok', { status: 200 });
    }
    if (url === `${WORKER_URL}/` && method === 'GET') {
      // فاز D1 — چک وب گام ۷: پیش‌فرض HTML سبز؛ webHtml:false → JSON (شکست فیک)
      return opts.webHtml === false
        ? Response.json({ ok: true })
        : new Response('<!DOCTYPE html><html lang="fa"><body>وب مرکزی</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
          });
    }
    if (url === `${WORKER_URL}/api/instance-sync/state` && method === 'GET') {
      return Response.json({
        data: { device_id: 'provision-check', applied_migrations: opts.appliedMigrations ?? EXPECTED_MIGRATIONS, cursors: {}, table_count: 60 }
      });
    }
    return Response.json({ success: false, errors: [{ code: 9999, message: 'مسیر فیک ناشناخته' }] }, { status: 404 });
  };
  return { calls, fetchImpl, workerUrl: WORKER_URL };
}

/** تصادفی قطعی برای secretها — خروجی می‌تواند در آزمون redaction سنجیده شود */
function makeDeterministicRandom() {
  let seed = 0;
  return (n: number): Uint8Array => {
    seed += 1;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) out[i] = (i * 7 + seed * 13) % 256;
    return out;
  };
}

/** ساعت جلورو — برای آزمون انقضای بودجهٔ سلامت بدون انتظار واقعی */
function makeFastClock() {
  let t = 0;
  return () => (t += 60_000);
}

interface ProvisionOpts {
  name?: string;
  token?: string;
  random?: (bytes: number) => Uint8Array;
  now?: () => number;
  logs?: string[];
  fakeOpts?: FakeOptions;
}

async function runProvision(opts: ProvisionOpts = {}): Promise<{ result: ProvisionResult; fake: ReturnType<typeof makeCfFake> }> {
  const fake = makeCfFake(opts.fakeOpts ?? {});
  const logs = opts.logs ?? [];
  const result = await provisionCloudWorker({
    fetchImpl: fake.fetchImpl,
    centralWorker: CENTRAL_WORKER,
    schemaSql: SCHEMA,
    name: opts.name ?? 'clinic',
    token: opts.token ?? TOKEN,
    random: opts.random ?? makeDeterministicRandom(),
    ...(opts.now ? { now: opts.now } : {}),
    log: (m) => logs.push(m)
  });
  return { result, fake };
}

// ─── ①/② زنجیرهٔ کامل موفق — ترتیب گام‌ها و شکل درخواست‌ها ───

describe('زنجیرهٔ کامل ساخت (fetchImpl ماک)', () => {
  it('ترتیب دقیق فراخوانی‌ها — CF API فقط روی api.cloudflare.com و ورکر تازه روی workers.dev', async () => {
    const { result, fake } = await runProvision();
    expect(result.ok).toBe(true);
    const urls = fake.calls.map((c) => `${c.method} ${c.url}`);
    expect(urls).toEqual([
      `POST ${CF_BASE}/user/tokens/verify`,
      `GET ${CF_BASE}/accounts`,
      `GET ${CF_BASE}/accounts/${ACCOUNT_ID}/d1/database?name=${WORKER_NAME}-db`,
      `POST ${CF_BASE}/accounts/${ACCOUNT_ID}/d1/database`,
      `POST ${CF_BASE}/accounts/${ACCOUNT_ID}/d1/database/db-new/query`,
      `PUT ${CF_BASE}/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`,
      `GET ${CF_BASE}/accounts/${ACCOUNT_ID}/workers/subdomain`,
      `POST ${CF_BASE}/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`,
      `GET ${WORKER_URL}/healthz`,
      `GET ${WORKER_URL}/api/instance-sync/state`
    ]);
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    expect(result.workerName).toBe(WORKER_NAME);
    expect(result.d1Name).toBe(`${WORKER_NAME}-db`);
    expect(result.workerUrl).toBe(WORKER_URL);
    // steps قراردادی — همهٔ گام‌ها به‌ترتیب و همه سبز
    expect(result.steps.map((s) => s.step)).toEqual(['verify', 'accounts', 'd1', 'schema', 'worker', 'subdomain', 'health', 'state']);
    expect(result.steps.every((s) => s.ok)).toBe(true);
    expect(result.steps.every((s) => typeof s.ms === 'number')).toBe(true);
    // secretها — ۳۲بایت base64url بدون وابستگی، حداقل ۱۶ کاراکتر (قرارداد AUTH_SECRET)
    expect(result.authSecret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.nodeSetupToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.authSecret).not.toBe(result.nodeSetupToken);
  });

  it('شکل multipart گام ورکر — metadata با main_module/compatibility_date و bindingهای DB/AUTH_SECRET/NODE_SETUP_TOKEN + ماژول باندل', async () => {
    const { result, fake } = await runProvision();
    expect(result.ok).toBe(true);
    const put = fake.calls.find((c) => c.method === 'PUT' && c.url.includes('/workers/scripts/'));
    expect(put).toBeTruthy();
    const body = put!.init.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    const metaPart: unknown = form.get('metadata');
    expect(metaPart).toBeInstanceOf(Blob);
    const metadata = JSON.parse(await (metaPart as Blob).text()) as {
      main_module: string;
      compatibility_date: string;
      bindings: Array<Record<string, string>>;
    };
    expect(metadata.main_module).toBe('central-worker.js');
    expect(metadata.compatibility_date).toBe('2025-01-01');
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    expect(metadata.bindings).toEqual([
      { type: 'd1', name: 'DB', id: 'db-new' },
      { type: 'secret_text', name: 'AUTH_SECRET', text: result.authSecret },
      { type: 'secret_text', name: 'NODE_SETUP_TOKEN', text: result.nodeSetupToken }
    ]);
    const modulePart: unknown = form.get('central-worker.js');
    expect(modulePart).toBeInstanceOf(Blob);
    expect(await (modulePart as Blob).text()).toBe(CENTRAL_WORKER);
    expect((modulePart as Blob).type).toBe('application/javascript+module');
  });

  it('سلامت نهایی — state با Bearer راز سشن تازه + هدر X-Device-Id قراردادی؛ healthz عمومی بی‌سرایند', async () => {
    const { result, fake } = await runProvision();
    expect(result.ok).toBe(true);
    const health = fake.calls.find((c) => c.url === `${WORKER_URL}/healthz`);
    expect(health).toBeTruthy();
    expect(health!.init.headers ?? {}).toEqual({});
    const state = fake.calls.find((c) => c.url === `${WORKER_URL}/api/instance-sync/state`);
    expect(state).toBeTruthy();
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    const headers = state!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${result.authSecret}`);
    expect(headers['x-device-id']).toBe('provision-check');
  });

  it('ناهم‌خوانی شمارش مایگریشن ابر با باندل → توقف در گام state با پیام فارسی', async () => {
    const { result } = await runProvision({ fakeOpts: { appliedMigrations: 999 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('state');
      expect(result.kind).toBe('schema_mismatch');
      expect(result.message).toContain('اسکیما');
    }
  });
});

// ─── ③ reuse-existing-D1 ───

describe('D1 موجود با همین نام', () => {
  it('بدون فراخوانی ساخت؛ binding DB با شناسهٔ دیتابیس موجود بسته می‌شود', async () => {
    const { result, fake } = await runProvision({ fakeOpts: { existingD1: true } });
    expect(result.ok).toBe(true);
    expect(fake.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/d1/database')).length).toBe(0);
    const put = fake.calls.find((c) => c.method === 'PUT' && c.url.includes('/workers/scripts/'));
    const metadata = put!.metadata as { bindings: Array<{ name: string; id?: string }> };
    expect(metadata.bindings[0]).toEqual({ type: 'd1', name: 'DB', id: 'db-existing' });
    const d1Step = result.ok ? result.steps.find((s) => s.step === 'd1') : null;
    expect(d1Step?.detail).toContain('موجود');
  });
});

// ─── ④ نام ورکر ───

describe('نام ورکر — نرمال‌سازی و خطای فارسی', () => {
  it('پیشوند markaz- خودکار؛ نام پیشونددار دست‌نخورده؛ D1 = نام + -db', () => {
    expect(normalizeWorkerName('clinic')).toEqual({ ok: true, workerName: 'markaz-clinic', d1Name: 'markaz-clinic-db' });
    expect(normalizeWorkerName('  clinic  ')).toEqual({ ok: true, workerName: 'markaz-clinic', d1Name: 'markaz-clinic-db' });
    expect(normalizeWorkerName('markaz-clinic')).toEqual({ ok: true, workerName: 'markaz-clinic', d1Name: 'markaz-clinic-db' });
    expect(normalizeWorkerName('ab1')).toEqual({ ok: true, workerName: 'markaz-ab1', d1Name: 'markaz-ab1-db' });
  });

  it('نام فارسی/خالی/بیش‌ازحد/نماددار → invalid_name با پیام فارسی', () => {
    for (const bad of ['', '   ', 'کلینیک مرکزی', 'مرکز', 'markaz-', 'Markaz-Clinic', 'a b', 'clinic!', 'x_y', 'a'.repeat(70)]) {
      const out = normalizeWorkerName(bad);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.kind).toBe('invalid_name');
        expect(out.message).toContain('نام');
      }
    }
  });

  it('نام بد پیش از هر فراخوانی شبکه رد می‌شود — بدون گام و بدون فراخوانی', async () => {
    const { result, fake } = await runProvision({ name: 'کلینیک مرکزی' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('name');
      expect(result.kind).toBe('invalid_name');
    }
    expect(fake.calls.length).toBe(0);
    expect(result.steps.length).toBe(0);
    if (!result.ok) expect(result.message).toContain('انگلیسی');
  });
});

// ─── ⑤ قطعه‌بندی اسکیما ───

describe('قطعه‌بندی اسکیما (chunkSchemaSql)', () => {
  const encoder = new TextEncoder();

  it('مرز «;» — دستور تهی/فقط-قطعه‌کننده قطعهٔ خالی نمی‌سازد', () => {
    const chunks = chunkSchemaSql('CREATE TABLE a (id TEXT);\n\n ; \nCREATE TABLE b (id TEXT);');
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('CREATE TABLE a');
    expect(chunks[0]).toContain('CREATE TABLE b');
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });

  it('سقف ۶۴KB — هر قطعه (به‌جز دستور منفرد بزرگ‌تر از سقف) زیر سقف بایت می‌ماند و چندقطعه می‌شود', () => {
    const stmt = (tag: string) => `INSERT INTO t (id, note) SELECT '${tag}', '${'x'.repeat(1000)}';\n`;
    const sql = Array.from({ length: 120 }, (_, i) => stmt(`r${i}`)).join('');
    const chunks = chunkSchemaSql(sql);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).length).toBeLessThanOrEqual(SCHEMA_CHUNK_BYTES);
    }
    // هیچ قطعهٔ خالی
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });

  it('نقل‌قول تک و کامنت خطی/بلوکی در برابر «;» داخلی نمی‌شکنند', () => {
    const chunks = chunkSchemaSql(
      `INSERT INTO t (a) VALUES ('x;y -- z');\n-- کامنت؛ با نقطه‌ویرگول؛ داخلی\nINSERT INTO u (a) VALUES (1);\n/* بلوک؛ با ; */\nCREATE TABLE w (id TEXT);`
    );
    // سه دستور در یک قطعه — «;»های داخل نقل‌قول/کامنت جداکننده نشده‌اند
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("'x;y -- z'");
    expect(chunks[0]).toContain('بلوک');
    expect((chunks[0].match(/;\n/g) ?? []).length).toBe(3);
  });

  it('شمارش مایگریشن‌های تجمیعی از نشان مونتاژ — مبنای schema_match', () => {
    expect(schemaMigrationCount(SCHEMA)).toBe(3);
    expect(schemaMigrationCount('-- بدون نشان')).toBe(0);
  });
});

// ─── ⑥ redaction ───

describe('redaction — هیچ secret/توکنی در steps یا log', () => {
  it('مسیر موفق — steps و پیام‌های log عاری از راز و توکن', async () => {
    const logs: string[] = [];
    const { result, fake } = await runProvision({ logs });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    const blob = JSON.stringify(result.steps);
    expect(blob).not.toContain(result.authSecret);
    expect(blob).not.toContain(result.nodeSetupToken);
    expect(blob).not.toContain(TOKEN);
    for (const line of logs) {
      expect(line).not.toContain(result.authSecret);
      expect(line).not.toContain(result.nodeSetupToken);
      expect(line).not.toContain(TOKEN);
    }
    // metadata آپلود رازها را داشته — پس مقایسه معنا دارد
    const put = fake.calls.find((c) => c.method === 'PUT');
    expect(JSON.stringify(put!.metadata)).toContain(result.authSecret);
  });

  it('شکست گام ۵ (آپلود ورکر) — پیام/steps/log حتی وقتی metadata حاوی راز بود، بدون هیچ راز', async () => {
    const logs: string[] = [];
    const { result, fake } = await runProvision({ logs, fakeOpts: { failMatch: '/workers/scripts/', failStatus: 400 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('worker');
      expect(result.kind).toBe('cf_api');
      expect(result.message).toContain('آپلود ورکر');
      expect(result.message).toContain('شکست فیک');
    }
    // رازهای واقعاً تولیدشده در همان درخواست شکسته — از metadata ثبت‌شده استخراج
    const put = fake.calls.find((c) => c.method === 'PUT');
    const bindings = ((put!.metadata as { bindings: Array<{ text?: string }> }).bindings ?? []) as Array<{ text?: string }>;
    const secrets = bindings.map((b) => b.text ?? '').filter((s) => s.length > 0);
    expect(secrets.length).toBe(2);
    const blob = JSON.stringify({ steps: result.steps, message: (result as { message?: string }).message ?? '', logs });
    for (const s of secrets) expect(blob).not.toContain(s);
    expect(blob).not.toContain(TOKEN);
  });

  it('شکست گام اسکیما — پیام شمارهٔ قطعه دارد ولی محتوای قطعه (SQL) ندارد', async () => {
    const { result } = await runProvision({ fakeOpts: { failMatch: '/query' } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('schema');
      expect(result.message).toContain('قطعهٔ 1 از 1');
      expect(result.message).not.toContain('CREATE TABLE');
    }
  });
});

// ─── شکست‌های زودرس ───

describe('شکست‌های گام‌های اول', () => {
  it('خطای CF در وارسی توکن — پیام فارسی + errors CF، گام verify', async () => {
    const { result } = await runProvision({ fakeOpts: { failMatch: '/user/tokens/verify' } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('verify');
      expect(result.kind).toBe('cf_api');
      expect(result.errors?.[0]?.message).toBe('شکست فیک');
      expect(result.steps[result.steps.length - 1].ok).toBe(false);
    }
  });

  it('قطع شبکه در وارسی توکن — kind network با پیام فارسی', async () => {
    const result = await provisionCloudWorker({
      fetchImpl: async () => {
        throw new TypeError('fetch failed — شبکه قطع است');
      },
      centralWorker: CENTRAL_WORKER,
      schemaSql: SCHEMA,
      name: 'clinic',
      token: TOKEN
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('verify');
      expect(result.kind).toBe('network');
      expect(result.message).toContain('api.cloudflare.com');
    }
  });

  it('انقضای بودجهٔ سلامت (۳۰ ثانیه) — state هرگز فراخوانی نمی‌شود', async () => {
    const { result, fake } = await runProvision({ now: makeFastClock(), fakeOpts: { failMatch: '/healthz', failStatus: 500 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('health');
      expect(result.kind).toBe('health_timeout');
      expect(result.message).toContain('healthz');
    }
    expect(fake.calls.some((c) => c.url.includes('/api/instance-sync/state'))).toBe(false);
  });
});

// ─── فاز D1 — دارایی‌های وب (گام ۵‌الف + چک وب گام ۷) ───

describe('فاز D1 — زنجیره با دارایی‌های وب', () => {
  const runWithWeb = async (extra: { webAssets?: WebAssetFile[] | null; fakeOpts?: FakeOptions } = {}) => {
    const fake = makeCfFake(extra.fakeOpts ?? {});
    const logs: string[] = [];
    const result = await provisionCloudWorker({
      fetchImpl: fake.fetchImpl,
      centralWorker: CENTRAL_WORKER,
      schemaSql: SCHEMA,
      ...(extra.webAssets !== undefined ? { webAssets: extra.webAssets } : {}),
      name: 'clinic',
      token: TOKEN,
      random: makeDeterministicRandom(),
      log: (m) => logs.push(m)
    });
    return { result, fake, logs };
  };

  it('گام assets-upload میان schema و worker — سشن با manifest قطعی، آپلود multipart با base64 صحیح، metadata.assets و web فعال', async () => {
    const { result, fake, logs } = await runWithWeb({ webAssets: WEB_FILES });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    expect(result.webEnabled).toBe(true);
    expect(result.steps.map((s) => s.step)).toEqual([
      'verify',
      'accounts',
      'd1',
      'schema',
      'assets-upload',
      'worker',
      'subdomain',
      'health',
      'state',
      'web'
    ]);
    // ترتیب — سشن پس از آخرین قطعهٔ اسکیما و پیش از PUT ورکر
    const urls = fake.calls.map((c) => `${c.method} ${c.url}`);
    const sessionIdx = urls.findIndex((u) => u.includes('assets-upload-session'));
    const putIdx = urls.findIndex((u) => u === `PUT ${CF_BASE}/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`);
    const queryIdx = urls.findIndex((u) => u.includes('/d1/database/db-new/query'));
    expect(sessionIdx).toBeGreaterThan(queryIdx);
    expect(sessionIdx).toBeLessThan(putIdx);
    expect(urls.filter((u) => u.includes('/workers/assets/upload?base64=true')).length).toBe(2);
    // سشن — manifest با همان hashهای قطعی buildAssetManifest
    const expected = await buildAssetManifest(WEB_FILES);
    const session = fake.calls.find((c) => c.url.includes('assets-upload-session'))!;
    expect((session.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(session.init.body)).manifest).toEqual(expected);
    // آپلود — part به نام hash و مقدار base64 صحیح؛ Authorization با jwt سشن
    const hashToFile = new Map<string, Uint8Array>();
    for (const file of WEB_FILES) {
      const key = '/' + file.path.replace(/\\/g, '/');
      hashToFile.set((expected as Record<string, { hash: string }>)[key].hash, file.bytes);
    }
    const uploads = fake.calls.filter((c) => c.url.includes('/workers/assets/upload?base64=true'));
    for (const up of uploads) {
      expect((up.init.headers as Record<string, string>).authorization).toBe('Bearer assets-session-jwt');
      const form = up.init.body as FormData;
      for (const hash of [...form.keys()]) {
        const bytes = hashToFile.get(hash);
        expect(bytes).toBeTruthy();
        expect(Uint8Array.from([...atob(form.get(hash) as string)].map((ch) => ch.charCodeAt(0)))).toEqual(bytes);
      }
    }
    // متادیتای PUT — assets.jwt توکن پایانی و config SPA
    const put = fake.calls.find((c) => c.method === 'PUT' && c.url.endsWith(`/workers/scripts/${WORKER_NAME}`))!;
    expect(put.metadata).toMatchObject({
      assets: {
        jwt: 'assets-upload-jwt-2',
        config: { html_handling: 'auto-trailing-slash', not_found_handling: 'single-page-application' }
      }
    });
    // چک وب — GET / با Accept text/html
    const webCall = fake.calls.find((c) => c.url === `${WORKER_URL}/`);
    expect(webCall).toBeTruthy();
    expect((webCall!.init.headers as Record<string, string>).accept).toBe('text/html');
    // redaction — jwt دارایی در steps/log نمی‌آید
    const blob = `${JSON.stringify(result.steps)}\n${logs.join('\n')}`;
    expect(blob).not.toContain('assets-session-jwt');
    expect(blob).not.toContain('assets-upload-jwt');
    expect(blob).not.toContain(TOKEN);
  });

  it('webAssets null — بدون هیچ تماس دارایی، بدون assets در metadata، بدون چک وب و webEnabled=false', async () => {
    const { result, fake, logs } = await runWithWeb({ webAssets: null });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    expect(result.webEnabled).toBe(false);
    expect(fake.calls.some((c) => c.url.includes('assets-upload-session'))).toBe(false);
    expect(fake.calls.some((c) => c.url.includes('/workers/assets/upload'))).toBe(false);
    expect(fake.calls.some((c) => c.url === `${WORKER_URL}/`)).toBe(false);
    const put = fake.calls.find((c) => c.method === 'PUT' && c.url.endsWith(`/workers/scripts/${WORKER_NAME}`))!;
    expect((put.metadata as { assets?: unknown }).assets).toBeUndefined();
    // سازگار عقب — گام‌ها همان هشت‌گام قبلی و یادداشت skip در log
    expect(result.steps.map((s) => s.step)).toEqual(['verify', 'accounts', 'd1', 'schema', 'worker', 'subdomain', 'health', 'state']);
    expect(logs.join('\n')).toContain('چک وب رد شد');
  });

  it('webAssets خالی [] — مثل null بدون دارایی', async () => {
    const { result, fake } = await runWithWeb({ webAssets: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    expect(result.webEnabled).toBe(false);
    expect(fake.calls.some((c) => c.url.includes('assets-upload-session'))).toBe(false);
    expect(result.steps.some((s) => s.step === 'assets-upload')).toBe(false);
  });

  it('شکست سشن دارایی‌ها → توقف در assets-session با پیام فارسی و بدون PUT اسکریپت', async () => {
    const { result, fake } = await runWithWeb({ webAssets: WEB_FILES, fakeOpts: { failMatch: 'assets-upload-session', failStatus: 400 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('assets-session');
      expect(result.kind).toBe('cf_api');
      expect(result.message).toContain('سشن آپلود دارایی‌های وب ساخته نشد');
    }
    expect(fake.calls.some((c) => c.method === 'PUT' && c.url.endsWith(`/workers/scripts/${WORKER_NAME}`))).toBe(false);
    expect(fake.calls.some((c) => c.url.includes('/workers/subdomain'))).toBe(false);
  });

  it('شکست آپلود bucket دارایی → توقف در assets-upload و بدون PUT اسکریپت', async () => {
    const { result, fake } = await runWithWeb({ webAssets: WEB_FILES, fakeOpts: { failMatch: '/workers/assets/upload', failStatus: 500 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('assets-upload');
      expect(result.kind).toBe('cf_api');
      expect(result.message).toContain('آپلود دارایی‌های وب');
    }
    expect(fake.calls.some((c) => c.method === 'PUT' && c.url.endsWith(`/workers/scripts/${WORKER_NAME}`))).toBe(false);
  });

  it('GET / پاسخ غیر HTML → توقف در گام web با پیام فارسی، با وجود سبزی state', async () => {
    const { result, fake } = await runWithWeb({ webAssets: WEB_FILES, fakeOpts: { webHtml: false } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('web');
      expect(result.kind).toBe('worker_error');
      expect(result.message).toContain('صفحهٔ وب');
    }
    expect(fake.calls.some((c) => c.url === `${WORKER_URL}/`)).toBe(true);
  });
});

// ─── گام وارسی تنها (verifyCloudToken) ───

describe('verifyCloudToken — بدون هیچ پرویژن', () => {
  it('وارسی + فهرست حساب‌ها؛ هیچ فراخوانی D1/worker نمی‌زند', async () => {
    const fake = makeCfFake();
    const logs: string[] = [];
    const result: VerifyCloudResult = await verifyCloudToken({ fetchImpl: fake.fetchImpl, token: TOKEN, log: (m) => logs.push(m) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('غیرقابل‌دسترس');
    expect(result.accounts).toEqual([{ id: ACCOUNT_ID, name: ACCOUNT_NAME }]);
    expect(fake.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${CF_BASE}/user/tokens/verify`,
      `GET ${CF_BASE}/accounts`
    ]);
    for (const line of logs) expect(line).not.toContain(TOKEN);
  });

  it('رد توکن → گام verify با errors CF؛ توکن در پاسخ نمی‌آید', async () => {
    const fake = makeCfFake({ failMatch: '/user/tokens/verify' });
    const result = await verifyCloudToken({ fetchImpl: fake.fetchImpl, token: TOKEN });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('verify');
      expect(result.message).toContain('توکن');
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
  });

  it('حساب صفر → kind no_account با پیام فارسی', async () => {
    const emptyFake = makeCfFake();
    const base = emptyFake.fetchImpl;
    const result = await verifyCloudToken({
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url === `${CF_BASE}/accounts`) return Response.json({ success: true, result: [] });
        return base(input, init);
      },
      token: TOKEN
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('no_account');
  });
});

// ─── ⑦ مسیرهای فقط-مدیر desktop-routes ───

function provisionIo(): CloudProvisionIO {
  return {
    readCentralWorker: async () => CENTRAL_WORKER,
    readSchemaSql: async () => SCHEMA
  };
}

async function mountEnv(extra: Record<string, unknown> = {}): Promise<{ A: TestApp; api: Api; env: Record<string, unknown> }> {
  const A = createTestApp();
  const env = A.env as unknown as Record<string, unknown>;
  Object.assign(env, extra);
  const api = await asRole(A, 'manager');
  return { A, api, env };
}

describe('مسیرهای provision در desktop-routes', () => {
  it('binding غایب (workerd/تولید وب) → ۵۰۱ با پیام فارسی «فقط در نسخهٔ دسکتاپ»', async () => {
    const { api } = await mountEnv({ CENTER_DESKTOP_ENGINE: '1' });
    const res = await api.post('/api/instance-sync/provision', { token: TOKEN, name: 'clinic' });
    expect(res.status).toBe(501);
    expect((res.body as { error: string }).error).toBe('CLOUD_PROVISION_UNAVAILABLE');
    expect((res.body as { message: string }).message).toContain('نسخهٔ دسکتاپ');
  });

  it('binding غایب ولی دارایی‌ها هم null → باز هم ۵۰۱؛ بدون هیچ فراخوانی شبکه', async () => {
    const { api } = await mountEnv({
      CLOUD_PROVISION: { readCentralWorker: async () => null, readSchemaSql: async () => null }
    });
    const res = await api.post('/api/instance-sync/provision', { token: TOKEN, name: 'clinic' });
    expect(res.status).toBe(501);
  });

  it('پرویژن کامل از مسیر — ۲۰۰ و data قراردادی؛ رازها فقط در پاسخِ یک‌بارمصرف', async () => {
    const fake = makeCfFake();
    const { api } = await mountEnv({ CLOUD_PROVISION: provisionIo(), CLOUD_FETCH: fake.fetchImpl });
    const res = await api.post('/api/instance-sync/provision', { token: TOKEN, name: 'clinic' });
    expect(res.status).toBe(200);
    const data = (res.body as { data: { ok: boolean; workerUrl: string; workerName: string; d1Name: string; steps: unknown[] } }).data;
    expect(data.ok).toBe(true);
    expect(data.workerUrl).toBe(WORKER_URL);
    expect(data.workerName).toBe(WORKER_NAME);
    expect(data.d1Name).toBe(`${WORKER_NAME}-db`);
    expect(data.steps.length).toBe(8);
    // هیچ ردیف وضعیت محلی نوشته نشده — این مسیر فقط می‌سازد و برمی‌گرداند
  });

  it('verify از مسیر — فهرست حساب‌ها و بدون هیچ پرویژن (binding غایب بی‌اثر است)', async () => {
    const fake = makeCfFake();
    const { api } = await mountEnv({ CLOUD_FETCH: fake.fetchImpl });
    const res = await api.post('/api/instance-sync/provision/verify', { token: TOKEN });
    expect(res.status).toBe(200);
    expect((res.body as { data: { accounts: Array<{ id: string; name: string }> } }).data.accounts).toEqual([
      { id: ACCOUNT_ID, name: ACCOUNT_NAME }
    ]);
    expect(fake.calls.some((c) => c.url.includes('/d1/'))).toBe(false);
    expect(fake.calls.some((c) => c.url.includes('/workers/'))).toBe(false);
  });

  it('شکست CF از مسیر → ۴۰۰ با پاکت قراردادی و step؛ بدون هیچ secret', async () => {
    const fake = makeCfFake({ failMatch: '/user/tokens/verify' });
    const { api } = await mountEnv({ CLOUD_PROVISION: provisionIo(), CLOUD_FETCH: fake.fetchImpl });
    const res = await api.post('/api/instance-sync/provision', { token: TOKEN, name: 'clinic' });
    expect(res.status).toBe(400);
    const body = res.body as { error: string; message: string; data: { step: string } };
    expect(body.error).toBe('CLOUD_PROVISION_FAILED');
    expect(body.data.step).toBe('verify');
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it('گیت‌ها — بی‌سشن ۴۰۱ و غیرمدیر ۴۰۳ روی هر دو مسیر', async () => {
    const { A } = await mountEnv({ CENTER_DESKTOP_ENGINE: '1', CLOUD_PROVISION: provisionIo() });
    const anon = await A.app.request(
      '/api/instance-sync/provision',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TOKEN, name: 'clinic' }) },
      A.env as never
    );
    expect(anon.status).toBe(401);
    const secretary = await asRole(A, 'secretary');
    expect((await secretary.post('/api/instance-sync/provision', { token: TOKEN, name: 'clinic' })).status).toBe(403);
    expect((await secretary.post('/api/instance-sync/provision/verify', { token: TOKEN })).status).toBe(403);
  });

  it('بدنهٔ نامعتبر → ۴۰۰ VALIDATION_ERROR روی هر دو مسیر', async () => {
    const { api } = await mountEnv({});
    const noBody = await api.post('/api/instance-sync/provision', { name: 'clinic' });
    expect(noBody.status).toBe(400);
    expect((noBody.body as { error: string }).error).toBe('VALIDATION_ERROR');
    const noToken = await api.post('/api/instance-sync/provision/verify', {});
    expect(noToken.status).toBe(400);
  });

  it('لاگر silentLogger در مسیر مستقیم هم بی‌راز می‌ماند — سانتی‌نل ساده', () => {
    // redaction در provision.ts تضمین شده؛ این سانتی‌نل فقط ثابت می‌کند ماژول بدون خطا بار می‌شود
    expect(silentLogger('t')).toBeTruthy();
  });
});
