/**
 * سینک ترکیبی نودهای دسکتاپ (rust-f4) — منطق سمت ورکر
 * سند قرارداد: docs/rust/node-sync.md · طراحی: docs/rust/design.md §۵
 *
 * دسکتاپ میز، یک «نود» در شبکه است با هویت node_code = DESKTOP:<install-id> + node_key.
 * جهت داده فقط دوطرفهٔ سفیدفهرستی است و هیچ چیز دیگری:
 *   pull  (نود از ابر):  announcements · packages · library   — فقط این سه
 *   push  (نود به ابر):  usage_summary · client_errors · health_ping — فقط این سه
 * ممنوعیت مطلقِ انتقال دادهٔ بالینی (مراجعان/جلسات/تجویزها/فعالیت بازی فردی) نه فقط در سند،
 * در کد با فهرست سفید دامنه اعمال می‌شود: دامنهٔ بیرون فهرست = رد صریح 403 با کد آزمون‌پذیر.
 *
 * الگوهای بازاستفاده‌شده از خط m1.5/cp (بدون نوآوری پروتکلی):
 *  • احراز کلید: هش SHA-256 سمت سرور + مقایسهٔ زمان‌ثابت + محاسبهٔ هش حتی برای کد ناموجود
 *    (ضدکاوش) — همان مکانیزم cp-link (docs/cp-link-key-rotation.md §۱) با hashApiKey موجود.
 *  • هدرها: X-CP-Node-Code + Authorization: Bearer — عین قرارداد cp-sync/cp-report/cp-content.
 *  • مُهر تلاش push: مُهر قبل از کار، گات ۱۵دقیقه‌ای، پاسخ صامت زیر گات (بدون رشد لاگ/audit) —
 *    همان نویز-سپر cp-sync/cp-report؛ مُهرها روی ردیف خود نود در sync_nodes می‌نشیند.
 *  • idempotency push با جفت (node_code, id) — همان قرارداد ingest م۱.۲.
 *  • چرخش کلید: plaintext فقط یک‌بار در پاسخ، ابطال بی‌درنگ کلید کهنه (تک‌ستون هش) — سیاست CP-6.
 *  • حکم م۲۱۰: خطا هرگز مسیری را نمی‌شکند — خروجی همهٔ عملیات مقدار است نه throw، و
 *    سمت نود (کلاینت) در قطع شبکه فقط خطای نرم می‌گیرد و دورهٔ بعد تلاش می‌کند.
 *  • rust-f15 — سهمیهٔ روزانهٔ مرکز: شمارش برآوردی مصرف (pull/push/login) در quota_usage با
 *    UPSERT تک‌دستوری؛ تصویر مصرف GET /api/central/quota و هم‌راستاسازی GET /node/reconcile.
 */
import { z } from 'zod';
import { hashApiKey } from '@core/auth';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';

// ─── فهرست سفید دامنه‌ها — مرزِ قرارداد؛ رشد فقط با ویرایش آگاهانهٔ هر دو سمت ───

/** دامنه‌های مجاز pull (نود از ابر می‌خواند) — محتوای عمومی شبکه، هرگز بالینی */
export const NODE_PULL_DOMAINS = ['announcements', 'packages', 'library'] as const;
/** دامنه‌های مجاز push (نود به ابر می‌فرستد) — فقط تله‌متری تجمیعی/بی‌نام، هرگز بالینی */
export const NODE_PUSH_DOMAINS = ['usage_summary', 'client_errors', 'health_ping'] as const;

export type NodePullDomain = (typeof NODE_PULL_DOMAINS)[number];
export type NodePushDomain = (typeof NODE_PUSH_DOMAINS)[number];

export const NODE_PULL_DOMAIN_SET: ReadonlySet<string> = new Set(NODE_PULL_DOMAINS);
export const NODE_PUSH_DOMAIN_SET: ReadonlySet<string> = new Set(NODE_PUSH_DOMAINS);

// ─── سقف‌ها و گات‌ها (هم‌ریتم قرارداد m1.5) ───

/** حداقل فاصلهٔ دو push هر نود — ۱۵ دقیقه (هم‌ریتم گات سینک m1.5) */
export const NODE_PUSH_MIN_INTERVAL_MS = 15 * 60_000;
/**
 * rust-f14 — هدر اعلام «همگام‌سازی جبرانی» (catch-up) روی /node/push: فقط گات ۱۵دقیقه‌ای را
 * برای همین درخواست می‌گشاید — بوتِ پس از هفته‌ها آفلاین باید صندوق را در چند بستهٔ پشت‌سرهم
 * تخلیه کند وگرنه گات پس از بستهٔ نخست می‌ایستد. مُهر تلاش، فهرست سفید و idempotency
 * (node_code, id) عیناً برقرار می‌مانند؛ تیک دوره‌ای بدون این هدر زیر گات می‌ماند.
 */
