/**
 * فاز D1 (B2) — آزمون دارایی‌های وب ورکر ابری (assets.ts — Workers Static Assets Direct Upload)
 *
 * بدون شبکه — api.cloudflare.com با fetchImpl ماک شبیه‌سازی می‌شود و ترتیب/شکل هر فراخوانی ثبت
 * می‌گردد. بندهای قرارداد مأموریت فاز D1 که این‌جا بسته می‌شوند:
 *   ① شکل manifest — hash ۳۲hex قطعی روی بایت نمونه (برش sha256)، مسیر نرمال با اسلش آغازین و
 *     بک‌اسلش→اسلش، بدون قطعهٔ تکراری
 *   ② گارد حجم — تک‌فایل > ۸MB و مجموع > ۲۰MB → خطای فارسی assets-error، پیش از هر تماس CF
 *   ③ جریان آپلود با API فیک — ترتیب سشن → فقط hashهای داخل buckets → توکن پایانی از آخرین
 *     آپلود؛ multipart شامل hashهای درست با base64 صحیح؛ Authorization هر تماس درست
 *   ④ buckets خالی → همان jwt سشن، بدون هیچ آپلود
 *   ⑤ خطای سشن/آپلود — step مشخص با پیام فارسی؛ قطع شبکه هم جدا
 * عین الگوی provision.test.ts (CF API فیک — هیچ secret/jwt در log نمی‌آید).
 */
import { describe, it, expect } from 'vitest';
import { buildAssetManifest, uploadWebAssets } from '../assets';
import type { WebAssetFile } from '../assets';

// ─── دارایی‌های آزمون ───

const CF_BASE = 'https://api.cloudflare.com/client/v4';
const TOKEN = 'cf-token-abcdefgh';
const ACCOUNT_ID = 'acc-0000000000000000000000000001';
const WORKER_NAME = 'markaz-clinic';
const SESSION_JWT = 'assets-session-jwt-1';
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** digest کامل sha256 برای مقایسهٔ مستقل با برش ۳۲hex ماژول */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface RecordedCall {
  url: string;
  method: string;
  init: RequestInit;
}

interface FakeOptions {
  /** buckets سشن — پیش‌فرض همهٔ hashها در یک bucket */
  buckets?: string[][] | null;
  /** شکست فیک سشن آپلود دارایی */
  failSession?: boolean;
  /** شمارهٔ bucket (۱-مبنا) که باید شکست بخورد */
  failUploadAt?: number;
}

function makeCfFake(opts: FakeOptions = {}) {
  const calls: RecordedCall[] = [];
  let uploadSeq = 0;
  const fetchImpl = async (input: string | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, init: init ?? {} });
    if (url.endsWith('/assets-upload-session') && method === 'POST') {
      if (opts.failSession) {
        return Response.json({ success: false, errors: [{ code: 971, message: 'شکست فیک' }] }, { status: 400 });
      }
      let manifest: Record<string, { hash: string }> = {};
      try {
        manifest = (JSON.parse(String(init?.body ?? '{}')) as { manifest?: typeof manifest }).manifest ?? {};
      } catch {
        manifest = {};
      }
      const hashes = Object.values(manifest).map((e) => e.hash);
      const buckets = opts.buckets !== undefined && opts.buckets !== null ? opts.buckets : [hashes];
      return Response.json({ success: true, result: { jwt: SESSION_JWT, buckets } });
    }
    if (url.includes('/workers/assets/upload') && method === 'POST') {
      uploadSeq += 1;
      if (opts.failUploadAt === uploadSeq) {
        return Response.json({ success: false, errors: [{ code: 972, message: 'شکست فیک آپلود' }] }, { status: 500 });
      }
      return Response.json({ success: true, result: { jwt: `assets-upload-jwt-${uploadSeq}` } }, { status: 201 });
    }
    return Response.json({ success: false, errors: [{ code: 9999, message: 'مسیر فیک ناشناخته' }] }, { status: 404 });
  };
  return { calls, fetchImpl };
}

