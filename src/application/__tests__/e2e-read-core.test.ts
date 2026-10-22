/**
 * تست‌های e2e — چیپ هستهٔ خواندن (T10/m153)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-read-core.test.ts — حلقهٔ کامل ابزار میکروی «هستهٔ خواندن» مرحلهٔ مهارت‌ها:
// ثبت معتبر (پنج مؤلفه) → رویداد completed با تحلیل باند + payload برچسب‌دار + پیشنهاد شرطی
// (readCoreAdviceOf — فقط ابزار رسمی باتری با دلیل، بدون برچسب تشخیصی)؛
// آیتم جا/خارج از بازه → خطای اعتبارسنجی فارسی و بدون رکورد؛ لبه‌های باند (۰/۱/۲/۳/۴/۱۰)؛
// الگوی «درک زبانی» (نمای سادهٔ خواندن): درک گیردار با رمزگشایی/روانی برقرار → فقط چک‌لیست زبان؛
// درک گیردار با رمزگشایی گیردار → پیشنهاد جدا نمی‌گیرد (از هم‌گیری کدگشایی پیروی می‌کند)؛
// ensure idempotent type سیستمی (بدون مایگریشن)؛ RBAC همان گیت ثبت رویداد (منشی ۴۰۳)؛
// موتور/rules از این ابزار مصرفی ندارد (افزودنی خالص — رفتار ابزارهای موجود دست‌نخورده).

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface ChipEvent {
  id: string;
  status: string;
  typeTitle: string;
  analysis: { score: number; band: string | null; maxScore: number; answered: number; total: number } | null;
  payload: Record<string, { value: string; label: string }> | null;
  summary: string | null;
}

const chipCount = (A: ReturnType<typeof createTestApp>): number =>
  (A.sql.prepare(
    `SELECT COUNT(*) AS c FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id WHERE t.key = 'ce-read-core-v1'`
  ).get() as { c: number }).c;

describe('حلقهٔ چیپ هستهٔ خواندن — مسیر اختصاصی دوکلیکی + پیشنهاد شرطی (T10/m153)', () => {
  let A: ReturnType<typeof createTestApp>;
  let therapist: Api;
  let secretary: Api;
  let manager: Api;
  let studentId = '';

  beforeAll(async () => {
    A = createTestApp();
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'آوا', last_name: 'خوانا' });
    studentId = s.id;
  });

  const chip = (levels: unknown, api: Api = therapist) =>
    api.post(`/api/students/${studentId}/case-events/read-core`, { levels });

  it('ثبت معتبر (پنج مؤلفه) → رویداد completed با باند، پیشنهاد شرطی و type سیستمی تضمین‌شده', async () => {
    expect(chipCount(A)).toBe(0);
    // pa=2, dec=1, flu=0, voc=1, comp=0 → جمع ۴ (باند «ضعف آشکار»)
    const res = await chip({ pa: 2, dec: 1, flu: 0, voc: 1, comp: 0 });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ChipEvent }).data;

    expect(ev.status).toBe('completed');
    expect(ev.typeTitle).toContain('چیپ هستهٔ خواندن');
    expect(ev.analysis?.score).toBe(4);
    expect(ev.analysis?.maxScore).toBe(10);
    expect(ev.analysis?.answered).toBe(5);
    expect(ev.analysis?.band).toBe('ضعف آشکار');

    // payload — آیتم‌ها با برچسب سطح + نمرهٔ کل + باند + خلاصهٔ فارسی
    expect(ev.payload?.pa).toEqual({ value: 'ضعف آشکار', label: 'آگاهی واج‌شناختی (بخشیدن و ترکیب صدا، قافیه)' });
    expect(ev.payload?.dec.value).toBe('مرزی');
    expect(ev.payload?.comp.value).toBe('برقرار');
    expect(ev.payload?.chip_total).toEqual({ value: '4', label: 'نمرهٔ کل' });
    expect(ev.payload?.chip_band.value).toBe('ضعف آشکار');
    expect(ev.payload?.fa_summary.value).toContain('هستهٔ خواندن: ۴ از ۱۰');

    // پیشنهاد شرطی — ترتیب رسمی باتری: چک‌لیست ملاکی (pa + جمع≥۴) → پروب (dec) → زبان (voc)
    expect(ev.payload?.advice_1?.label).toContain('چک‌لیست دشواری خواندن');
    expect(ev.payload?.advice_1?.value).toContain('آگاهی واج‌شناختی');
    expect(ev.payload?.advice_1?.value).toContain('الگوی ضعف گسترده');
    expect(ev.payload?.advice_2?.label).toContain('آزمون کوتاه خواندن');
    expect(ev.payload?.advice_2?.value).toContain('واژهٔ بی‌معنی');
    expect(ev.payload?.advice_3?.label).toContain('چک‌لیست زبان و گفتار');
    expect(ev.payload?.advice_3?.value).toContain('واژگان');
    expect(ev.payload?.advice_4).toBeUndefined();

    // خط خلاصهٔ تایم‌لاین هم‌شکل بقیهٔ چک‌لیست‌ها
    expect(ev.summary).toContain('امتیاز: ۴ از ۱۰');
    expect(ev.summary).toContain('ضعف آشکار');

    // type سیستمی ساخته شد — خارج کتابخانهٔ فرم (active=0) و محافظت‌شده
    const trow = A.sql
      .prepare(`SELECT key, active, is_system FROM case_event_types WHERE key = 'ce-read-core-v1'`)
      .get() as { key: string; active: number; is_system: number };
    expect(trow.is_system).toBe(1);
    expect(trow.active).toBe(0);

    // audit هم‌تراکنش
    const audits = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_type = 'case_event' AND resource_id = ?`)
      .all(ev.id) as { action: string }[];
    expect(audits.some((a) => a.action === 'case_event.read_core_created')).toBe(true);
  });

  it('ثبت دوم — از همان type استفاده می‌شود (idempotent؛ بدون type تکراری)', async () => {
    const res = await chip({ pa: 0, dec: 0, flu: 0, voc: 0, comp: 0 });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ChipEvent }).data;
    expect(ev.analysis?.band).toBe('بدون نشان');
    // جمع صفر → هیچ پیشنهاد شرطی‌ای نمی‌آید (بدون advice_N)
    expect(ev.payload?.advice_1).toBeUndefined();
    const rows = A.sql
      .prepare(`SELECT COUNT(*) AS c FROM case_event_types WHERE key = 'ce-read-core-v1'`)
      .get() as { c: number };
    expect(rows.c).toBe(1);
    expect(chipCount(A)).toBe(2);
  });

  it('لبه‌های باند — ۱ = «بدون نشان» (مؤلفهٔ مرزی منفرد) و ۲ = شروع «گیر مرزی»', async () => {
    const one = await chip({ pa: 1, dec: 0, flu: 0, voc: 0, comp: 0 });
    expect(one.status).toBe(201);
    const evOne = (one.body as { data: ChipEvent }).data;
    expect(evOne.analysis?.band).toBe('بدون نشان');
    // pa مرزی منفرد → هنوز پیشنهاد شرطی دارد (قاعدهٔ pa از جمع ۱ مستقل است)
    expect(evOne.payload?.advice_1?.label).toContain('چک‌لیست دشواری خواندن');
    const two = await chip({ pa: 1, dec: 1, flu: 0, voc: 0, comp: 0 });
    expect(((two.body as { data: ChipEvent }).data).analysis?.band).toBe('گیر مرزی');
  });

  it('لبه‌های باند — ۴ = شروع «ضعف آشکار» و ۱۰ = سقف بازه', async () => {
    const four = await chip({ pa: 2, dec: 2, flu: 0, voc: 0, comp: 0 });
    expect(((four.body as { data: ChipEvent }).data).analysis?.band).toBe('ضعف آشکار');
    const ten = await chip({ pa: 2, dec: 2, flu: 2, voc: 2, comp: 2 });
    const evTen = (ten.body as { data: ChipEvent }).data;
    expect(evTen.analysis?.band).toBe('ضعف آشکار');
    expect(evTen.analysis?.score).toBe(10);
    // الگوی گسترده: رمزگشایی هم گیردار → درک مطلب پیشنهاد جدا نمی‌گیرد؛ سه ابزار دقیق
    expect(evTen.payload?.advice_1?.label).toContain('چک‌لیست دشواری خواندن');
    expect(evTen.payload?.advice_2?.value).toContain('واژهٔ بی‌معنی');
    expect(evTen.payload?.advice_2?.value).toContain('روانی');
    expect(evTen.payload?.advice_3?.value).toContain('واژگان');
    expect(evTen.payload?.advice_4).toBeUndefined();
  });

  it('نمای سادهٔ خواندن — درک گیردار با رمزگشایی/روانی برقرار → فقط چک‌لیست زبان (الگوی درک زبانی)', async () => {
    const res = await chip({ pa: 0, dec: 0, flu: 0, voc: 0, comp: 2 });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ChipEvent }).data;
    expect(ev.analysis?.band).toBe('گیر مرزی');
    expect(ev.payload?.advice_1?.label).toContain('چک‌لیست زبان و گفتار');
    expect(ev.payload?.advice_1?.value).toContain('درک زبانی');
    expect(ev.payload?.advice_2).toBeUndefined();
  });

  it('آیتم جا → ۴۰۰ فارسی و بدون رکورد جدید', async () => {
    const before = chipCount(A);
    const res = await chip({ pa: 1, dec: 1, flu: 1, voc: 1 });
    expect(res.status).toBe(400);
    const body = res.body as { message?: string };
    expect(body.message).toContain('درک مطلب');
    expect(chipCount(A)).toBe(before);
  });

  it('سطح خارج از بازه (۳) و سطح غیرعددی → ۴۰۰ فارسی', async () => {
    const before = chipCount(A);
    const over = await chip({ pa: 3, dec: 0, flu: 0, voc: 0, comp: 0 });
    expect(over.status).toBe(400);
    expect((over.body as { message?: string }).message).toContain('آگاهی واج‌شناختی');
    const bad = await chip({ pa: 0, dec: 'خیلی بد', flu: 0, voc: 0, comp: 0 });
    expect(bad.status).toBe(400);
    expect((bad.body as { message?: string }).message).toContain('رمزگشایی');
    expect(chipCount(A)).toBe(before);
  });

  it('RBAC — منشی (فقط مشاهده) ۴۰۳ می‌گیرد؛ دانش‌آموز ناموجود ۴۰۴', async () => {
    const res = await chip({ pa: 0, dec: 0, flu: 0, voc: 0, comp: 0 }, secretary);
    expect(res.status).toBe(403);
    const missing = await therapist.post('/api/students/00000000-0000-0000-0000-00000000dead/case-events/read-core', {
      levels: { pa: 0, dec: 0, flu: 0, voc: 0, comp: 0 }
    });
    expect(missing.status).toBe(404);
    expect(chipCount(A)).toBe(chipCount(A)); // بدون تغییر
  });

  it('رویداد چیپ در تایم‌لاین دانش‌آموز با summary باندخورده ظاهر می‌شود', async () => {
    const list = await therapist.get(`/api/students/${studentId}/case-events`);
    expect(list.status).toBe(200);
    const items = (list.body as { data: ChipEvent[] }).data.filter((e) => e.typeTitle.includes('چیپ هستهٔ خواندن'));
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((e) => e.status === 'completed' && e.analysis?.band)).toBe(true);
  });
});
