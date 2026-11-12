/**
 * rust-f7 — گات فعال‌سازی و سیم‌کشی شل (وب بایت‌به‌بایت ثابت می‌ماند)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  desktopShellChannel,
  setupFlagEnabled,
  shellFeatureEnabled
} from '../cloud-setup/flags.js';
import { tutorialFlagEnabled } from '../tutorial/flags.js';
import {
  emptyCloudRecord,
  localStorageStore,
  saveCloudRecord,
  setCloudStore
} from '../cloud-setup/state.js';
import {
  cloudSetupSection,
  maybeRunSetup,
  setCloudSetupDepsForTests
} from '../cloud-setup/run.js';
import type { CsDocument, CsElement } from '../cloud-setup/dom-build.js';

const APP_JS = readFileSync(join(process.cwd(), 'public/assets/js/app.js'), 'utf8');
const SETTINGS_JS = readFileSync(join(process.cwd(), 'public/assets/js/views/settings.js'), 'utf8');

const ROOT = globalThis as Record<string, unknown>;

afterEach(() => {
  delete ROOT['__DESKTOP_SHELL__'];
  delete ROOT['__DESKTOP_FEATURES__'];
  setCloudSetupDepsForTests(null);
  setCloudStore(null);
});

describe('گات دفاع دوکاناله', () => {
  it('پیش‌فرض وب: هیچ کانالی روشن نیست', () => {
    expect(desktopShellChannel()).toBe(false);
    expect(shellFeatureEnabled('setup')).toBe(false);
    expect(setupFlagEnabled()).toBe(false);
    expect(tutorialFlagEnabled()).toBe(false);
  });

  it('ویژگی پوسته بدون کانال شل = بی‌اثر (در وب غیرممکن است)', () => {
    ROOT['__DESKTOP_FEATURES__'] = { setup: true, tutorial: true };
    expect(setupFlagEnabled()).toBe(false);
    expect(tutorialFlagEnabled()).toBe(false);
  });

  it('شل بدون ویژگی صریح = بی‌اثر', () => {
    ROOT['__DESKTOP_SHELL__'] = true;
    expect(setupFlagEnabled()).toBe(false);
    expect(tutorialFlagEnabled()).toBe(false);
  });

  it('شل + ویژگی صریح (تزریق lib.rs) = فعال؛ هر دو ویژگی مستقل‌اند', () => {
    ROOT['__DESKTOP_SHELL__'] = true;
    ROOT['__DESKTOP_FEATURES__'] = { setup: true };
    expect(setupFlagEnabled()).toBe(true);
    expect(tutorialFlagEnabled()).toBe(false); // تور کلید خودش را دارد
    ROOT['__DESKTOP_FEATURES__'] = { setup: true, tutorial: true };
    expect(tutorialFlagEnabled()).toBe(true);
  });
});

describe('maybeRunSetup — گیت وب ثابت + مسیر میز', () => {
  it('در وب: false و بدون هیچ اثر جانبی', async () => {
    const result = await maybeRunSetup({ role: 'manager' });
    expect(result).toBe(false);
  });

  it('در میز با ویزار تمام‌نشده: true و modal به سند وصل می‌شود', async () => {
    ROOT['__DESKTOP_SHELL__'] = true;
    ROOT['__DESKTOP_FEATURES__'] = { setup: true, tutorial: true };
    const children: unknown[] = [];
    const body = {
      appendChild: (c: unknown) => {
        children.push(c);
        return c;
      },
      firstChild: null,
      remove: () => {}
    } as unknown as CsElement;
    setCloudSetupDepsForTests({
      doc: {
        createElement: () => minimalEl() as unknown as CsElement,
        body
      } as unknown as CsDocument,
      store: localStorageStore,
      secure: { get: async () => null, set: async () => {}, delete: async () => {} },
      fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({}) })) as never,
      onFinished: () => {}
    });
    const result = await maybeRunSetup({ role: 'manager' });
    expect(result).toBe(true);
    expect(children).toHaveLength(1);
  });

  it('در میز با ویزار تمام‌شده: false (app.js مستقیم توتوریال را می‌اندازد)', async () => {
    ROOT['__DESKTOP_SHELL__'] = true;
    ROOT['__DESKTOP_FEATURES__'] = { setup: true, tutorial: true };
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k)
    };
    saveCloudRecord(emptyCloudRecord(), store);
    const raw = JSON.parse(mem.get('cloud_conn_v1') ?? '{}');
    raw.setup_done = true;
    mem.set('cloud_conn_v1', JSON.stringify(raw));
    setCloudSetupDepsForTests({
      store: store as never,
      secure: { get: async () => null, set: async () => {}, delete: async () => {} }
    });
    const result = await maybeRunSetup({ role: 'manager' });
    expect(result).toBe(false);
  });
});

describe('cloudSetupSection — بخش تنظیمات', () => {
  it('در وب نال است (هیچ DOMی ساخته نمی‌شود)', () => {
    expect(cloudSetupSection(null)).toBeNull();
  });
});

describe('سیم‌کشی شل', () => {
  it('هوک app.js: ویزار پیش از توتوریال، توالی با maybeRunSetup', () => {
    expect(APP_JS).toContain('/* __CLOUD_SETUP_HOOK__ */');
    expect(APP_JS).toContain("import('../../../src/cloud-setup/index.ts')");
    expect(APP_JS).toContain('maybeRunSetup');
    expect(APP_JS.indexOf('/* __CLOUD_SETUP_HOOK__ */')).toBeLessThan(
      APP_JS.indexOf('/* __TUTORIAL_HOOK__ */')
    );
    expect(APP_JS).toContain('if (setupRan !== true)');
  });

  it('هوک تنظیمات: بخش اتصال ابر با همان گارد شل', () => {
    expect(SETTINGS_JS).toContain("import('../../../src/cloud-setup/index.ts')");
    expect(SETTINGS_JS).toContain('cloudSetupSection');
  });
});

/* کمک‌ساز حداقلی برای ساخت عنصر در آزمون maybeRunSetup */
function minimalEl(): Record<string, unknown> {
  const children: unknown[] = [];
  const el = {
    className: '',
    textContent: '',
    title: '',
    type: '',
    value: '',
    placeholder: '',
    disabled: false,
    style: { display: '' },
    firstChild: null,
    children,
    appendChild: (c: unknown) => {
      children.push(c);
      return c;
    },
    addEventListener: () => {},
    remove: () => {},
    focus: () => {}
  };
  return el;
}