const depsOf = (files: WebAssetFile[] | null | undefined, fake: ReturnType<typeof makeCfFake>) => ({
  fetchImpl: fake.fetchImpl,
  token: TOKEN,
  accountId: ACCOUNT_ID,
  scriptName: WORKER_NAME,
  files
});

function decodedOf(b64: string): Uint8Array {
  return Uint8Array.from([...atob(b64)].map((ch) => ch.charCodeAt(0)));
}

// ─── ① شکل manifest ───

describe('buildAssetManifest — شکل و قطعیت', () => {
  const HELLO = enc('hello');

  it('hash = برش ۳۲hex sha256 بایت‌ها (قطعی) و size = بایت', async () => {
    const manifest = await buildAssetManifest([{ path: 'index.html', bytes: HELLO }]);
    expect(Object.keys(manifest)).toEqual(['/index.html']);
    expect(manifest['/index.html'].hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e'); // sha256('hello')
    expect(manifest['/index.html'].hash).toBe((await sha256Hex(HELLO)).slice(0, 32));
    expect(manifest['/index.html'].size).toBe(HELLO.length);
    for (const entry of Object.values(manifest)) {
      expect(entry.hash).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('مسیر نرمال — اسلش آغازین خودکار و بک‌اسلش → اسلش', async () => {
    const manifest = await buildAssetManifest([
      { path: 'index.html', bytes: HELLO },
      { path: 'assets\\dist\\app.js', bytes: enc('app') },
      { path: '/css/site.css', bytes: enc('css') }
    ]);
    expect(Object.keys(manifest)).toEqual(['/index.html', '/assets/dist/app.js', '/css/site.css']);
  });

  it('مسیر تکراری قطعهٔ جدا نمی‌سازد — آخرین محتوا می‌ماند', async () => {
    const first = enc('aaa');
    const second = enc('bbbb');
    const manifest = await buildAssetManifest([
      { path: 'x.txt', bytes: first },
      { path: '/x.txt', bytes: second }
    ]);
    expect(Object.keys(manifest)).toEqual(['/x.txt']);
    expect(manifest['/x.txt'].size).toBe(second.length);
    expect(manifest['/x.txt'].hash).toBe((await sha256Hex(second)).slice(0, 32));
  });
});

// ─── ② گارد حجم — پیش از هر تماس CF ───

describe('گارد حجم — بدون هیچ تماس با کلادفلر', () => {
  it('تک‌فایل بزرگ‌تر از ۸ مگابایت → step assets-size با پیام فارسی و مسیر فایل', async () => {
    const fake = makeCfFake();
    const out = await uploadWebAssets(
      depsOf([{ path: 'assets/big.bin', bytes: new Uint8Array(8 * 1024 * 1024 + 1) }], fake)
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.step).toBe('assets-size');
      expect(out.kind).toBe('assets_error');
      expect(out.message).toContain('سقف هر فایل 8 مگابایت');
      expect(out.message).toContain('/assets/big.bin');
    }
    expect(fake.calls.length).toBe(0);
  });

  it('مجموع بزرگ‌تر از ۲۰ مگابایت → step assets-size؛ هر فایل زیر سقف تک‌فایل', async () => {
    const fake = makeCfFake();
    const chunk = new Uint8Array(7 * 1024 * 1024); // ۷ مگابایت — زیر سقف تک‌فایل
    const out = await uploadWebAssets(
      depsOf(
        [
          { path: 'a.bin', bytes: chunk },
          { path: 'b.bin', bytes: chunk },
          { path: 'c.bin', bytes: chunk }
        ],
        fake
      )
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.step).toBe('assets-size');
      expect(out.kind).toBe('assets_error');
      expect(out.message).toContain('سقف کل 20 مگابایت');
    }
    expect(fake.calls.length).toBe(0);
  });
});

// ─── ③ جریان آپلود با API فیک ───

describe('uploadWebAssets — جریان سشن → bucketها → توکن پایانی', () => {
  const F1: WebAssetFile = { path: 'index.html', bytes: enc('<!doctype html><html><body>وب</body></html>') };
  const F2: WebAssetFile = { path: 'assets\\app.js', bytes: enc('console.log("app")') };

  it('ترتیب تماس‌ها — سشن با Authorization توکن CF و manifest کامل؛ آپلودها با Bearer jwt سشن', async () => {
    const manifest = await buildAssetManifest([F1, F2]);
    const hashes = Object.values(manifest).map((e) => e.hash);
    const fake = makeCfFake({ buckets: [hashes.slice(0, 1), hashes.slice(1)] });
    const logs: string[] = [];
    const out = await uploadWebAssets({ ...depsOf([F1, F2], fake), log: (m) => logs.push(m) });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('غیرقابل‌دسترس');
    expect(out.jwt).toBe('assets-upload-jwt-2'); // توکن پایانی از پاسخ آخرین آپلود
    expect(out.fileCount).toBe(2);
    expect(out.uploadedCount).toBe(2);
    expect(out.manifest).toEqual(manifest);
    expect(fake.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${CF_BASE}/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/assets-upload-session`,
      `POST ${CF_BASE}/accounts/${ACCOUNT_ID}/workers/assets/upload?base64=true`,
      `POST ${CF_BASE}/accounts/${ACCOUNT_ID}/workers/assets/upload?base64=true`
    ]);
    // سشن — Authorization با توکن CF و بدنهٔ JSON با همان manifest
    const session = fake.calls[0];
    expect((session.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(session.init.body)).manifest).toEqual(manifest);
    // آپلودها — Authorization با jwt سشن؛ هر part به نام hash و مقدار base64 صحیح
    const uploads = fake.calls.filter((c) => c.url.includes('/workers/assets/upload'));
    const hashToFile = new Map<string, Uint8Array>([
      [manifest['/index.html'].hash, F1.bytes],
      [manifest['/assets/app.js'].hash, F2.bytes]
    ]);
    for (let i = 0; i < uploads.length; i += 1) {
      expect((uploads[i].init.headers as Record<string, string>).authorization).toBe(`Bearer ${SESSION_JWT}`);
      const form = uploads[i].init.body as FormData;
      const partHashes = [...form.keys()];
      expect(partHashes.length).toBe(1);
      const bytes = hashToFile.get(partHashes[0]);
      expect(bytes).toBeTruthy();
      expect(decodedOf(form.get(partHashes[0]) as string)).toEqual(bytes);
    }
    // redaction — هیچ jwt/توکنی در log نمی‌آید
    for (const line of logs) {
      expect(line).not.toContain(SESSION_JWT);
      expect(line).not.toContain('assets-upload-jwt');
      expect(line).not.toContain(TOKEN);
    }
  });

  it('فقط hashهای داخل buckets آپلود می‌شوند — hash غایب هرگز part نمی‌شود', async () => {
    const manifest = await buildAssetManifest([F1, F2]);
    const onlyFirst = manifest['/index.html'].hash;
    const fake = makeCfFake({ buckets: [[onlyFirst]] });
    const out = await uploadWebAssets(depsOf([F1, F2], fake));
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('غیرقابل‌دسترس');
    expect(out.uploadedCount).toBe(1);
    expect(out.jwt).toBe('assets-upload-jwt-1');
    const uploads = fake.calls.filter((c) => c.url.includes('/workers/assets/upload'));
    expect(uploads.length).toBe(1);
    expect([...(uploads[0].init.body as FormData).keys()]).toEqual([onlyFirst]);
  });

  it('buckets خالی → همان jwt سشن، بدون هیچ آپلود', async () => {
    const fake = makeCfFake({ buckets: [] });
    const out = await uploadWebAssets(depsOf([F1], fake));
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('غیرقابل‌دسترس');
    expect(out.jwt).toBe(SESSION_JWT);
    expect(out.uploadedCount).toBe(0);
    expect(out.fileCount).toBe(1);
    expect(fake.calls.filter((c) => c.url.includes('/workers/assets/upload')).length).toBe(0);
  });

  it('files خالی/null → سبز بدون دارایی و بدون هیچ تماس', async () => {
    const fake = makeCfFake();
    for (const files of [null, undefined, []] as Array<WebAssetFile[] | null | undefined>) {
      const out = await uploadWebAssets(depsOf(files, fake));
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.jwt).toBe('');
        expect(out.fileCount).toBe(0);
        expect(Object.keys(out.manifest).length).toBe(0);
      }
    }
    expect(fake.calls.length).toBe(0);
  });
});

// ─── ⑤ خطای سشن/آپلود با step مشخص ───

describe('خطاهای آپلود دارایی — step فارسی مشخص', () => {
  const F1: WebAssetFile = { path: 'index.html', bytes: enc('<!doctype html><html></html>') };
  const F2: WebAssetFile = { path: 'app.js', bytes: enc('export default 1') };

  it('شکست سشن (CF ۴۰۰) → step assets-session با پیام فارسی و errors؛ بدون هیچ آپلود', async () => {
    const fake = makeCfFake({ failSession: true });
    const out = await uploadWebAssets(depsOf([F1], fake));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.step).toBe('assets-session');
      expect(out.kind).toBe('cf_api');
      expect(out.message).toContain('سشن آپلود دارایی‌های وب ساخته نشد');
      expect(out.message).toContain('شکست فیک');
      expect(out.errors?.[0]?.code).toBe(971);
    }
    expect(fake.calls.filter((c) => c.url.includes('/workers/assets/upload')).length).toBe(0);
  });

  it('شکست آپلود bucket دوم → step assets-upload با شمارهٔ bucket در پیام فارسی', async () => {
    const manifest = await buildAssetManifest([F1, F2]);
    const hashes = Object.values(manifest).map((e) => e.hash);
    const fake = makeCfFake({ buckets: [hashes.slice(0, 1), hashes.slice(1)], failUploadAt: 2 });
    const out = await uploadWebAssets(depsOf([F1, F2], fake));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.step).toBe('assets-upload');
      expect(out.kind).toBe('cf_api');
      expect(out.message).toContain('bucket 2 از 2');
      expect(out.message).toContain('شکست فیک آپلود');
    }
  });

  it('قطع شبکه در سشن → kind network؛ قطع در آپلود → step assets-upload', async () => {
    const deadFetch = async (): Promise<Response> => {
      throw new TypeError('fetch failed — شبکه قطع است');
    };
    const sessionOut = await uploadWebAssets({ ...depsOf([F1], makeCfFake()), fetchImpl: deadFetch });
    expect(sessionOut.ok).toBe(false);
    if (!sessionOut.ok) {
      expect(sessionOut.step).toBe('assets-session');
      expect(sessionOut.kind).toBe('network');
      expect(sessionOut.message).toContain('api.cloudflare.com');
    }
    const manifest = await buildAssetManifest([F1, F2]);
    const hashes = Object.values(manifest).map((e) => e.hash);
    let seenUpload = false;
    const halfDead = async (input: string | RequestInfo, init?: RequestInit): Promise<Response> => {
      if (String(input).includes('/workers/assets/upload')) {
        seenUpload = true;
        throw new TypeError('fetch failed');
      }
      return makeCfFake({ buckets: [hashes.slice(0, 1), hashes.slice(1)] }).fetchImpl(input, init);
    };
    const uploadOut = await uploadWebAssets({ ...depsOf([F1, F2], makeCfFake()), fetchImpl: halfDead });
    expect(seenUpload).toBe(true);
    expect(uploadOut.ok).toBe(false);
    if (!uploadOut.ok) {
      expect(uploadOut.step).toBe('assets-upload');
      expect(uploadOut.kind).toBe('network');
      expect(uploadOut.message).toContain('bucket 1 از 2');
    }
  });
});
