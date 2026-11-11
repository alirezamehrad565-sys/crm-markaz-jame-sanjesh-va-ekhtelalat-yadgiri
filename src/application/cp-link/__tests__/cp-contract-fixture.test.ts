/**
 * گیت هم‌قراردادی لینک CP — CP-4 فیکسچر فریز + CP-7 قرارداد NODE_DB
 * (طرح ارتقای بک‌اند §۳-۱۶ پلهٔ ۱ و §۳-۴؛ ف۲ انتشار ۱.۲۵.۶۸)
 *
 * اصل: قرمزی این آزمون یعنی رانش قرارداد CP — کشف پیش از تولید، نه باگ نود.
 * فیکسچرها: src/test/fixtures/cp/ (پرووننس خط‌به‌خط در README همان پوشه).
 * فهرست جدول‌های NODE_DB: منبع فریز در cp-link/node-db-contract.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync } from 'node:fs';

import {
  createTestApp,
  MANAGER_ID,
  silentLogger,
  type TestApp
} from '../../../test/harness';
import {
  buildCpSyncConfig,
  syncCpAnnouncements,
  CP_SYNC_SETTINGS_KEY
} from '../../cp-sync/announcements';
import {
  buildCpContentConfig,
  runCpContentCycle,
  CP_CONTENT_SYNC_KEY
} from '../../cp-content/sync';
import { buildBugReportConfig, runBugReportForward } from '../../bug-report-forward';
import { NODE_DB_CONTRACT_TABLES, NODE_DB_CONTRACT_CP_SOURCE } from '../../cp-link/node-db-contract';

const FIXTURES = join(__dirname, '../../../test/fixtures/cp');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

function fetchServing(byUrl: (url: string) => Response | undefined) {
  const calls: string[] = [];
  const fn = (async (url: string | URL, _init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    const res = byUrl(u);
    if (!res) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 });
    return res;
  }) as typeof fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

const CP_ENV = {
  CP_SYNC_URL: 'https://network-control-plane.sanjeshm.workers.dev/api/node/announcements/sync',
  CP_NODE_CODE: 'demo-a',
  CP_NODE_KEY: 'ck_live_test_key',
  CP_SYNC_STAFF_ID: MANAGER_ID
};

// ─── CP-4 — فیکسچر فریز: پاسخ واقعی هر درگاه از سیم CP می‌گذرد ───

describe('CP-4 فیکسچر اعلان‌ها — announcements-sync.json از خط لولهٔ واقعی cp-sync', () => {
  let A: TestApp;
  beforeAll(() => {
    A = createTestApp();
  });

  it('پاسخ فریز‌شده parse و UPSERT می‌شود — دو ردیف cp- نشسته، extras (scope/source) برده می‌شود', async () => {
    const fixture = loadFixture('announcements-sync.json');
    const fn = fetchServing((u) => (u.includes('/api/node/announcements/sync') ? jsonRes(fixture) : undefined));
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger(),
      config: buildCpSyncConfig(CP_ENV),
      fetchFn: fn
    });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(2);
    expect(res.received).toBe(2);

    const rows = await A.db.query<Record<string, unknown>>(
      "SELECT * FROM announcements WHERE id LIKE 'cp-%' ORDER BY id"
    );
    expect(rows).toHaveLength(2);
    const live = rows.find((r) => r.id === 'cp-an-fixture-0001') as Record<string, unknown>;
    expect(live.title).toBe('اعلان شبکه‌ای — فیکسچر هم‌قراندی ۱.۲۵.۶۸');
    expect(live.active).toBe(1);
    expect(live.show_login).toBe(1);
    const retired = rows.find((r) => r.id === 'cp-an-fixture-0002') as Record<string, unknown>;
    expect(retired.active).toBe(0); // active:false = بایگانی
    // مُهر سینک = server_time فیکسچر
    const stamp = await A.db.queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [CP_SYNC_SETTINGS_KEY]
    );
    expect(JSON.parse(stamp?.value ?? '""')).toBe(
      (fixture as { data: { server_time: string } }).data.server_time
    );
  });

  it('کلیدهای آیتم فیکسچر دقیقاً = شکل CP (schema نود + extras سیم CP) — رانش = قرمز', () => {
    const fixture = loadFixture('announcements-sync.json') as {
      data: { items: Array<Record<string, unknown>> };
    };
    // شکل مرجع سیم CP: buildSyncItem در cp-repo@4dc81df announcements/pure.ts:137
    const expected = [
      'id',
      'title',
      'body',
      'show_login',
      'show_panel',
      'active',
      'created_at',
      'updated_at',
      'scope',
      'source'
    ].sort();
    for (const item of fixture.data.items) {
      expect(Object.keys(item).sort()).toEqual(expected);
    }
  });
});

describe('CP-4 فیکسچر برگزیده‌ها — content-sync.json از چرخهٔ واقعی cp-content', () => {
  let A: TestApp;
  beforeAll(() => {
    A = createTestApp();
  });

  it('پاسخ فریز‌شده parse و UPSERT می‌شود — retired بایگانی می‌شود و quality/فایل می‌نشیند', async () => {
    const fixture = loadFixture('content-sync.json');
    const fn = fetchServing((u) => (u.includes('/api/node/content/sync') ? jsonRes(fixture) : undefined));
    const res = await runCpContentCycle({
      db: A.db,
      logger: silentLogger(),
      config: buildCpContentConfig(CP_ENV),
      fetchFn: fn
    });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(2);

    const rows = await A.db.query<Record<string, unknown>>(
      "SELECT * FROM network_content WHERE id LIKE 'cp-content-%' ORDER BY id"
    );
    expect(rows).toHaveLength(2);
    const exercise = rows.find((r) => r.id === 'cp-content-cc-fixture-001') as Record<string, unknown>;
    expect(exercise.kind).toBe('exercise');
    expect(exercise.active).toBe(1);
    expect(JSON.parse(String(exercise.tags))).toEqual(['دقت دیداری', 'کارت آماده']);
    expect(JSON.parse(String(exercise.quality))).toEqual({ refs: 12, uses: 4 });
    expect(exercise.source_center).toBe('مرکز مبدأ نمونه'); // source_center_name مبدأ می‌شود
    const retired = rows.find((r) => r.id === 'cp-content-cc-fixture-002') as Record<string, unknown>;
    expect(retired.status).toBe('published'); // نود همیشه status='published' می‌نویسد — بایگانی با active
    expect(retired.active).toBe(0); // retired CP = بایگانی نود
    expect(retired.file_name).toBe('کاربرگ-نمونه.pdf');
    expect(retired.file_size).toBe(19687);
    // مُهر سینک = server_time فیکسچر
    const stamp = await A.db.queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [CP_CONTENT_SYNC_KEY]
    );
    expect(JSON.parse(stamp?.value ?? '""')).toBe(
      (fixture as { data: { server_time: string } }).data.server_time
    );
  });

  it('کلیدهای آیتم فیکسچر دقیقاً = SYNC_ITEM_KEYS سیم CP (cp-repo@4dc81df content/pure.ts:176+)', () => {
    const fixture = loadFixture('content-sync.json') as {
      data: { items: Array<Record<string, unknown>> };
    };
    // آینهٔ فریز SYNC_ITEM_KEYS سمت CP — تغییر هر سو باید همین‌جا قرمز شود
    const SYNC_ITEM_KEYS = [
      'id',
      'kind',
      'title',
      'summary',
      'body',
      'tags',
      'subcategory',
      'author_name',
      'co_author_name',
      'file_name',
      'file_size',
      'external_url',
      'quality',
      'status',
      'source_center_code',
      'source_center_name',
      'created_at',
      'updated_at'
    ].sort();
    for (const item of fixture.data.items) {
      expect(Object.keys(item).sort()).toEqual(SYNC_ITEM_KEYS);
    }
  });
});

describe('CP-4 فیکسچر بازخورد — feedback-replies.json از خط لولهٔ واقعی bug-report-forward', () => {
  let A: TestApp;
  beforeAll(() => {
    A = createTestApp();
  });

  it('پاسخ فریز‌شده روی bug_reports می‌نشیند — پاسخ پشتیبانی گم نمی‌شود', async () => {
    // دو گزارش بازِ هم‌شناسهٔ فیکسچر — مکالمهٔ واقعی نود↔CP (severity CHECK جدول 0101: minor/major/critical)
    await A.db.execute(
      `INSERT OR IGNORE INTO bug_reports (id, areas, severity, description, status, created_at)
       VALUES ('br-20261110-a1b2c3d4', '["بایگانی"]', 'minor', 'گزارش فیکسچر ۱', 'open', '2026-11-10 08:00:00')`
    );
    await A.db.execute(
      `INSERT OR IGNORE INTO bug_reports (id, areas, severity, description, status, created_at)
       VALUES ('br-20261109-e5f6a7b8', '["پنل"]', 'major', 'گزارش فیکسچر ۲', 'open', '2026-11-09 08:00:00')`
    );

    const fixture = loadFixture('feedback-replies.json');
    const fn = fetchServing((u) =>
      u.includes('/api/node/feedback/replies') ? jsonRes(fixture) : undefined
    );
    const res = await runBugReportForward({
      db: A.db,
      logger: silentLogger(),
      config: buildBugReportConfig(CP_ENV),
      fetchFn: fn,
      force: true
    });
    if (res.status !== 'done') throw new Error('forward cycle must be done');
    expect(res.status).toBe('done');
    // applyReplies هر دو ردیف را UPDATE می‌زند (ردیف بی‌پاسخ هم match است — reply null روی null بی‌اثر ولی changes می‌شمارد)
    expect(res.pulled).toBe(2);

    const row = await A.db.queryOne<Record<string, unknown>>(
      'SELECT reply_text, reply_by, reply_at FROM bug_reports WHERE id = ?',
      ['br-20261110-a1b2c3d4']
    );
    expect(row?.reply_text).toBe(
      'پاسخ پشتیبانی شبکه — مایگریشن ۰۰۱۳ سمت CP؛ فیلد updated_at تازه‌تر از since مُهر نود.'
    );
    expect(row?.reply_by).toBe('پشتیبانی شبکه');
    expect(row?.reply_at).toBe('2026-11-10 14:22:31');
  });

  it('شکل پاسخ submit فریز‌شده = قرارداد سیم CP ({id, duplicate} درون ok) — ۲۰۱ تازه/۲۰۰ تکراری', () => {
    const fixture = loadFixture('feedback-submit-response.json') as {
      data: Record<string, unknown>;
    };
    // شکل مرجع: submitNodeFeedback در cp-repo@4dc81df feedback/service.ts — پاسخ ok(result)
    expect(Object.keys(fixture.data).sort()).toEqual(['duplicate', 'id']);
    expect(String(fixture.data.id)).toMatch(/^fb-/);
    expect(fixture.data.duplicate).toBe(false);
  });

  it('کلیدهای آیتم replies دقیقاً = شکل سیم CP (listRepliesForNode نگاشت فریز)', () => {
    const fixture = loadFixture('feedback-replies.json') as {
      data: { items: Array<Record<string, unknown>> };
    };
    const expected = ['id', 'status', 'reply_text', 'reply_by', 'reply_at', 'updated_at'].sort();
    for (const item of fixture.data.items) {
      expect(Object.keys(item).sort()).toEqual(expected);
    }
  });
});

// ─── CP-7 — گیت همگامی شِمای خواندنی‌های NODE_DB ───

describe('CP-7 قرارداد NODE_DB — فهرست فریز ↔ مایگریشن‌های نود ↔ سند §۳-۴', () => {
  const migrationsDir = join(__dirname, '../../../../migrations');

  it('هر ۲۴ جدول قرارداد در مایگریشن‌های نود ساخته شده — حذف/تغییر نام = قرمز', () => {
    const sql = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
      .join('\n')
      .toLowerCase();
    const missing = NODE_DB_CONTRACT_TABLES.filter((t) => !sql.includes(`create table if not exists ${t}`));
    expect(missing, `جدول‌های قرارداد NODE_DB بی‌CREATE TABLE: ${missing.join(', ')}`).toEqual([]);
  });

  it('فهرست قرارداد در سند طرح ارتقا §۳-۴ هم ثبت است — رشد فقط با رأی دوطرفه', () => {
    const doc = readFileSync(
      join(__dirname, '../../../../docs/backend-upgrade-plan-2026-11-11.md'),
      'utf8'
    );
    const missing = NODE_DB_CONTRACT_TABLES.filter((t) => !doc.includes(t));
    expect(missing, `جدول‌های بی‌سند در §۳-۴: ${missing.join(', ')}`).toEqual([]);
  });

  it('فهرست فریز: مرتب، بی‌تکرار، ۲۴ عضو، با مُهر منبع CP', () => {
    const sorted = [...NODE_DB_CONTRACT_TABLES].sort();
    expect(NODE_DB_CONTRACT_TABLES).toEqual(sorted);
    expect(new Set(NODE_DB_CONTRACT_TABLES).size).toBe(NODE_DB_CONTRACT_TABLES.length);
    expect(NODE_DB_CONTRACT_TABLES).toHaveLength(24);
    expect(NODE_DB_CONTRACT_CP_SOURCE).toContain('m8');
  });
});
