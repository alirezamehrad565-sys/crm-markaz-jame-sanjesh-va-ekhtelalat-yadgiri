/**
 * v1.26.0 — منطق ویزار راه‌اندازی نخست (بدون DOM مستقیم — refs از dom-build)
 *
 * چرخهٔ شش‌اسلایدی (docs/rust/first-run-and-cloud.md §۲):
 *   لندینگ (سه مسیر + پیام به سازنده) → اتصال ابر موجود → توکن CF اختیاری →
 *   ساخت سرور مرکزی با کلادفلر (cf_deploy پوسته + setup مدیر + ثبت نود) →
 *   تعریف کارکنان → پایان (بستن حساب‌های نمایشی).
 *
 * حفظ قراردادهای قبلی برای آزمون‌ها:
 *   «پایان» = ذخیرهٔ رازها در مخزن امن + فراداده → onFinished(false)
 *   «رد کردن» = setup_done=true بدون اعتبار → onFinished(true)
 *   testNode/testToken/next/back/skip/finish روی handle عین کاری که دکمه‌ها می‌کنند.
 * جدید: goTo (انتخاب مسیر از لندینگ) + deployCentral/adminSetup+register/addStaff.
 *
 * همهٔ مسیرهای شبکه‌ای نرم‌اند — خطا فقط در statusArea نمایش می‌یابد، هیچ throwی نیست.
 */

import {
  SECRET_CF_TOKEN,
  SECRET_NODE_KEY,
  completeCloudSetup,
  desktopInvoke,
  loadCloudRecord,
  localStorageStore,
  saveCloudRecord,
  type CloudConnRecord,
  type CloudStore,
  type SecureStore
} from './state.js';
import {
  buildWizardShell,
  buildReportBlock,
  csButton,
  csEl,
  csInput,
  renderWizardStep,
  type CsDocument,
  type CsElement,
  type WizardRefs
} from './dom-build.js';
import { APP_VERSION } from '../core/version.js';
import type { WizardInput } from './types.js';
import { verifyCloudNode, verifyCloudToken, type FetchLike, type VerifyResult } from './verify.js';
import { CF_TOKEN_GUIDE_URL, mapCloudflareTokenError } from './token-errors.js';

export interface SetupWizardDeps {
  doc: CsDocument;
  store: CloudStore;
  secure: SecureStore;
  /** true یعنی مخزن امن نبود و fallback محلی استفاده می‌شود — در تنظیمات هشدار می‌گیرد */
  insecure: boolean;
  fetchImpl: FetchLike;
  /** پس از پایان یا رد شدن — در run.ts توتوریال را راه می‌اندازد */
  onFinished: (skipped: boolean) => void;
  /** مهر زمان تزریق‌پذیر برای آزمون */
  now?: () => string;
}

export interface SetupWizardHandle {
  close(): void;
  next(): void;
  back(): void;
  skip(): void;
  goTo(step: number): void;
  /** پایان ویزار — تا پس از ذخیرهٔ کامل منتظر می‌ماند (آزمون‌پذیر) */
  finish(): Promise<void>;
  testNode(url: string, code: string, key: string): Promise<{ ok: boolean; message: string }>;
  testToken(token: string): Promise<{ ok: boolean; message: string }>;
  /** v1.26.0 — ساخت سرور مرکزی با توکن کلادفلر (فرمان پوسته) — بیرون میز = نرم‌رد */
  deployCentral(token?: string, accountId?: string): Promise<{ ok: boolean; message: string }>;
  /** v1.26.0 — ساخت مدیر مرکز + ثبت نود این میز روی سروری که deployCentral ساخته است */
  adminSetup(username: string, password: string, fullName: string): Promise<{ ok: boolean; message: string }>;
  /** v1.26.0 — افزودن کارمند واقعی از اسلاید کارکنان (همان POST /api/staff) */
  addStaff(fullName: string, username: string, role: string, password: string): Promise<{ ok: boolean; message: string }>;
  /**
   * موج ۲ (۲-۳) — دکمهٔ «تلاش دوباره» استقرار مرکز: همان گام ۱ با همان ورودی‌ها دوباره اجرا
   * می‌شود. پشتوانه: استقرار از ۱.۲۶.۲ per-file idempotent است (جدول پیگیری __deploy_applied
   * سمت پوسته؛ مایگریشن‌های اعمال‌شده دوباره اعمال نمی‌شوند) — اجرای دوباره بی‌خطر است.
   * آرگومان اختیاری فقط برای آزمون/تماس برنامه‌ای است — توکن را در ورودی همان گام می‌نشیند
   * (عین تایپ کاربر)؛ کلیک دکمه بدون آرگومان از خود ورودی می‌خواند.
   */
  retryDeploy(tokenArg?: string): Promise<{ ok: boolean; message: string }>;
  /** موج ۲ (۲-۳) — نمای «تلاش دوباره» پس از شکست استقرار (برای آزمون) */
  deployRetryVisible(): boolean;
  refs: WizardRefs;
  step(): number;
}

