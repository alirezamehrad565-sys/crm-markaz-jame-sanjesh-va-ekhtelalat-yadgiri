/**
 * rust-f3 — آزمون فِیک‌های DOM/انبار (پایهٔ اعتبار آزمون‌های overlay و gate)
 */

import { describe, expect, it } from 'vitest';
import { FakeDocument, FakeElement, FakeStore, fakeNavItem } from './tutorial-fakes.js';

describe('tutorial-fakes — انبار درون‌حافظه‌ای', () => {
  it('مقدار را نگه می‌دارد و ترتیب نوشته‌ها را ثبت می‌کند', () => {
    const store = new FakeStore();
    expect(store.getItem('k')).toBeNull();
    store.setItem('k', 'v1');
    store.setItem('k', 'v2');
    store.removeItem('x');
    expect(store.getItem('k')).toBe('v2');
    expect(store.writes).toEqual([
      { key: 'k', value: 'v1' },
      { key: 'k', value: 'v2' },
      { key: 'x', value: '' }
    ]);
  });
});

describe('tutorial-fakes — عنصر و سند مینیمال', () => {
  it('dataset آیتم سایدبار با سلکتور data-nav تور تطبیق می‌کند', () => {
    const item = fakeNavItem('#/reports');
    expect(FakeDocument.prototype.querySelector).toBeTypeOf('function'); // قرارداد سند حفظ است
    const doc = new FakeDocument([item]);
    expect(doc.querySelector('[data-nav="#/reports"]')).toBe(item);
    expect(doc.querySelector('[data-nav="#/backup"]')).toBeNull();
  });

  it('remove عنصر را از والد جدا می‌کند و پرچم removed می‌گذارد', () => {
    const parent = new FakeElement('div');
    const child = new FakeElement('div');
    parent.appendChild(child);
    expect(parent.children).toHaveLength(1);
    child.remove();
    expect(child.removed).toBe(true);
    expect(child.parentElement).toBeNull();
    expect(parent.children).toHaveLength(0);
  });

  it('click شنونده‌های کلیک را به ترتیب ثبت شلیک می‌کند', () => {
    const btn = new FakeElement('button');
    const calls: number[] = [];
    btn.addEventListener('click', () => calls.push(1));
    btn.addEventListener('click', () => calls.push(2));
    btn.click();
    expect(calls).toEqual([1, 2]);
  });

  it('keydown سطح سند به همهٔ شنونده‌ها می‌رسد و removeEventListener می‌شمارَدش را کم می‌کند', () => {
    const doc = new FakeDocument([]);
    const seen: string[] = [];
    const l1 = (ev?: unknown) => seen.push(`l1:${(ev as { key: string }).key}`);
    const l2 = () => seen.push('l2');
    doc.addEventListener('keydown', l1);
    doc.addEventListener('keydown', l2);
    doc.keydown({ key: 'Escape' });
    expect(seen).toEqual(['l1:Escape', 'l2']);
    doc.removeEventListener('keydown', l1);
    expect(doc.listenerCount('keydown')).toBe(1);
  });
});
