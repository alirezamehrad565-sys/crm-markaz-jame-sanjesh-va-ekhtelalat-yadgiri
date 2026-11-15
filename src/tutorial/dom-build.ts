/**
 * rust-f3 — لایهٔ DOM باریک توتوریال
 *
 * tsconfig پروژه lib:DOM ندارد (کد سرور-سازگار است)؛ پس فقط همان قلمرو کوچکی که تور
 * لازم دارد، با اینترفیس‌های ساختاریِ خودش تعریف می‌شود. در مرورگر همین اینترفیس‌ها با
 * document واقعی سازگارند (cast ساختاری، بدون any)، و در آزمون‌ها با فِیک مینیمال.
 *
 * قواعد فاز ۳: بدون CSS تازه (همه‌چیز style درون‌خطی)، بدون وابستگی npm،
 * بدون import از public/assets/js (ماژول تور کاملاً خودبسنده است).
 */

/* ——— اینترفیس‌های باریک (زیرمجموعهٔ ساختاری DOM واقعی) ——— */

export interface TutRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TutElement {
  tagName: string;
  className: string;
  textContent: string;
  readonly children: TutElement[];
  readonly parentElement: TutElement | null;
  style: Record<string, string>;
  dataset: Record<string, string>;
  appendChild(child: TutElement): TutElement;
  removeChild(child: TutElement): TutElement;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: (ev?: unknown) => void): void;
  removeEventListener(type: string, listener: (ev?: unknown) => void): void;
  remove(): void;
  focus(): void;
  querySelector(selector: string): TutElement | null;
  getBoundingClientRect(): TutRect;
}

export interface TutDocument {
  createElement(tagName: string): TutElement;
  body: TutElement;
  documentElement: TutElement;
  querySelector(selector: string): TutElement | null;
  querySelectorAll(selector: string): TutElement[];
  addEventListener(type: string, listener: (ev?: unknown) => void): void;
  removeEventListener(type: string, listener: (ev?: unknown) => void): void;
}

export type KeydownEvent = { key?: unknown; preventDefault?: () => void };

/** دسترسی گاردشده به document واقعی؛ نبودش (سرور/آزمون node) یعنی null */
export function defaultTutorialDocument(): TutDocument | null {
  const d = (globalThis as { document?: unknown }).document;
  if (!d || typeof (d as { createElement?: unknown }).createElement !== 'function') return null;
  return d as unknown as TutDocument;
}

/** یک عنصر تازه با class و style درون‌خطی */
export function tutEl(doc: TutDocument, tag: string, className: string, styleCss: Record<string, string>): TutElement {
  const el = doc.createElement(tag);
  el.className = className;
  Object.assign(el.style, styleCss);
  return el;
}

/** ارقام فارسی — ماژول تور خودبسنده است و از format.js وب import نمی‌کند */
export function faDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** ردیف دکمه‌های حباب: [قبلی] [گام i از n] [بعدی/پایان] + دکمهٔ مستقل «رد کردن» */
export interface BubbleControls {
  row: TutElement;
  prevBtn: TutElement;
  nextBtn: TutElement;
  skipBtn: TutElement;
  progress: TutElement;
}

export function buildBubbleControls(doc: TutDocument, index: number, total: number): BubbleControls {
  const row = tutEl(doc, 'div', 'tutorial-controls', {
    display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px',
    direction: 'rtl'
  });

  const prevBtn = doc.createElement('button');
  prevBtn.className = 'btn btn--soft btn--sm';
  prevBtn.setAttribute('type', 'button');
  prevBtn.textContent = 'قبلی';

  const progress = tutEl(doc, 'span', 'tutorial-progress', {
    fontSize: '12px', opacity: '0.85', flex: '1', textAlign: 'center'
  });
  progress.textContent = `گام ${faDigits(index + 1)} از ${faDigits(total)}`;

  const nextBtn = doc.createElement('button');
  nextBtn.className = 'btn btn--primary btn--sm';
  nextBtn.setAttribute('type', 'button');
  nextBtn.textContent = 'بعدی';

  row.appendChild(prevBtn);
  row.appendChild(progress);
  row.appendChild(nextBtn);

  const skipBtn = doc.createElement('button');
  skipBtn.className = 'btn btn--ghost btn--sm';
  skipBtn.setAttribute('type', 'button');
  skipBtn.textContent = 'رد کردن';

  return { row, prevBtn, progress, nextBtn, skipBtn };
}