const STEP_LANDING = 0;
const STEP_CLOUD = 1;
const STEP_TOKEN = 2;
const STEP_DEPLOY = 3;
const STEP_STAFF = 4;
const STEP_DONE = 5;

const ALLOWED_ROLES = ['manager', 'secretary', 'therapist', 'supervisor'] as const;

/** پاسخ فرمان پوستهٔ cloudflare_deploy (cf_deploy.rs) — ساختاریافته و نرم */
interface DeployResult {
  ok?: boolean;
  message?: string;
  worker_url?: string;
  admin_setup_token?: string;
  auth_secret?: string;
  steps?: unknown;
}

/** توکن سشن کارمند — کلید استاندارد پوسته (هم‌الگوی node-sync-runner/panel) */
function sessionToken(): string | null {
  try {
    return localStorageStore.getItem('cs.token');
  } catch {
    return null;
  }
}

/** مبدأ موتور محلی — در آزمون غایب است و مسیرهای API نرم رد می‌شوند */
function engineOrigin(): string | null {
  try {
    const loc = (globalThis as { location?: { origin?: string } }).location;
    return loc?.origin && loc.origin.startsWith('http') ? loc.origin : null;
  } catch {
    return null;
  }
}

/** fetch نرم با پاسخ ساختاریافته — هیچ مسیری throw نمی‌کند */
async function softFetch(
  fetchImpl: FetchLike,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
): Promise<{ status: number; body: { data?: unknown; error?: unknown; message?: unknown } | null }> {
  try {
    const res = await fetchImpl(url, init as never);
    const status = res.status;
    let body: { data?: unknown; error?: unknown; message?: unknown } | null = null;
    try {
      if (typeof res.json === 'function') body = (await res.json()) as typeof body;
    } catch {
      body = null;
    }
    return { status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export function openSetupWizard(deps: SetupWizardDeps): SetupWizardHandle {
  const record = loadCloudRecord(deps.store);
  const refs = buildWizardShell(deps.doc, record);
  const now = deps.now ?? (() => new Date().toISOString());
  let step = STEP_LANDING;
  let nodeResult: VerifyResult | null = null;
  let tokenResult: VerifyResult | null = null;
  // v1.26.0 — وضعیت گام «ساخت سرور مرکزی» — فقط در حافظه؛ در finish روی رکورد می‌نشیند
  let deployed: { worker_url: string; admin_setup_token: string } | null = null;
  let centralToken: string | null = null;
  // handle زودتر اعلام می‌شود چون کلوژرهای اسلایدها به آن ارجاع می‌دهند (فقط پس از ساخت اجرا می‌شوند)
  let handle: SetupWizardHandle;

  function showStatus(text: string): void {
    refs.statusArea.textContent = text;
    refs.statusArea.style.display = 'block';
  }
  function hideStatus(): void {
    refs.statusArea.style.display = 'none';
  }

  /**
   * موج ۲ (۲-۳) — اجرای گام «ساخت سرور مرکزی» — هم دکمهٔ اصلی و هم «تلاش دوباره» همین را
   * می‌زنند: شکست → پیام (با نگاشت ۲-۴ اگر خطای توکن کلادفلر باشد) + نمایان‌شدن تلاش دوباره؛
   * موفقیت → پنهان‌شدن تلاش دوباره + پیام ادامه. هیچ مسیری throw نمی‌کند.
   */
  async function runDeployStep(): Promise<{ ok: boolean; message: string }> {
    hideStatus();
    const r = await handle.deployCentral(deployTokenInput.value, refs.inputs.cf_account.value);
    if (r.ok) {
      hideDeployRetry();
      showStatus('✓ ' + r.message + ' — حالا مدیر مرکز را بسازید (گام ۲).');
    } else {
      const guide = mapCloudflareTokenError({ message: r.message });
      showStatus('✕ ' + (guide ? guide.text : r.message));
      showDeployRetry();
    }
    return r;
  }

  async function testNode(url: string, code: string, key: string): Promise<{ ok: boolean; message: string }> {
    const r = await verifyCloudNode(deps.fetchImpl, { workerUrl: url, nodeCode: code, nodeKey: key });
    nodeResult = r;
    showStatus((r.ok ? '✓ ' : '✕ ') + r.message);
    return { ok: r.ok, message: r.message };
  }

  async function testToken(token: string): Promise<{ ok: boolean; message: string }> {
    const r = await verifyCloudToken(deps.fetchImpl, { token });
    tokenResult = r;
    if (r.ok) {
      showStatus('✓ ' + r.message);
    } else {
      // موج ۲ (۲-۴) — نگاشت خطای توکن به راهنمای عملی: چه اتفاقی افتاد + لینک مستقیم صفحهٔ
      // توکن‌های کلادفلر + محدوده‌های لازم. خطای ناآشنا (شبکه و…) نگاشت نمی‌گیرد — پیام اصلی.
      const guide = mapCloudflareTokenError({ message: r.message, outcome: r.outcome });
      showStatus('✕ ' + (guide ? `${r.message} — ${guide.text}` : r.message));
    }
    return { ok: r.ok, message: r.message };
  }

  function collectInput(): WizardInput {
    return {
      worker_url: refs.inputs.worker_url.value,
      node_code: refs.inputs.node_code.value,
      node_key: refs.inputs.node_key.value,
      cf_token: refs.inputs.cf_token.value
    };
  }

  async function finish(): Promise<void> {
    const input = collectInput();
    let nodeKeySet = false;
    let cfTokenSet = false;
    try {
      if (input.node_key.trim()) {
        await deps.secure.set(SECRET_NODE_KEY, input.node_key.trim());
        nodeKeySet = true;
      }
    } catch {
      /* مخزن امن رد کرد — فراداده با node_key_set=false ذخیره می‌شود؛ هشدار در تنظیمات */
    }
    try {
      if (input.cf_token.trim()) {
        await deps.secure.set(SECRET_CF_TOKEN, input.cf_token.trim());
        cfTokenSet = true;
      }
    } catch {
      /* هم‌سان گام کلید نود */
    }
    const next: CloudConnRecord = {
      ...record,
      worker_url: input.worker_url.trim() || null,
      node_code: input.node_code.trim() || null,
      node_key_set: nodeKeySet || record.node_key_set,
      cf_token_set: cfTokenSet || record.cf_token_set,
      insecure_fallback: deps.insecure,
      last_node_verify: nodeResult ? { at: now(), outcome: nodeResult.ok ? 'ok' : nodeResult.outcome } : record.last_node_verify,
      last_cf_verify: tokenResult ? { at: now(), outcome: tokenResult.ok ? 'ok' : tokenResult.outcome } : record.last_cf_verify
    };
    saveCloudRecord(completeCloudSetup(next, false), deps.store);

    // v1.26.0 — بستن حساب‌های نمایشی (نرم): اگر توکن/مبدأ نبود یا قبلاً کامل شده، بی‌اثر می‌گذرد
    const token = sessionToken();
    const origin = engineOrigin();
    if (token && origin) {
      await softFetch(deps.fetchImpl, `${origin}/api/setup/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ close_demo: true })
      });
    }

    refs.root.remove();
    deps.onFinished(false);
  }

  function skip(): void {
    saveCloudRecord(completeCloudSetup(record, true), deps.store);
    refs.root.remove();
    deps.onFinished(true);
  }

  function go(delta: number): void {
    const target = step + delta;
    if (target < STEP_LANDING || target > STEP_DONE) return;
    step = target;
    render();
  }

  function goTo(target: number): void {
    if (target < STEP_LANDING || target > STEP_DONE) return;
    step = target;
    render();
  }

  // ─── اسلاید ۱ — لندینگ: سه مسیر + پیام به سازنده + راهنمای ورود نمایشی ───
  const landing = csEl(deps.doc, 'div', 'cloud-slide');
  landing.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'این نسخهٔ میزِ سامانه است و کامل آفلاین کار می‌کند. اتصال به ابر فقط برای «اعلان‌ها، کتابخانهٔ شبکه، بسته‌های بازی و گزارش تجمیعی» است — هیچ دادهٔ بالینی از میز به ابر نمی‌رود.'
    )
  );
  landing.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'راهنمای نصب اولیه: با نام کاربری manager و رمز 1234 وارد شده‌اید؛ در گام «تعریف کارکنان» حساب‌های واقعی مرکز را می‌سازید و در پایان، حساب نمایشی بسته می‌شود.'
    )
  );
  landing.appendChild(
    csButton(deps.doc, 'اتصال به سرور مرکزی موجود', 'cloud-btn cloud-btn-primary', () => {
      hideStatus();
      goTo(STEP_CLOUD);
    })
  );
  landing.appendChild(
    csButton(deps.doc, 'ساخت سرور مرکزی خودم با توکن کلادفلر', 'cloud-btn cloud-btn-primary', () => {
      hideStatus();
      goTo(STEP_DEPLOY);
    })
  );
  landing.appendChild(buildReportBlock(deps.doc, [
    'گزارش از نسخهٔ میز — ' + APP_VERSION,
    'باز شدن خودکار از ویزار راه‌اندازی نخست',
    'پیام شما:'
  ]));

  // ─── اسلاید ۲ — اتصال ابر موجود (قرارداد قبلی) ───
  const cloud = csEl(deps.doc, 'div', 'cloud-slide');
  cloud.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'آدرس ورکر ابری'));
  cloud.appendChild(refs.inputs.worker_url);
  cloud.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'کد نود'));
  cloud.appendChild(refs.inputs.node_code);
  cloud.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'کلید نود'));
  cloud.appendChild(refs.inputs.node_key);
  cloud.appendChild(
    csButton(deps.doc, 'آزمون اتصال', 'cloud-btn cloud-btn-secondary', () => {
      void testNode(refs.inputs.worker_url.value, refs.inputs.node_code.value, refs.inputs.node_key.value);
    })
  );

  // ─── اسلاید ۳ — توکن Cloudflare (اختیاری، قرارداد قبلی) ───
  const tokenSlide = csEl(deps.doc, 'div', 'cloud-slide');
  tokenSlide.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'توکن Cloudflare برای سینک لازم نیست — فقط اگر می‌خواهید اعتبار توکن حساب کلادفلر همین‌جا آزمون شود. توکن فقط به api.cloudflare.com ارسال می‌شود و هرگز به لاگ ما نمی‌رسد.'
    )
  );
  tokenSlide.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'توکن API کلادفلر'));
  tokenSlide.appendChild(refs.inputs.cf_token);
  tokenSlide.appendChild(
    csButton(deps.doc, 'آزمون توکن', 'cloud-btn cloud-btn-secondary', () => {
      void testToken(refs.inputs.cf_token.value);
    })
  );

  // ─── اسلاید ۴ — ساخت سرور مرکزی با کلادفلر (v1.26.0) ───
  const deployTokenInput = csInput(deps.doc, 'password', 'توکن API کلادفلر (مجوز: Workers Scripts:Edit + D1:Edit)', 'cloud-input');
  const deployUserInput = csInput(deps.doc, 'text', 'نام کاربری مدیر مرکز (انگلیسی کوچک)', 'cloud-input');
  const deployPassInput = csInput(deps.doc, 'password', 'رمز مدیر مرکز — حداقل ۶ نویسه', 'cloud-input');
  const deployNameInput = csInput(deps.doc, 'text', 'نام کامل مدیر مرکز', 'cloud-input');

  // موج ۲ (۲-۳) — بلوک «تلاش دوباره» استقرار: پس از شکست قطعهٔ i/n نمایان می‌شود؛
  // پشتوانهٔ بی‌خطر بودن: استقرار per-file idempotent از ۱.۲۶.۲ (جدول پیگیری __deploy_applied
  // سمت پوسته — مایگریشن‌های اعمال‌شده در اجرای دوباره شناسایی و رد می‌شوند؛ از همان قطعه ادامه).
  const deployRetryBox = csEl(deps.doc, 'div', 'cloud-retry-block');
  deployRetryBox.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text cloud-retry-hint',
      'اجرای دوباره بی‌خطر است — گام‌های انجام‌شدهٔ استقرار (از جمله مایگریشن‌های اعمال‌شده) شناسایی و رد می‌شوند و از همان قطعهٔ ناتمام ادامه می‌یابد.'
    )
  );
  deployRetryBox.style.display = 'none';
  const showDeployRetry = (): void => {
    deployRetryBox.style.display = 'block';
  };
  const hideDeployRetry = (): void => {
    deployRetryBox.style.display = 'none';
  };

  const deploy = csEl(deps.doc, 'div', 'cloud-slide');
  deploy.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'با توکن کلادفلر خودتان، سرور مرکزی سینک روی حساب خودتان ساخته می‌شود: پایگاه D1 با اسکیمای کامل، ورکر «markaz-central» با رمز اختصاصی و دامنهٔ workers.dev. توکن فقط به api.cloudflare.com می‌رود.'
    )
  );
  deploy.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'توکن API کلادفلر'));
  deploy.appendChild(deployTokenInput);
  deploy.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'شناسهٔ حساب (اگر چند حساب دارید)'));
  deploy.appendChild(refs.inputs.cf_account);
  deploy.appendChild(
    // موج ۲ (۲-۴) — لینک مستقیم صفحهٔ توکن‌های کلادفلر (همیشه در دسترس، نه فقط در خطا)
    csButton(deps.doc, 'صفحهٔ توکن‌های کلادفلر', 'cloud-btn cloud-btn-secondary', () => {
      try {
        const g = globalThis as { open?: (url: string) => unknown };
        g.open?.(CF_TOKEN_GUIDE_URL);
      } catch {
        /* نرم — لینک در متن راهنما هم هست */
      }
    })
  );
  deploy.appendChild(
    csButton(deps.doc, '۱) ساخت سرور مرکزی', 'cloud-btn cloud-btn-primary', () => {
      void runDeployStep();
    })
  );

  // موج ۲ (۲-۳) — دکمهٔ «تلاش دوباره» + متن اطمینان؛ فقط پس از شکست نمایان است
  deployRetryBox.appendChild(
    csButton(deps.doc, 'تلاش دوباره', 'cloud-btn cloud-btn-primary cloud-retry-btn', () => {
      void runDeployStep();
    })
  );
  deploy.appendChild(deployRetryBox);

  deploy.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'نام کاربری مدیر مرکز'));
  deploy.appendChild(deployUserInput);
  deploy.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'رمز مدیر مرکز'));
  deploy.appendChild(deployPassInput);
  deploy.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'نام کامل مدیر'));
  deploy.appendChild(deployNameInput);
  deploy.appendChild(
    csButton(deps.doc, '۲) ساخت مدیر و ثبت نود این میز', 'cloud-btn cloud-btn-primary', () => {
      void (async () => {
        hideStatus();
        const r = await handle.adminSetup(deployUserInput.value, deployPassInput.value, deployNameInput.value);
        showStatus((r.ok ? '✓ ' : '✕ ') + r.message);
        if (r.ok) showStatus('✓ اتصال کامل شد — «بعدی» برای تعریف کارکنان.');
      })();
    })
  );

  // ─── اسلاید ۵ — تعریف کارکنان (v1.26.0) ───
  const staffList = csEl(deps.doc, 'div', 'cloud-staff-list');
  const staffName = csInput(deps.doc, 'text', 'نام و نام خانوادگی', 'cloud-input');
  const staffUser = csInput(deps.doc, 'text', 'نام کاربری (انگلیسی کوچک)', 'cloud-input');
  const staffRole = csInput(deps.doc, 'text', 'نقش: manager | secretary | therapist | supervisor', 'cloud-input');
  const staffPass = csInput(deps.doc, 'password', 'رمز — حداقل ۶ نویسه', 'cloud-input');

  const staff = csEl(deps.doc, 'div', 'cloud-slide');
  staff.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'حساب‌های واقعی مرکز را همین‌جا بسازید. در گام پایان، سه حساب نمایشی نصب (manager/secretary/therapist با رمز 1234) بسته می‌شوند تا فقط حساب‌های خودتان باقی بمانند.'
    )
  );
  staff.appendChild(staffList);
  staff.appendChild(
    csButton(deps.doc, 'به‌روزرسانی فهرست', 'cloud-btn cloud-btn-secondary', () => {
      void (async () => {
        const r = await refreshStaffList();
        showStatus((r.ok ? '✓ ' : '✕ ') + r.message);
      })();
    })
  );
  staff.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'نام و نام خانوادگی'));
  staff.appendChild(staffName);
  staff.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'نام کاربری'));
  staff.appendChild(staffUser);
  staff.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'نقش'));
  staff.appendChild(staffRole);
  staff.appendChild(csEl(deps.doc, 'label', 'cloud-label', 'رمز'));
  staff.appendChild(staffPass);
  staff.appendChild(
    csButton(deps.doc, 'افزودن کارمند', 'cloud-btn cloud-btn-primary', () => {
      void (async () => {
        const r = await handle.addStaff(staffName.value, staffUser.value, staffRole.value, staffPass.value);
        showStatus((r.ok ? '✓ ' : '✕ ') + r.message);
        if (r.ok) {
          staffName.value = '';
          staffUser.value = '';
          staffRole.value = '';
          staffPass.value = '';
        }
      })();
    })
  );

  async function refreshStaffList(): Promise<{ ok: boolean; message: string }> {
    const token = sessionToken();
    const origin = engineOrigin();
    if (!token || !origin) {
      staffList.textContent = '(فهرست کارکنان فقط داخل نسخهٔ میز و پس از ورود در دسترس است)';
      return { ok: true, message: 'فهرست در این محیط نمایش داده نمی‌شود' };
    }
    const r = await softFetch(deps.fetchImpl, `${origin}/api/staff`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status !== 200 || !r.body || !Array.isArray((r.body.data as { items?: unknown[] })?.items)) {
      staffList.textContent = '(فهرست گرفته نشد)';
      return { ok: false, message: `فهرست کارکنان نگرفته شد (HTTP ${r.status})` };
    }
    const items = (r.body.data as { items: Array<{ full_name?: string; username?: string; role?: string; active?: boolean }> }).items;
    staffList.textContent = '';
    for (const it of items) {
      const row = csEl(deps.doc, 'div', 'cloud-row');
      row.appendChild(
        csEl(
          deps.doc,
          'span',
          'cloud-row-label',
          `${it.full_name ?? '?'} — ${it.username ?? '?'} (${it.role ?? '?'})${it.active === false ? ' — غیرفعال' : ''}`
        )
      );
      staffList.appendChild(row);
    }
    if (items.length === 0) staffList.textContent = '(هنوز کارمندی ثبت نشده)';
    return { ok: true, message: 'فهرست به‌روز شد' };
  }

  // ─── اسلاید ۶ — پایان (قرارداد قبلی + بستن نمایشی‌ها در finish) ───
  const done = csEl(deps.doc, 'div', 'cloud-slide');
  done.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'راه‌اندازی ذخیره می‌شود. رازها (کلید نود/توکن) در مخزن امن ویندوز نگه‌داری می‌شوند و فقط برای اتصال به ورکر خودتان استفاده می‌شوند. با «پایان»، حساب‌های نمایشی نصب هم بسته می‌شوند.'
    )
  );

  const slides: CsElement[] = [landing, cloud, tokenSlide, deploy, staff, done];

  function render(): void {
    renderWizardStep(refs, step, slides);
    if (step === STEP_STAFF) void refreshStaffList();
  }

  refs.nextBtn.addEventListener('click', () => {
    if (step < STEP_DONE) go(1);
    else void finish();
  });
  refs.backBtn.addEventListener('click', () => go(-1));
  refs.skipBtn.addEventListener('click', () => skip());

  deps.doc.body.appendChild(refs.root);
  render();

  handle = {
    close() {
      refs.root.remove();
    },
    next() {
      if (step < STEP_DONE) go(1);
      else void finish();
    },
    back() {
      go(-1);
    },
    skip,
    goTo,
    finish,
    testNode,
    testToken,
    async deployCentral(tokenArg, accountIdArg) {
      const token = (tokenArg ?? deployTokenInput.value ?? '').trim();
      if (!token) return { ok: false, message: 'توکن کلادفلر خالی است.' };
      const accountId = (accountIdArg ?? refs.inputs.cf_account.value ?? '').trim();
      const res = desktopInvoke('cloudflare_deploy', { token, account_id: accountId || null });
      if (!res) {
        return { ok: false, message: 'این گام فقط داخل نسخهٔ میز کار می‌کند (فرمان پوسته در دسترس نیست).' };
      }
      let out: DeployResult | null = null;
      try {
        out = (await res) as DeployResult | null;
      } catch (e) {
        return { ok: false, message: 'فرمان پوسته شکست خورد: ' + (e instanceof Error ? e.message : String(e)) };
      }
      if (!out || out.ok !== true || !out.worker_url || !out.admin_setup_token) {
        return { ok: false, message: out?.message ?? 'ساخت سرور مرکزی ناموفق بود — جزئیات در کنش‌های گام.' };
      }
      deployed = { worker_url: out.worker_url, admin_setup_token: out.admin_setup_token };
      refs.inputs.worker_url.value = out.worker_url;
      if (!refs.inputs.cf_token.value.trim()) refs.inputs.cf_token.value = token;
      return { ok: true, message: `سرور مرکزی ساخته شد: ${out.worker_url}` };
    },
    async adminSetup(username, password, fullName) {
      if (!deployed) return { ok: false, message: 'اول سرور مرکزی را بسازید (گام ۱).' };
      const u = username.trim();
      const p = password.trim();
      const n = fullName.trim();
      if (!/^[a-z0-9._-]{3,64}$/.test(u)) return { ok: false, message: 'نام کاربری مدیر: فقط انگلیسی کوچک/عدد/نقطه/خط، حداقل ۳ نویسه.' };
      if (p.length < 6) return { ok: false, message: 'رمز مدیر حداقل ۶ نویسه است.' };
      if (n.length < 2) return { ok: false, message: 'نام کامل مدیر را بنویسید.' };

      // ۱) ساخت مدیر با توکن یک‌بارمصرف
      const setup = await softFetch(deps.fetchImpl, `${deployed.worker_url}/admin/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Setup-Token': deployed.admin_setup_token },
        body: JSON.stringify({ username: u, password: p, full_name: n })
      });
      if (setup.status !== 201) {
        const msg = (setup.body?.message as string) ?? `HTTP ${setup.status}`;
        return { ok: false, message: `ساخت مدیر مرکز رد شد: ${msg}` };
      }

      // ۲) ورود به مرکز برای ثبت نود
      const login = await softFetch(deps.fetchImpl, `${deployed.worker_url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const loginData = (login.body?.data as { token?: unknown } | undefined) ?? undefined;
      if (login.status !== 200 || typeof loginData?.token !== 'string') {
        return { ok: false, message: 'مدیر ساخته شد ولی ورود به مرکز ناموفق بود — دوباره تلاش کنید.' };
      }
      centralToken = loginData.token;

      // ۳) ثبت نود این میز — کد از نصب تولید می‌شود؛ کلید فقط یک‌بار در پاسخ می‌آید
      let nodeCode = 'DESKTOP:';
      try {
        nodeCode += (crypto.randomUUID().replace(/-/g, '')).slice(0, 8).toLowerCase();
      } catch {
        nodeCode += String(Date.now()).slice(-8);
      }
      const reg = await softFetch(deps.fetchImpl, `${deployed.worker_url}/node/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${centralToken}` },
        body: JSON.stringify({ node_code: nodeCode, label: 'میز مرکز — نصب محلی' })
      });
      const regData = (reg.body?.data as { node_code?: unknown; node_key?: unknown } | undefined) ?? undefined;
      if (reg.status !== 201 || typeof regData?.node_code !== 'string' || typeof regData?.node_key !== 'string') {
        return {
          ok: false,
          message: 'مدیر و ورود برقرار شد ولی ثبت نود رد شد — کد نود را دستی در گام «اتصال» بدهید.'
        };
      }
      refs.inputs.node_code.value = regData.node_code;
      refs.inputs.node_key.value = regData.node_key;
      nodeResult = { ok: true, outcome: 'ok', message: 'نود روی سرور مرکزی شما ثبت شد.' };
      return { ok: true, message: `مدیر ساخته شد و نود ${regData.node_code} ثبت شد — کلید در «پایان» به مخزن امن می‌رود.` };
    },
    async addStaff(fullName, username, role, password) {
      const token = sessionToken();
      const origin = engineOrigin();
      if (!token || !origin) return { ok: false, message: 'افزودن کارمند فقط داخل نسخهٔ میز و پس از ورود ممکن است.' };
      const r = role.trim().toLowerCase();
      if (!(ALLOWED_ROLES as readonly string[]).includes(r)) {
        return { ok: false, message: 'نقش باید یکی از: manager | secretary | therapist | supervisor باشد.' };
      }
      const res = await softFetch(deps.fetchImpl, `${origin}/api/staff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: fullName.trim(), username: username.trim(), role: r, password: password.trim() || undefined })
      });
      if (res.status === 201) {
        await refreshStaffList();
        return { ok: true, message: `کارمند «${fullName.trim()}» ساخته شد.` };
      }
      const msg = (res.body?.message as string) ?? `HTTP ${res.status}`;
      return { ok: false, message: `ساخت کارمند رد شد: ${msg}` };
    },
    async retryDeploy(tokenArg?: string) {
      // موج ۲ (۲-۳) — همان مسیر دکمهٔ «تلاش دوباره» (عین کلیک — آزمون‌پذیر)
      if (tokenArg !== undefined) deployTokenInput.value = tokenArg;
      return runDeployStep();
    },
    deployRetryVisible() {
      return deployRetryBox.style.display !== 'none';
    },
    refs,
    step: () => step
  };

  return handle;
}
