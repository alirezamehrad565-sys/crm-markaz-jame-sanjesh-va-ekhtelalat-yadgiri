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
 *
 * rust-f15 — سهمیه و هم‌راستاسازی:
 *   • هر pull/pushِ احرازشده شمارندهٔ روزانهٔ quota_usage را با UPSERT تک‌دستوری جمع می‌زند
 *     (برآورد ثابت هندلر در service.ts؛ خواندنی‌های مدیریتی شمرده نمی‌شوند)؛ پاسخ صامت زیر
 *     گات push به قرارداد m1.5 «بدون نوشتن» می‌ماند و شمارش هم اضافه نمی‌کند.
 *   • GET /node/reconcile — شمارش/تازه‌ترین مُهر دامنه‌های pull برای هم‌راستاسازی نود؛
 *     دامنهٔ بیرون فهرست سفید = ۴۰۰ با همان پاکت NODE_DOMAIN_FORBIDDEN (قرارداد rust-f15).
 *   • registerCentralQuotaRoutes — GET /api/central/quota فقط-مدیر (سشن + نقش مدیر)؛
 *     در api-routing «بعد از» گیت‌های سراسری ثبت می‌شود.
 *
 * EXP-7 — محدودساز نرخ per-node: روی /node/pull، /node/push و /node/reconcile پنجرهٔ لغزان
 *   درون‌حافظهٔ per-node (پیش‌فرض ۱۲۰ درخواست در دقیقه بر node_code؛ env «۰» = خاموش)؛
 *   ردِ ۴۲۹ با پاکت استاندارد RateLimitError + یک ردیف audit به‌ازای هر ۴۲۹ (تلاش
 *   محدودشده مشکوک است). قرارداد پاسخ pull/push/reconcile دست‌نخورده می‌ماند — این لایه
 *   فقط «مسیر ۴۲۹ تازه» اضافه می‌کند و تحت سقف هیچ رفتاری عوض نمی‌شود.
 *
 * EXP-8 — نقشهٔ معماری فقط-سمت-مرکز: registerCentralNodesMapRoutes مسیر GET
 *   /api/central/nodes-map را با همان گیت quota (سشن + نقش مدیر) ثبت می‌کند؛ خروجی JSON
 *   پاکت قراردادی و با ?format=html صفحهٔ مدیریتی رندر-سروری فارسی RTL بدون هیچ JavaScript.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { faDigits } from '@core/shared';
import { authMiddleware, requireRole, getAuthContext } from '@core/auth';
import { runWithRequestId } from '@core/audit';
import type { AuditWriter } from '@core/audit';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { ConflictError, NotFoundError, RateLimitError, ValidationError } from '@core/errors';
// موج ۱ (۱-۳/۱-۴) — نسخهٔ مرکز و حداقل نسخهٔ نود در پاسخ‌های موفق pull/push حمل می‌شوند
import { APP_VERSION, NODE_MIN_VERSION } from '@core/version';
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
  NODE_PUSH_CATCHUP_HEADER,
  NODE_PUSH_DOMAIN_SET,
  NODE_PUSH_BODY_MAX_BYTES,
  NODE_PUSH_MIN_INTERVAL_MS,
  NODE_RATE_LIMIT_WINDOW_MS,
  NodeCodeInvalidError,
  NodePushRawBodySchema,
  bearerToken,
  bumpQuotaUsage,
  centralNodesMap,
  centralQuotaSnapshot,
  decodeNodeCursor,
  listNodes,
  makeNodeSlidingWindowLimiter,
  parseNodeRateLimitPerMin,
  pullNodePage,
  pushNodeEvents,
  reconcileDomainCounts,
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
import type { CentralNodesMapPayload, NodePullDomain, NodePushRawItem, SyncNodeRow } from './service';

