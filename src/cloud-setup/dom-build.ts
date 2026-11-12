/**
 * rust-f7 — لایهٔ DOM باریک ویزار راه‌اندازی (بدون lib DOM در tsconfig)
 *
 * عین رویکرد src/tutorial/dom-build.ts: یک قرارداد حداقلی از گره DOM که
 * مرورگر واقعی و فِیک آزمون هر دو آن را برآورده می‌کنند (سازگاری ساختاری).
 * این ماژول فقط پوسته/کمک‌سازهاست؛ اسلایدها و منطق در wizard.ts.
 * ویزار هرگز querySelector نمی‌زند — همهٔ ارجاع‌ها از سازنده برمی‌گردند (refs).
 */

import type { CloudConnRecord, CloudVerifyOutcome } from './state.js';

export interface CsStyle {
  display: string;
  [prop: string]: string;
}

export interface CsElement {
  readonly tag?: string;
  className: string;
  textContent: string;
  title: string;
  type: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  style: CsStyle;
  firstChild: CsElement | null;
  appendChild(child: CsElement): CsElement;
  addEventListener(type: string, listener: () => void): void;
  remove(): void;
  focus(): void;
}

export interface CsDocument {
  createElement(tag: string): CsElement;
  body: CsElement;
}

/** خواندن سند واقعی با گارد کامل — در محیط بدون DOM نال است */
export function defaultCloudDocument(): CsDocument | null {
  const doc = (globalThis as Record<string, unknown>)['document'] as
    | { createElement?: unknown; body?: unknown }
    | undefined;
  return doc && typeof doc.createElement === 'function' ? (doc as unknown as CsDocument) : null;
}

export function csEl(doc: CsDocument, tag: string, className = '', text = ''): CsElement {
  const el = doc.createElement(tag) as unknown as CsElement;
  el.className = className;
  el.textContent = text;
  return el;
}

export function csInput(doc: CsDocument, type: string, placeholder: string, className = ''): CsElement {
  const el = csEl(doc, 'input', className);
  el.type = type;
  el.placeholder = placeholder;
  return el;
}

export function csButton(doc: CsDocument, label: string, className: string, onClick: () => void): CsElement {
  const el = csEl(doc, 'button', className, label);
  el.addEventListener('click', onClick);
  return el;
}

export function csRow(doc: CsDocument, label: string, value: string): CsElement {
  const row = csEl(doc, 'div', 'cloud-row');
  row.appendChild(csEl(doc, 'span', 'cloud-row-label', label));
  row.appendChild(csEl(doc, 'span', 'cloud-row-value', value));
  return row;
}

export const WIZARD_STEP_TITLES = [
  'خوش آمدید — نسخهٔ میز',
  'اتصال به ابر (اختیاری)',
  'توکن Cloudflare (اختیاری)',
  'پایان راه‌اندازی'
] as const;

export const WIZARD_STEP_COUNT = WIZARD_STEP_TITLES.length;

/** متنی که دکمهٔ پیش‌روی در گام پایان دارد */
export const FINISH_LABEL = 'پایان و شروع راهنمای شروع';

const OUTCOME_FA: Record<CloudVerifyOutcome, string> = {
  never: 'هنوز آزمون نشده',
  ok: 'برقرار',
  auth_error: 'اعتبار رد شد',
  network_error: 'شبکه در دسترس نیست',
  bad_url: 'آدرس نامعتبر',
  server_error: 'خطای سرور',
  invalid_token: 'توکن نامعتبر'
};

export function outcomeFa(outcome: CloudVerifyOutcome): string {
  return OUTCOME_FA[outcome] ?? outcome;
}

export interface WizardInputDom {
  worker_url: CsElement;
  node_code: CsElement;
  node_key: CsElement;
  cf_token: CsElement;
}

export interface WizardRefs {
  root: CsElement;
  stepTitle: CsElement;
  stepBody: CsElement;
  statusArea: CsElement;
  backBtn: CsElement;
  nextBtn: CsElement;
  skipBtn: CsElement;
  inputs: WizardInputDom;
}

/**
 * پوستهٔ modal ویزار: عنوان + بدنه + ناوبری (قبلی/بعدی/رد کردن) + ناحیهٔ نتیجه
 * + چهار ورودی. دکمه‌ها هندلر خالی دارند — سیم‌کشی واقعی در wizard.ts.
 * ورودی‌ها از رکورد موجود پیش‌پر می‌شوند (ویرایش دوباره از تنظیمات).
 */
