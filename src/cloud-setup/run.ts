/**
 * rust-f7 — نقطه‌های ورود ماژول اتصال ابر (ویزار نخست + بخش تنظیمات)
 *
 * maybeRunSetup: از app.js پس از ورود — اگر پوستهٔ دسکتاپ، ویزار تمام‌نشده و
 * گات فعال: ویزار باز می‌شود (true) و در پایانِ «پایان» توتوریال راه می‌افتد.
 * اگر ویزار رد شده/تمام شده → false و app.js مستقیم توتوریال را می‌اندازد.
 * cloudSetupSection: بخش «اتصال ابر» در تنظیمات — وضعیت/آزمون دوباره/ویرایش/پاک‌سازی.
 */

import { setupFlagEnabled } from './flags.js';
import {
  SECRET_CF_TOKEN,
  SECRET_NODE_KEY,
  loadCloudRecord,
  readSecret,
  resetCloudRecord,
  resolveSecureStore,
  saveCloudRecord,
  stampVerify,
  localStorageStore,
  type CloudStore,
  type SecureStore
} from './state.js';
import {
  buildCloudSection,
  csButton,
  csEl,
  defaultCloudDocument,
  type CsDocument,
  type CsElement
} from './dom-build.js';
import { openSetupWizard } from './wizard.js';
import { verifyCloudNode, type FetchLike } from './verify.js';
// rust-f9 — بخش همگام‌سازی محتوا با import پویا سیم می‌شود (پایین cloudSetupSection) —
// نه import ایستا: فقط-میز است و بودجهٔ eager_modules وب (ci.yml) را نمی‌شکند.

export interface SetupUser {
  role?: string | null;
}

export interface RunDeps {
  doc?: CsDocument;
  store?: CloudStore;
  secure?: SecureStore;
  insecure?: boolean;
  fetchImpl?: FetchLike;
  onFinished?: (skipped: boolean) => void;
  now?: () => string;
  /** باز کردن دوبارهٔ ویزار از تنظیمات حتی اگر setup_done باشد */
  force?: boolean;
}

/** فetch سراسری با تطبیق قرارداد FetchLike — در node و مرورگر هر دو هست */
const globalFetch: FetchLike = (input, init) =>
  fetch(input, init as Parameters<typeof fetch>[1]);

let testDeps: Partial<RunDeps> | null = null;

/** جای‌گذاری وابستگی‌ها برای آزمون (الگوی setTutorialDepsForTests) */
export function setCloudSetupDepsForTests(deps: Partial<RunDeps> | null): void {
  testDeps = deps;
}

/** پس از پایان موفق ویزار: توتوریال شروع می‌شود (chunk جدا — هرگز throw نمی‌کند) */
async function startTutorialAfterSetup(user: SetupUser | null): Promise<void> {
  try {
    const tutorial = await import('../tutorial/index.js');
    void tutorial.maybeStartTutorial(user as Parameters<typeof tutorial.maybeStartTutorial>[0]);
  } catch {
    /* تور اختیاری است — خرابی‌اش نباید ویزار را خراب کند */
  }
}

/**
 * ویزار راه‌اندازی نخست. خروجی: آیا ویزار باز شد؟
 * (app.js با false مسیر توتوریال را مستقیم می‌رود.)
 */
export async function maybeRunSetup(user: SetupUser | null, deps?: Partial<RunDeps>): Promise<boolean> {
  const merged: Partial<RunDeps> = { ...(testDeps ?? {}), ...(deps ?? {}) };
  if (!setupFlagEnabled()) return false;
  const doc = merged.doc ?? defaultCloudDocument();
  if (!doc) return false;
  const store: CloudStore = merged.store ?? localStorageStore;
  const record = loadCloudRecord(store);
  if (record.setup_done && merged.force !== true) return false;
  const secureRes = merged.secure
    ? { store: merged.secure, insecure: merged.insecure ?? false }
    : await resolveSecureStore(store);
  openSetupWizard({
    doc,
    store,
    secure: secureRes.store,
    insecure: secureRes.insecure,
    fetchImpl: merged.fetchImpl ?? globalFetch,
    now: merged.now,
    onFinished: (skipped) => {
      merged.onFinished?.(skipped);
      if (!skipped) void startTutorialAfterSetup(user);
      // v1.26.0 — اعتبار تازه ممکن است ذخیره شده باشد؛ هماهنگ‌ساز سینک از قرنطینه خارج می‌شود
      // (import پویا — فقط-میز؛ در وب چانک اصلاً لود نمی‌شود)
      void (async () => {
        try {
          const panel = await import('../node-sync-runner/panel.js');
          panel.notifySyncCredentialsChanged();
        } catch {
          /* نرم — هماهنگ‌ساز اختیاری است */
        }
      })();
    }
  });
  return true;
}

