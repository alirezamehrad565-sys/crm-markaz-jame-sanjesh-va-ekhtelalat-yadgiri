/**
 * rust-f7 — منطق ویزار راه‌اندازی نخست (بدون DOM مستقیم — refs از dom-build)
 *
 * چرخه: خوش‌آمد → اتصال ابر (آزمون بدون ذخیره) → توکن CF اختیاری → پایان.
 * «پایان» = ذخیرهٔ رازها در مخزن امن + فراداده در localStorage → onFinished(false).
 * «رد کردن» = setup_done=true بدون هیچ اعتباری → onFinished(true) — اتصال ابر
 * اختیاری است و رد کردن هیچ مسیری را قفل نمی‌کند (تور مستقل ادامه می‌یابد).
 * متدهای next/back/skip/finish/testNode/testToken روی handle عین کاری است که
 * دکمه‌ها می‌کنند — آزمون‌ها بدون کلیک واقعی رانندهٔ جریان‌اند.
 */

import {
  SECRET_CF_TOKEN,
  SECRET_NODE_KEY,
  completeCloudSetup,
  loadCloudRecord,
  saveCloudRecord,
  type CloudConnRecord,
  type CloudStore,
  type SecureStore
} from './state.js';
import {
  buildWizardShell,
  csButton,
  csEl,
  renderWizardStep,
  type CsDocument,
  type CsElement,
  type WizardRefs
} from './dom-build.js';
import type { WizardInput } from './types.js';
import { verifyCloudNode, verifyCloudToken, type FetchLike, type VerifyResult } from './verify.js';

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
  /** پایان ویزار — تا پس از ذخیرهٔ کامل منتظر می‌ماند (آزمون‌پذیر) */
  finish(): Promise<void>;
  testNode(url: string, code: string, key: string): Promise<{ ok: boolean; message: string }>;
  testToken(token: string): Promise<{ ok: boolean; message: string }>;
  refs: WizardRefs;
  step(): number;
}

const STEP_WELCOME = 0;
const STEP_CLOUD = 1;
const STEP_TOKEN = 2;
const STEP_DONE = 3;

export function openSetupWizard(deps: SetupWizardDeps): SetupWizardHandle {
  const record = loadCloudRecord(deps.store);
  const refs = buildWizardShell(deps.doc, record);
  const now = deps.now ?? (() => new Date().toISOString());
  let step = STEP_WELCOME;
  let nodeResult: VerifyResult | null = null;
  let tokenResult: VerifyResult | null = null;

  async function testNode(url: string, code: string, key: string): Promise<{ ok: boolean; message: string }> {
    const r = await verifyCloudNode(deps.fetchImpl, { workerUrl: url, nodeCode: code, nodeKey: key });
    nodeResult = r;
    refs.statusArea.textContent = (r.ok ? '✓ ' : '✕ ') + r.message;
    refs.statusArea.style.display = 'block';
    return { ok: r.ok, message: r.message };
  }

  async function testToken(token: string): Promise<{ ok: boolean; message: string }> {
    const r = await verifyCloudToken(deps.fetchImpl, { token });
    tokenResult = r;
    refs.statusArea.textContent = (r.ok ? '✓ ' : '✕ ') + r.message;
    refs.statusArea.style.display = 'block';
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
    if (target < STEP_WELCOME || target > STEP_DONE) return;
    step = target;
    render();
  }

  // اسلاید ۱ — خوش‌آمد
  const welcome = csEl(deps.doc, 'div', 'cloud-slide');
  welcome.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'این نسخهٔ میزِ سامانه است و کامل آفلاین کار می‌کند. اتصال به ابر فقط برای «اعلان‌ها، کتابخانهٔ شبکه، بسته‌های بازی و گزارش تجمیعی» است — هیچ دادهٔ بالینی از میز به ابر نمی‌رود.'
    )
  );
  welcome.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'برای اتصال، مدیر اپ ابری باید در «پنل مدیریت ← نودهای میز» نود را ثبت کند و کد/کلید نود را یک‌بار به شما بدهد. این گام را می‌توانید رد کنید و بعداً از تنظیمات انجام دهید.'
    )
  );

  // اسلاید ۲ — اتصال ابر
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
  cloud.appendChild(refs.statusArea);

  // اسلاید ۳ — توکن Cloudflare (اختیاری)
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

  // اسلاید ۴ — پایان
  const done = csEl(deps.doc, 'div', 'cloud-slide');
  done.appendChild(
    csEl(
      deps.doc,
      'p',
      'cloud-text',
      'راه‌اندازی ذخیره شد. رازها (کلید نود/توکن) در مخزن امن ویندوز نگه‌داری می‌شوند و فقط برای اتصال به ورکر خودتان استفاده می‌شوند.'
    )
  );

  const slides: CsElement[] = [welcome, cloud, tokenSlide, done];

  function render(): void {
    renderWizardStep(refs, step, slides);
  }

  refs.nextBtn.addEventListener('click', () => {
    if (step < STEP_DONE) go(1);
    else void finish();
  });
  refs.backBtn.addEventListener('click', () => go(-1));
  refs.skipBtn.addEventListener('click', () => skip());

  deps.doc.body.appendChild(refs.root);
  render();

  return {
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
    finish,
    testNode,
    testToken,
    refs,
    step: () => step
  };
}
