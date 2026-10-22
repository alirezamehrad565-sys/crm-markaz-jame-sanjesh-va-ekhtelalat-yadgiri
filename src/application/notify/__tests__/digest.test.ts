import { describe, expect, it } from 'vitest';
import { groupFollowUpsForBot, followupsNudgeBody } from '../digest';
import { renderFollowupsMessage, renderDigestBody, renderAttendanceSummary, renderCenterStatus } from '@core/notify';
import type { FollowUp } from '@core/shared';

function fu(overrides: Partial<FollowUp> & { id: string }): FollowUp {
  return {
    entityType: 'student',
    entityId: 'e1',
    studentId: null,
    studentName: null,
    title: 'پیگیری آزمایشی',
    assigneeId: 'staff-1',
    assigneeName: null,
    createdBy: 'staff-0',
    createdByName: null,
    status: 'open',
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    dueAt: null,
    ...overrides
  } as FollowUp;
}

const NOW = new Date('2026-10-06T04:30:00.000Z');

describe('groupFollowUpsForBot (pure) — گروه‌بندی §13.4', () => {
  it('مهلت گذشته → overdue؛ امروز → today؛ این هفته → week؛ دورتر → future؛ بی‌مهلت → open', () => {
    const list = [
      fu({ id: 'a', dueAt: '2026-10-05T10:00:00.000Z' }), // دیروز → عقب‌افتاده
      fu({ id: 'b', dueAt: '2026-10-06T10:00:00.000Z' }), // امروز تهران → امروز
      fu({ id: 'c', dueAt: '2026-10-08T10:00:00.000Z' }), // ظرف FOLLOWUP_DEFAULT_DUE_DAYS → هفته
      fu({ id: 'd', dueAt: '2027-01-01T10:00:00.000Z' }), // دور → آینده
      fu({ id: 'e', dueAt: null }),                        // بدون مهلت → open
      fu({ id: 'f', status: 'done', dueAt: '2026-10-05T10:00:00.000Z' }) // بسته → نادیده
    ];
    const g = groupFollowUpsForBot(list, NOW);
    expect(g.overdue.map((i) => i.id)).toEqual(['a']);
    expect(g.today.map((i) => i.id)).toEqual(['b']);
    expect(g.week.map((i) => i.id)).toEqual(['c']);
    expect(g.future.map((i) => i.id)).toEqual(['d']);
    expect(g.open.map((i) => i.id)).toEqual(['e']);
  });

  it('in_progress باز است و گروه می‌گیرد؛ برچسب مهلت جلالی است', () => {
    const g = groupFollowUpsForBot([fu({ id: 'x', status: 'in_progress', dueAt: '2026-10-05T10:00:00.000Z' })], NOW);
    expect(g.overdue).toHaveLength(1);
    expect(g.overdue[0].dueLabel).toBeTruthy();
    expect(g.overdue[0].dueLabel).not.toMatch(/2026-10-05/); // تاریخ جلالی نه ISO
  });
});

describe('followupsNudgeBody (pure) — بدنهٔ پوش یادآور', () => {
  it('شمارش عقب‌افتاده/امروز + حداکثر ۸ آیتم + خط «و n پیگیری دیگر»', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      fu({ id: `o${i}`, title: `تماس ${i}`, dueAt: '2026-10-05T10:00:00.000Z' })
    );
    const body = followupsNudgeBody(items, NOW);
    expect(body.overdue).toBe(10);
    expect(body.today).toBe(0);
    expect(body.total).toBe(10);
    expect(body.extra).toContain('عقب‌افتاده: ۱۰');
    expect(body.extra).toContain('• تماس 0');
    expect(body.extra).toContain('پیگیری دیگر'); // ۱۰ − ۸ = ۲ مورد باقی‌مانده
    expect(body.extra).not.toContain('• تماس 9');
  });

  it('بدون مورد عقب‌افتاده/امروز → total صفر', () => {
    const body = followupsNudgeBody([fu({ id: 'w', dueAt: '2027-01-01T00:00:00.000Z' })], NOW);
    expect(body.total).toBe(0);
    expect(body.extra).toBe('');
  });
});

describe('رندررهای پیام بات (pure)', () => {
  it('renderFollowupsMessage — خالی → پیام میز خالی؛ با آیتم → گروه و مهلت', () => {
    const empty = renderFollowupsMessage({
      title: 'ت',
      groups: { overdue: [], today: [], week: [], future: [], open: [] }
    });
    expect(empty).toContain('پیگیری بازی روی میز شما نیست');

    const text = renderFollowupsMessage({
      title: 'ت',
      clinicName: 'مرکز نمونه',
      groups: {
        overdue: [{ id: 'a', title: 'تماس با ولیّ', dueLabel: 'شنبه ۴ مهر' }],
        today: [{ id: 'b', title: 'جلسه هماهنگی', dueLabel: null }],
        week: [],
        future: [],
        open: []
      }
    });
    expect(text).toContain('عقب‌افتاده (۱)');
    expect(text).toContain('• تماس با ولیّ — مهلت: شنبه ۴ مهر');
    expect(text).toContain('امروز (۱)');
    expect(text).toContain('مرکز نمونه');
  });

  it('renderDigestBody — ردیف‌های زمان‌دار + برچسب لغوشده', () => {
    const body = renderDigestBody([
      { timeLabel: '09:00', title: 'پویا امیدی', cancelled: false },
      { timeLabel: '10:30', title: 'مریم احمدی', cancelled: true },
      { timeLabel: '12:00', title: 'دکتر علی رضایی', subtitle: 'فرزند: پریا امیدی', cancelled: false }
    ]);
    expect(body).toContain('۰۹:۰۰  پویا امیدی');
    expect(body).toContain('۱۰:۳۰  مریم احمدی (لغوشده)');
    expect(body).toContain('۱۲:۰۰  دکتر علی رضایی — فرزند: پریا امیدی');
    expect(renderDigestBody([])).toContain('موردی برای امروز ثبت نشده است');
  });

  it('renderAttendanceSummary — یک خط برای هر فرزند + بدون ثبت/لغو فقط وقتی صفر نیستند', () => {
    const text = renderAttendanceSummary({
      title: 'حضور فرزند',
      children: [
        { name: 'پویا امیدی', present: 8, absent: 1, pending: 2, cancelled: 0 },
        { name: 'پریا امیدی', present: 0, absent: 0, pending: 0, cancelled: 0 }
      ]
    });
    expect(text).toContain('• پویا امیدی: حاضر ۸ · غایب ۱ · بدون ثبت ۲');
    expect(text).toContain('• پریا امیدی: حاضر ۰ · غایب ۰'); // بدون «لغو ۰»
    expect(text).not.toContain('لغو ۰');
  });

  it('renderCenterStatus — چهار متریک با ارقام فارسی', () => {
    const text = renderCenterStatus({
      title: 'وضعیت مرکز',
      sessionsToday: 6,
      presentToday: 4,
      absentToday: 1,
      waitlistOpen: 3,
      followupsOverdue: 2,
      followupsToday: 1
    });
    expect(text).toContain('جلسات امروز: ۶');
    expect(text).toContain('حاضر: ۴');
    expect(text).toContain('لیست انتظار باز: ۳');
    expect(text).toContain('۲ عقب‌افتاده · ۱ امروز');
  });
});