export interface NodeSyncAppDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** تزریق زمان — فقط برای آزمون مُهر تلاش (پیش‌فرض: ساعت واقعی) */
  now?: () => Date;
  /** بازنویسی گات ۱۵دقیقه‌ای push — فقط برای آزمون */
  pushMinIntervalMs?: number;
  /** بازنویسی پنجرهٔ محدودساز per-node (EXP-7) — فقط برای آزمون؛ پیش‌فرض NODE_RATE_LIMIT_WINDOW_MS */
  rateLimitWindowMs?: number;
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

  // ─── EXP-7 — محدودساز نرخ per-node روی pull/push/reconcile (پنجرهٔ لغزان per-isolate) ───
  // کلید = node_code هدر (هویت نود؛ مقدار غیرمحرمانه)؛ هدر غایب = کلید per-IP در حافظهٔ همین
  // isolate (IP هرگز لاگ/ذخیره نمی‌شود — قانون PII §۶). سقف از env NODE_RATE_LIMIT_PER_MIN
  // («۰» = خاموش، پیش‌فرض ۱۲۰) و در کلید سطل هم می‌نشیند تا تغییر سقف سطل تازه بسازد.
  // ردِ ۴۲۹: پاکت استاندارد RateLimitError (errorHandler میزبان) + Retry-After + یک ردیف
  // audit به‌ازای هر ۴۲۹ — تلاش محدودشده مشکوک است (نظرسنجی ماشینی یا کلید سرقتی).
  // ثبت پیش از احراز نود: رگبار بی‌کلید هم پیش از پرس‌وجوی رجیستری بسته شود.
  const nodeLimitWindowMs = deps.rateLimitWindowMs ?? NODE_RATE_LIMIT_WINDOW_MS;
  const nodeLimiter = makeNodeSlidingWindowLimiter(nodeLimitWindowMs);
  const nodeRateLimitGuard = async (c: Context<Env>, next: () => Promise<void>): Promise<void> => {
    const perMin = parseNodeRateLimitPerMin(c.env?.NODE_RATE_LIMIT_PER_MIN);
    if (perMin <= 0) return next();
    const nodeCode = (c.req.header('X-CP-Node-Code') ?? '').trim().slice(0, 120);
    const ip = (c.req.header('cf-connecting-ip') ?? 'unknown').slice(0, 64);
    const key = nodeCode ? `node:${perMin}:${nodeCode}` : `anon:${perMin}:${ip}`;
    if (!nodeLimiter.allow(key, perMin)) {
      const retryAfterS = Math.ceil(nodeLimitWindowMs / 1000);
      c.header('Retry-After', String(retryAfterS));
      try {
        await audit.log({
          actorId: nodeCode || 'anonymous',
          action: 'node.rate_limited',
          resourceType: 'node',
          resourceId: nodeCode || 'unauthenticated',
          changes: { path: { from: null, to: c.req.path } }
        });
      } catch {
        // حکم م۲۱۰ — ممیزی هرگز مسیر را نمی‌شکند
      }
      throw new RateLimitError(
        retryAfterS,
        'تعداد درخواست‌های نود بیش از حد مجاز است — بعداً تلاش کنید'
      );
    }
    return next();
  };
  app.use('/pull', nodeRateLimitGuard);
  app.use('/push', nodeRateLimitGuard);
  app.use('/reconcile', nodeRateLimitGuard);

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

    // rust-f15 — شمارش سهمیه: هر pullِ احرازشده یک درخواست است (+۱ و برآورد ردیف هندلر).
    // تلاشِ احراز-نشدن شمرده نمی‌شود تا مهاجمِ بی‌کلید نتواند سهمیهٔ روز را با نویز متورم کند؛
    // خطای شمارش هم در bumpQuotaUsage بلعیده می‌شود (حکم م۲۱۰) و pull را نمی‌شکند.
    await bumpQuotaUsage(db, 'pull', now());

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

    // موج ۱ (۱-۳/۱-۴) — ساعت مرجع مرکز + هندشیک نسخه در هر پاسخ موفق pull (فقط-افزودنی؛
    // server_time قرارداد قبلی است و برای سازگاری عقب می‌ماند — همان مقدار server_ts).
    const at = now().toISOString();
    const page = await pullNodePage(db, { domains, cursor, limit });
    fireAndForget(c, stampNodePull(db, node.node_code, now()).catch(() => undefined));

    return c.json(
      {
        data: {
          items: page.items,
          next_cursor: page.next_cursor,
          server_time: at,
          server_ts: at,
          center_version: APP_VERSION,
          min_node_version: NODE_MIN_VERSION
        }
      },
      200
    );
  });

  // ─── GET /node/reconcile?domains=... — هم‌راستاسازی شمارش (rust-f15) ───
  // احراز دقیقاً هم‌الگوی pull (نودِ فعال با node_code+node_key)؛ دامنه‌ها همان فهرست سفید pull.
  // پاسخ: server_ts لحظهٔ مرکز + count/max_updated_at بر حسب دامنه — بدون پاکت data (قرارداد).
  // شمارش روی «همان ردیف‌هایی که pull تحویل می‌دهد» انجام می‌شود (شرط پایهٔ دامنه) تا نود بتواند
  // با صندوق محلی‌اش مقایسه کند. این مسیر در سهمیه شمرده نمی‌شود (خواندنی نودی سبک).
  app.get('/reconcile', async (c) => {
    const node = await authNode(c);
    if (!node) return authFailed(c);

    const rawDomains = (c.req.query('domains') ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);
    const unknownDomains = [...new Set(rawDomains.filter((d) => !NODE_PULL_DOMAIN_SET.has(d)))];
    if (unknownDomains.length > 0) {
      // قرارداد rust-f15: دامنهٔ بیرون فهرست سفید → ۴۰۰ با همان پاکت رد سفیدفهرست (کد آزمون‌پذیر)
      return c.json(
        {
          error: 'NODE_DOMAIN_FORBIDDEN',
          message: 'دامنهٔ درخواستی بیرون فهرست سفید reconcile است',
          details: { domains: unknownDomains }
        },
        400
      );
    }
    const domains: readonly NodePullDomain[] =
      rawDomains.length > 0 ? (rawDomains as NodePullDomain[]) : [...NODE_PULL_DOMAINS];

    const statuses = await reconcileDomainCounts(db, domains);
    return c.json({ server_ts: now().toISOString(), domains: statuses }, 200);
  });

  // ─── POST /node/push — سفیدفهرستی + مُهر تلاش + idempotency ───
  app.post('/push', async (c) => {
    const node = await authNode(c);
    if (!node) return authFailed(c);

    // ۱) گات ۱۵دقیقه‌ای — زیر گات پاسخ صامت: بدون خواندن بدنه، بدون لاگ، بدون نوشتن.
    //    (مُهر تلاش مشترک؛ نودِ خوش‌رفتار هرگز این پاسخ را نمی‌بیند — کلاینت خودش فاصله می‌گیرد.)
    // rust-f14 — استثنای همگام‌سازی جبرانی: درخواستی که صراحتاً خودش را catch-up اعلام می‌کند
    // (هدر NODE_PUSH_CATCHUP_HEADER — فقط بوت/تخلیهٔ صندوق) از گات می‌گذرد تا بوتِ پس از
    // هفته‌ها آفلاین در چند بستهٔ پشت‌سرهم کامل تخلیه شود. مُهر تلاش و بقیهٔ قراردادها همین‌جا
    // عیناً اجرا می‌شوند؛ تیک دوره‌ای بدون هدر زیر گات می‌ماند (هم‌ریتم m1.5).
    const catchUpDeclared = c.req.header(NODE_PUSH_CATCHUP_HEADER) === '1';
    const at = now();
    // موج ۱ (۱-۳/۱-۴) — پاکت نسخه/ساعت مرکز؛ روی پاسخ موفق و پاسخ صامت زیر گات هر دو می‌نشیند
    const handshake = {
      server_ts: at.toISOString(),
      center_version: APP_VERSION,
      min_node_version: NODE_MIN_VERSION
    };
    if (!catchUpDeclared && !shouldAttemptNodePush(node.last_push_attempt_at, at, minIntervalMs)) {
      const lastT = Date.parse(node.last_push_attempt_at ?? '');
      const retryAfterS = Number.isNaN(lastT)
        ? null
        : Math.max(0, Math.ceil((lastT + minIntervalMs - at.getTime()) / 1000));
      return c.json(
        { data: { accepted: 0, duplicates: 0, throttled: true, retry_after_s: retryAfterS, ...handshake } },
        200
      );
    }

    // ۲) rust-f15 — شمارش سهمیه فقط برای pushهایی که از گات گذشتند (+۱ و برآورد ردیف هندلر):
    //    پاسخ صامت زیر گات به قرارداد m1.5 «بدون لاگ/نوشتن» می‌ماند و شمارش سهمیه هم اضافه
    //    نمی‌کند؛ خطای شمارش در bumpQuotaUsage بلعیده می‌شود و push را نمی‌شکند (حکم م۲۱۰).
    await bumpQuotaUsage(db, 'push', now());

    // ۳) سقف سخت بدنه (اعتراف Content-Length — هم‌الگوی لولهٔ خطای مرورگر)
    const contentLength = Number.parseInt(c.req.header('content-length') ?? '0', 10) || 0;
    if (contentLength > NODE_PUSH_BODY_MAX_BYTES) {
      return c.json({ error: 'NODE_BODY_TOO_LARGE', message: 'حجم بدنهٔ push بیش از حد مجاز است' }, 400);
    }

    // ۴) مُهر تلاش قبل از کار — همان الگوی m1.5 (خطای بعدی هم فاصله می‌گیرد)
    await stampNodePushAttempt(db, node.node_code, at);

    // ۵) شکل کلی بدنه (SyntaxError → پاکت INVALID_JSON با errorHandler میزبان)
    const raw = NodePushRawBodySchema.parse(await c.req.json<unknown>());

    // ۶) فهرست سفید push — رد صریح کل درخواست؛ حتی یک بایت هم نوشته نمی‌شود (fail-closed)
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

    // ۷) اعتبارسنجی سفت بر حسب دامنه (ZodError → ۴۰۰ با details)
    const items = raw.items.map((it: NodePushRawItem) => validatePushItem(it));

    // ۸) درج idempotent — جفت (node_code, id)؛ دوباره‌فرستادن همان id هیچ ردیفی اضافه نمی‌کند
    const outcome = await pushNodeEvents(db, node.node_code, items);
    await stampNodePushOk(db, node.node_code, at).catch(() => undefined);
    log.info('node_sync.push', { node: node.node_code, accepted: outcome.accepted, duplicates: outcome.duplicates });

    return c.json(
      { data: { accepted: outcome.accepted, duplicates: outcome.duplicates, throttled: false, ...handshake } },
      200
    );
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

// ─── rust-f15 — GET /api/central/quota: دید مصرف روزانهٔ سهمیهٔ مرکز (فقط-مدیر) ───
// احراز: همان الگوی مسیرهای مدیریتی دیگر ورکر — گیت سشن authMiddleware + requireRole('manager')
// (عین مسیرهای register/rotate-key/revoke/nodes زیراپ). جای ثبت: api-routing «بعد از» گیت‌های
// سراسری /api/* تا سشن بگیرد و no-store/request-id از زنجیرهٔ عمومی بیاید.
// پاسخ: پاکت خام قرارداد rust-f15 (بدون لفاف data) — day/requests/rows_written/rows_read_est +
// limits/percent/level + estimated:true + failed_logins_24h. منطق در centralQuotaSnapshot است.
export interface CentralQuotaRoutesDeps {
  db: DbClient;
  /** تزریق زمان — فقط برای آزمون (پیش‌فرض: ساعت واقعی) */
  now?: () => Date;
}

export function registerCentralQuotaRoutes(app: AppHono, deps: CentralQuotaRoutesDeps): void {
  const now = deps.now ?? (() => new Date());
  app.get('/api/central/quota', authMiddleware(), requireRole('manager'), async (c) => {
    const snapshot = await centralQuotaSnapshot(deps.db, now());
    return c.json(snapshot, 200);
  });
}

// ─── EXP-8 — GET /api/central/nodes-map: نقشهٔ معماری مرکز↔نودها (فقط-مدیر) ───
// احراز: عین مسیر quota — گیت سشن authMiddleware + requireRole('manager'). جای ثبت:
// api-routing «بعد از» گیت‌های سراسری /api/* (هم‌الگوی quota) تا سشن بگیرد و no-store و
// request-id از زنجیرهٔ عمومی بیاید. JSON = پاکت قراردادی EXP-8؛ ?format=html = صفحهٔ
// مدیریتی رندر-سروری (پیشینهٔ text/html در ورکر: گزارش بازی‌ها routes.ts `?format=html` و
// صفحهٔ /m/:token — هدرهای همان خانواده: no-store + noindex + CSP سخت بدون اسکریپت).
export interface CentralNodesMapRoutesDeps {
  db: DbClient;
  /** تزریق زمان — فقط برای آزمون (پیش‌فرض: ساعت واقعی) */
  now?: () => Date;
}

export function registerCentralNodesMapRoutes(app: AppHono, deps: CentralNodesMapRoutesDeps): void {
  const now = deps.now ?? (() => new Date());
  app.get('/api/central/nodes-map', authMiddleware(), requireRole('manager'), async (c) => {
    const map = await centralNodesMap(deps.db, now());
    if (c.req.query('format') === 'html') {
      return new Response(renderNodesMapHtml(map), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        }
      });
    }
    return c.json(map, 200);
  });
}

