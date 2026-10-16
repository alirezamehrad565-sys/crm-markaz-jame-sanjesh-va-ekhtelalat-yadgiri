/**
 * سرویس تنظیمات مرکز — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مسیرهای REST تنظیمات — بدون business logic (فقط wire + Zod)
// قانون RBAC: تغییر تنظیمات فقط مدیر؛ خواندن کامل فقط دفتر
// («بازه کاری مرکز» برای رنگ تقویم همه نقش‌ها باز می‌ماند)

import type { AppHono } from '@core/shared';
import { ReplaceCenterHoursSchema, ScoringConfigSchema, UpdateSettingsSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { SettingsService } from './service';

export function registerSettingsRoutes(app: AppHono, service: SettingsService): void {
  // ─── خواندن کامل — فقط دفتر (: درمانگر به ماژول تنظیمات دسترسی ندارد) ───
  app.get('/api/settings', requireRole('manager', 'secretary'), async (c) => {
    const data = await service.get();
    return c.json({ data }, 200);
  });

  // ─── به‌روزرسانی عمومی (فقط مدیر) ───
  app.put('/api/settings', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateSettingsSchema.parse(await c.req.json<unknown>());
    const data = await service.update(
      {
        clinicName: body.clinic_name,
        defaultReminderHours: body.default_reminder_hours,
        notifyOnCreate: body.notify_on_create,
        notifyOnMove: body.notify_on_move,
        notifyOnCancel: body.notify_on_cancel,
        notifyDigest: body.notify_digest,
        notifyWaitlist: body.notify_waitlist,
        clinicPhone: body.clinic_phone,
        notifyBatchHour: body.notify_batch_hour,
        screeningTargets: body.screening_targets
      },
      actor
    );
    return c.json({ data }, 200);
  });

  // ─── بازه کاری مرکز ───
  app.get('/api/settings/center-hours', async (c) => {
    const data = await service.getCenterHours();
    return c.json({ data }, 200);
  });

  app.put('/api/settings/center-hours', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = ReplaceCenterHoursSchema.parse(await c.req.json<unknown>());
    const data = await service.replaceCenterHours(
      body.items.map((r) => ({ weekday: r.weekday, startMinute: r.start_minute, endMinute: r.end_minute })),
      actor
    );
    return c.json({ data }, 200);
  });

  // ─── اعمال بازه مرکز روی همه کارکنان ───
  app.post('/api/settings/center-hours/apply-to-all', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.applyCenterHoursToAllStaff(actor);
    return c.json({ data }, 200);
  });

  // ─── پیکربندی امتیازدهی همکاران — فقط مدیر (فرمول از غیرمدیر پنهان است) ───
  app.get('/api/settings/scoring', requireRole('manager'), async (c) => {
    const data = await service.getScoringConfig();
    return c.json({ data }, 200);
  });

  app.put('/api/settings/scoring', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = ScoringConfigSchema.parse(await c.req.json<unknown>());
    const data = await service.updateScoringConfig(
      {
        epochYmd: body.epoch_ymd,
        weights: {
          exercises: body.weights.exercises,
          packages: body.weights.packages,
          templates: body.weights.templates,
          forms: body.weights.forms,
          exerciseUses: body.weights.exerciseUses,
          templateUses: body.weights.templateUses,
          formFills: body.weights.formFills,
          exerciseRefs: body.weights.exerciseRefs,
          templateRefs: body.weights.templateRefs,
          formRefs: body.weights.formRefs,
          baseAction: body.weights.base_action,
          adminCap: body.weights.admin_cap
        }
      },
      actor
    );
    return c.json({ data }, 200);
  });
}
