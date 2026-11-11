/**
 * گیت گزارش‌دهی تجمیعی نود → CP (فاز غنی‌سازی پلهٔ ۱) — قرارداد درگاه موجود m1.2
 * همهٔ تست‌ها با fetch ساختگی و MockD1 (SQLite واقعی) — بدون شبکهٔ واقعی.
 */
import { describe, it, expect } from 'vitest';
import { createTestApp, MANAGER_ID, STUDENT1_ID, silentLogger, type TestApp } from '../../../test/harness';
import { tehranTodayYmd, tehranDayRange } from '@core/shared';
import {
  buildCpReportConfig,
  ingestUrlFrom,
  pushCpReport,
  cpReportOpportunistic,
  shouldPushCpReport,
  percentile75,
  collectKpiBucket,
  CP_REPORT_PUSH_KEY,
  CP_REPORT_ATTEMPT_KEY,
  CP_REPORT_SEQ_KEY,
  CP_REPORT_MIN_INTERVAL_MS
} from '../ingest';

const CP_SYNC_URL = 'https://network-control-plane.sanjeshm.workers.dev/api/node/announcements/sync';
const INGEST_URL = 'https://network-control-plane.sanjeshm.workers.dev/api/node/ingest';

const FULL_ENV = { CP_SYNC_URL, CP_NODE_CODE: 'demo-a', CP_NODE_KEY: 'ck_live_test_key' };

interface IngestCall {
  url: string;
  headers: Record<string, string>;
  body: {
    events: Array<{ seq: number; ts: string; payload: Record<string, unknown> }>;
    // ۱.۲۵.۶۷ — CP-2: snapshot سلامت با فیلدهای واقعی (قبلاً فقط reported_version تایپ می‌شد)
    health: {
      captured_at?: string;
      reported_version: string | null;
      outbox_depth?: number | null;
      unsynced_ops?: number | null;
      error_rate_1h?: number | null;
      error_rate_24h?: number | null;
      sync_lag_s?: number | null;
    } | null;
  };
}

