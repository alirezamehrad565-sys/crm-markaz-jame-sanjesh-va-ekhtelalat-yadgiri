/**
 * rust-f3 — فِیک‌های مینیمال برای آزمون توتوریال بدون مرورگر
 *
 * محیط vitest پروژه node است و lib DOM ندارد؛ این فایل همان قلمروی کوچکی که
 * dom-build/overlay/run لازم دارند را شبیه‌سازی می‌کند: عنصر، سند، انبار، ناوبر.
 */

import type { TutDocument, TutElement, TutRect } from '../tutorial/dom-build.js';

/** تطبیق سادهٔ سلکتور موردنیاز تور: [data-nav="#/x"] و .class */
export function fakeMatches(el: FakeElement, selector: string): boolean {
  const dataNav = selector.match(/^\[data-nav="([^"]+)"\]$/);
  if (dataNav) return el.dataset['nav'] === dataNav[1];
  if (selector.startsWith('.')) return el.className.split(' ').includes(selector.slice(1));
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

export class FakeElement implements TutElement {
  tagName: string;
  className = '';
  private _text = '';
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  readonly listeners: Record<string, Array<(ev?: unknown) => void>> = {};
  rect: TutRect = { top: 0, left: 0, width: 0, height: 0 };
  focused = false;
  removed = false;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  /* همان معنای DOM واقعی: خواندن = متن خود + همهٔ نوادگان */
  get textContent(): string {
    return this._text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(value: string) {
    this._text = value ?? '';
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): FakeElement {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentElement = null;
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  addEventListener(type: string, listener: (ev?: unknown) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: (ev?: unknown) => void): void {
    const arr = this.listeners[type];
    if (!arr) return;
    const i = arr.indexOf(listener);
    if (i >= 0) arr.splice(i, 1);
  }

  remove(): void {
    this.removed = true;
    if (this.parentElement) this.parentElement.removeChild(this);
  }

  focus(): void {
    this.focused = true;
  }

  querySelector(selector: string): TutElement | null {
    for (const c of this.children) {
      if (fakeMatches(c, selector)) return c;
      const deep = c.querySelector(selector);
      if (deep) return deep;
    }
    return null;
  }

  getBoundingClientRect(): TutRect {
    return this.rect;
  }

  /** راحتی آزمون: شلیک رویداد کلیک */
  click(): void {
    for (const l of [...(this.listeners['click'] ?? [])]) l();
  }

  /** جست‌وجوی زیردرخت بر اساس class */
  findByClass(cls: string): FakeElement | null {
    if (this.className.split(' ').includes(cls)) return this;
    for (const c of this.children) {
      const hit = c.findByClass(cls);
      if (hit) return hit;
    }
    return null;
  }

  /** همهٔ دکمه‌های زیردرخت */
  buttons(): FakeElement[] {
    const out: FakeElement[] = [];
    if (this.tagName === 'BUTTON') out.push(this);
    for (const c of this.children) out.push(...c.buttons());
    return out;
  }
}

export class FakeDocument implements TutDocument {
  readonly body = new FakeElement('body');
  readonly documentElement = new FakeElement('html');
  readonly created: FakeElement[] = [];
  private readonly items: FakeElement[];
  private readonly docListeners: Record<string, Array<(ev?: unknown) => void>> = {};

  constructor(matchables: FakeElement[] = []) {
    this.items = matchables;
  }

  createElement(tagName: string): FakeElement {
    const el = new FakeElement(tagName);
    this.created.push(el);
    return el;
  }

  querySelector(selector: string): TutElement | null {
    return this.items.find((i) => fakeMatches(i, selector)) ?? null;
  }

  querySelectorAll(selector: string): TutElement[] {
    return this.items.filter((i) => fakeMatches(i, selector));
  }

  addEventListener(type: string, listener: (ev?: unknown) => void): void {
    (this.docListeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: (ev?: unknown) => void): void {
    const arr = this.docListeners[type];
    if (!arr) return;
    const i = arr.indexOf(listener);
    if (i >= 0) arr.splice(i, 1);
  }

  /** راحتی آزمون: شلیک keydown در سطح سند */
  keydown(ev: { key?: string; preventDefault?: () => void }): void {
    for (const l of [...(this.docListeners['keydown'] ?? [])]) l(ev);
  }

  listenerCount(type: string): number {
    return (this.docListeners[type] ?? []).length;
  }
}

/** انبار درون‌حافظه‌ای با ثبت ترتیب نوشته‌ها */
export class FakeStore {
  private readonly map = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string }> = [];

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
    this.writes.push({ key, value });
  }

  removeItem(key: string): void {
    this.map.delete(key);
    this.writes.push({ key, value: '' });
  }
}

/** سازندهٔ آیتم سایدبار — همان قرارداد dataset: { nav: hash } در buildSidebar */
export function fakeNavItem(hash: string): FakeElement {
  const btn = new FakeElement('button');
  btn.className = 'nav__item';
  btn.dataset['nav'] = hash;
  return btn;
}

/** یک مکث کوتاه برای رسیدن به تعهدات async داخلی (void gotoStep) */
export async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