// ─── EXP-8 — رندر سروری صفحهٔ نقشهٔ معماری ───
// خودکفا: CSS درون‌خطی، بدون هیچ JavaScript، فارسی RTL. خروجی «فقط-گزارش» است — هیچ دکمهٔ
// اقدامی ندارد (قرارداد آشتی‌ساز/داشبورد: گزارش می‌دهد، اصلاح نمی‌کند).

/** گریز HTML برای مقادیرِ از رجیستری (label ورودی مدیر است — همیشه گریز می‌شود) */
function escHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** نمایش مقدار تاریخ/رشته؛ null/خالی = «—» (فیلد بدون منبع مرکزی، صادقانه خالی می‌ماند) */
function faCell(v: string | null | undefined): string {
  if (!v) return '—';
  return faDigits(v.slice(0, 19).replace('T', ' '));
}

const STATE_CHIP: Record<CentralNodesMapPayload['nodes'][number]['status']['state'], { cls: string; label: string }> = {
  synced: { cls: 'chip ok', label: 'هم‌گام' },
  stale: { cls: 'chip warn', label: 'بی‌تماس' },
  never_seen: { cls: 'chip warn', label: 'هرگز تماس نگرفته' },
  revoked: { cls: 'chip bad', label: 'باطل‌شده' }
};