function fetchCapturing(status = 200): typeof fetch & { calls: IngestCall[] } {
  const calls: IngestCall[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const parsed = init?.body ? (JSON.parse(String(init.body)) as IngestCall['body']) : null;
    calls.push({ url: String(url), headers, body: parsed as IngestCall['body'] });
    return new Response(JSON.stringify({ data: { inserted: 1 } }), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch & { calls: IngestCall[] };
  fn.calls = calls;
  return fn;
}

/** درج فیکسچرهای غیربدیهی: نوبت امروز، تأخیر حضور، خطای کلاینت، رویدادهای RUM */
async function seedFixtures(A: TestApp, now: Date): Promise<void> {
  const day = tehranDayRange(tehranTodayYmd(now));
  const startToday = new Date(Date.parse(day.start) + 3 * 60 * 60_000).toISOString();
  await A.db.execute(
    `INSERT INTO appointments (id, staff_id, start_at, end_at, status, created_by)
     VALUES ('apt-today-1', ?, ?, ?, 'scheduled', 'seed'),
            ('apt-today-2', ?, ?, ?, 'cancelled', 'seed')`,
    [MANAGER_ID, startToday, new Date(Date.parse(startToday) + 30 * 60_000).toISOString(),
     MANAGER_ID, startToday, new Date(Date.parse(startToday) + 60 * 60_000).toISOString()]
  );
  // تأخیر ثبت حضور: نوبتِ گذشته با attendance=pending
  await A.db.execute(
    `INSERT INTO appointments (id, staff_id, start_at, end_at, status, created_by)
     VALUES ('apt-past-1', ?, ?, ?, 'scheduled', 'seed')`,
    [MANAGER_ID, new Date(Date.parse(day.start) - 48 * 60 * 60_000).toISOString(),
     new Date(Date.parse(day.start) - 47 * 60 * 60_000).toISOString()]
  );
  await A.db.execute(
    `INSERT INTO appointment_students (appointment_id, student_id, attendance) VALUES ('apt-past-1', ?, 'pending')`,
    [STUDENT1_ID]
  );
  await A.db.execute(
    `INSERT INTO client_errors (occurred_at, message) VALUES (datetime('now', '-2 hours'), 'probe')`
  );
  const ts = now.toISOString();
  const rum: Array<[string, number]> = [
    ['LCP', 400], ['LCP', 100], ['LCP', 300], ['LCP', 200], // p75 nearest-rank → 300
    ['CLS', 0.1], ['CLS', 0.25]                              // p75 → 0.25
  ];
  for (let i = 0; i < rum.length; i++) {
    await A.db.execute(
      `INSERT INTO rum_events (ts, metric, value, rating, nav_id, path, viewport_w, viewport_h)
       VALUES (?, ?, ?, 'good', ?, '/', 390, 844)`,
      [ts, rum[i][0], rum[i][1], `nav-${i}`]
    );
  }
}

describe('cp-report: قرارداد آدرس و گیت', () => {
  it('ingestUrlFrom — origin سینک اعلان + مسیر ingest؛ ورودی خراب = null', () => {
    expect(ingestUrlFrom(CP_SYNC_URL)).toBe(INGEST_URL);
    expect(ingestUrlFrom('https://cp.example.com/base?x=1')).toBe('https://cp.example.com/api/node/ingest');
    expect(ingestUrlFrom('')).toBeNull();
    expect(ingestUrlFrom('   ')).toBeNull();
    expect(ingestUrlFrom('not-a-url')).toBeNull();
  });

  it('kill switch — هر متغیر خالی یعنی disabled و هیچ fetch ای زده نمی‌شود', async () => {
    for (const env of [
      { ...FULL_ENV, CP_SYNC_URL: '' },
      { ...FULL_ENV, CP_NODE_CODE: '  ' },
      { ...FULL_ENV, CP_NODE_KEY: undefined },
      { CP_SYNC_URL: 'not-a-url', CP_NODE_CODE: 'x', CP_NODE_KEY: 'y' }
    ]) {
      const A = createTestApp();
      const f = fetchCapturing();
      const res = await pushCpReport({
        db: A.db,
        logger: silentLogger('it'),
        config: buildCpReportConfig(env as Record<string, string | undefined>),
        fetchFn: f
      });
      expect(res.status).toBe('disabled');
      expect(f.calls).toHaveLength(0);
    }
  });

  it('shouldPushCpReport — ۲۴ ساعت فاصله؛ مُهر خراب = اجازه', () => {
    const now = new Date('2026-11-08T09:00:00.000Z');
    expect(shouldPushCpReport(null, now)).toBe(true);
    expect(shouldPushCpReport('garbage', now)).toBe(true);
    const last = new Date(now.getTime() - CP_REPORT_MIN_INTERVAL_MS + 1_000).toISOString();
    expect(shouldPushCpReport(last, now)).toBe(false);
    const lastOld = new Date(now.getTime() - CP_REPORT_MIN_INTERVAL_MS - 1_000).toISOString();
    expect(shouldPushCpReport(lastOld, now)).toBe(true);
  });

  it('percentile75 — nearest-rank', () => {
    expect(percentile75([])).toBeNull();
    expect(percentile75([10, 20, 30, 40])).toBe(30);
    expect(percentile75([1, 2, 3])).toBe(3);
    expect(percentile75([5])).toBe(5);
  });
});

describe('cp-report: یک push کامل — فقط عدد، seq صعودی، مُهرها', () => {
  it('push اول: payload عددی هم‌ارز SQL واقعی + هدرها + مُهرها', async () => {
    const A = createTestApp();
    const now = new Date();
    await seedFixtures(A, now);
    const f = fetchCapturing();

    const res = await pushCpReport({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpReportConfig(FULL_ENV),
      fetchFn: f,
      now: () => now
    });

    expect(res.status).toBe('ok');
    expect(res.applied).toBe(1);
    expect(res.seq).toBe(1);
    expect(f.calls).toHaveLength(1);

    const call = f.calls[0];
    expect(call.url).toBe(INGEST_URL);
    expect(call.headers['X-CP-Node-Code']).toBe('demo-a');
    expect(call.headers['Authorization']).toBe('Bearer ck_live_test_key');
    expect(call.headers['X-CP-Node-Version']).toBeTruthy();

    expect(call.body.events).toHaveLength(1);
    const ev = call.body.events[0];
    expect(ev.seq).toBe(1);
    expect(ev.payload).toBeTruthy();

    // قانون طلایی: همهٔ مقادیر عدد یا null — هیچ رشته‌ای از دادهٔ عملیاتی عبور نمی‌کند
    for (const [k, v] of Object.entries(ev.payload)) {
      expect(k).toMatch(/^[a-z0-9_]+$/);
      expect(['number', 'object']).toContain(typeof v);
      if (typeof v === 'object') expect(v).toBeNull();
    }

    // هم‌ارزی با SQL واقعی روی همان DB (خود-سازگار، بدون عدد دستی)
    const day = tehranDayRange(tehranTodayYmd(now));
    const expected = {
      students_active: (await A.db.queryOne<{ c: number }>('SELECT COUNT(*) c FROM students WHERE active=1'))?.c,
      appointments_today: (await A.db.queryOne<{ c: number }>(
        "SELECT COUNT(*) c FROM appointments WHERE start_at >= ? AND start_at <= ? AND status='scheduled'",
        [day.start, day.end]
      ))?.c,
      attendance_pending_overdue: (await A.db.queryOne<{ c: number }>(
        `SELECT COUNT(*) c FROM appointment_students aps JOIN appointments a ON a.id=aps.appointment_id
         WHERE aps.attendance='pending' AND a.end_at < ?`,
        [now.toISOString()]
      ))?.c,
      client_errors_24h: (await A.db.queryOne<{ c: number }>(
        "SELECT COUNT(*) c FROM client_errors WHERE occurred_at >= datetime('now','-24 hours')"
      ))?.c,
      rum_lcp_p75: 300,
      rum_cls_p75: 0.25
    };
    expect(ev.payload.students_active).toBe(expected.students_active);
    expect(ev.payload.appointments_today).toBe(expected.appointments_today);
    expect(ev.payload.attendance_pending_overdue).toBe(expected.attendance_pending_overdue);
    expect(ev.payload.client_errors_24h).toBe(expected.client_errors_24h);
    expect(ev.payload.rum_lcp_p75).toBe(expected.rum_lcp_p75);
    expect(ev.payload.rum_cls_p75).toBe(expected.rum_cls_p75);

    expect(call.body.health?.reported_version).toBeTruthy();

    // مُهرها
    const push = await A.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_REPORT_PUSH_KEY]);
    expect(push?.value).toContain(now.toISOString().slice(0, 10));
    const seqRow = await A.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_REPORT_SEQ_KEY]);
    expect(JSON.parse(seqRow?.value ?? '0')).toBe(1);
    const attempt = await A.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_REPORT_ATTEMPT_KEY]);
    expect(attempt?.value).toBeTruthy();
  });

  it('گیت ۲۴ساعته: بلافاصله بعد از push موفق → skipped؛ بعد از فاصلهٔ کافی → seq بعدی', async () => {
    const A = createTestApp();
    const t0 = new Date('2026-11-08T09:00:00.000Z');
    let now = new Date(t0);
    const f = fetchCapturing();

    const r1 = await cpReportOpportunistic({
      db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: f, now: () => now
    });
    expect(r1.status).toBe('ok');
    expect(f.calls).toHaveLength(1);

    now = new Date(t0.getTime() + 60 * 60_000);
    const r2 = await cpReportOpportunistic({
      db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: f, now: () => now
    });
    expect(r2.status).toBe('skipped');
    expect(f.calls).toHaveLength(1);

    now = new Date(t0.getTime() + CP_REPORT_MIN_INTERVAL_MS + 60_000);
    const r3 = await cpReportOpportunistic({
      db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: f, now: () => now
    });
    expect(r3).toMatchObject({ status: 'ok', seq: 2 });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].body.events[0].seq).toBe(2);
  });

  it('خطای ۴۰۱: status=error، کرش نمی‌کند، مُهر تلاش ثبت شده؛ پس از فاصله تلاش بعدی سبز', async () => {
    const A = createTestApp();
    let now = new Date('2026-11-08T09:00:00.000Z');
    const bad = fetchCapturing(401);
    const r1 = await pushCpReport({
      db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: bad, now: () => now
    });
    expect(r1.status).toBe('error');
    expect(r1.detail).toBe('http_401');
    const attempt = await A.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_REPORT_ATTEMPT_KEY]);
    expect(attempt?.value).toBeTruthy();
    // push ناموفق مُهر seq/pass نزده
    const pushRow = await A.db.queryOne('SELECT value FROM settings WHERE key = ?', [CP_REPORT_PUSH_KEY]);
    expect(pushRow).toBeNull();

    now = new Date(now.getTime() + CP_REPORT_MIN_INTERVAL_MS + 1_000);
    const good = fetchCapturing(200);
    const r2 = await pushCpReport({
      db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: good, now: () => now
    });
    expect(r2.status).toBe('ok');
    expect(r2.seq).toBe(1);
  });

  it('Service Binding: اگر binding باشد fetch عمومی صدا زده نمی‌شود', async () => {
    const A = createTestApp();
    const bindingCalls: string[] = [];
    const binding = {
      fetch: (async (url: string | URL) => {
        bindingCalls.push(String(url));
        return new Response(JSON.stringify({ data: { inserted: 1 } }), { status: 200 });
      }) as Fetcher['fetch']
    };
    const publicFn = fetchCapturing();
    const res = await pushCpReport({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpReportConfig(FULL_ENV),
      binding: binding as unknown as Fetcher,
      fetchFn: publicFn
    });
    expect(res.status).toBe('ok');
    expect(bindingCalls).toEqual([INGEST_URL]);
    expect(publicFn.calls).toHaveLength(0);
  });

  it('استثنای شبکه: status=error با detail=exception و بدون کرش', async () => {
    const A = createTestApp();
    const boom = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    const res = await pushCpReport({
      db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: boom
    });
    expect(res.status).toBe('error');
    expect(res.detail).toBe('exception');
  });

  it('collectKpiBucket روی DB خالی از فیکسچر: صفرهای سالم، نه null و نه NaN', async () => {
    const A = createTestApp();
    const kpi = await collectKpiBucket(A.db, new Date('2026-11-08T09:00:00.000Z'));
    expect(kpi.students_active).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(kpi)) {
      expect(v === null || typeof v === 'number').toBe(true);
      expect(v).not.toBeNaN();
    }
  });
});