export const NODE_PUSH_CATCHUP_HEADER = 'X-CP-Node-Catchup';
/** حداکثر آیتم در یک push */
export const NODE_PUSH_MAX_ITEMS = 100;
/** حداکثر بدنهٔ push — ۲۵۶KB (پشتهٔ خطا و شمارنده‌ها جا می‌شود؛ بزرگ‌تر یعنی سوءاستفاده) */
export const NODE_PUSH_BODY_MAX_BYTES = 256 * 1024;
/** پیش‌فرض و سقف صفحهٔ pull — هم‌ریتم سقف قراردادی CP (۱۰۰) */
export const NODE_PULL_DEFAULT_LIMIT = 50;
export const NODE_PULL_MAX_LIMIT = 100;
/** شکل هویت نود: DESKTOP:<install-id> — install-id فقط حروف/رقم/نقطه/خط تیره */
export const NODE_CODE_PATTERN = /^DESKTOP:[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

type Stringish = string | undefined | null;

/** رشتهٔ خالی/فاصله‌دار = تنظیم‌نشده (هم‌قرارداد clean در cp-*) */
function clean(v: Stringish): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/** استخراج توکن از هدر Authorization (فقط شکل Bearer) */
export function bearerToken(header: Stringish): string | null {
  const s = clean(header);
  if (!s) return null;
  return s.startsWith('Bearer ') ? clean(s.slice(7)) : null;
}

// ─── کلید نود — همان مکانیزم هش کلید موجود، با پیشوند جدا تا با کلید API کارمندان اشتباه نشود ───

const NODE_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export interface GeneratedNodeKey {
  /** plaintext — فقط یک‌بار در پاسخ register/rotate-key برمی‌گردد و هرگز ذخیره/لاگ نمی‌شود */
  token: string;
  keyHash: string;
  /** ۱۲ کاراکتر اول هش — تنها بازنمایی مجاز کلید در لاگ/audit/پنل */
  fingerprint: string;
}

function randomKeySuffix(length = 40): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) out += NODE_KEY_ALPHABET[bytes[i] % NODE_KEY_ALPHABET.length];
  return out;
}

/** کلید نود با پیشوند nk_live_ — هش همان hashApiKey مکانیزم موجود (SHA-256) */
export async function generateNodeKey(): Promise<GeneratedNodeKey> {
  const token = `nk_live_${randomKeySuffix()}`;
  const keyHash = await hashApiKey(token);
  return { token, keyHash, fingerprint: keyHash.slice(0, 12) };
}

/** مقایسهٔ زمان‌ثابت دو رشتهٔ هش hex — هم‌قرارداد تأیید CP (بدون نشت طول/محتوا) */
export function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── رجیستری نود — ثبت/چرخش/باطل‌سازی فقط-مدیر با audit ───

export interface SyncNodeRow {
  node_code: string;
  label: string | null;
  key_hash: string;
  key_fingerprint: string;
  key_rotated_at: string;
  active: number;
  last_pull_at: string | null;
  last_push_attempt_at: string | null;
  last_push_ok_at: string | null;
  created_at: string;
}

const NODE_ROW_COLUMNS =
  'node_code, label, key_hash, key_fingerprint, key_rotated_at, active, last_pull_at, last_push_attempt_at, last_push_ok_at, created_at';

export class NodeCodeInvalidError extends Error {
  constructor() {
    super('کد نود باید شکل DESKTOP:<install-id> داشته باشد');
    this.name = 'NodeCodeInvalidError';
  }
}

export interface NodeRegistration {
  node_code: string;
  label: string | null;
  key_fingerprint: string;
  created_at: string;
}

