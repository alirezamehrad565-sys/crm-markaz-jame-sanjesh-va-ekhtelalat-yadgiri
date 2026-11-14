/**
 * rust-f11/f12-B — آزمون صندوق خروج (outbox) موتور محلی (مسیر واقعی api-routing روی MockD1)
 * هم‌الگوی ingest.test.ts: گیت زمان‌اجرای CENTER_DESKTOP_ENGINE خاموش → ۴۰۴ کم‌دست
 * (رفتار تولید وب)؛ روشن → سشن کارمند لازم است. پوشش قرارداد:
 *   ۴۰۴ گیت خاموش · ۴۰۱ بدون سشن · ۴۰۰ since نامعتبر · items=[] با since=اکنون روی جدول
 *   خالی · آیتم client_errors با payload سازگار ClientErrorPayloadSchema (نگاشت ستون‌ها) ·
 *   صافی since (فقط تازه‌ترها، ASC) · سقف ۲۰۰ آیتم · دقیقاً یک health_ping با id ساعت‌بکت ·
 *   rust-f12-B: آیتم usage_summary روزانه — payload رکورد اعداد متناهی از جدول واقعی ·
 *   فیلتر since=اکنون · idempotency بکت روز · جای‌گذاری آیتم عادی در sort صفحه.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, loginToken, MANAGER_ID } from '../../test/harness';
import type { TestApp } from '../../test/harness';
import { APP_VERSION } from '@core/version';
import { ClientErrorPayloadSchema, HealthPingPayloadSchema, UsageSummaryPayloadSchema } from '../../node-sync';
import { OUTBOX_MAX_ITEMS } from '../outbox';

interface OutboxItemBody {
  id: string;
  domain: string;
  at: string;
  payload: Record<string, unknown>;
}
interface OutboxBody {
  data: { items: OutboxItemBody[]; generated_at: string };
}

function dataOf(res: { body: unknown }): OutboxBody['data'] {
  return (res.body as OutboxBody).data;
}

describe('/api/internal/sync/outbox — صندوق خروج push نود (rust-f11)', () => {
  it('گیت خاموش (تولید وب): ۴۰۴ کم‌دست حتی با سشن معتبر', async () => {
    const A = createTestApp(); // env بدون CENTER_DESKTOP_ENGINE
    const token = await loginToken(A, 'manager');
    const r = await new Api(A).withToken(token).get('/api/internal/sync/outbox');
    expect(r.status).toBe(404);
  });

  describe('گیت روشن (موتور محلی)', () => {
    let A: TestApp;
    let managerToken: string;

    beforeAll(async () => {
      A = createTestApp();
      A.env.CENTER_DESKTOP_ENGINE = '1'; // بایند فقط در کانفیگ capnp موتور (config.mjs) هست
      managerToken = await loginToken(A, 'manager');
    });

    it('بدون سشن → ۴۰۱ (قبل از رسیدن به گیت env مسیر محافظت شده است)', async () => {
      const res = await new Api(A).get('/api/internal/sync/outbox');
      expect(res.status).toBe(401);
    });

    it('since نامعتبر → ۴۰۰ (غیرISO، آفست‌دار، فرمت datetime جدول)', async () => {
      const api = new Api(A).withToken(managerToken);
      for (const bad of ['not-a-date', '2026-11-12T13:00:00+03:30', '2026-11-12 13:00:00']) {
        const r = await api.get(`/api/internal/sync/outbox?since=${encodeURIComponent(bad)}`);
        expect(r.status).toBe(400);
      }
    });

    it('جدول خالی + since=اکنون → items=[] (since روی همهٔ آیتم‌ها حتی ping اکید است)', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.get(`/api/internal/sync/outbox?since=${encodeURIComponent(new Date().toISOString())}`);
      expect(r.status).toBe(200);
      const data = dataOf(r);
      expect(data.items).toEqual([]);
      expect(!Number.isNaN(Date.parse(data.generated_at))).toBe(true);
    });

    it('جدول خالی بدون since → دقیقاً یک آیتم health_ping با id ساعت‌بکت و payload اسکیمادار', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.get('/api/internal/sync/outbox');
      expect(r.status).toBe(200);
      const items = dataOf(r).items;
      // rust-f12-B — صفحه بدون since دو آیتم دارد: usage_summary روزانه + ping ساعت‌بکت
      expect(items.length).toBe(2);
      expect(items.filter((i) => i.domain === 'health_ping').length).toBe(1); // عین ادعای f11: دقیقاً یک ping
      const ping = items.find((i) => i.domain === 'health_ping') as OutboxItemBody;
      expect(ping.domain).toBe('health_ping');
      expect(ping.id).toMatch(/^ping-\d{4}-\d{2}-\d{2}T\d{2}$/); // ping-<بکت ساعت UTC>
      expect(ping.at).toBe(`${ping.id.slice(5)}:00:00Z`); // at = ابتدای همان ساعت UTC
      expect(ping.payload.ok).toBe(true);
      expect(ping.payload.version).toBe(APP_VERSION); // نسخهٔ اپ از @core/version
      expect(typeof (ping.payload.counters as Record<string, number>).client_errors_24h).toBe('number');
      expect(HealthPingPayloadSchema.safeParse(ping.payload).success).toBe(true);
    });

    it('درج ردیف ساختگی client_errors → آیتم درست با payload سازگار ClientErrorPayloadSchema', async () => {
      // فرمت occurred_at هم‌قرارداد datetime('now') جدول 0057 — 'YYYY-MM-DD HH:MM:SS' (UTC)
      await A.db.execute(
        `INSERT INTO client_errors (id, occurred_at, message, source, line_no, col_no, stack, url, app_version)
         VALUES ('outbox-err-1', '2026-11-01 10:00:00', 'TypeError: x is undefined', 'app://main.js', 42, 7,
                 'at f (app://main.js:42:7)', 'https://center.test.example.com/', '1.25.75')`
      );
      const api = new Api(A).withToken(managerToken);
      const r = await api.get('/api/internal/sync/outbox');
      expect(r.status).toBe(200);
      const items = dataOf(r).items;
      const err = items.find((i) => i.domain === 'client_errors');
      expect(err?.id).toBe('outbox-err-1'); // ردیف id جدول محلی → شناسهٔ پایدار/idempotent آیتم
      expect(err?.at).toBe('2026-11-01T10:00:00Z'); // نرمال ISO ثانیه‌ای (strftime)
      // نگاشت ستون‌ها: message→message · source→source · line_no→line · col_no→col · stack→stack · url→url · app_version→app_version
      expect(err?.payload).toEqual({
        message: 'TypeError: x is undefined',
        source: 'app://main.js',
        line: 42,
        col: 7,
        stack: 'at f (app://main.js:42:7)',
        url: 'https://center.test.example.com/',
        app_version: '1.25.75'
      });
      expect('user_agent' in (err?.payload ?? {})).toBe(false); // قانون PII مایگریشن 0106 — هرگز عبور نمی‌کند
      expect(ClientErrorPayloadSchema.safeParse(err?.payload).success).toBe(true);
    });

    it('since → فقط تازه‌ترها (at > since اکید) و مرتب ASC بر حسب at', async () => {
      await A.db.execute(
        `INSERT INTO client_errors (id, occurred_at, message) VALUES
           ('outbox-err-old', '2026-11-01 11:00:00', 'کهنه'),
           ('outbox-err-new', '2026-11-03 11:00:00', 'تازه')`
      );
      const api = new Api(A).withToken(managerToken);
      const r = await api.get(`/api/internal/sync/outbox?since=${encodeURIComponent('2026-11-02T00:00:00.000Z')}`);
      expect(r.status).toBe(200);
      const items = dataOf(r).items;
      // خطای کهنه (۱۱-۰۱) صافی می‌خورد؛ تازه (۱۱-۰۳) می‌ماند؛ usage بکت روزِ امروز و ping
      // ساعت‌بکت (اکنون) تازه‌ترند — rust-f12-B: usage مثل آیتم عادی بین آن دو می‌نشیند
      expect(items.map((i) => i.domain)).toEqual(['client_errors', 'usage_summary', 'health_ping']);
      expect(items[0]?.id).toBe('outbox-err-new');
      expect(items[0]?.at).toBe('2026-11-03T11:00:00Z');
      for (let i = 1; i < items.length; i += 1) {
        expect(items[i - 1]!.at <= items[i]!.at).toBe(true); // ASC
      }
    });

    it(`سقف ${OUTBOX_MAX_ITEMS} آیتم روی کل صفحه — ping تازه‌ترین است و در پس‌انداز شلوغ جا می‌ماند`, async () => {
      const tuples = Array.from({ length: 250 }, (_, i) => `('cap-${String(i).padStart(3, '0')}', '2026-10-01 00:00:00', 'cap')`).join(',');
      await A.db.execute(`INSERT INTO client_errors (id, occurred_at, message) VALUES ${tuples}`);
      const api = new Api(A).withToken(managerToken);
      const r = await api.get('/api/internal/sync/outbox'); // بدون since — ۲۵۳ خطا + ping = ۲۵۴
      expect(r.status).toBe(200);
      const items = dataOf(r).items;
      expect(items.length).toBe(OUTBOX_MAX_ITEMS);
      expect(items.every((i) => i.domain === 'client_errors')).toBe(true); // ۲۰۰ کهنه‌ترین = ردیف‌های cap
      expect(items[0]?.id).toBe('cap-000');
      expect(items[199]?.id).toBe('cap-199');
      for (let i = 1; i < items.length; i += 1) {
        expect(items[i - 1]!.at <= items[i]!.at).toBe(true); // ASC پایدار
      }
    });

    // ─── rust-f12-B — دامنهٔ usage_summary: اسنپ‌شات روزانهٔ شمارنده‌های تجمیعی نود ───
    // اپ مستقل B با DB تازه — مستقل از پس‌ماند client_errors آزمون‌های بالا تا شمارنده‌ها
    // و شکل صفحه دقیق ادعا شوند؛ فیکسچرها همین‌جا درج می‌شوند.
    describe('دامنهٔ usage_summary — اسنپ‌شات روزانهٔ شمارنده‌ها (rust-f12-B)', () => {
      let B: TestApp;
      let token: string;

      beforeAll(async () => {
        B = createTestApp();
        B.env.CENTER_DESKTOP_ENGINE = '1';
        token = await loginToken(B, 'manager');
        // فیکسچر: ۲ قرار تازه (created_at = اکنون — داخل پنجرهٔ ۷ روز) + ۱ کهنه (۳۰ روز پیش)
        // → appointments_total=۳ و appointments_7d=۲؛ مستقل از روزِ اجرای آزمون.
        // staff_id/created_by از کارمند seed تا FK جدول 0001 برقرار بماند.
        await B.db.execute(
          `INSERT INTO appointments (id, staff_id, start_at, end_at, status, created_by, created_at) VALUES
             ('usage-appt-1', '${MANAGER_ID}', '2026-01-01T08:00:00Z', '2026-01-01T09:00:00Z', 'scheduled', '${MANAGER_ID}', datetime('now')),
             ('usage-appt-2', '${MANAGER_ID}', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', 'scheduled', '${MANAGER_ID}', datetime('now')),
             ('usage-appt-old', '${MANAGER_ID}', '2026-01-01T12:00:00Z', '2026-01-01T13:00:00Z', 'scheduled', '${MANAGER_ID}', datetime('now', '-30 days'))`
        );
      });

      it('بدون since → آیتم usage_summary با payload رکورد اعداد متناهی و id/at بکت روزانه', async () => {
        const api = new Api(B).withToken(token);
        const r = await api.get('/api/internal/sync/outbox');
        expect(r.status).toBe(200);
        const usage = dataOf(r).items.find((i) => i.domain === 'usage_summary') as OutboxItemBody;
        expect(usage).toBeDefined();
        expect(usage.id).toMatch(/^usage-\d{4}-\d{2}-\d{2}$/); // بکت روزانهٔ UTC — idempotent برای جفت (node_code,id) ابر
        expect(usage.at).toBe(`${usage.id.slice(6)}T00:00:00Z`); // at = ابتدای همان بکت روز — هم‌الگوی ping ساعت‌بکت
        const payload = usage.payload;
        expect(Object.keys(payload).length).toBeGreaterThan(0); // DB تازه seed دارد → شمارنده‌های زندهٔ واقعی
        for (const v of Object.values(payload)) {
          expect(typeof v).toBe('number'); // رکورد تخت «نام‌متریک → عدد»
          expect(Number.isFinite(v)).toBe(true); // هرگز NaN/Infinity عبور نمی‌کند
        }
        expect(typeof payload.students_active).toBe('number'); // از جدول students (seed: فعال‌ها)
        expect(typeof payload.audit_events_24h).toBe('number'); // از audit_log
        expect('national_id' in payload).toBe(false); // قانون حریم: فقط عدد — هیچ id/نام/ایمیل/متن
        expect(UsageSummaryPayloadSchema.safeParse(payload).success).toBe(true); // سازگار با اسکیمای مرجع ابر
      });

      it('درج ردیف‌های فیکسچر → شمارندهٔ مربوط از جدول واقعی می‌آید: appointments_7d=۲ و appointments_total=۳', async () => {
        const api = new Api(B).withToken(token);
        const r = await api.get('/api/internal/sync/outbox');
        expect(r.status).toBe(200);
        const usage = dataOf(r).items.find((i) => i.domain === 'usage_summary') as OutboxItemBody;
        const payload = usage.payload as Record<string, number>;
        expect(payload.appointments_total).toBe(3); // کل = ۲ تازه + ۱ کهنه
        expect(payload.appointments_7d).toBe(2); // پنجرهٔ ۷ روزهٔ created_at فقط تازه‌ها را می‌شمارد
      });

      it('since=اکنون → usage هم مثل بقیه فیلتر می‌شود (بکت روزِ at همیشه ≤ اکنون)', async () => {
        const api = new Api(B).withToken(token);
        const r = await api.get(`/api/internal/sync/outbox?since=${encodeURIComponent(new Date().toISOString())}`);
        expect(r.status).toBe(200);
        const items = dataOf(r).items;
        expect(items.some((i) => i.domain === 'usage_summary')).toBe(false);
        expect(items.some((i) => i.domain === 'health_ping')).toBe(false);
      });

      it('ارسال دوبارهٔ همان روز → همان id بکت روزانه (idempotent — ابر با (node_code,id) dedupe می‌کند)', async () => {
        const api = new Api(B).withToken(token);
        const r1 = await api.get('/api/internal/sync/outbox');
        const r2 = await api.get('/api/internal/sync/outbox');
        const id1 = (dataOf(r1).items.find((i) => i.domain === 'usage_summary') as OutboxItemBody).id;
        const id2 = (dataOf(r2).items.find((i) => i.domain === 'usage_summary') as OutboxItemBody).id;
        expect(id1).toBe(id2);
      });

      it('usage آیتم عادی صفحه است: در sort ASC بین خطای کهنه‌تر و ping تازه‌تر می‌نشیند', async () => {
        await B.db.execute(
          `INSERT INTO client_errors (id, occurred_at, message) VALUES ('usage-err-old', '2020-01-01 00:00:00', 'کهنه‌تر از بکت امروز')`
        );
        const api = new Api(B).withToken(token);
        const r = await api.get('/api/internal/sync/outbox');
        expect(r.status).toBe(200);
        // ترتیب نهایی حاصل sort مشترک صفحه است نه ترتیب الحاق — usage مرز کهنه/تازه را پر می‌کند
        expect(dataOf(r).items.map((i) => i.domain)).toEqual(['client_errors', 'usage_summary', 'health_ping']);
      });
    });
  });
});
