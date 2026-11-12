/**
 * زیراپ سینک نودهای دسکتاپ (rust-f4) — /node/*
 * سند قرارداد: docs/rust/node-sync.md · طراحی: docs/rust/design.md §۵
 *
 * جای ثبت: در createApp «پیش از» گیت authMiddleware ثبت می‌شود (هم‌الگوی زنجیرهٔ عمومی §۵
 * نقشهٔ راه) — احراز این مسیرها خودِ نودی است (node_code + node_key) نه سشن کارمندان؛
 * مسیرهای مدیریتی (register/rotate-key/revoke/nodes) درون همین زیراپ با همان گیت
 * authMiddleware + requireRole('manager') بسته می‌شوند و با audit_log ثبت می‌شوند.
 *
 * زنجیرهٔ عمومی درون زیراپ (هم‌الگوی اپ اصلی و games-standalone):
 *   request-id سراسری (X-Request-Id + زمینهٔ audit) → محدودساز نوشتنی per-IP → no-store
 *   → ۴۰۴ کم‌دست (بدون جزئیات مسیر). هدرهای امنیتی و لاگ درخواست از میزبان می‌آیند.
 *
 * قراردادهای ارثی از m1.5 (همه در service.ts سند شده‌اند):
 *   • هدرهای نود: X-CP-Node-Code + Authorization: Bearer <node_key>
 *   • مُهر تلاش push با گات ۱۵دقیقه‌ای — زیر گات پاسخ صامت (بدون لاگ/audit/نوشتن)
 *   • idempotency با جفت (node_code, id)
 *   • دامنهٔ بیرون فهرست سفید = 403 با کد آزمون‌پذیر NODE_DOMAIN_FORBIDDEN
 *   • هرگز مسیری نمی‌شکند: خطا = پاکت تمیز؛ حکم م۲۱۰ سمت نود فقط warn و دورهٔ بعد
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { authMiddleware, requireRole, getAuthContext } from '@core/auth';
import { runWithRequestId } from '@core/audit';
import type { AuditWriter } from '@core/audit';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { ConflictError, NotFoundError, RateLimitError, ValidationError } from '@core/errors';
import {
  parseApiRateLimitPerMin,
  makeKeyedRateLimiter,
  API_RATE_LIMIT_WINDOW_MS
} from '@app/http';
import {
  NODE_PULL_DOMAINS,
  NODE_PULL_DOMAIN_SET,
  NODE_PULL_DEFAULT_LIMIT,
  NODE_PULL_MAX_LIMIT,
  NODE_PUSH_DOMAIN_SET,
  NODE_PUSH_BODY_MAX_BYTES,
  NODE_PUSH_MIN_INTERVAL_MS,
  NodeCodeInvalidError,
  NodePushRawBodySchema,
  bearerToken,
  decodeNodeCursor,
  listNodes,
  pullNodePage,
  pushNodeEvents,
  registerNode,
  revokeNode,
  rotateNodeKey,
  shouldAttemptNodePush,
  stampNodePull,
  stampNodePushAttempt,
  stampNodePushOk,
  validatePushItem,
  verifyNodeCredentials
} from './service';
import type { NodePullDomain, NodePushRawItem, SyncNodeRow } from './service';

export interface NodeSyncAppDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** تزریق زمان — فقط برای آزمون مُهر تلاش (پیش‌فرض: ساعت واقعی) */
  now?: () => Date;
  /** بازنویسی گات ۱۵دقیقه‌ای push — فقط برای آزمون */
  pushMinIntervalMs?: number;
}

type Env = { Bindings: AppBindings; Variables: AppVariables };

/** صف پس‌زمینه وقتی ExecutionContext هست؛ وگرنه اجرای نرم بدون شکستن مسیر */
function fireAndForget(c: Context<Env>, p: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    p.catch(() => undefined);
  }
}

const RegisterSchema = z.object({
  node_code: z.string().max(120),
  label: z.string().max(120).nullish()
});

const NodeCodeSchema = z.object({
  node_code: z.string().max(120)
});

