/**
 * rust-f3 — آزمون وضعیت: ترانزیشن‌های not_started → active → completed/skipped + reset
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  TUTORIAL_STATE_KEY,
  advanceTutorialState,
  completeTutorialState,
  loadTutorialState,
  localStorageStore,
  resetTutorialState,
  setTutorialStore,
  skipTutorialState,
  startTutorialState,
  tutorialShouldAutoStart
} from '../tutorial/state.js';
import { FakeStore } from './tutorial-fakes.js';

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
  setTutorialStore(store);
});

describe('tutorial-state — خواندن امن', () => {
  it('بدون رکورد، وضعیت آغازین not_started است', () => {
    expect(loadTutorialState()).toEqual({
      status: 'not_started', stepIndex: 0, role: null, updatedAt: null
    });
  });

  it('JSON خراب، وضعیت ناشناخته یا ایندکس منفی → پاک‌سازی به وضعیت سالم', () => {
    store.setItem(TUTORIAL_STATE_KEY, '{شکسته');
    expect(loadTutorialState().status).toBe('not_started');
    store.setItem(TUTORIAL_STATE_KEY, JSON.stringify({ status: 'hacked', stepIndex: -3 }));
    const rec = loadTutorialState();
    expect(rec.status).toBe('not_started');
    store.setItem(TUTORIAL_STATE_KEY, JSON.stringify({ status: 'active', stepIndex: -3 }));
    expect(loadTutorialState().stepIndex).toBe(0);
  });
});

describe('tutorial-state — ترانزیشن‌ها', () => {
  it('آغاز: not_started → active با نقش و ایندکس صفر و ماندگاری در انبار', () => {
    const rec = startTutorialState('manager');
    expect(rec.status).toBe('active');
    expect(rec.stepIndex).toBe(0);
    expect(rec.role).toBe('manager');
    const fromStore = JSON.parse(store.getItem(TUTORIAL_STATE_KEY) ?? '{}');
    expect(fromStore.status).toBe('active');
    expect(loadTutorialState().role).toBe('manager');
  });

  it('آغاز در حالت active دست‌نخورده است (ادامه از محل قطع)', () => {
    startTutorialState('manager');
    advanceTutorialState(3);
    const again = startTutorialState('manager');
    expect(again.stepIndex).toBe(3);
  });

  it('جلو رفتن گام ایندکس را در انبار می‌نویسد', () => {
    startTutorialState('secretary');
    advanceTutorialState(2);
    expect(loadTutorialState().stepIndex).toBe(2);
    expect(store.writes.length).toBeGreaterThanOrEqual(2);
  });

  it('منفی: advance/complete/skip از not_started هیچ تغییری نمی‌دهد', () => {
    expect(advanceTutorialState(5).status).toBe('not_started');
    expect(completeTutorialState().status).toBe('not_started');
    expect(skipTutorialState().status).toBe('not_started');
    expect(store.writes).toHaveLength(0);
  });

  it('اتمام از active: completed با ایندکس صفر و خواندن مجدد از انبار همان', () => {
    startTutorialState('therapist');
    advanceTutorialState(4);
    completeTutorialState();
    expect(loadTutorialState()).toMatchObject({ status: 'completed', stepIndex: 0, role: 'therapist' });
  });

  it('رد کردن از active: skipped — «رد کردن» هیچ مسیری را قفل نمی‌کند', () => {
    startTutorialState('manager');
    skipTutorialState();
    expect(loadTutorialState().status).toBe('skipped');
  });

  it('reset برای «اجرای دوباره»: به not_started برمی‌گردد و انبار بازنویسی می‌شود', () => {
    startTutorialState('manager');
    completeTutorialState();
    resetTutorialState();
    expect(loadTutorialState().status).toBe('not_started');
    expect(store.writes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('tutorial-state — سیاست شروع خودکار', () => {
  it('not_started بله؛ completed/skipped خیر؛ نیمه‌کارهٔ همان نقش بله و نقش دیگر خیر', () => {
    expect(tutorialShouldAutoStart('manager')).toBe(true);
    startTutorialState('manager');
    completeTutorialState();
    expect(tutorialShouldAutoStart('manager')).toBe(false);
    resetTutorialState();
    startTutorialState('manager');
    skipTutorialState();
    expect(tutorialShouldAutoStart('manager')).toBe(false);
    resetTutorialState();
    startTutorialState('secretary');
    advanceTutorialState(2);
    expect(tutorialShouldAutoStart('secretary')).toBe(true);
    expect(tutorialShouldAutoStart('manager')).toBe(false);
  });
});