/** جعبهٔ هایلایت روی عنصر هدف — قاب درون‌خطی، بدون CSS تازه */
export function buildHighlight(doc: TutDocument, rect: TutRect): TutElement {
  const pad = 6;
  const box = tutEl(doc, 'div', 'tutorial-highlight', {
    position: 'fixed',
    top: `${Math.max(0, rect.top - pad)}px`,
    left: `${Math.max(0, rect.left - pad)}px`,
    width: `${rect.width + pad * 2}px`,
    height: `${rect.height + pad * 2}px`,
    border: '2px solid var(--primary, #4f6ef7)',
    borderRadius: '10px',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'none',
    zIndex: '2147483646',
    transition: 'top .2s, left .2s, width .2s, height .2s'
  });
  box.setAttribute('aria-hidden', 'true');
  return box;
}

/**
 * حباب توضیح گام — کنار هدف (زیر یا بالای آن) یا وسط صفحه وقتی هدفی نیست.
 * عرض حباب محدود است تا در پنجره‌های کوچک هم سالم بماند.
 */
export function buildBubble(
  doc: TutDocument,
  title: string,
  text: string,
  controls: BubbleControls,
  anchor: TutRect | null
): TutElement {
  const bubble = tutEl(doc, 'div', 'tutorial-bubble', {
    position: 'fixed',
    maxWidth: '340px',
    background: 'var(--surface, #fff)',
    color: 'var(--text, #1c2333)',
    border: '1px solid var(--border, #dfe4ef)',
    borderRadius: '12px',
    padding: '14px 16px',
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.25)',
    zIndex: '2147483647',
    direction: 'rtl'
  });

  const h = tutEl(doc, 'h3', 'tutorial-bubble__title', {
    margin: '0 0 6px', fontSize: '14px', fontWeight: '700'
  });
  h.textContent = title;

  const p = tutEl(doc, 'p', 'tutorial-bubble__text', {
    margin: '0', fontSize: '13px', lineHeight: '1.9'
  });
  p.textContent = text;

  bubble.appendChild(h);
  bubble.appendChild(p);
  bubble.appendChild(controls.row);
  bubble.appendChild(controls.skipBtn);
  controls.skipBtn.style.marginTop = '8px';

  const w = 340;
  const estH = 190;
  // دسترسی باریک به viewport — بدون lib DOM در tsconfig
  const viewport = globalThis as { innerWidth?: number; innerHeight?: number };
  if (anchor && anchor.width > 0) {
    const below = anchor.top + anchor.height + 12;
    const fitsBelow = below + estH < (viewport.innerHeight ?? 100000);
    const top = fitsBelow ? below : Math.max(8, anchor.top - estH - 12);
    const left = Math.min(
      Math.max(8, anchor.left + anchor.width / 2 - w / 2),
      Math.max(8, (viewport.innerWidth ?? 1200) - w - 8)
    );
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.left = `${Math.round(left)}px`;
  } else {
    bubble.style.top = '50%';
    bubble.style.left = '50%';
    bubble.style.transform = 'translate(50%, -50%)';
  }
  return bubble;
}

/** یافتن عنصر هدف گام با سلکتور — در سند تزریقی؛ null یعنی «بدون هایلایت، حباب مرکزی» */
export function findStepTarget(doc: TutDocument, selector: string | null): TutRect | null {
  if (!selector) return null;
  let el: TutElement | null = null;
  try {
    el = doc.querySelector(selector);
  } catch {
    return null; // سلکتور نامعتبر هرگز نباید تور را بیندازد
  }
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!rect || typeof rect.top !== 'number') return null;
  return rect;
}

/** بخش «اجرای دوبارهٔ راهنمای شروع» برای نمای تنظیمات (فقط دسکتاپ) */
export function buildRerunSection(doc: TutDocument, onRerun: () => void): TutElement {
  const section = tutEl(doc, 'div', 'settings-section tutorial-rerun', {
    marginTop: 'var(--sp-3, 16px)'
  });

  const h = tutEl(doc, 'h3', '', { margin: '0 0 6px' });
  h.textContent = 'راهنمای شروع';

  const p = tutEl(doc, 'p', 'hint-text', { margin: '0 0 10px' });
  p.textContent =
    'تور نقش‌محورِ آشنایی با صفحه‌های مرکز. اگر در نخستین ورود ردش کردید یا می‌خواهید دوباره ببینید، از همین‌جا اجرایش کنید.';

  const btn = doc.createElement('button');
  btn.className = 'btn btn--soft btn--sm';
  btn.setAttribute('type', 'button');
  btn.textContent = 'اجرای دوبارهٔ راهنمای شروع';
  btn.addEventListener('click', () => onRerun());

  section.appendChild(h);
  section.appendChild(p);
  section.appendChild(btn);
  return section;
}
