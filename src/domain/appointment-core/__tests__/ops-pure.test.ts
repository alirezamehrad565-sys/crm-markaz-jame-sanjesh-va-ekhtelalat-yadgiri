/**
 * تست‌های واحد — ops-pure
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۱ — تست pure ماتریس ترنزیشن وضعیت عملیاتی (تصمیم D1)

import { describe, expect, it } from 'vitest';
import { APPOINTMENT_OPS_STATUSES } from '@core/shared';
import {
  OPS_STATUS_TRANSITIONS,
  canTransitionOps,
  opsFromDb,
  opsTransitionMessage
} from '../pure';
import type { OpsFrom } from '../pure';

const ALL: OpsFrom[] = ['none', ...APPOINTMENT_OPS_STATUSES];

describe('ماتریس ترنزیشن وضعیت عملیاتی (D1)', () => {
  it('T1 — حالت شروع (NULL): فقط آمد/تأخیر/نیامد مجاز است', () => {
    expect(canTransitionOps('none', 'checked_in')).toBe(true);
    expect(canTransitionOps('none', 'delayed')).toBe(true);
    expect(canTransitionOps('none', 'no_show')).toBe(true);
    // شروع مستقیم جلسه یا پرش به پایان‌حالت ممنوع
    expect(canTransitionOps('none', 'in_session')).toBe(false);
    expect(canTransitionOps('none', 'completed')).toBe(false);
  });

  it('T2 — آمد: شروع جلسه یا نیامد؛ برگشت به برنامه‌ریزی‌شده و تأخیر ممنوع', () => {
    expect(canTransitionOps('checked_in', 'in_session')).toBe(true);
    expect(canTransitionOps('checked_in', 'no_show')).toBe(true);
    expect(canTransitionOps('checked_in', 'delayed')).toBe(false);
    expect(canTransitionOps('checked_in', 'completed')).toBe(false);
  });

  it('T3 — تأخیر: می‌تواند آمد شود، جلسه‌اش شروع شود یا نیامد ثبت شود', () => {
    expect(canTransitionOps('delayed', 'checked_in')).toBe(true);
    expect(canTransitionOps('delayed', 'in_session')).toBe(true);
    expect(canTransitionOps('delayed', 'no_show')).toBe(true);
    expect(canTransitionOps('delayed', 'completed')).toBe(false);
  });

  it('T4 — در جلسه: فقط اتمام جلسه مجاز است', () => {
    expect(canTransitionOps('in_session', 'completed')).toBe(true);
    expect(canTransitionOps('in_session', 'no_show')).toBe(false);
    expect(canTransitionOps('in_session', 'checked_in')).toBe(false);
    expect(canTransitionOps('in_session', 'delayed')).toBe(false);
  });

  it('T5 — پایان‌حالت‌ها (انجام شد / نیامد) هیچ ترنزیشنی ندارند', () => {
    for (const from of ['completed', 'no_show'] as const) {
      for (const to of APPOINTMENT_OPS_STATUSES) {
        expect(canTransitionOps(from, to)).toBe(false);
      }
    }
  });

  it('T6 — همان‌وضعیت همیشه غیرمجاز است (سمت سرویس idempotent no-op می‌شود)', () => {
    for (const s of ALL) {
      if (s === 'none') continue; // 'none' مقدار DB نیست
      expect(canTransitionOps(s, s as never)).toBe(false);
    }
  });

  it('T7 — ماتریس همهٔ وضعیت‌ها را پوشش می‌دهد (exhaustive)', () => {
    expect(Object.keys(OPS_STATUS_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it('T8 — opsFromDb: NULL/غایب → none؛ مقدار موجود عبور می‌کند', () => {
    expect(opsFromDb(null)).toBe('none');
    expect(opsFromDb(undefined)).toBe('none');
    expect(opsFromDb('checked_in')).toBe('checked_in');
    expect(opsFromDb('completed')).toBe('completed');
  });

  it('T9 — پیام خطای ترنزیشن نامعتبر actionable است (§33)', () => {
    const msg = opsTransitionMessage('none', 'completed');
    expect(msg).toContain('مجاز');
    expect(msg).toContain('آمد'); // اقدام مجاز بعدی را نام می‌برد

    const doneMsg = opsTransitionMessage('completed', 'checked_in');
    expect(doneMsg).toContain('انجام شد');
    expect(doneMsg).toContain('تغییر نمی‌کند');

    const noShowMsg = opsTransitionMessage('no_show', 'checked_in');
    expect(noShowMsg).toContain('نیامد');
  });
});
