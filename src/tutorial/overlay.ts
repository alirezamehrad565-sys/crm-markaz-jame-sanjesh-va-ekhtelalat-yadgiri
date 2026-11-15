/**
 * rust-f3 — کنترلر اورلیِ تور: هایلایت + حباب گام + قبلی/بعدی/رد کردن + Escape = رد
 *
 * - سند DOM تزریقی است (dom-build) تا آزمون‌ها بدون مرورگر اجرا شوند.
 * - Escape در هر لحظه = «رد کردن» (قاعدهٔ «هرگز مسیر قفل نشود»).
 * - فوکوس بعد از هر گام روی دکمهٔ بعدی/پایان برمی‌گردد تا پیمایش با کیبورد هم روان باشد.
 * - بستن اورلی همهٔ عناصر و شنونده‌ها را پاک می‌کند — هیچ ردی از تور در DOM نمی‌ماند.
 */

import type { KeydownEvent, TutDocument, TutElement } from './dom-build.js';
import {
  buildBubble,
  buildBubbleControls,
  buildHighlight,
  findStepTarget
} from './dom-build.js';
import type { TutorialStep } from './steps.js';

export interface TutorialOverlayHandlers {
  /** کاربر «بعدی/پایان» زد — روی گام آخر یعنی اتمام */
  onNext(index: number): void;
  /** کاربر «قبلی» زد */
  onPrev(index: number): void;
  /** کاربر «رد کردن» زد یا Escape زد */
  onSkip(reason: 'button' | 'escape'): void;
}

export interface TutorialOverlay {
  show(index: number): void;
  close(): void;
  isOpen: boolean;
}

/** تنها اورلی زندهٔ کل صفحه — اورلی موازی ممنوع (ساخت دومی، اولی را واقعاً می‌بندد) */
let currentOverlay: TutorialOverlay | null = null;

export function isTutorialOverlayOpen(): boolean {
  return currentOverlay !== null;
}

/** بستن اورلی زنده — برای «اجرای دوباره» و گارد اورلی موازی */
export function closeTutorialOverlay(): void {
  currentOverlay?.close();
  currentOverlay = null;
}

/**
 * ساخت اورلی برای فهرست گام‌ها. تا فراخوانی show، هیچ چیزی در DOM نمی‌نشیند.
 * doc تزریقی است؛ null یا فهرست گام خالی یعنی اورلی ساختنی نیست (null برمی‌گردد).
 */
export function createTutorialOverlay(
  doc: TutDocument | null,
  steps: TutorialStep[],
  handlers: TutorialOverlayHandlers
): TutorialOverlay | null {
  if (!doc) return null;
  if (steps.length === 0) return null;
  if (currentOverlay) closeTutorialOverlay(); // اورلی قبلی: DOM و شنونده‌ها کامل پاک می‌شوند

  const opened: TutElement[] = [];
  const keydown = (ev?: unknown) => {
    const e = ev as KeydownEvent | undefined;
    if (e && e.key === 'Escape') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      handlers.onSkip('escape');
    }
  };
  let closed = false;
  let currentIndex = 0;

  const mount = (index: number) => {
    const step = steps[index];
    if (!step) return;
    const rect = findStepTarget(doc, step.selector);
    const controls = buildBubbleControls(doc, index, steps.length);
    controls.nextBtn.textContent = index === steps.length - 1 ? 'پایان' : 'بعدی';
    if (index === 0) {
      controls.prevBtn.setAttribute('disabled', 'true');
      controls.prevBtn.setAttribute('aria-disabled', 'true');
    }

    controls.nextBtn.addEventListener('click', () => handlers.onNext(currentIndex));
    controls.prevBtn.addEventListener('click', () => handlers.onPrev(currentIndex));
    controls.skipBtn.addEventListener('click', () => handlers.onSkip('button'));

    const bubble = buildBubble(doc, step.title, step.text, controls, rect);
    const highlight = rect ? buildHighlight(doc, rect) : null;

    if (highlight) doc.body.appendChild(highlight);
    doc.body.appendChild(bubble);
    if (highlight) opened.push(highlight);
    opened.push(bubble);
    controls.nextBtn.focus();
  };

  const overlay: TutorialOverlay = {
    isOpen: false,
    show(index: number) {
      if (closed) return;
      for (const el of opened) el.remove();
      opened.length = 0;
      currentIndex = Math.max(0, Math.min(index, steps.length - 1));
      mount(currentIndex);
      if (!this.isOpen) {
        this.isOpen = true;
        currentOverlay = overlay;
        doc.addEventListener('keydown', keydown);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      for (const el of opened) el.remove();
      opened.length = 0;
      doc.removeEventListener('keydown', keydown);
      this.isOpen = false;
      if (currentOverlay === overlay) currentOverlay = null;
    }
  };

  return overlay;
}