/** ثبت نود تازه — plaintext کلید فقط در خروجی این تابع است (یک‌بار؛ همان قرارداد rotate-key CP) */
export async function registerNode(
  db: DbClient,
  audit: AuditWriter,
  input: { nodeCode: string; label: string | null; actorStaffId: string }
): Promise<{ registration: NodeRegistration; nodeKey: string }> {
  const code = clean(input.nodeCode);
  if (!code || !NODE_CODE_PATTERN.test(code)) throw new NodeCodeInvalidError();
  const label = clean(input.label)?.slice(0, 120) ?? null;
  const { token, keyHash, fingerprint } = await generateNodeKey();
  const createdAt = new Date().toISOString();

  const registration = await db.transaction(async (tx) => {
    const dup = await tx.queryOne<{ node_code: string }>(
      'SELECT node_code FROM sync_nodes WHERE node_code = ?',
      [code]
    );
    if (dup) {
      throw new Error('NODE_CODE_TAKEN'); // مسیر تبدیل به ConflictError در لایهٔ روت
    }
    await tx.execute(
      `INSERT INTO sync_nodes (node_code, label, key_hash, key_fingerprint, key_rotated_at, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [code, label, keyHash, fingerprint, createdAt, input.actorStaffId, createdAt, createdAt]
    );
    // audit — هرگز کلید plaintext در آن نمی‌نشیند؛ فقط اثر انگشت (سیاست cp-link §۴)
    await audit.logInTransaction(tx, {
      actorId: input.actorStaffId,
      action: 'node.register',
      resourceType: 'node',
      resourceId: code,
      changes: { label: { from: null, to: label }, key_fingerprint: { from: null, to: fingerprint } }
    });
    return { node_code: code, label, key_fingerprint: fingerprint, created_at: createdAt };
  });

  return { registration, nodeKey: token };
}

export interface NodeKeyRotation {
  node_code: string;
  key_fingerprint: string;
  rotated_at: string;
}

/**
 * چرخش کلید نود — plaintext فقط یک‌بار در خروجی؛ کلید کهنه بی‌درنگ باطل می‌شود
 * (تک‌ستون هش — همان سیاست «مسیر امروز» سند cp-link §۲ بند ۲).
 */
export async function rotateNodeKey(
  db: DbClient,
  audit: AuditWriter,
  input: { nodeCode: string; actorStaffId: string }
): Promise<{ rotation: NodeKeyRotation; nodeKey: string }> {
  const code = clean(input.nodeCode);
  if (!code) throw new NodeCodeInvalidError();
  const current = await db.queryOne<SyncNodeRow>(`SELECT ${NODE_ROW_COLUMNS} FROM sync_nodes WHERE node_code = ?`, [code]);
  if (!current) throw new Error('NODE_MISSING'); // مسیر تبدیل به NotFoundError در لایهٔ روت
  const { token, keyHash, fingerprint } = await generateNodeKey();
  const rotatedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.execute(
      `UPDATE sync_nodes SET key_hash = ?, key_fingerprint = ?, key_rotated_at = ?, updated_at = ? WHERE node_code = ?`,
      [keyHash, fingerprint, rotatedAt, rotatedAt, code]
    );
    await audit.logInTransaction(tx, {
      actorId: input.actorStaffId,
      action: 'node.rotate_key',
      resourceType: 'node',
      resourceId: code,
      changes: { key_fingerprint: { from: current.key_fingerprint, to: fingerprint } }
    });
  });
  return { rotation: { node_code: code, key_fingerprint: fingerprint, rotated_at: rotatedAt }, nodeKey: token };
}

/** باطل‌سازی نود (نرم؛ ردیف می‌ماند) — نود باطل‌شده در نخستین درخواست ۴۰۱ می‌گیرد */
export async function revokeNode(
  db: DbClient,
  audit: AuditWriter,
  input: { nodeCode: string; actorStaffId: string }
): Promise<{ node_code: string; active: 0 }> {
  const code = clean(input.nodeCode);
  if (!code) throw new NodeCodeInvalidError();
  const current = await db.queryOne<SyncNodeRow>(`SELECT ${NODE_ROW_COLUMNS} FROM sync_nodes WHERE node_code = ?`, [code]);
  if (!current) throw new Error('NODE_MISSING');
  await db.transaction(async (tx) => {
    await tx.execute(`UPDATE sync_nodes SET active = 0, updated_at = ? WHERE node_code = ?`, [new Date().toISOString(), code]);
    await audit.logInTransaction(tx, {
      actorId: input.actorStaffId,
      action: 'node.revoke',
      resourceType: 'node',
      resourceId: code,
      changes: { active: { from: current.active === 1, to: false } }
    });
  });
  return { node_code: code, active: 0 };
}

export interface SyncNodeListItem {
  node_code: string;
  label: string | null;
  active: boolean;
  key_fingerprint: string;
  key_rotated_at: string;
  last_pull_at: string | null;
  last_push_ok_at: string | null;
  created_at: string;
}

/** فهرست نودها برای پنل مدیر — بدون هش، بدون plaintext */
export async function listNodes(db: DbClient): Promise<SyncNodeListItem[]> {
  const rows = await db.query<SyncNodeRow>(
    `SELECT ${NODE_ROW_COLUMNS} FROM sync_nodes ORDER BY created_at DESC, node_code ASC`,
    []
  );
  return rows.map((r) => ({
    node_code: r.node_code,
    label: r.label,
    active: r.active === 1,
    key_fingerprint: r.key_fingerprint,
    key_rotated_at: r.key_rotated_at,
    last_pull_at: r.last_pull_at,
    last_push_ok_at: r.last_push_ok_at,
    created_at: r.created_at
  }));
}

// ─── احراز نود — هم‌قرارداد هدرهای cp-* و مکانیزم تأیید کلید cp-link ───

export type NodeAuthOutcome =
  | { ok: true; node: SyncNodeRow }
  | { ok: false; fingerprint: string };

/**
 * تأیید node_code + node_key:
 *  • هش SHA-256 کلید ارائه‌شده حتی برای کد ناموجود محاسبه می‌شود (ضدکاوش — هم‌الگوی CP).
 *  • مقایسهٔ زمان‌ثابت با هش ذخیره‌شده.
 *  • «کد ناموجود»، «نود باطل» و «کلید غلط» همه یک خروجی می‌دهند — پاسخ روت یک‌شکل و کم‌دست است.
 */
export async function verifyNodeCredentials(
  db: DbClient,
  input: { nodeCode: Stringish; bearer: Stringish }
): Promise<NodeAuthOutcome> {
  const code = clean(input.nodeCode);
  const key = clean(input.bearer);
  const hash = await hashApiKey(key ?? ''); // همیشه محاسبه می‌شود — ضدکاوش
  const fingerprint = hash.slice(0, 12);
  if (!code || !key) return { ok: false, fingerprint };
  const node = await db.queryOne<SyncNodeRow>(
    `SELECT ${NODE_ROW_COLUMNS} FROM sync_nodes WHERE node_code = ?`,
    [code]
  );
  if (!node || node.active !== 1) return { ok: false, fingerprint };
  if (!timingSafeHexEqual(node.key_hash, hash)) return { ok: false, fingerprint };
  return { ok: true, node };
}

// ─── مُهر تلاش push — همان نویز-سپر m1.5 (مُهر قبل از کار؛ زیر گات پاسخ صامت) ───

/** آیا از آخرین تلاش به اندازهٔ کافی گذشته؟ مُهر غایب/خراب = اجازهٔ تلاش (هم‌قرارداد shouldAttemptCpSync) */
export function shouldAttemptNodePush(
  lastAttemptIso: string | null,
  now: Date,
  minIntervalMs: number = NODE_PUSH_MIN_INTERVAL_MS
): boolean {
  if (!lastAttemptIso) return true;
  const t = Date.parse(lastAttemptIso);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= minIntervalMs;
}

export async function stampNodePushAttempt(db: DbClient, nodeCode: string, at: Date): Promise<void> {
  await db.execute(
    `UPDATE sync_nodes SET last_push_attempt_at = ?, updated_at = ? WHERE node_code = ?`,
    [at.toISOString(), at.toISOString(), nodeCode]
  );
}

export async function stampNodePushOk(db: DbClient, nodeCode: string, at: Date): Promise<void> {
  await db.execute(
    `UPDATE sync_nodes SET last_push_ok_at = ?, last_push_attempt_at = ?, updated_at = ? WHERE node_code = ?`,
    [at.toISOString(), at.toISOString(), at.toISOString(), nodeCode]
  );
}

export async function stampNodePull(db: DbClient, nodeCode: string, at: Date): Promise<void> {
  await db.execute(
    `UPDATE sync_nodes SET last_pull_at = ?, updated_at = ? WHERE node_code = ?`,
    [at.toISOString(), at.toISOString(), nodeCode]
  );
}

// ─── pull — صفحه‌بندی کلیدset پایدار روی اجتماع دامنه‌های سفید ───

export interface NodePullItem {
  id: string;
  domain: NodePullDomain;
  updated_at: string;
  payload: Record<string, unknown>;
}

export interface PullPageResult {
  items: NodePullItem[];
  next_cursor: string | null;
}

/** cursor مپر: base64url(JSON {d,t,i}) — مپر = آخرین ردیف تحویل‌شده (کلیدset) */
export interface NodeCursor {
  d: string;
  t: string;
  i: string;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
  try {
    const norm = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
    const bin = atob(norm + pad);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeNodeCursor(c: NodeCursor): string {
  return toBase64Url(JSON.stringify({ d: c.d.slice(0, 40), t: c.t.slice(0, 40), i: c.i.slice(0, 200) }));
}

/** cursor خراب/غایب → null (غایب = صفحهٔ نخست؛ خراب = خطای ۴۰۰ در روت) */
export function decodeNodeCursor(raw: Stringish): NodeCursor | null {
  const s = clean(raw);
  if (!s) return null;
  if (s.length > 512) return null;
  const json = fromBase64Url(s);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { d?: unknown; t?: unknown; i?: unknown };
    if (typeof parsed.d !== 'string' || typeof parsed.t !== 'string' || typeof parsed.i !== 'string') return null;
    if (parsed.t.length === 0 || parsed.i.length === 0) return null;
    return { d: parsed.d, t: parsed.t, i: parsed.i };
  } catch {
    return null;
  }
}

function parseJsonSafe(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

interface PullSource {
  domain: NodePullDomain;
  /** نام جدول */
  from: string;
  /** شرط پایهٔ دامنه (بدون شرط cursor) */
  fromWhere: string;
  /** عبارت شناسهٔ آیتم — پیش‌فرض id؛ بسته‌ها «pkg@نسخه» (نسخه‌قفل، هم‌قرارداد §۱۳ بازی‌ها) */
  idExpr?: string;
  /** payload به شکل JSON در خود SQL ساخته می‌شود (json_object) تا UNION به‌جای موقعیت، نام داشته باشد */
  columns: string;
  payload: (data: unknown) => Record<string, unknown>;
}

/** updated_at همیشه نرمال ISO ثانیه‌ای می‌شود تا ترتیب بین جدول‌ها یکدست باشد (فرمت‌های دوگانهٔ ستون‌ها) */
const ISO_NORM = `strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)`;

const PULL_SOURCES: readonly PullSource[] = [
  {
    domain: 'announcements',
    from: 'announcements',
    columns: `json_object('title', title, 'body', body, 'show_login', show_login, 'show_panel', show_panel,
                           'active', active, 'created_at', created_at)`,
    fromWhere: 'active = 1',
    payload: (d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        title: o.title,
        body: o.body,
        show_login: o.show_login === 1,
        show_panel: o.show_panel === 1,
        active: o.active === 1,
        created_at: o.created_at
      };
    }
  },
  {
    domain: 'packages',
    from: 'game_packages',
    idExpr: `id || '@' || version`,
    columns: `json_object('version', version, 'title_fa', title_fa, 'evidence_level', evidence_level,
                           'dose_json', dose_json, 'body_json', body_json, 'status', status)`,
    fromWhere: `status = 'published'`,
    payload: (d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        version: o.version,
        title_fa: o.title_fa,
        evidence_level: o.evidence_level,
        dose: parseJsonSafe(o.dose_json as string | null),
        body: parseJsonSafe(o.body_json as string | null),
        status: o.status
      };
    }
  },
  {
    domain: 'library',
    from: 'network_content',
    columns: `json_object('kind', kind, 'title', title, 'summary', summary, 'body', body,
                           'tags', tags, 'source_center', source_center)`,
    fromWhere: `origin = 'cp' AND active = 1`,
    payload: (d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        kind: o.kind,
        title: o.title,
        summary: o.summary,
        body: parseJsonSafe(o.body as string | null),
        tags: parseJsonSafe(o.tags as string | null) ?? [],
        source_center: o.source_center
      };
    }
  }
];

/**
 * یک صفحهٔ pull روی اجتماع دامنه‌های خواسته‌شده — مرتب کلیدsetی بر (updated_at, id, domain)؛
 * cursor پایدار است: درج هم‌زمان ترتیب را نمی‌شکند و هیچ آیتمی دو بار نمی‌آید.
 * همهٔ مقایسه‌ها در SQL انجام می‌شود (بدون ناهمخوانی collation بین JS و SQLite).
 */
export async function pullNodePage(
  db: DbClient,
  opts: { domains: readonly NodePullDomain[]; cursor: NodeCursor | null; limit: number }
): Promise<PullPageResult> {
  const branches: string[] = [];
  const params: unknown[] = [];
  const sources = PULL_SOURCES.filter((s) => opts.domains.includes(s.domain));
  for (const src of sources) {
    // هر شاخه دقیقاً همین چهار ستون را می‌دهد تا UNION با نام (نه موقعیت) یکی شود
    let branch = `SELECT '${src.domain}' AS domain, ${src.idExpr ?? 'id'} AS id, ${ISO_NORM} AS updated_at, ${src.columns} AS data
                    FROM ${src.from} WHERE ${src.fromWhere}`;
    if (opts.cursor) {
      // شرط کلیدset با تیراز دامنه — مقایسهٔ سه‌مولفه‌ای (t, id, domain)؛ همه در SQL
      branch += ` AND (${ISO_NORM} > ? OR (${ISO_NORM} = ? AND (id > ? OR (id = ? AND '${src.domain}' > ?))))`;
      params.push(opts.cursor.t, opts.cursor.t, opts.cursor.i, opts.cursor.i, opts.cursor.d);
    }
    branches.push(branch);
  }
  if (branches.length === 0) return { items: [], next_cursor: null };

  const sql = `SELECT * FROM (${branches.join(' UNION ALL ')}) ORDER BY updated_at ASC, id ASC, domain ASC LIMIT ?`;
  params.push(opts.limit + 1);
  const rows = await db.query<Record<string, unknown> & { domain: string }>(sql, params);

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const items: NodePullItem[] = page.map((r) => {
    const src = sources.find((s) => s.domain === r.domain) as PullSource;
    return {
      id: String(r.id),
      domain: r.domain as NodePullDomain,
      updated_at: String(r.updated_at),
      payload: src.payload(parseJsonSafe(r.data as string))
    };
  });
  const last = page.length > 0 ? page[page.length - 1] : null;
  return {
    items,
    next_cursor: hasMore && last ? encodeNodeCursor({ d: String(last.domain), t: String(last.updated_at), i: String(last.id) }) : null
  };
}

// ─── سهمیهٔ روزانهٔ مرکز (rust-f15) — شمارش برآوردی مصرف Workers/D1 پلن رایگان ───

/**
 * سقف‌های پلن رایگان Cloudflare — «تقریبی» و وابسته به پلن رایگان (estimated): این اعداد
 * سقف‌های روزانهٔ اعلامی Workers/D1 در زمان نوشتن است (درخواست ۱۰۰هزار، ردیف‌نویسی ۱۰۰هزار،
 * ردیف‌خوانی ۵میلیون) و هرگز صورتحساب دقیق پلتفورم نیستند — فقط مبنای سطح‌بندی هشدار
 * (ok/warn/danger) در GET /api/central/quota. تغییر پلن یا تغییر سیاست Cloudflare یعنی
 * این ثابت‌ها باید بازبینی شوند؛ پاسخ همیشه estimated: true می‌فرستد تا مصرف‌کننده فریب نخورد.
 */
export const QUOTA_LIMITS = {
  requests: 100_000,
  rows_written: 100_000,
  rows_read: 5_000_000
} as const;

/**
 * برآورد ثابتِ ردیف‌نویسی/ردیف‌خوانی هر هندلر (برآوردی — «روی کاغذ»): شمارش دقیق ردیف‌های
 * D1 خودش هزینه دارد و ممکن نیست؛ پس هر هندلر یک تخمین ثابت بیشینه می‌دهد تا جمع روزانه
 * «حداکثر مصرف محتمل» را نشان دهد نه عدد دقیق. مبنای هر عدد:
 *  • pull  — نوشتن: مُهر last_pull_at (۱)؛ خواندن: صفحهٔ کامل تا سقف ۱۰۰ + ردیف خود نود (~۱۰۰)
 *  • push  — نوشتن: مُهر تلاش + مُهر ok + تا ۱۰۰ آیتم صندوق (~۱۰۱)؛ خواندن: ردیف نود + صندوق (~۱۰۰)
 *  • login — نوشتن: login_throttle + auth_sessions + audit + هرس (~۴)؛ خواندن: staff + دو
 *            throttle + نشست (~۱۰)
 * این ثابت‌ها هزینهٔ ثابت هر درخواست را نزدیک‌به‌بدترین‌حالت می‌شمارند؛ حجم payload در آنها نیست.
 */
export const NODE_PULL_ROWS_WRITTEN_EST = 1;
export const NODE_PULL_ROWS_READ_EST = 100;
export const NODE_PUSH_ROWS_WRITTEN_EST = 101;
export const NODE_PUSH_ROWS_READ_EST = 100;
export const LOGIN_ROWS_WRITTEN_EST = 4;
export const LOGIN_ROWS_READ_EST = 10;

/** هندلرهای شمرده‌شده — عمداً فقط همین سه: خواندنی‌های مدیریتی شمرده نمی‌شوند (نویز = برآورد بی‌اعتبار) */
export type QuotaKind = 'pull' | 'push' | 'login';

const QUOTA_ESTIMATES: Record<QuotaKind, { rowsWritten: number; rowsRead: number }> = {
  pull: { rowsWritten: NODE_PULL_ROWS_WRITTEN_EST, rowsRead: NODE_PULL_ROWS_READ_EST },
  push: { rowsWritten: NODE_PUSH_ROWS_WRITTEN_EST, rowsRead: NODE_PUSH_ROWS_READ_EST },
  login: { rowsWritten: LOGIN_ROWS_WRITTEN_EST, rowsRead: LOGIN_ROWS_READ_EST }
};

/** روز UTC به شکل YYYY-MM-DD — دانه‌بندی quota_usage همان روز UTC است نه محلی */
export function quotaDayUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * جمع‌زنِ شمارندهٔ روز (rust-f15) — تک‌دستوری و ارزان: INSERT ... ON CONFLICT(day) DO UPDATE
 * همان UPSERT جمع‌کنندهٔ هم‌ریتم قرارداد (requests+1 و افزودن برآورد ردیف‌های همان هندلر).
 * حکم م۲۱۰: شمارش سهمیه هرگز میزبان را نمی‌شکند — خطای اینجا بلعیده می‌شود (سهمیه تلمتری است
 * نه دادهٔ عملیاتی؛ خرابی آن نباید pull/push/login را سرخ کند).
 */
export async function bumpQuotaUsage(db: DbClient, kind: QuotaKind, now: Date = new Date()): Promise<void> {
  try {
    const est = QUOTA_ESTIMATES[kind];
    await db.execute(
      `INSERT INTO quota_usage (day, requests, rows_written, rows_read_est)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(day) DO UPDATE SET
         requests = requests + 1,
         rows_written = rows_written + excluded.rows_written,
         rows_read_est = rows_read_est + excluded.rows_read_est`,
      [quotaDayUtc(now), est.rowsWritten, est.rowsRead]
    );
  } catch {
    // حکم م۲۱۰ — شمارش سهمیه هیچ مسیری را نمی‌شکند؛ بی‌صدا رد می‌شود
  }
}

export type QuotaLevel = 'ok' | 'warn' | 'danger';

/**
 * سطح‌بندی مصرف از روی درصدها — قرارداد rust-f15: «danger» اگر هر درصدی ≥ ۹۵، وگرنه
 * «warn» اگر هر درصدی ≥ ۸۰، وگرنه «ok». مرزها درصدهای رند‌شدهٔ یک‌اعشاری‌اند.
 */
export function quotaLevelFor(percents: { requests: number; rows_written: number; rows_read: number }): QuotaLevel {
  const values = [percents.requests, percents.rows_written, percents.rows_read];
  if (values.some((v) => v >= 95)) return 'danger';
  if (values.some((v) => v >= 80)) return 'warn';
  return 'ok';
}

/** درصد مصرف با گرد شدن به یک اعشار — قرارداد پاسخ quota */
export function quotaPercent(value: number, limit: number): number {
  return Math.round((value / limit) * 1000) / 10;
}

export interface CentralQuotaSnapshot {
  day: string;
  requests: number;
  rows_written: number;
  rows_read_est: number;
  limits: { requests: number; rows_written: number; rows_read: number };
  percent: { requests: number; rows_written: number; rows_read: number };
  level: QuotaLevel;
  estimated: true;
  failed_logins_24h: number;
}

/**
 * تصویر مصرف روز برای GET /api/central/quota — شمارندهٔ امروز (غایب = صفر نرم) + شمار تلاش‌های
 * ورود ناموفق ۲۴ساعت اخیر. منبع failed_logins_24h: audit_log با action = 'auth.login_failed'
 * (هر تلاش ناموفق یک ردیف ممیزی می‌سازد)؛ جدول login_throttle برای این کار مناسب نیست چون
 * fail_count را بر شناسه با پنجرهٔ ۱۵دقیقه‌ای نگه می‌دارد — تاریخچهٔ ۲۴ساعته ندارد.
 * created_at ممیزی با پیش‌فرض datetime('now') = «YYYY-MM-DD HH:MM:SS» است؛ برش ۲۴ساعت با همان
 * قالب مقایسه می‌شود (ردیف‌های ISO احتمالی هم به‌درستی بالای برش می‌مانند — 'T' > ' ').
 */
export async function centralQuotaSnapshot(db: DbClient, now: Date = new Date()): Promise<CentralQuotaSnapshot> {
  const day = quotaDayUtc(now);
  const row = await db.queryOne<{ requests: number; rows_written: number; rows_read_est: number }>(
    'SELECT requests, rows_written, rows_read_est FROM quota_usage WHERE day = ?',
    [day]
  );
  const requests = row?.requests ?? 0;
  const rowsWritten = row?.rows_written ?? 0;
  const rowsRead = row?.rows_read_est ?? 0;

  const cutoffSql = new Date(now.getTime() - 24 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const failedRow = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.login_failed' AND created_at >= ?`,
    [cutoffSql]
  );

  const percent = {
    requests: quotaPercent(requests, QUOTA_LIMITS.requests),
    rows_written: quotaPercent(rowsWritten, QUOTA_LIMITS.rows_written),
    rows_read: quotaPercent(rowsRead, QUOTA_LIMITS.rows_read)
  };
  return {
    day,
    requests,
    rows_written: rowsWritten,
    rows_read_est: rowsRead,
    limits: { ...QUOTA_LIMITS },
    percent,
    level: quotaLevelFor(percent),
    estimated: true,
    failed_logins_24h: failedRow?.n ?? 0
  };
}

// ─── reconcile (rust-f15) — شمارش/تازه‌ترین مُهر هر دامنهٔ pull برای هم‌راستاسازی نود ───

export interface ReconcileDomainStatus {
  domain: NodePullDomain;
  count: number;
  /** MAX(updated_at) نرمال ISO ثانیه‌ای (هم‌قالب ISO_NORM pull)؛ جدول خالی = null */
  max_updated_at: string | null;
}

/**
 * شمارش و MAX(updated_at) بر حسب دامنهٔ pull — روی «همان ردیف‌هایی که pull تحویل می‌دهد»
 * (شرط پایهٔ دامنه در PULL_SOURCES) تا مقایسهٔ شمارش نود با مرکز معنا داشته باشد؛ نه کل جدول.
 * اسکن کامل جدول است (COUNT/MAX) — برآوردی و سبک برای حجم کلینیک؛ فقط سه دامنهٔ سفید دارد و
 * مسیر نود است (احراز نود، نه سشن) — خواندنی مدیریتی نیست و در سهمیه شمرده نمی‌شود.
 */
export async function reconcileDomainCounts(
  db: DbClient,
  domains: readonly NodePullDomain[]
): Promise<ReconcileDomainStatus[]> {
  const out: ReconcileDomainStatus[] = [];
  for (const domain of domains) {
    const src = PULL_SOURCES.find((s) => s.domain === domain);
    if (!src) continue; // گارد داخلی — روت پیش‌تر با فهرست سفید رد کرده است
    const row = await db.queryOne<{ n: number; mx: string | null }>(
      `SELECT COUNT(*) AS n, MAX(${ISO_NORM}) AS mx FROM ${src.from} WHERE ${src.fromWhere}`,
      []
    );
    out.push({ domain, count: row?.n ?? 0, max_updated_at: row?.mx ?? null });
  }
  return out;
}

// ─── push — فهرست سفید سخت + اعتبارسنجی بر حسب دامنه + idempotency (node_code, id) ───

export const NodePushRawItemSchema = z.object({
  id: z.string().min(4).max(120),
  domain: z.string().min(1).max(40),
  at: z.string().max(40).nullish(),
  payload: z.record(z.string(), z.unknown()) // zod4 — کلید صریح
});

export const NodePushRawBodySchema = z.object({
  items: z.array(NodePushRawItemSchema).min(1).max(NODE_PUSH_MAX_ITEMS)
});

export type NodePushRawItem = z.infer<typeof NodePushRawItemSchema>;

/** usage_summary — قانون طلایی «تجمیع در نود، فقط عدد در ابر»: فقط شمارنده/درصد */
export const UsageSummaryPayloadSchema = z.record(z.string().min(1).max(64), z.number());

/** client_errors — هم‌شکل لولهٔ خطای مرورگر خود سامانه (برش‌ها سقف سخت) */
export const ClientErrorPayloadSchema = z.object({
  message: z.string().min(1).max(2000),
  source: z.string().max(300).nullish(),
  line: z.number().int().min(0).max(10_000_000).nullish(),
  col: z.number().int().min(0).max(10_000_000).nullish(),
  stack: z.string().max(8000).nullish(),
  url: z.string().max(300).nullish(),
  app_version: z.string().max(50).nullish()
});

/** health_ping — وضعیت سلامت موتور محلی؛ فقط بولی/رشتهٔ کوتاه/شمارنده */
export const HealthPingPayloadSchema = z.object({
  ok: z.boolean().nullish(),
  version: z.string().max(50).nullish(),
  counters: z.record(z.string().min(1).max(64), z.number()).nullish()
});

const PAYLOAD_SCHEMA_BY_DOMAIN: Record<NodePushDomain, z.ZodType> = {
  usage_summary: UsageSummaryPayloadSchema,
  client_errors: ClientErrorPayloadSchema,
  health_ping: HealthPingPayloadSchema
};

export interface ValidatedPushItem {
  id: string;
  domain: NodePushDomain;
  at: string | null;
  payload: Record<string, unknown>;
}

/** اعتبارسنجی سفت بر حسب دامنه — خطا = ZodError (۴۰۰ در روت) */
export function validatePushItem(item: NodePushRawItem): ValidatedPushItem {
  if (!NODE_PUSH_DOMAIN_SET.has(item.domain)) {
    // گارد دوم لایه — روت پیش‌تر کل درخواست را با ۴۰۳ رد کرده؛ این فقط سپر داخلی است
    throw new Error('NODE_DOMAIN_FORBIDDEN');
  }
  const domain = item.domain as NodePushDomain;
  const payload = PAYLOAD_SCHEMA_BY_DOMAIN[domain].parse(item.payload) as Record<string, unknown>;
  const at = typeof item.at === 'string' && item.at.trim().length > 0 ? item.at.trim() : null;
  return { id: item.id, domain, at, payload };
}

export interface NodePushOutcome {
  accepted: number;
  duplicates: number;
}

/**
 * درج idempotent رویدادهای push — جفت (node_code, id) کلید است؛ تلاش دوباره با همان id
 * هیچ ردیف تازه‌ای نمی‌سازد (ON CONFLICT DO NOTHING) و در پاسخ duplicates شمرده می‌شود.
 */
export async function pushNodeEvents(
  db: DbClient,
  nodeCode: string,
  items: readonly ValidatedPushItem[]
): Promise<NodePushOutcome> {
  if (items.length === 0) return { accepted: 0, duplicates: 0 };
  const statements = items.map((it) =>
    db.prepare(
      `INSERT INTO node_push_events (node_code, id, domain, payload, occurred_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(node_code, id) DO NOTHING`,
      [nodeCode, it.id, it.domain, JSON.stringify(it.payload), it.at]
    )
  );
  const results = await db.batch(statements);
  let accepted = 0;
  for (const r of results) {
    const changes = (r as { meta?: { changes?: number } }).meta?.changes;
    if (typeof changes === 'number') accepted += changes;
  }
  return { accepted, duplicates: items.length - accepted };
}
