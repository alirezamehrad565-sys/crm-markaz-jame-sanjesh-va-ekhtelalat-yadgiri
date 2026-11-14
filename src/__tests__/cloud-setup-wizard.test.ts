/**
 * rust-f7 — آزمون منطق ویزار راه‌اندازی نخست (فِیک DOM/انبار/مخزن امن — بدون مرورگر)
 */
import { describe, expect, it } from 'vitest';
import {
  CLOUD_CONN_KEY,
  SECRET_CF_TOKEN,
  SECRET_NODE_KEY,
  emptyCloudRecord,
  loadCloudRecord,
  saveCloudRecord,
  type CloudStore,
  type SecureStore
} from '../cloud-setup/state.js';
import {
  buildWizardShell,
  FINISH_LABEL,
  type CsElement,
  type WizardRefs
} from '../cloud-setup/dom-build.js';
import { openSetupWizard } from '../cloud-setup/wizard.js';
import { CF_TOKEN_GUIDE_URL, mapCloudflareTokenError } from '../cloud-setup/token-errors.js';

/* ─── فِیک DOM سازگار با قرارداد CsElement ─── */

interface FakeEl extends CsElement {
  readonly children: FakeEl[];
  clickListeners: Array<() => void>;
  parent: FakeEl | null;
}

function fakeEl(tag: string): FakeEl {
  const children: FakeEl[] = [];
  const el = {
    tag,
    className: '',
    textContent: '',
    title: '',
    type: '',
    value: '',
    placeholder: '',
    disabled: false,
    style: { display: '' } as Record<string, string>,
    clickListeners: [] as Array<() => void>,
    parent: null as FakeEl | null,
    get children() {
      return children;
    },
    get firstChild() {
      return children[0] ?? null;
    },
    appendChild(child: FakeEl) {
      if (child.parent) {
        const siblings = child.parent.children;
        const idx = siblings.indexOf(child);
        if (idx >= 0) siblings.splice(idx, 1);
      }
      children.push(child);
      child.parent = el;
      return child;
    },
    addEventListener(type: string, listener: () => void) {
      if (type === 'click') el.clickListeners.push(listener);
    },
    remove() {
      if (el.parent) {
        const siblings = el.parent.children;
        const idx = siblings.indexOf(el);
        if (idx >= 0) siblings.splice(idx, 1);
        el.parent = null;
      }
    },
    focus() {}
  } as unknown as FakeEl;
  return el;
}

function fakeDoc(): { doc: Parameters<typeof buildWizardShell>[0]; body: FakeEl } {
  const body = fakeEl('body');
  const doc = {
    createElement: (tag: string) => fakeEl(tag),
    body: body as unknown as CsElement
  } as Parameters<typeof buildWizardShell>[0];
  return { doc, body };
}

/* ─── فِیک انبار و مخزن امن ─── */

function fakeStore(): CloudStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}

function fakeSecure(fail = false): SecureStore & { calls: string[]; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    calls: [],
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      if (fail) throw new Error('secure store down');
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    }
  };
}

const okFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

function build(refs: WizardRefs): FakeEl {
  return refs.root as unknown as FakeEl;
}