describe('cp-report: CP-2 — snapshot سلامت از مُهرها و صف‌های واقعی (۱.۲۵.۶۷)', () => {
  const isoToSqlite = (d: Date): string => d.toISOString().replace('T', ' ').slice(0, 19);

  it('بدون هیچ مُهری: sync_lag_s و error_rate_24h پوچ — اما عمق صف‌ها صفر واقعی است (جدول هست، خالی است)', async () => {
    const A = createTestApp();
    const now = new Date();
    const f = fetchCapturing();
    await pushCpReport({ db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: f, now: () => now });
    const h = f.calls[0].body.health!;
    expect(h.reported_version).toBeTruthy();
    expect(h.sync_lag_s).toBeNull(); // هنوز هیچ سینک موفقی ثبت نشده
    expect(h.error_rate_24h).toBeNull(); // بدون ترافیک ۲۴ساعته = ناشناخته نه صفر
    expect(h.outbox_depth).toBe(0);
    expect(h.unsynced_ops).toBe(0);
  });

  it('با مُهر سینک یک‌ساعته + دو گزارش باگ (یکی شکسته): sync_lag_s ≈ ۳۶۰۰، outbox=۱، error_rate=۵۰٪', async () => {
    const A = createTestApp();
    const t0 = new Date('2026-11-08T09:00:00.000Z');
    const f = fetchCapturing();

    const r1 = await pushCpReport({ db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: f, now: () => t0 });
    expect(r1.status).toBe('ok');

    // مُهر سینک اعلان یک ساعت قبل از t0 + دو گزارش باگ ۲۴ساعته (یکی open سالم، یکی forward_error)
    // توجه: created_at باید در پنجرهٔ واقعی datetime('now','-24 hours') باشد — ساعت هارنس با t0 موک‌شده فرق دارد
    const hourAgo = new Date(t0.getTime() - 3600_000).toISOString();
    const createdNow = isoToSqlite(new Date());
    await A.db.execute(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('cp_sync.last_sync_at', ?, 'test', ?)`,
      [JSON.stringify(hourAgo), hourAgo]
    );
    await A.db.execute(
      `INSERT INTO bug_reports (id, areas, severity, status, forward_error, created_at)
       VALUES ('bug-ok-1', '[]', 'minor', 'sent', NULL, ?)`,
      [createdNow]
    );
    await A.db.execute(
      `INSERT INTO bug_reports (id, areas, severity, status, forward_error, created_at)
       VALUES ('bug-fail-1', '[]', 'major', 'open', 'http_500', ?)`,
      [createdNow]
    );

    const r2 = await cpReportOpportunistic({
      db: A.db, logger: silentLogger('it'), config: buildCpReportConfig(FULL_ENV), fetchFn: f,
      now: () => new Date(t0.getTime() + CP_REPORT_MIN_INTERVAL_MS + 60_000)
    });
    expect(r2.status).toBe('ok');
    const h = f.calls[1].body.health!;
    expect(h.sync_lag_s).toBeGreaterThanOrEqual(3600);
    expect(h.sync_lag_s).toBeLessThan(3600 + 25 * 3600); // فاصلهٔ کرون + یک ساعت، نه مقدار مسخره
    expect(h.outbox_depth).toBe(1); // فقط شکست‌خورده در صف می‌ماند (sent دیگر در صف نیست)
    expect(h.error_rate_24h).toBe(50); // ۱ شکسته از ۲ گزارش ۲۴ساعته
  });
});
