import type { AppHono, AuthContext } from '@core/shared';
import { NewStaffSchema, UpdateStaffSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError } from '@core/errors';
import type { StaffMember, StaffPublicMember, StaffService } from './types';

/* ممیزی صفحهٔ تقویم (۱.۲۷.۸۸) — اصل حداقل داده: فهرست کارکنان برای انتخابگرِ تقویم/تمرین/پیگیری
   به همهٔ نقش‌های احرازشده باز است و تا اینجا تلفن، کد ملی، نام کاربری و ایمیل همهٔ همکاران را
   به هر نقش می‌داد. این فیلدها فقط به مدیر/ناظر می‌رسد؛ بقیه فقط پروجکشن عمومی می‌گیرند. */
function visibleTo(actor: AuthContext, member: StaffMember): StaffMember | StaffPublicMember {
  if (actor.role === 'manager' || actor.role === 'supervisor') return member;
  const { id, fullName, role, active, notifyEnabled, createdAt } = member;
  return { id, fullName, role, active, notifyEnabled, createdAt };
}

export function registerRoutes(app: AppHono, service: StaffService): void {
  app.get('/api/staff', async (c) => {
    const actor = getAuthContext(c);
    const activeRaw = c.req.query('active');
    const items = await service.list({
      active: activeRaw === undefined ? undefined : activeRaw === 'true'
    });
    return c.json({ data: items.map((member) => visibleTo(actor, member)) }, 200);
  });

  app.get('/api/staff/:id', async (c) => {
    const actor = getAuthContext(c);
    const member = await service.getById(c.req.param('id'));
    if (!member) throw new NotFoundError('کارمند');
    return c.json({ data: visibleTo(actor, member) }, 200);
  });

  app.post('/api/staff', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewStaffSchema.parse(await c.req.json<unknown>());
    const member = await service.create(
      {
        fullName: body.full_name,
        phone: body.phone,
        nationalId: body.national_id,
        username: body.username,
        password: body.password,
        role: body.role,
        notifyEnabled: body.notify_enabled
      },
      actor
    );
    return c.json({ data: member }, 201);
  });

  app.patch('/api/staff/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateStaffSchema.parse(await c.req.json<unknown>());
    const member = await service.update(
      c.req.param('id'),
      {
        fullName: body.full_name,
        phone: body.phone,
        nationalId: body.national_id,
        username: body.username,
        password: body.password,
        role: body.role,
        notifyEnabled: body.notify_enabled
      },
      actor
    );
    return c.json({ data: member }, 200);
  });

  app.post('/api/staff/:id/activate', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const member = await service.setActive(c.req.param('id'), true, actor);
    return c.json({ data: member }, 200);
  });

  app.post('/api/staff/:id/deactivate', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const member = await service.setActive(c.req.param('id'), false, actor);
    return c.json({ data: member }, 200);
  });

  app.delete('/api/staff/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.body(null, 204);
  });
}