describe('ویزار راه‌اندازی نخست', () => {
  it('باز شدن روی گام خوش‌آمد؛ قبلی پنهان، بعدی فعال', () => {
    const { doc, body } = fakeDoc();
    const handle = openSetupWizard({
      doc,
      store: fakeStore(),
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    expect(handle.step()).toBe(0);
    expect(body.children).toHaveLength(1);
    expect(handle.refs.nextBtn.textContent).toBe('بعدی');
    expect(handle.refs.backBtn.style.display).toBe('none');
    handle.close();
    expect(body.children).toHaveLength(0);
  });

  it('ناوبری شش گام + برچسب پایان در گام آخر', () => {
    const { doc } = fakeDoc();
    const handle = openSetupWizard({
      doc,
      store: fakeStore(),
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    handle.next();
    expect(handle.step()).toBe(1);
    handle.next();
    handle.next();
    handle.next();
    handle.next();
    expect(handle.step()).toBe(5);
    expect(handle.refs.nextBtn.textContent).toBe(FINISH_LABEL);
    expect(handle.refs.skipBtn.style.display).toBe('none');
    handle.back();
    expect(handle.step()).toBe(4);
  });

  it('لندینگ: سه مسیر با goTo — گام ساخت سرور و کارکنان قابل رسیدن‌اند', () => {
    const { doc } = fakeDoc();
    const handle = openSetupWizard({
      doc,
      store: fakeStore(),
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    handle.goTo(3); // مسیر «ساخت سرور مرکزی با کلادفلر»
    expect(handle.step()).toBe(3);
    handle.goTo(4); // مسیر «تعریف کارکنان»
    expect(handle.step()).toBe(4);
    handle.goTo(0);
    expect(handle.refs.backBtn.style.display).toBe('none');
  });

  it('ساخت سرور مرکزی بیرون پوسته: نرم رد می‌شود (بدون throw)', async () => {
    const { doc } = fakeDoc();
    const handle = openSetupWizard({
      doc,
      store: fakeStore(),
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    const r = await handle.deployCentral('tok');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('نسخهٔ میز');
    const r2 = await handle.adminSetup('admin', 'secret1', 'مدیر');
    expect(r2.ok).toBe(false);
  });

  it('آزمون اتصال موفق: پیام در ناحیهٔ وضعیت + بدون ذخیره', async () => {
    const { doc } = fakeDoc();
    const store = fakeStore();
    const handle = openSetupWizard({
      doc,
      store,
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    handle.refs.inputs.worker_url.value = 'https://w.example/';
    const r = await handle.testNode('https://w.example/', 'DESKTOP:a', 'nk_live_x');
    expect(r.ok).toBe(true);
    expect(handle.refs.statusArea.textContent.startsWith('✓')).toBe(true);
    expect(store.map.has(CLOUD_CONN_KEY)).toBe(false); // آزمون، ذخیره نمی‌کند
  });

  it('پایان: رازها در مخزن امن + فراداده در انبار + onFinished(false)', async () => {
    const { doc, body } = fakeDoc();
    const store = fakeStore();
    const secure = fakeSecure();
    let finished: boolean | null = null;
    const handle = openSetupWizard({
      doc,
      store,
      secure,
      insecure: false,
      fetchImpl: okFetch,
      onFinished: (s) => {
        finished = s;
      },
      now: () => '2026-11-12T00:00:00Z'
    });
    handle.refs.inputs.worker_url.value = 'https://w.example';
    handle.refs.inputs.node_code.value = 'DESKTOP:abc';
    handle.refs.inputs.node_key.value = ' nk_live_secret ';
    handle.refs.inputs.cf_token.value = 'cf_tok';
    await handle.finish();
    expect(secure.data.get(SECRET_NODE_KEY)).toBe('nk_live_secret'); // trim شده
    expect(secure.data.get(SECRET_CF_TOKEN)).toBe('cf_tok');
    const rec = loadCloudRecord(store);
    expect(rec.setup_done).toBe(true);
    expect(rec.worker_url).toBe('https://w.example');
    expect(rec.node_code).toBe('DESKTOP:abc');
    expect(rec.node_key_set).toBe(true);
    expect(rec.cf_token_set).toBe(true);
    expect(rec.insecure_fallback).toBe(false);
    expect(finished).toBe(false);
    expect(body.children).toHaveLength(0); // modal بسته شد
  });

  it('مخزن امن شکست خورد: ویزار نمی‌شکند، راز ست نمی‌شود، setup_done می‌ماند', async () => {
    const { doc } = fakeDoc();
    const store = fakeStore();
    const secure = fakeSecure(true);
    const handle = openSetupWizard({
      doc,
      store,
      secure,
      insecure: true,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    handle.refs.inputs.node_key.value = 'nk_x';
    await handle.finish();
    const rec = loadCloudRecord(store);
    expect(rec.setup_done).toBe(true);
    expect(rec.node_key_set).toBe(false);
    expect(rec.insecure_fallback).toBe(true);
  });

  it('رد کردن: setup_done بدون هیچ رازی + onFinished(true)', () => {
    const { doc } = fakeDoc();
    const store = fakeStore();
    const secure = fakeSecure();
    let finished: boolean | null = null;
    const handle = openSetupWizard({
      doc,
      store,
      secure,
      insecure: false,
      fetchImpl: okFetch,
      onFinished: (s) => {
        finished = s;
      }
    });
    handle.skip();
    expect(finished).toBe(true);
    expect(loadCloudRecord(store).setup_done).toBe(true);
    expect(secure.data.size).toBe(0);
  });

  it('پیش‌پر از رکورد موجود (ویرایش دوباره از تنظیمات)', () => {
    const { doc } = fakeDoc();
    const store = fakeStore();
    saveCloudRecord(
      { ...emptyCloudRecord(), worker_url: 'https://old.example', node_code: 'DESKTOP:old' },
      store
    );
    const handle = openSetupWizard({
      doc,
      store,
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    expect(handle.refs.inputs.worker_url.value).toBe('https://old.example');
    expect(handle.refs.inputs.node_code.value).toBe('DESKTOP:old');
  });
});

/* ─── موج ۲ — ۲-۳ تلاش دوبارهٔ استقرار و ۲-۴ نگاشت خطای توکن ─────────────────────────
   پشتوانهٔ «اجرای دوباره بی‌خطر است»: استقرار per-file idempotent از ۱.۲۶.۲ (جدول پیگیری
   __deploy_applied سمت پوسته). فرمان پوسته با پل __TAURI_INTERNALS__.invoke شبیه‌سازی می‌شود. */

/** جست‌وجوی عمقی متن در فِیک DOM — برای یافتن بلوک تلاش دوباره در اسلاید استقرار */
function findText(node: { textContent: string; children: readonly { textContent: string; children: readonly unknown[] }[] }, needle: string): boolean {
  if (node.textContent.includes(needle)) return true;
  return node.children.some((c) => findText(c as never, needle));
}

/** پل Tauri شبیه‌سازی‌شده — نتیجهٔ n-ام فراخوانی cloudflare_deploy را برمی‌گرداند */
function stubTauriDeploy(results: Array<Record<string, unknown>>): { calls: () => number; restore: () => void } {
  const g = globalThis as { __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
  const previous = g.__TAURI_INTERNALS__;
  let calls = 0;
  g.__TAURI_INTERNALS__ = {
    invoke: async () => {
      const next = results[Math.min(calls, results.length - 1)];
      calls += 1;
      return next;
    }
  };
  return { calls: () => calls, restore: () => { if (previous) g.__TAURI_INTERNALS__ = previous; else delete g.__TAURI_INTERNALS__; } };
}

describe('موج ۲ (۲-۳) — دکمهٔ «تلاش دوباره» استقرار مرکز', () => {
  it('شکست قطعهٔ i/n: بلوک تلاش دوباره با متن «اجرای دوباره بی‌خطر است» نمایان می‌شود', async () => {
    const { doc } = fakeDoc();
    const stub = stubTauriDeploy([
      { ok: false, message: 'اعمال «0030_quota.sql» در قطعهٔ ۵/۱۲ شکست خورد: قطع شبکه' }
    ]);
    try {
      const handle = openSetupWizard({
        doc,
        store: fakeStore(),
        secure: fakeSecure(),
        insecure: false,
        fetchImpl: okFetch,
        onFinished: () => {}
      });
      expect(handle.deployRetryVisible()).toBe(false);
      const r = await handle.retryDeploy('tok');
      expect(r.ok).toBe(false);
      expect(r.message).toContain('قطعهٔ ۵/۱۲');
      expect(handle.deployRetryVisible()).toBe(true);
      // اسلاید استقرار حاوی دکمهٔ تلاش دوباره + متن اطمینان + دکمهٔ لینک توکن کلادفلر است
      handle.goTo(3);
      expect(findText(handle.refs.stepBody as never, 'تلاش دوباره')).toBe(true);
      expect(findText(handle.refs.stepBody as never, 'اجرای دوباره بی‌خطر است')).toBe(true);
      expect(findText(handle.refs.stepBody as never, 'صفحهٔ توکن‌های کلادفلر')).toBe(true);
    } finally {
      stub.restore();
    }
  });

  it('تلاش دوباره با موفقیت: بلوک پنهان، پیام ✓، آدرس ورکر پر می‌شود', async () => {
    const { doc } = fakeDoc();
    const stub = stubTauriDeploy([
      { ok: false, message: 'اعمال «0030_quota.sql» در قطعهٔ ۵/۱۲ شکست خورد: قطع شبکه' },
      { ok: true, worker_url: 'https://center.example.workers.dev', admin_setup_token: 'setup-tok' }
    ]);
    try {
      const handle = openSetupWizard({
        doc,
        store: fakeStore(),
        secure: fakeSecure(),
        insecure: false,
        fetchImpl: okFetch,
        onFinished: () => {}
      });
      const first = await handle.retryDeploy('tok');
      expect(first.ok).toBe(false);
      expect(handle.deployRetryVisible()).toBe(true);
      const second = await handle.retryDeploy('tok');
      expect(second.ok).toBe(true);
      expect(handle.deployRetryVisible()).toBe(false);
      expect(handle.refs.statusArea.textContent.startsWith('✓')).toBe(true);
      expect(handle.refs.inputs.worker_url.value).toBe('https://center.example.workers.dev');
    } finally {
      stub.restore();
    }
  });

  it('بیرون پوسته: شکست نرم، بلوک تلاش دوباره نمایان (دکمه دوباره نرم رد می‌دهد)', async () => {
    const { doc } = fakeDoc();
    const handle = openSetupWizard({
      doc,
      store: fakeStore(),
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: okFetch,
      onFinished: () => {}
    });
    const r = await handle.retryDeploy('tok');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('نسخهٔ میز');
    expect(handle.deployRetryVisible()).toBe(true);
  });
});

describe('موج ۲ (۲-۴) — نگاشت خطای توکن کلادفلر', () => {
  it('جدول نگاشت: ۴۰۱ → توکن نشناخته، ۴۰۳ → محدودهٔ ناقص، توکن نامعتبر، غیرخطای توکن → null', () => {
    expect(mapCloudflareTokenError({ status: 401, message: '' })?.kind).toBe('unauthorized');
    expect(mapCloudflareTokenError({ message: 'فهرست حساب‌ها نگرفته شد: HTTP 401' })?.kind).toBe('unauthorized');
    expect(mapCloudflareTokenError({ status: 403, message: '' })?.kind).toBe('insufficient_scope');
    expect(mapCloudflareTokenError({ message: 'آپلود ورکر رد شد (HTTP 403): forbidden' })?.kind).toBe('insufficient_scope');
    expect(mapCloudflareTokenError({ outcome: 'invalid_token', message: 'توکن معتبر نیست: Invalid or expired token' })?.kind).toBe('invalid_token');
    // عدد 4010 نه 401 است — الگوی کد HTTP وسط عدد بزرگ‌تر نگاشت نمی‌گیرد
    expect(mapCloudflareTokenError({ message: 'خطای 4010 نامشخص' })).toBeNull();
    // قطعی شبکه — توکن نیست، نگاشت توکن گمراه‌کننده است
    expect(mapCloudflareTokenError({ message: 'دسترسی به api.cloudflare.com برقرار نشد — اینترنت را بررسی کنید.' })).toBeNull();
    expect(mapCloudflareTokenError({})).toBeNull();
  });

  it('راهنمای نگاشت: لینک مستقیم صفحهٔ توکن‌ها + نام صریح محدوده‌های لازم', () => {
    const g = mapCloudflareTokenError({ status: 403, message: '' });
    expect(g).not.toBeNull();
    expect(g?.url).toBe(CF_TOKEN_GUIDE_URL);
    expect(g?.text).toContain(CF_TOKEN_GUIDE_URL);
    for (const scope of ['Workers Scripts:Edit', 'D1:Edit', 'Account Settings:Read']) {
      expect(g?.scopes).toContain(scope);
      expect(g?.text).toContain(scope);
    }
    expect(g?.text).toContain('توکن تازه');
  });

  it('ویزار: آزمون توکن ۴۰۱ → پیام حاوی لینک و محدوده‌ها', async () => {
    const { doc } = fakeDoc();
    const fail401 = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false, errors: [{ message: 'Invalid or expired token' }] })
    });
    const handle = openSetupWizard({
      doc,
      store: fakeStore(),
      secure: fakeSecure(),
      insecure: false,
      fetchImpl: fail401 as never,
      onFinished: () => {}
    });
    const r = await handle.testToken('tok');
    expect(r.ok).toBe(false);
    expect(handle.refs.statusArea.textContent).toContain('dash.cloudflare.com/profile/api-tokens');
    expect(handle.refs.statusArea.textContent).toContain('Workers Scripts:Edit');
    expect(handle.refs.statusArea.textContent).toContain('D1:Edit');
  });

  it('ویزار: شکست استقرار با ۴۰۳ → نگاشت در پیام + بلوک تلاش دوباره نمایان', async () => {
    const { doc } = fakeDoc();
    const stub = stubTauriDeploy([
      { ok: false, message: 'فهرست حساب‌ها نگرفته شد: HTTP 403' }
    ]);
    try {
      const handle = openSetupWizard({
        doc,
        store: fakeStore(),
        secure: fakeSecure(),
        insecure: false,
        fetchImpl: okFetch,
        onFinished: () => {}
      });
      const r = await handle.retryDeploy('tok');
      expect(r.ok).toBe(false);
      expect(handle.deployRetryVisible()).toBe(true);
      expect(handle.refs.statusArea.textContent).toContain('۴۰۳');
      expect(handle.refs.statusArea.textContent).toContain('dash.cloudflare.com/profile/api-tokens');
      expect(handle.refs.statusArea.textContent).toContain('Account Settings:Read');
    } finally {
      stub.restore();
    }
  });
});