export function buildWizardShell(doc: CsDocument, initial: CloudConnRecord): WizardRefs {
  const root = csEl(doc, 'div', 'cloud-setup-overlay');
  const modal = csEl(doc, 'div', 'cloud-setup-modal');
  const stepTitle = csEl(doc, 'h2', 'cloud-setup-title', '');
  const stepBody = csEl(doc, 'div', 'cloud-setup-body');
  const statusArea = csEl(doc, 'div', 'cloud-setup-status');
  statusArea.style.display = 'none';

  const inputs: WizardInputDom = {
    worker_url: csInput(doc, 'text', 'مثل https://center.example.workers.dev', 'cloud-input'),
    node_code: csInput(doc, 'text', 'DESKTOP:…', 'cloud-input'),
    node_key: csInput(doc, 'password', 'کلید نود — فقط یک‌بار نمایش داده می‌شود', 'cloud-input'),
    cf_token: csInput(doc, 'password', 'توکن API کلادفلر — اختیاری', 'cloud-input')
  };
  if (initial.worker_url) inputs.worker_url.value = initial.worker_url;
  if (initial.node_code) inputs.node_code.value = initial.node_code;

  const backBtn = csButton(doc, 'قبلی', 'cloud-btn cloud-btn-secondary', () => {});
  const nextBtn = csButton(doc, 'بعدی', 'cloud-btn cloud-btn-primary', () => {});
  const skipBtn = csButton(doc, 'رد کردن', 'cloud-btn cloud-btn-skip', () => {});
  const nav = csEl(doc, 'div', 'cloud-setup-nav');
  nav.appendChild(backBtn);
  nav.appendChild(nextBtn);
  nav.appendChild(skipBtn);

  modal.appendChild(stepTitle);
  modal.appendChild(stepBody);
  modal.appendChild(nav);
  root.appendChild(modal);

  return { root, stepTitle, stepBody, statusArea, backBtn, nextBtn, skipBtn, inputs };
}

/** جای‌گذاری اسلاید جاری در بدنهٔ ویزار + وضعیت دکمه‌ها */
export function renderWizardStep(refs: WizardRefs, stepIndex: number, slides: CsElement[]): void {
  refs.stepTitle.textContent = WIZARD_STEP_TITLES[stepIndex] ?? '';
  while (refs.stepBody.firstChild) refs.stepBody.firstChild.remove();
  const slide = slides[stepIndex];
  if (slide) refs.stepBody.appendChild(slide);
  refs.backBtn.disabled = stepIndex === 0;
  refs.backBtn.style.display = stepIndex === 0 ? 'none' : 'inline-block';
  const isDone = stepIndex === slides.length - 1;
  refs.nextBtn.textContent = isDone ? FINISH_LABEL : 'بعدی';
  refs.skipBtn.style.display = isDone ? 'none' : 'inline-block';
}

/** بخش تنظیمات «اتصال ابر» — وضعیت فعلی بدون کنش‌ها (کنش‌ها در run.ts سیم می‌شوند) */
export function buildCloudSection(doc: CsDocument, record: CloudConnRecord, insecure: boolean): CsElement {
  const box = csEl(doc, 'div', 'cloud-setup-section');
  box.appendChild(csEl(doc, 'h3', 'cloud-section-title', 'اتصال ابر (نسخهٔ میز)'));
  box.appendChild(csRow(doc, 'آدرس ورکر', record.worker_url ?? '— تنظیم نشده'));
  box.appendChild(csRow(doc, 'کد نود', record.node_code ?? '—'));
  box.appendChild(
    csRow(doc, 'آخرین آزمون اتصال', record.last_node_verify ? outcomeFa(record.last_node_verify.outcome) : 'هنوز آزمون نشده')
  );
  box.appendChild(csRow(doc, 'کلید نود', record.node_key_set ? 'ذخیره شده' : '—'));
  box.appendChild(csRow(doc, 'توکن کلادفلر', record.cf_token_set ? 'ذخیره شده' : '— اختیاری'));
  if (insecure) {
    box.appendChild(
      csEl(
        doc,
        'p',
        'cloud-warn',
        'هشدار: مخزن امن سیستم در دسترس نبود و رازها در حافظهٔ محلی نگه‌داری شده‌اند. پس از راه‌اندازی کامل پوسته، اتصال را دوباره ذخیره کنید.'
      )
    );
  }
  return box;
}
