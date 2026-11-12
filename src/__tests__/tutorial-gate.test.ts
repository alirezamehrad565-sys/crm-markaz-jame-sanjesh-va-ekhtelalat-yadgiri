/**
 * rust-f3 — گات فلگ دوکاناله + سیم‌کشی شل + چرخهٔ کامل شروع/ردشدن/تکرار
 *
 * قید طلایی: در وب (فلگ خاموش) حتی با کانال روشن، maybeStartTutorial باید بدون
 * هیچ اثر جانبی (نه DOM، نه navigate، نه نوشتن انبار) برگردد.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TUTORIAL_FEATURE, tutorialFlagEnabled } from '../tutorial/flags.js';
import { maybeStartTutorial, setTutorialDepsForTests } from '../tutorial/run.js';
import { TUTORIAL_STATE_KEY, loadTutorialState, setTutorialStore } from '../tutorial/state.js';
import { FakeDocument, FakeStore, fakeNavItem, flushMicrotasks } from './tutorial-fakes.js';

const APP_JS = readFileSync(
  fileURLToPath(new URL('../../public/assets/js/app.js', import.meta.url)),
  'utf8'
);
const SETTINGS_JS = readFileSync(
  fileURLToPath(new URL('../../public/assets/js/views/settings.js', import.meta.url)),
  'utf8'
);

const SHELL = globalThis as { __DESKTOP_SHELL__?: boolean };

beforeEach(() => {
  TUTORIAL_FEATURE.enabled = false;
  SHELL.__DESKTOP_SHELL__ = undefined;
  setTutorialStore(new FakeStore());
  setTutorialDepsForTests(null);
});

afterEach(() => {
  TUTORIAL_FEATURE.enabled = false;
  SHELL.__DESKTOP_SHELL__ = undefined;
  delete (globalThis as Record<string, unknown>)['__DESKTOP_FEATURES__'];
  setTutorialStore(null);
  setTutorialDepsForTests(null);
});

describe('tutorial-gate — دفاع دوکاناله', () => {
  it('پیش‌فرض: فلگ استاتیک خاموش است (رفتار تولید وب بایت‌به‌بایت ثابت)', () => {
    expect(TUTORIAL_FEATURE.enabled).toBe(false);
    expect(tutorialFlagEnabled()).toBe(false);
  });

  it('منفی (وب): حتی با کانال روشن، فلگ خاموش = بدون هیچ اثر جانبی', async () => {
    SHELL.__DESKTOP_SHELL__ = true; // کانال روشن، فلگ خاموش
    const doc = new FakeDocument([fakeNavItem('#/dashboard')]);
    const store = new FakeStore();
    const navTargets: string[] = [];
    const result = await maybeStartTutorial({ role: 'manager' }, {
      deps: {
        doc,
        store,
        waitForView: async () => {},
        navigate: (h) => navTargets.push(h)
      }
    });
    expect(result).toBe('flag_off');
    expect(navTargets).toEqual([]);          // نه تغییر مسیر
    expect(doc.body.children).toHaveLength(0); // نه DOM
    expect(store.writes).toHaveLength(0);      // نه انبار
  });

  it('مثبت (rust-f7): فلگ استاتیک «یا» کانال ویژگی پوسته گات را باز می‌کند', () => {
    TUTORIAL_FEATURE.enabled = true;
    expect(tutorialFlagEnabled()).toBe(true); // فلگ استاتیک — مسیر بیلد اختصاصی میز
    TUTORIAL_FEATURE.enabled = false;
    SHELL.__DESKTOP_SHELL__ = true;
    expect(tutorialFlagEnabled()).toBe(false); // فقط کانال شل، بدون ویژگی صریح
    (globalThis as Record<string, unknown>)['__DESKTOP_FEATURES__'] = { tutorial: true, setup: true };
    expect(tutorialFlagEnabled()).toBe(true); // کانال ویژگی پوسته (تزریق lib.rs پیش از ناوبری)
    TUTORIAL_FEATURE.enabled = true;
    expect(tutorialFlagEnabled()).toBe(true); // هر دو
  });
});

describe('tutorial-gate — سیم‌کشی شل (چانک تور در وب fetch نمی‌شود)', () => {
  it('هوک app.js: داخل loadCurrentUser().then، با گارد __DESKTOP_SHELL__ و dynamic import تور', () => {
    expect(APP_JS).toContain('loadCurrentUser().then((ok) => {');
    expect(APP_JS).toContain('/* __TUTORIAL_HOOK__ */');
    expect(APP_JS).toContain('globalThis.__DESKTOP_SHELL__ === true');
    expect(APP_JS).toContain("import('../../../src/tutorial/index.ts')");
    expect(APP_JS).toContain('maybeStartTutorial');
  });

  it('هوک تنظیمات: انتهای renderSettings، همان گارد + tutorialRerunSection', () => {
    expect(SETTINGS_JS).toContain('globalThis.__DESKTOP_SHELL__ === true');
    expect(SETTINGS_JS).toContain("import('../../../src/tutorial/index.ts')");
    expect(SETTINGS_JS).toContain('tutorialRerunSection');
  });

  it('چرخهٔ کامل: شروع → گام بعد → رد کردن → اجرای دوبارهٔ اجباری از تنظیمات', async () => {
    TUTORIAL_FEATURE.enabled = true;
    SHELL.__DESKTOP_SHELL__ = true;
    const doc = new FakeDocument([
      fakeNavItem('#/dashboard'),
      fakeNavItem('#/appointments'),
      fakeNavItem('#/screening'),
      fakeNavItem('#/reports'),
      fakeNavItem('#/settings')
    ]);
    const store = new FakeStore();
    const navTargets: string[] = [];
    const result = await maybeStartTutorial({ role: 'manager' }, {
      deps: { doc, store, waitForView: async () => {}, navigate: (h) => navTargets.push(h) }
    });
    expect(result).toBe('started');
    expect(loadTutorialState()).toMatchObject({ status: 'active', stepIndex: 0, role: 'manager' });
    expect(navTargets).toEqual(['#/dashboard']);
    expect(doc.body.findByClass('tutorial-bubble')).not.toBeNull();

    // نقش ناشناخته تور نمی‌بیند
    const sup = await maybeStartTutorial({ role: 'supervisor' }, { deps: { doc, store, waitForView: async () => {} } });
    expect(sup).toBe('unsupported_role');

    // گام بعد از حباب (بعدی → گام ۲)
    const bubble = doc.body.findByClass('tutorial-bubble');
    const nextBtn = bubble!.buttons().find((b) => b.textContent === 'بعدی');
    nextBtn!.click();
    await flushMicrotasks();
    expect(loadTutorialState().stepIndex).toBe(1);
    expect(navTargets).toEqual(['#/dashboard', '#/appointments']);

    // رد کردن از دکمه → skipped
    const bubble2 = doc.body.findByClass('tutorial-bubble');
    bubble2!.buttons().find((b) => b.textContent === 'رد کردن')!.click();
    await flushMicrotasks();
    expect(loadTutorialState().status).toBe('skipped');
    expect(doc.body.findByClass('tutorial-bubble')).toBeNull();

    // تور تمام‌شده دوباره خودکار بالا نمی‌آید
    const again = await maybeStartTutorial({ role: 'manager' }, { deps: { doc, store, waitForView: async () => {} } });
    expect(again).toBe('already_done');

    // «اجرای دوبارهٔ راهنمای شروع» = force: reset و شروع از صفر
    const rerun = await maybeStartTutorial({ role: 'manager' }, {
      deps: { doc, store, waitForView: async () => {}, navigate: (h) => navTargets.push(h) },
      force: true
    });
    expect(rerun).toBe('rerun');
    expect(loadTutorialState()).toMatchObject({ status: 'active', stepIndex: 0, role: 'manager' });
    expect(store.getItem(TUTORIAL_STATE_KEY)).toContain('active');
  });
});
