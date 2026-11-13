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