export function createNodeSyncApp(deps: NodeSyncAppDeps): AppHono {
  const { db, audit, logger } = deps;
  const log = logger.child('node-sync');
  const now = deps.now ?? (() => new Date());
  const minIntervalMs = deps.pushMinIntervalMs ?? NODE_PUSH_MIN_INTERVAL_MS;

  const app: AppHono = new Hono<Env>();

  // — request-id سراسری زیراپ (هم‌الگوی /api/* اپ اصلی) —
  app.use('*', async (c, next) => {
    const requestId = `req-${crypto.randomUUID()}`;
    c.set('requestId', requestId);
    try {
      return await runWithRequestId(requestId, () => next());
    } finally {
      c.header('X-Request-Id', requestId);
    }
  });

  // — محدودساز نوشتنی per-IP (همان سقف و همان مستثنی‌های اپ اصلی؛ env «۰» = خاموش) —
  const limiter = makeKeyedRateLimiter(API_RATE_LIMIT_WINDOW_MS);
  app.use('*', async (c, next) => {
    if (c.req.method !== 'POST' && c.req.method !== 'PUT' && c.req.method !== 'PATCH' && c.req.method !== 'DELETE') {
      return next();
    }
    const perMin = parseApiRateLimitPerMin(c.env?.API_RATE_LIMIT_PER_MIN);
    if (perMin <= 0) return next();
    const ip = (c.req.header('cf-connecting-ip') ?? 'unknown').slice(0, 64);
    if (!limiter.allow(`nodesync:${perMin}:${ip}`, perMin)) {
      c.header('Retry-After', String(Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000)));
      throw new RateLimitError(
        Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000),
        'درخواست‌های سینک نود بیش از حد مجاز است — کمی بعد دوباره تلاش کنید'
      );
    }
    return next();
  });

  // — پاسخ‌های این زیراپ هرگز کش نمی‌شوند —
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  // ─── احراز نود مشترک pull/push — پاسخ رد یک‌شکل و کم‌دست (بدون نشت وجود/عدم‌وجود کد) ───
  async function authNode(c: Context<Env>): Promise<SyncNodeRow | null> {
    const outcome = await verifyNodeCredentials(db, {
      nodeCode: c.req.header('X-CP-Node-Code'),
      bearer: bearerToken(c.req.header('Authorization'))
    });
    if (outcome.ok) return outcome.node;
    log.warn('node_sync.auth_failed', { fingerprint: outcome.fingerprint });
    return null;
  }

  const authFailed = (c: Context<Env>): Response =>
    c.json({ error: 'NODE_AUTH_FAILED', message: 'اعتبار نود پذیرفته نشد' }, 401);

  // ─── GET /node/pull?domains=...&cursor=...&limit=... ───
  app.get('/pull', async (c) => {
    const node = await authNode(c);
    if (!node) return authFailed(c);

    // فهرست سفید pull — هر دامنهٔ بیرون فهرست (مثل patients) رد صریح ۴۰۳ دارد
    const rawDomains = (c.req.query('domains') ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);
    const unknownDomains = [...new Set(rawDomains.filter((d) => !NODE_PULL_DOMAIN_SET.has(d)))];
    if (unknownDomains.length > 0) {
      return c.json(
        {
          error: 'NODE_DOMAIN_FORBIDDEN',
          message: 'دامنهٔ درخواستی بیرون فهرست سفید pull است',
          details: { domains: unknownDomains }
        },
        403
      );
    }
    const domains: readonly NodePullDomain[] =
      rawDomains.length > 0 ? (rawDomains as NodePullDomain[]) : [...NODE_PULL_DOMAINS];

    const cursor = decodeNodeCursor(c.req.query('cursor'));
    if (c.req.query('cursor') && !cursor) {
      return c.json({ error: 'NODE_CURSOR_INVALID', message: 'cursor نامعتبر است' }, 400);
    }

    const parsedLimit = Number.parseInt(c.req.query('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, NODE_PULL_MAX_LIMIT)
      : NODE_PULL_DEFAULT_LIMIT;

    const page = await pullNodePage(db, { domains, cursor, limit });
    fireAndForget(c, stampNodePull(db, node.node_code, now()).catch(() => undefined));

    return c.json(
      { data: { items: page.items, next_cursor: page.next_cursor, server_time: now().toISOString() } },
      200
    );
  });

  // ─── POST /node/push — سفیدفهرستی + مُهر تلاش + idempotency ───
  app.post('/push', async (c) => {
    const node = await authNode(c);
    if (!node) return authFailed(c);

    // ۱) گات ۱۵دقیقه‌ای — زیر گات پاسخ صامت: بدون خواندن بدنه، بدون لاگ، بدون نوشتن.
    //    (مُهر تلاش مشترک؛ نودِ خوش‌رفتار هرگز این پاسخ را نمی‌بیند — کلاینت خودش فاصله می‌گیرد.)
    const at = now();
    if (!shouldAttemptNodePush(node.last_push_attempt_at, at, minIntervalMs)) {
      const lastT = Date.parse(node.last_push_attempt_at ?? '');
      const retryAfterS = Number.isNaN(lastT)
        ? null
        : Math.max(0, Math.ceil((lastT + minIntervalMs - at.getTime()) / 1000));
      return c.json({ data: { accepted: 0, duplicates: 0, throttled: true, retry_after_s: retryAfterS } }, 200);
    }

    // ۲) سقف سخت بدنه (اعتراف Content-Length — هم‌الگوی لولهٔ خطای مرورگر)
    const contentLength = Number.parseInt(c.req.header('content-length') ?? '0', 10) || 0;
    if (contentLength > NODE_PUSH_BODY_MAX_BYTES) {
      return c.json({ error: 'NODE_BODY_TOO_LARGE', message: 'حجم بدنهٔ push بیش از حد مجاز است' }, 400);
    }

    // ۳) مُهر تلاش قبل از کار — همان الگوی m1.5 (خطای بعدی هم فاصله می‌گیرد)
    await stampNodePushAttempt(db, node.node_code, at);

    // ۴) شکل کلی بدنه (SyntaxError → پاکت INVALID_JSON با errorHandler میزبان)
    const raw = NodePushRawBodySchema.parse(await c.req.json<unknown>());

    // ۵) فهرست سفید push — رد صریح کل درخواست؛ حتی یک بایت هم نوشته نمی‌شود (fail-closed)
    const unknownDomains = [...new Set(raw.items.map((it) => it.domain).filter((d) => !NODE_PUSH_DOMAIN_SET.has(d)))];
    if (unknownDomains.length > 0) {
      log.warn('node_sync.push_domain_forbidden', { domains: unknownDomains });
      return c.json(
        {
          error: 'NODE_DOMAIN_FORBIDDEN',
          message: 'دامنهٔ ارسالی بیرون فهرست سفید push است — دادهٔ بالینی هرگز از میز خارج نمی‌شود',
          details: { domains: unknownDomains }
        },
        403
      );
    }

    // ۶) اعتبارسنجی سفت بر حسب دامنه (ZodError → ۴۰۰ با details)
    const items = raw.items.map((it: NodePushRawItem) => validatePushItem(it));

    // ۷) درج idempotent — جفت (node_code, id)؛ دوباره‌فرستادن همان id هیچ ردیفی اضافه نمی‌کند
    const outcome = await pushNodeEvents(db, node.node_code, items);
    await stampNodePushOk(db, node.node_code, at).catch(() => undefined);
    log.info('node_sync.push', { node: node.node_code, accepted: outcome.accepted, duplicates: outcome.duplicates });

    return c.json({ data: { accepted: outcome.accepted, duplicates: outcome.duplicates, throttled: false } }, 200);
  });

  // ─── مسیرهای فقط-مدیر — همان گیت سشن کارمندان + audit_log ───
  // (نکتهٔ «پیوند دستی CP↔نود»: ثبت نود فقط با ورود مدیر اپ ابری انجام می‌شود؛
  //  plaintext کلید فقط یک‌بار در پاسخ همین مسیرها برمی‌گردد.)

  app.post('/register', authMiddleware(), requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = RegisterSchema.parse(await c.req.json<unknown>());
    try {
      const { registration, nodeKey } = await registerNode(db, audit, {
        nodeCode: body.node_code,
        label: body.label ?? null,
        actorStaffId: actor.staffId
      });
      log.info('node_sync.registered', { node: registration.node_code, fingerprint: registration.key_fingerprint });
      return c.json({ data: { ...registration, node_key: nodeKey } }, 201);
    } catch (err) {
      if (err instanceof NodeCodeInvalidError) throw new ValidationError(err.message);
      if (err instanceof Error && err.message === 'NODE_CODE_TAKEN') {
        throw new ConflictError('این کد نود قبلاً ثبت شده است — برای کلید تازه از rotate-key استفاده کنید');
      }
      throw err;
    }
  });

  app.post('/rotate-key', authMiddleware(), requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NodeCodeSchema.parse(await c.req.json<unknown>());
    try {
      const { rotation, nodeKey } = await rotateNodeKey(db, audit, {
        nodeCode: body.node_code,
        actorStaffId: actor.staffId
      });
      log.info('node_sync.key_rotated', { node: rotation.node_code, fingerprint: rotation.key_fingerprint });
      return c.json({ data: { ...rotation, node_key: nodeKey } }, 200);
    } catch (err) {
      if (err instanceof NodeCodeInvalidError) throw new ValidationError(err.message);
      if (err instanceof Error && err.message === 'NODE_MISSING') throw new NotFoundError('نود');
      throw err;
    }
  });

  app.post('/revoke', authMiddleware(), requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NodeCodeSchema.parse(await c.req.json<unknown>());
    try {
      const result = await revokeNode(db, audit, { nodeCode: body.node_code, actorStaffId: actor.staffId });
      log.info('node_sync.revoked', { node: result.node_code });
      return c.json({ data: result }, 200);
    } catch (err) {
      if (err instanceof NodeCodeInvalidError) throw new ValidationError(err.message);
      if (err instanceof Error && err.message === 'NODE_MISSING') throw new NotFoundError('نود');
      throw err;
    }
  });

  app.get('/nodes', authMiddleware(), requireRole('manager'), async (c) => {
    return c.json({ data: { nodes: await listNodes(db) } }, 200);
  });

  // ۴۰۴ کم‌دست — هیچ جزئیاتی از مسیرهای زیر /node لو نمی‌رود (هم‌قرارداد §۵)
  app.notFound((c) => c.json({ error: 'NOT_FOUND' }, 404));

  // خطاها به errorHandler میزبان می‌روند (زیراپ همیشه در اپ اصلی سوار است)؛
  // errorHandler پاکت استاندارد + request_id همین زیراپ را می‌پیوندد.
  return app;
}
