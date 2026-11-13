// ورودی ورکر مرکزی مستقل (v1.26.0 — docs/rust/first-run-and-cloud.md §۳)
// هدف: «ساخت سرور مرکزی» از توکن کلادفلر کاربر — cf_deploy.rs این ماژول را با
// bindings زیر آپلود می‌کند:
//   DB               — D1 پایگاه markaz-central (اسکیمای کامل ۱۱۵ مایگریشن)
//   AUTH_SECRET      — راز سشن per-deploy (تصادفی ۳۲بایتی)
//   NODE_SETUP_TOKEN — توکن یک‌بارمصرف /admin/setup (ساخت مدیر مرکز)
// مسیرها: /healthz عمومی، /api/auth/login، /node/* (subapp کامل سینک)،
//         /admin/setup یک‌بارمصرف، /admin/announcements فقط-مدیر.
// هیچ دادهٔ بالینی اینجا ذخیره نمی‌شود — فهرست سفید pull/push دست‌نخورده است.
import { Hono } from 'hono';
import { z } from 'zod';
import { createNodeSyncApp } from '../src/node-sync/app';
import { registerAuthRoutes } from '../src/application/auth/routes';
import { authMiddleware, requireRole, getAuthContext, hashPassword, findStaffByUsername } from '../src/core/auth';
import { createAuditWriter } from '../src/core/audit';
import { createLogger } from '../src/core/logger';

const logger = createLogger('central');
const audit = (db) => createAuditWriter(db);

const SetupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9._-]+$/, 'نام کاربری فقط حروف انگلیسی کوچک/عدد/نقطه/خط'),
  password: z.string().min(6).max(128),
  full_name: z.string().min(2).max(120)
});

const AnnounceSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().max(8000).default(''),
  show_login: z.boolean().default(false),
  show_panel: z.boolean().default(true)
});

function envelope(c, err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error('central.unhandled', { msg });
  return c.json({ error: 'INTERNAL_ERROR', message: 'خطای موقت سرور مرکزی' }, 500);
}

function buildCentralApp(env) {
  const app = new Hono();
  const db = env.DB;
  const aw = audit(db);

  // سلامت عمومی — cf_deploy و verifyCloudNode با 200 همین مسیر قانع می‌شوند (pull هم 200 می‌دهد)
  app.get('/healthz', (c) => c.json({ ok: true, service: 'markaz-central' }, 200));

  // ورود کارکنان مرکز — همان هستهٔ auth اپ اصلی (throttle + PBKDF2 + سشن)
  registerAuthRoutes(app, { audit: aw, logger });

  // زیراپ سینک نودها — عین قرارداد m1.5/rust-f4 (هدرها، فهرست سفید، idempotency، گات ۱۵دقیقه)
  app.route('/node', createNodeSyncApp({ db, audit: aw, logger }));

  // ─── /admin/setup — یک‌بارمصرف با NODE_SETUP_TOKEN ───
  app.post('/admin/setup', async (c) => {
    try {
      const provided = (c.req.header('X-Setup-Token') ?? '').trim();
      const expected = String(env.NODE_SETUP_TOKEN ?? '').trim();
      if (!expected || !provided || provided !== expected) {
        return c.json({ error: 'SETUP_TOKEN_INVALID', message: 'توکن راه‌اندازی نامعتبر است' }, 401);
      }
      const done = await db.prepare(`SELECT value FROM settings WHERE key = 'central_setup_done' LIMIT 1`).first();
      if (done) {
        return c.json({ error: 'SETUP_DONE', message: 'مدیر مرکز از قبل ساخته شده است' }, 409);
      }
      const body = SetupSchema.parse(await c.req.json());
      const existing = await findStaffByUsername(db, body.username);
      if (existing) {
        return c.json({ error: 'USERNAME_TAKEN', message: 'این نام کاربری قبلاً گرفته شده است' }, 409);
      }
      const id = crypto.randomUUID();
      const hash = await hashPassword(body.password);
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO staff (id, email, full_name, role, role_ext, active, notify_enabled, username, password_hash, created_at)
         VALUES (?, ?, ?, 'manager', NULL, 1, 0, ?, ?, ?)`
      ).bind(id, `admin-${id.replace(/-/g, '').slice(0, 12)}@local`, body.full_name.trim(), body.username.trim(), hash, now).run();
      await db.prepare(
        `INSERT INTO settings (key, value) VALUES ('central_setup_done', '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run();
      await aw.log({ actorId: id, action: 'central.admin_setup', resourceType: 'staff', resourceId: id });
      logger.info('central.setup_done', { username: body.username });
      return c.json({ data: { ok: true, staff_id: id, username: body.username } }, 201);
    } catch (err) {
      if (err?.issues) {
        return c.json({ error: 'VALIDATION', message: err.issues[0]?.message ?? 'ورودی نامعتبر' }, 400);
      }
      return envelope(c, err);
    }
  });

  // ─── /admin/announcements — انتشار اعلان برای نودها (فقط مدیر مرکز) ───
  app.use('/admin/*', async (c, next) => {
    // setup از گیت توکن خودش استفاده می‌کند؛ بقیهٔ /admin با سشن
    if (c.req.path === '/admin/setup') return next();
    return authMiddleware()(c, next);
  });

  app.post('/admin/announcements', authMiddleware(), requireRole('manager'), async (c) => {
    try {
      const actor = getAuthContext(c);
      const body = AnnounceSchema.parse(await c.req.json());
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO announcements (id, title, body, show_login, show_panel, active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(id, body.title.trim(), body.body, body.show_login ? 1 : 0, body.show_panel ? 1 : 0, actor.staffId, now, now).run();
      await aw.log({ actorId: actor.staffId, action: 'central.announcement_created', resourceType: 'announcement', resourceId: id });
      return c.json({ data: { id, title: body.title, created_at: now } }, 201);
    } catch (err) {
      if (err?.issues) return c.json({ error: 'VALIDATION', message: err.issues[0]?.message ?? 'ورودی نامعتبر' }, 400);
      return envelope(c, err);
    }
  });

  app.get('/admin/announcements', authMiddleware(), requireRole('manager'), async (c) => {
    try {
      const rows = await db.prepare(
        `SELECT id, title, body, show_login, show_panel, active, created_at, updated_at
         FROM announcements ORDER BY created_at DESC LIMIT 50`
      ).all();
      return c.json({ data: { items: rows.results ?? [] } }, 200);
    } catch (err) {
      return envelope(c, err);
    }
  });

  app.notFound((c) => c.json({ error: 'NOT_FOUND' }, 404));
  return app;
}

// اپ per-isolate — با تغییر identity env (بازگرم‌سازی isolate) بازساخته می‌شود
let cached = null;
export default {
  async fetch(request, env, ctx) {
    if (!cached || cached.env !== env) {
      cached = { env, app: buildCentralApp(env) };
      logger.info('central.app_built', {});
    }
    return cached.app.fetch(request, env, ctx);
  }
};
