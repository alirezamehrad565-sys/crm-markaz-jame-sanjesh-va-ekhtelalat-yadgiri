/**
 * تست‌های واحد — schema
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// schema.test.ts — فاز ۳: اعتبارسنجی ورودی ساخت/ویرایش پیگیری (Zod — مرز عمومی @core/shared)

import { describe, it, expect } from 'vitest';
import { NewFollowUpSchema, UpdateFollowUpSchema } from '@core/shared';

const VALID = {
  entity_type: 'appointment',
  entity_id: '11111111-1111-1111-1111-111111111111',
  title: 'تماس با خانواده برای پیگیری تمرین‌ها',
  assignee_id: '00000000-0000-0000-0000-000000000004',
  due_at: '2026-10-14T08:00:00.000Z'
};

describe('فاز ۳ — NewFollowUpSchema', () => {
  it('بدنهٔ کامل معتبر — title می‌تراشد', () => {
    const parsed = NewFollowUpSchema.parse({ ...VALID, title: '  عنوان با فاصله  ' });
    expect(parsed.title).toBe('عنوان با فاصله');
    expect(parsed.entity_type).toBe('appointment');
  });

  it('entity_type خارج از enum — رد می‌شود (توسعهٔ آینده فقط از constants، نه ورودی آزاد)', () => {
    expect(() => NewFollowUpSchema.parse({ ...VALID, entity_type: 'todo' })).toThrow();
  });

  it('عنوان خیلی کوتاه/طولانی — رد می‌شود (۲ تا ۲۰۰ نویسه)', () => {
    expect(() => NewFollowUpSchema.parse({ ...VALID, title: 'ک' })).toThrow();
    expect(() => NewFollowUpSchema.parse({ ...VALID, title: 'ا'.repeat(201) })).toThrow();
    expect(NewFollowUpSchema.parse({ ...VALID, title: 'ا'.repeat(200) }).title).toHaveLength(200);
  });

  it('assignee_id و entity_id اجباری‌اند؛ student_id اختیاری/nullable است', () => {
    const { assignee_id, ...noAssignee } = VALID;
    expect(() => NewFollowUpSchema.parse(noAssignee)).toThrow();
    const { entity_id, ...noEntity } = VALID;
    expect(() => NewFollowUpSchema.parse(noEntity)).toThrow();
    expect(NewFollowUpSchema.parse({ ...VALID, student_id: null }).student_id).toBeNull();
    expect(() => NewFollowUpSchema.parse({ ...VALID, student_id: 'not-uuid' })).toThrow();
  });

  it('due_at باید ISO قابل‌پارس باشد؛ حذف آن مجاز است', () => {
    expect(() => NewFollowUpSchema.parse({ ...VALID, due_at: 'دیروز' })).toThrow();
    const { due_at, ...noDue } = VALID;
    expect(NewFollowUpSchema.parse(noDue).due_at).toBeUndefined();
  });
});

describe('فاز ۳ — UpdateFollowUpSchema', () => {
  it('بدنهٔ خالی رد می‌شود — حداقل یکی از وضعیت/مسئول/مهلت لازم است', () => {
    expect(() => UpdateFollowUpSchema.parse({})).toThrow();
  });

  it('تک‌فیلدها مجازند — status، assignee_id، due_at (شامل null برای حذف مهلت)', () => {
    expect(UpdateFollowUpSchema.parse({ status: 'done' }).status).toBe('done');
    expect(UpdateFollowUpSchema.parse({ assignee_id: VALID.assignee_id }).assignee_id).toBe(VALID.assignee_id);
    expect(UpdateFollowUpSchema.parse({ due_at: null }).due_at).toBeNull();
    expect(() => UpdateFollowUpSchema.parse({ status: 'bogus' })).toThrow();
    expect(() => UpdateFollowUpSchema.parse({ due_at: '۱۲/۱۰' })).toThrow();
  });
});
