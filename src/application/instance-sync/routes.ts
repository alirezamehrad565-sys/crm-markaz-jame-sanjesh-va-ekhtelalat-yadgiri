/**
 * مسیرهای قرارداد instance-sync (فاز B — §۲-۴): سه endpoint دو-سویه با گیت Bearer runtime-secret
 *   GET  /state  — وضعیت هم‌گامی (cursorها + مایگریشن‌های اعمال‌شده + فهرست جداول)
 *   POST /pull   — { since } → ردیف‌ها + تومب‌استون‌ها + next_cursors
 *   POST /push   — { device_id, tables } → اعمال FWW + echo وضعیت نهایی برنده
 *
 * احراز: همان helper handshake مرکز↔نمونه‌ها — resolveSessionSecret (@core/auth؛ runtime-secret
 * per-deploy ورکر یا DEV در محیط توسعه) با Authorization: Bearer + هدر X-Device-Id.
 * مقایسهٔ توکن زمان-ثابت است (الگوی هش-مقایسه node-sync) و پاسخ رد یک‌شکل و کم‌دست می‌ماند.
 * ثبت این زیراپ در api-routing **پیش از گیت authMiddleware** است — احراز خودش این‌جاست.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppBindings, AppVariables } from '@core/shared';
import { resolveSessionSecret } from '@core/auth';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { DEVICE_ID_PATTERN, instanceState, pull, push } from './service';
import type { PullSince, PushPayload } from './service';

type Env = { Bindings: AppBindings; Variables: AppVariables };

export interface InstanceSyncDeps {
  db: DbClient;
  logger: Logger;
}

// ─── اعتبارسنجی بدنه (zod4 — کلید صریح record؛ هم‌الگوی node-sync/service) ───

const SinceTableSchema = z.object({
  rows: z.string().min(10).optional(),
  deleted: z.string().min(10).optional()
});

const PullSchema = z.object({
  since: z
    .object({
      tables: z.record(z.string().min(1).max(64), SinceTableSchema).optional()
    })
    .optional()
});

const TombstoneSchema = z.object({
  pk: z.string().min(1).max(512),
  deleted_at: z.string().min(10).max(40),
  device_id: z.string().max(64).nullish()
});

const PushSchema = z.object({
  device_id: z.string().min(4).max(64).regex(DEVICE_ID_PATTERN, 'شناسهٔ نمونه (device_id) نامعتبر است'),
  tables: z.record(
    z.string().min(1).max(64),
    z.object({
      rows: z.array(z.record(z.string().min(1).max(64), z.unknown())).max(1000).optional(),
      deleted: z.array(TombstoneSchema).max(1000).optional()
    })
  )
});

// ─── گیت مشترک ───

/** استخراج توکن از Authorization — عین bearerToken در node-sync/service */
function bearerToken(header: string | undefined): string | null {
  const value = header?.trim();
  if (!value) return null;
  return value.startsWith('Bearer ') ? value.slice(7).trim() || null : null;
}

/** مقایسهٔ زمان-ثابت رشته‌ها (بدون early-return روی نابرابری) — الگوی دفاع node-sync */
function timingSafeEqualStr(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const authFailed = (c: { json: (body: unknown, status: 401) => Response }): Response =>
  c.json({ error: 'INSTANCE_AUTH_FAILED', message: 'اعتبار هم‌گامی نمونه پذیرفته نشد' }, 401);

const deviceInvalid = (c: { json: (body: unknown, status: 400) => Response }): Response =>
  c.json({ error: 'DEVICE_ID_INVALID', message: 'هدر X-Device-Id الزامی است و باید معتبر باشد' }, 400);

/**
 * زیراپ instance-sync — در api-routing با یک خط پیش از گیت auth سوار می‌شود:
 *   app.route('/api/instance-sync', createInstanceSyncApp({ db, logger }))
 * و در ورکر مرکزی مستقل: app.route('/instance-sync', …) (همان باندل، دو سو — §۲-۴).
 */
export function createInstanceSyncApp(deps: InstanceSyncDeps) {
  const { db, logger } = deps;
  const log = logger.child('instance-sync');

  const app = new Hono<Env>();

  // — پاسخ‌های هم‌گامی هرگز کش نمی‌شوند (هم‌الگوی زیراپ /node) —
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  /** گیت Bearer runtime-secret + هدر device — برندهٔ احراز، شناسهٔ نمونه را برمی‌گرداند */
  async function authorize(c: { env: AppBindings; req: { header: (name: string) => string | undefined } }): Promise<string | null> {
    const token = bearerToken(c.req.header('Authorization'));
    if (!token) return null;
    const expected = await resolveSessionSecret(c.env);
    if (!timingSafeEqualStr(token, expected)) {
      log.warn('instance_sync.auth_failed', {});
      return null;
    }
    const deviceId = (c.req.header('X-Device-Id') ?? '').trim();
    if (!DEVICE_ID_PATTERN.test(deviceId)) return null;
    return deviceId;
  }

  // ─── GET /state ───
  app.get('/state', async (c) => {
    const deviceId = await authorize(c);
    if (deviceId === null) return authFailed(c);
    const state = await instanceState(db, deviceId);
    return c.json({ data: state }, 200);
  });

  // ─── POST /pull {since} ───
  app.post('/pull', async (c) => {
    const deviceId = await authorize(c);
    if (deviceId === null) return authFailed(c);
    const parsed = PullSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', message: 'بدنهٔ pull نامعتبر است', issues: parsed.error.issues }, 400);
    }
    const since = (parsed.data.since ?? {}) as PullSince;
    const result = await pull(db, since);
    return c.json({ data: result }, 200);
  });

  // ─── POST /push {device_id, tables} ───
  app.post('/push', async (c) => {
    const deviceId = await authorize(c);
    if (deviceId === null) return authFailed(c);
    const parsed = PushSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', message: 'بدنهٔ push نامعتبر است', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    if (body.device_id !== deviceId) {
      return c.json({ error: 'DEVICE_MISMATCH', message: 'device_id بدنه با هدر X-Device-Id هم‌خوان نیست' }, 400);
    }
    const result = await push(db, body.device_id, { tables: body.tables } as PushPayload);
    return c.json({ data: result }, 200);
  });

  return app;
}
