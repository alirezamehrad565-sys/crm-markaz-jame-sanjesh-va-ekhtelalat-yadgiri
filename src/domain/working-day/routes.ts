/**
 * ماژول بورد روز کاری — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مسیرهای بورد روز کاری (بدون business logic)
// بورد روز کاری ابزار دفتر بود: مشاهده فقط مدیر/منشی
// به دستور کاربر: درمانگر هم «کپی روز کاری» خودش را می‌بیند — همان طراحی،
// فقط کارت نوبت‌های خودش (بورد در سرویس نسبت به خودش scope می‌شود)؛
// ثبت توضیحات همچنان منشی/مدیر؛ حذف توضیحات فقط مدیر

import { NewDayNoteSchema, WorkingDayQuerySchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { AppHono } from '@core/shared';
import type { WorkingDayService } from './service';

export function registerWorkingDayRoutes(app: AppHono, service: WorkingDayService): void {
  // بورد کامل یک روز (پیش‌فرض: امروز تهران)
  // دفتر: کل مرکز؛ درمانگر: فقط کارت خودش (scope در سرویس)
  app.get('/api/working-day', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const q = WorkingDayQuerySchema.parse({ date: c.req.query('date') || undefined });
    const board = await service.getBoard(q.date, actor);
    return c.json({ data: board }, 200);
  });

  // ثبت توضیحات روز (لاگ — append-only) — همچنان ابزار دفتر
  app.post('/api/working-day/notes', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewDayNoteSchema.parse(await c.req.json<unknown>());
    const note = await service.addNote(body.date, body.body, actor);
    return c.json({ data: note }, 201);
  });

  // حذف توضیحات روز — فقط مدیر
  app.delete('/api/working-day/notes/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteNote(c.req.param('id'), actor);
    return c.json({ data: { ok: true } }, 200);
  });
}
