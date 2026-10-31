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
    `SELECT COUNT(*) AS c FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id WHERE t.key = 'ce-sensory-chip-v1'`
  ).get() as { c: number }).c;

describe('حلقهٔ چیپ غربالگری حسی — مسیر اختصاصی دوکلیکی (T9/)', () => {
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
    const s = await createStudent(manager, { first_name: 'آوا', last_name: 'حسی' });
    studentId = s.id;
  });

  const chip = (levels: unknown, api: Api = therapist) =>
    api.post(`/api/students/${studentId}/case-events/sensory-chip`, { levels });

  it('ثبت معتبر (سه آیتم) → رویداد completed با باند، payload برچسب‌دار و type سیستمی تضمین‌شده', async () => {
    expect(chipCount(A)).toBe(0);
    const res = await chip({ sound: 2, light: 1, touch: 0 });
    expect(res.status).toBe(201);
    const ev = (res.body as { data: ChipEvent }).data;

    expect(ev.status).toBe('completed');
    expect(ev.typeTitle).toContain('چیپ غربالگری حسی');
    expect(ev.analysis?.score).toBe(3);
    expect(ev.analysis?.maxScore).toBe(6);
    expect(ev.analysis?.answered).toBe(3);
    expect(ev.analysis?.band).toBe('حساسیت جزئی');
    expect(ev.payload?.sound).toEqual({ value: 'حساسیت آزارنده', label: 'صدا (صوت)' });
    expect(ev.payload?.light.value).toBe('حساسیت جزئی');
    expect(ev.payload?.touch.value).toBe('بدون حساسیت');
    expect(ev.payload?.chip_total).toEqual({ value: '3', label: 'نمرهٔ کل' });
    expect(ev.payload?.chip_band.value).toBe('حساسیت جزئی');
    expect(ev.payload?.fa_summary.value).toContain('حساسیت حسی: ۳ از ۶');
    expect(ev.summary).toContain('امتیاز: ۳ از ۶');
    expect(ev.summary).toContain('حساسیت جزئی');

    const trow = A.sql
      .prepare(`SELECT key, active, is_system FROM case_event_types WHERE key = 'ce-sensory-chip-v1'`)
      .get() as { key: string; active: number; is_system: number };
    expect(trow.is_system).toBe(1);
    expect(trow.active).toBe(0);

    const audits = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_type = 'case_event' AND resource_id = ?`)
      .all(ev.id) as { action: string }[];
    expect(audits.some((a) => a.action === 'case_event.sensory_chip_created')).toBe(true);
  });

  it('ثبت دوم — از همان type استفاده می‌شود (idempotent؛ بدون type تکراری)', async () => {
    const res = await chip({ sound: 0, light: 0, touch: 0 });
    expect(res.status).toBe(201);
    expect(((res.body as { data: ChipEvent }).data).analysis?.band).toBe('بدون نشان');
    const rows = A.sql
      .prepare(`SELECT COUNT(*) AS c FROM case_event_types WHERE key = 'ce-sensory-chip-v1'`)
      .get() as { c: number };
    expect(rows.c).toBe(1);
    expect(chipCount(A)).toBe(2);
  });

  it('لبه‌های باند — ۱ = «بدون نشان» (مشاهدهٔ جزئی منفرد) و ۲ = شروع «حساسیت جزئی»', async () => {
    const one = await chip({ sound: 0, light: 0, touch: 1 });
    expect(one.status).toBe(201);
    expect(((one.body as { data: ChipEvent }).data).analysis?.band).toBe('بدون نشان');
    const two = await chip({ sound: 1, light: 1, touch: 0 });
    expect(((two.body as { data: ChipEvent }).data).analysis?.band).toBe('حساسیت جزئی');
  });

  it('لبه‌های باند — ۴ = شروع «حساسیت قابل توجه» و ۶ = سقف بازه', async () => {
    const four = await chip({ sound: 2, light: 1, touch: 1 });
    expect(((four.body as { data: ChipEvent }).data).analysis?.band).toBe('حساسیت قابل توجه');
    const six = await chip({ sound: 2, light: 2, touch: 2 });
    expect(((six.body as { data: ChipEvent }).data).analysis?.band).toBe('حساسیت قابل توجه');
    expect(((six.body as { data: ChipEvent }).data).analysis?.score).toBe(6);
  });

  it('آیتم جا → ۴۰۰ فارسی و بدون رکورد جدید', async () => {
    const before = chipCount(A);
    const res = await chip({ sound: 1, light: 1 });
    expect(res.status).toBe(400);
    const body = res.body as { message?: string };
    expect(body.message).toContain('لمس و بافت');
    expect(chipCount(A)).toBe(before);
  });

  it('سطح خارج از بازه (۳) و سطح غیرعددی → ۴۰۰ فارسی', async () => {
    const before = chipCount(A);
    const over = await chip({ sound: 3, light: 0, touch: 0 });
    expect(over.status).toBe(400);
    expect((over.body as { message?: string }).message).toContain('صدا');
    const bad = await chip({ sound: 0, light: 'خیلی زیاد', touch: 0 });
    expect(bad.status).toBe(400);
    expect((bad.body as { message?: string }).message).toContain('نور');
    expect(chipCount(A)).toBe(before);
  });

  it('RBAC — منشی (فقط مشاهده) ۴۰۳ می‌گیرد؛ دانش‌آموز ناموجود ۴۰۴', async () => {
    const res = await chip({ sound: 0, light: 0, touch: 0 }, secretary);
    expect(res.status).toBe(403);
    const missing = await therapist.post('/api/students/00000000-0000-0000-0000-00000000dead/case-events/sensory-chip', {
      levels: { sound: 0, light: 0, touch: 0 }
    });
    expect(missing.status).toBe(404);
  });

  it('رویداد چیپ در تایم‌لاین دانش‌آموز با summary باندخورده ظاهر می‌شود', async () => {
    const list = await therapist.get(`/api/students/${studentId}/case-events`);
    expect(list.status).toBe(200);
    const items = (list.body as { data: ChipEvent[] }).data.filter((e) => e.typeTitle.includes('چیپ غربالگری حسی'));
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((e) => e.status === 'completed' && e.analysis?.band)).toBe(true);
  });
});