const QUOTA_LEVEL_CHIP: Record<CentralNodesMapPayload['quota']['level'], { cls: string; label: string }> = {
  ok: { cls: 'chip ok', label: 'سبز — مصرف عادی' },
  warn: { cls: 'chip warn', label: 'زرد — نزدیک سقف (۸۰٪+)' },
  danger: { cls: 'chip bad', label: 'قرمز — روی مرز سقف (۹۵٪+) — پلن Workers Paid را فعال کنید' }
};

export function renderNodesMapHtml(map: CentralNodesMapPayload): string {
  const worstPercent = Math.max(
    map.quota.percent_requests,
    map.quota.percent_rows_written,
    map.quota.percent_rows_read
  );
  const levelChip = QUOTA_LEVEL_CHIP[map.quota.level];
  const nodeRows = map.nodes.length
    ? map.nodes
        .map((n) => {
          const chip = STATE_CHIP[n.status.state];
          const rowCls = n.status.state === 'revoked' ? 'node bad' : n.status.state === 'synced' ? 'node' : 'node warn';
          const pending =
            n.status.pending_push !== null
              ? faDigits(String(n.status.pending_push))
              : '—';
          const recon = n.status.reconciliation_ok === null ? '—' : n.status.reconciliation_ok ? 'هم‌خوان' : 'ناهم‌خوان';
          return `      <div class="${rowCls}">
        <div class="row1">
          <span class="name">${escHtml(n.name)}</span>
          <span class="code">${escHtml(n.node_id)}</span>
          <span class="${chip.cls}">${chip.label}</span>
        </div>
        <div class="meta">
          <span>ثبت: ${faCell(n.registered_at)}</span>
          <span>آخرین تماس: ${faCell(n.last_seen)}</span>
          <span>آخرین pull موفق: ${faCell(n.status.last_pull_ok_at)}</span>
          <span>آخرین push موفق: ${faCell(n.status.last_push_ok_at)}</span>
          <span>در انتظار push: ${pending}</span>
          <span>آشتی‌ساز: ${recon}</span>
        </div>
      </div>`;
        })
        .join('\n')
    : '      <div class="node empty">هنوز نودی ثبت نشده است — از مسیر ثبت نود (فقط-مدیر) یک میز را پیوند بزنید.</div>';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>نقشهٔ معماری — مرکز و نودها</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f6f8; color: #1f2937; font-family: Vazirmatn, Tahoma, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.9; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 10px; }
  .meta { color: #6b7280; font-size: 12.5px; }
  .center { background: #fff; border: 2px solid #1d4ed8; border-radius: 12px; padding: 16px 20px; text-align: center; }
  .center .tag { display: inline-block; background: #dbeafe; color: #1e3a8a; border-radius: 999px; padding: 2px 14px; font-size: 12.5px; }
  .bar { background: #e5e7eb; border-radius: 999px; height: 14px; margin: 12px auto 6px; max-width: 520px; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: ${map.quota.level === 'danger' ? '#dc2626' : map.quota.level === 'warn' ? '#d97706' : '#16a34a'}; border-radius: 999px; }
  .connector { width: 2px; height: 26px; background: #94a3b8; margin: 0 auto; }
  .node { background: #fff; border: 1px solid #e2e8f0; border-inline-start: 6px solid #16a34a; border-radius: 10px; padding: 10px 14px; margin: 10px 0; }
  .node.warn { border-inline-start-color: #d97706; }
  .node.bad { border-inline-start-color: #dc2626; }
  .node.empty { color: #6b7280; border-inline-start-color: #cbd5e1; }
  .row1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .row1 .name { font-weight: 700; }
  .row1 .code { color: #64748b; font-size: 12px; direction: ltr; }
  .chip { border-radius: 999px; padding: 1px 12px; font-size: 12px; white-space: nowrap; }
  .chip.ok { background: #dcfce7; color: #166534; }
  .chip.warn { background: #fef9c3; color: #92400e; }
  .chip.bad { background: #fee2e2; color: #991b1b; }
  .node .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 4px; font-size: 12.5px; color: #475569; }
  .legend { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; font-size: 13px; }
  .legend ul { margin: 6px 0 0; padding-inline-start: 20px; }
  .note { color: #6b7280; font-size: 12.5px; margin-top: 10px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>نقشهٔ معماری — مرکز ↔ نودها</h1>
    <div class="meta">نسخهٔ مرکز: ${faDigits(map.center_version)} · لحظهٔ مرکز: ${faCell(map.server_ts)} · گزارشِ فقط-خواندنی است؛ این صفحه هیچ دادهٔ بالینی ندارد.</div>
  </header>

  <h2>مرکز (Cloudflare Worker + D1)</h2>
  <section class="center">
    <span class="tag">مرکز</span>
    <div>نسخهٔ ${faDigits(map.center_version)}</div>
    <div class="bar"><i style="width: ${faDigits(String(Math.min(100, Math.max(worstPercent, 1))))}%"></i></div>
    <div class="meta">سهمیهٔ روز (${faDigits(map.quota.day)}): درخواست‌ها ${faDigits(String(map.quota.percent_requests))}٪ · سطرنویسی ${faDigits(String(map.quota.percent_rows_written))}٪ · سطرخوانی ${faDigits(String(map.quota.percent_rows_read))}٪ — <span class="${levelChip.cls}">${levelChip.label}</span></div>
  </section>
  <div class="connector" aria-hidden="true"></div>

  <h2>نودها (${faDigits(String(map.nodes.length))})</h2>
  <section>
${nodeRows}
  </section>

  <h2>راهنمای رنگ‌ها</h2>
  <section class="legend">
    <ul>
      <li><span class="chip ok">هم‌گام</span> سبز — آخرین تماس نود با مرکز کمتر از ۲۴ ساعت پیش است.</li>
      <li><span class="chip warn">بی‌تماس / در انتظار</span> زرد — بیش از ۲۴ ساعت تماس نبوده، نود هنوز هرگز تماس نگرفته، یا رکوردی در انتظار push است.</li>
      <li><span class="chip bad">باطل / خطا</span> قرمز — نود از پنل مرکز باطل شده است. (وضعیت «خطا»ی سمت نود هنوز به مرکز آینه نمی‌شود؛ قرمزِ امروز فقط «باطل‌شده» را نشان می‌دهد.)</li>
      <li>نوار سهمیهٔ مرکز با رنگ سطح مصرف (سبز عادی / زرد ۸۰٪+ / قرمز ۹۵٪+) رنگ می‌شود.</li>
    </ul>
    <div class="note">ستون‌های «در انتظار push» و «آشتی‌ساز» فعلاً «—» می‌مانند: آینهٔ وضعیت سینک فقط روی دستگاهِ خود شعبه ذخیره می‌شود و به مرکز ارسال نمی‌شود (قرارداد rust-f14) — مرکز فقط مُهر تماس‌های واقعی (pull/push) را از رجیستری می‌داند.</div>
  </section>
</main>
</body>
</html>`;
}