/**
 * بخش «اتصال ابر» برای renderSettings — در وب نال (هیچ DOMی ساخته نمی‌شود).
 * سه کنش: آزمون دوبارهٔ اتصال (با راز ذخیره‌شده) / ویرایش (ویزار دوباره) / پاک‌سازی.
 */
export function cloudSetupSection(user: SetupUser | null, deps?: Partial<RunDeps>): CsElement | null {
  const merged: Partial<RunDeps> = { ...(testDeps ?? {}), ...(deps ?? {}) };
  if (!setupFlagEnabled()) return null;
  const doc = merged.doc ?? defaultCloudDocument();
  if (!doc) return null;
  const store: CloudStore = merged.store ?? localStorageStore;
  const record = loadCloudRecord(store);
  const box = buildCloudSection(doc, record, merged.insecure ?? record.insecure_fallback);
  const status = csEl(doc, 'div', 'cloud-setup-status');
  status.style.display = 'none';

  const showStatus = (text: string): void => {
    status.textContent = text;
    status.style.display = 'block';
  };

  async function secureFor(): Promise<{ store: SecureStore; insecure: boolean }> {
    return merged.secure
      ? { store: merged.secure, insecure: merged.insecure ?? false }
      : await resolveSecureStore(store);
  }

  box.appendChild(
    csButton(doc, 'آزمون دوبارهٔ اتصال', 'cloud-btn cloud-btn-secondary', () => {
      void (async () => {
        const secureRes = await secureFor();
        const key = await readSecret(secureRes.store, SECRET_NODE_KEY);
        const fresh = loadCloudRecord(store);
        if (!fresh.worker_url || !fresh.node_code || !key) {
          showStatus('✕ اتصال کامل ذخیره نشده — با «ویرایش اتصال» کاملش کنید.');
          return;
        }
        const r = await verifyCloudNode(merged.fetchImpl ?? globalFetch, {
          workerUrl: fresh.worker_url,
          nodeCode: fresh.node_code,
          nodeKey: key
        });
        saveCloudRecord(stampVerify(fresh, 'last_node_verify', r.outcome), store);
        showStatus((r.ok ? '✓ ' : '✕ ') + r.message);
      })();
    })
  );

  box.appendChild(
    csButton(doc, 'ویرایش اتصال', 'cloud-btn cloud-btn-secondary', () => {
      void maybeRunSetup(user, { ...merged, force: true });
    })
  );

  box.appendChild(
    csButton(doc, 'پاک‌سازی اتصال', 'cloud-btn cloud-btn-skip', () => {
      void (async () => {
        const secureRes = await secureFor();
        try {
          await secureRes.store.delete(SECRET_NODE_KEY);
        } catch {
          /* حذف مکرر بی‌ضرر است */
        }
        try {
          await secureRes.store.delete(SECRET_CF_TOKEN);
        } catch {
          /* هم‌سان */
        }
        resetCloudRecord(store);
        showStatus('✓ اتصال ابر پاک شد. برای اتصال دوباره از «ویرایش اتصال» استفاده کنید.');
      })();
    })
  );

  box.appendChild(status);

  // rust-f9 — بخش «همگام‌سازی محتوا از ابر» زیر اتصال ابر: اعتبار از همان record + مخزن
  // امن در لحظهٔ کلیک خوانده می‌شود؛ توکن سشن پوسته از کلید استاندارد cs.token می‌آید.
  // rust-f13fix — import پویا: پنل سینک فقط-میز است و نباید در گراف بوت وب باشد
  // (بودجهٔ eager_modules = ۵ در ci.yml)؛ در وب بخش‌های setup ساخته نمی‌شوند و
  // چانک اصلاً واکشی نمی‌شود — روی میز با یک تیک رندر غیرهمگام اضافه می‌شود.
  void (async () => {
    const { buildSyncSection } = await import('../node-sync-runner/panel.js');
    box.appendChild(
      buildSyncSection(doc, {
        getCreds: async () => {
          const secureRes = await secureFor();
          const key = await readSecret(secureRes.store, SECRET_NODE_KEY);
          const fresh = loadCloudRecord(store);
          return { baseUrl: fresh.worker_url, nodeCode: fresh.node_code, nodeKey: key };
        },
        progressStorage: store,
        tokenProvider: () => {
          try {
            return (typeof localStorage !== 'undefined' ? localStorage.getItem('cs.token') : null) ?? null;
          } catch {
            return null;
          }
        },
        // FetchLike ← قرارداد RunnerFetch زمان‌بند (runner فقط status مصرف می‌کند)
        fetchFn: (input: string, init?: RequestInit) => (merged.fetchImpl ?? globalFetch)(input, init as never)
      })
    );
  })();
  return box;
}
