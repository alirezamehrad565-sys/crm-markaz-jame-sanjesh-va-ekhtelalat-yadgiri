/**
 * rust-f3 — آزمون اورلی: هایلایت/حباب/دکمه‌ها/فوکوس/Escape/پاک‌سازی کامل
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTutorialOverlay, isTutorialOverlayOpen } from '../tutorial/overlay.js';
import type { TutorialOverlayHandlers } from '../tutorial/overlay.js';
import type { TutorialStep } from '../tutorial/steps.js';
import { FakeDocument, FakeElement } from './tutorial-fakes.js';

function bubbleOf(doc: FakeDocument): FakeElement {
  const b = doc.body.findByClass('tutorial-bubble');
  if (!b) throw new Error('حباب تور در body نیست');
  return b;
}

function buttonsOf(doc: FakeDocument): FakeElement[] {
  return bubbleOf(doc).buttons();
}

function byText(doc: FakeDocument, text: string): FakeElement {
  const hit = buttonsOf(doc).find((b) => b.textContent === text);
  if (!hit) throw new Error(`دکمهٔ «${text}» پیدا نشد`);
  return hit;
}

const STEPS: TutorialStep[] = [
  { id: 't1', role: 'manager', title: 'گام یک', text: 'متن گام یک تور', path: '#/dashboard', selector: '[data-nav="#/dashboard"]' },
  { id: 't2', role: 'manager', title: 'گام دو', text: 'متن گام دو تور', path: '#/reports', selector: '[data-nav="#/reports"]' },
  { id: 't3', role: 'manager', title: 'گام سه', text: 'متن گام سه تور', path: '#/settings', selector: null }
];

function handlers(): TutorialOverlayHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onNext: (i) => calls.push(`next:${i}`),
    onPrev: (i) => calls.push(`prev:${i}`),
    onSkip: (r) => calls.push(`skip:${r}`)
  };
}

let doc: FakeDocument;
let navItems: FakeElement[];

beforeEach(() => {
  navItems = ['#/', '#/dashboard', '#/reports', '#/settings'].map((h) => {
    const b = new FakeElement('button');
    b.dataset['nav'] = h;
    b.rect = { top: 100, left: 50, width: 160, height: 36 };
    return b;
  });
  doc = new FakeDocument(navItems);
});

describe('tutorial-overlay — ساخت و نمایش', () => {
  it('گام با سلکتور: هایلایت + حباب (عنوان/متن/شمارنده) در body می‌نشیند', () => {
    const h = handlers();
    const ov = createTutorialOverlay(doc, STEPS, h);
    ov!.show(0);
    expect(doc.body.findByClass('tutorial-highlight')).not.toBeNull();
    const bubble = bubbleOf(doc);
    expect(bubble.textContent).toContain('گام یک');
    expect(bubble.textContent).toContain('متن گام یک تور');
    expect(bubble.textContent).toContain('گام ۱ از ۳');
  });

  it('گام بدون سلکتور: بدون هایلایت، حباب مرکزی', () => {
    const ov = createTutorialOverlay(doc, STEPS, handlers());
    ov!.show(2);
    expect(doc.body.findByClass('tutorial-highlight')).toBeNull();
    expect(bubbleOf(doc).style['transform']).toContain('translate');
  });
});

describe('tutorial-overlay — کنترل‌ها', () => {
  it('برچسب «بعدی» در گام اول، «پایان» در گام آخر + فوکوس روی دکمهٔ بعدی', () => {
    const ov = createTutorialOverlay(doc, STEPS, handlers());
    ov!.show(0);
    expect(byText(doc, 'بعدی')).toBeDefined();
    expect(byText(doc, 'بعدی').focused).toBe(true);
    ov!.show(2);
    expect(byText(doc, 'پایان')).toBeDefined();
  });

  it('«قبلی» در گام اول disabled و در گام دوم فعال است', () => {
    const ov = createTutorialOverlay(doc, STEPS, handlers());
    ov!.show(0);
    expect(byText(doc, 'قبلی').attrs['disabled']).toBe('true');
    ov!.show(1);
    expect(byText(doc, 'قبلی').attrs['disabled']).toBeUndefined();
  });

  it('کلیک بعدی/قبلی/رد کردن هندلر درست را با ایندکس جاری صدا می‌زند', () => {
    const h = handlers();
    const ov = createTutorialOverlay(doc, STEPS, h);
    ov!.show(1);
    byText(doc, 'بعدی').click();
    byText(doc, 'قبلی').click();
    byText(doc, 'رد کردن').click();
    expect(h.calls).toEqual(['next:1', 'prev:1', 'skip:button']);
    expect(isTutorialOverlayOpen()).toBe(true);
  });

  it('Escape = رد کردن تور (هر لحظه) و شنوندهٔ سند پس از بستن برداشته می‌شود', () => {
    const h = handlers();
    const ov = createTutorialOverlay(doc, STEPS, h);
    ov!.show(0);
    expect(doc.listenerCount('keydown')).toBe(1);
    doc.keydown({ key: 'Escape' });
    expect(h.calls).toEqual(['skip:escape']);
    ov!.close();
    expect(doc.listenerCount('keydown')).toBe(0);
  });

  it('بستن همهٔ عناصر تور را از body پاک می‌کند و اورلی دوم، اولی را واقعاً می‌بندد', () => {
    const ov1 = createTutorialOverlay(doc, STEPS, handlers());
    ov1!.show(0);
    const ov2 = createTutorialOverlay(doc, STEPS, handlers());
    ov2!.show(1);
    expect(doc.body.findByClass('tutorial-bubble')).not.toBeNull();
    const bubbles = doc.body.children.filter((c) => c.className.includes('tutorial-bubble'));
    expect(bubbles).toHaveLength(1); // حبابِ اورلی اول پاک شده است
    ov2!.close();
    expect(doc.body.findByClass('tutorial-bubble')).toBeNull();
    expect(doc.body.findByClass('tutorial-highlight')).toBeNull();
    expect(isTutorialOverlayOpen()).toBe(false);
  });
});
