// آزمون‌های هشدار خودکار (ف۵ طرح ارتقا — P0-3 حداقلی):
// رانش مُهر تلاش/موفقیت → هشدار + مُهر ارزیابی · سالم → بی‌هشدار · جهش خطاهای مرورگر → هشدار · kill-switch → هیچ
// ساعت «فریز» با مُهرهای دست‌کاری‌شدهٔ settings برقرار می‌شود (هم‌الگوی e2e-health-panel) نه با تایمر ساختگی.
import { describe, it, expect } from 'vitest';
import { createTestApp, asRole, silentLogger, MANAGER_ID } from '../../test/harness';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { createHealthService } from '../health/service';
import {
  runAlertCycle,
  readAlertsSeal,
  parseClientErrorsMax,
  alertsDisabledFlag,
  ALERTS_SEAL_KEY,
  ALERT_CLIENT_ERRORS_MAX_DEFAULT
} from '../health/alerts';

type App = ReturnType<typeof createTestApp>;

/** لاگ‌ضبط — به‌جای لاگ خاموش، خطاها جمع می‌شوند تا «زنگ‌زدن» قابل ادعا باشد */
function recordingLogger(scope = 'alerts-it'): Logger & { errors: Array<{ code: string; meta: unknown }> } {
  const base = silentLogger(scope);
  const errors: Array<{ code: string; meta: unknown }> = [];
  const log: Logger = {
    ...base,
    error: ((msg: string, meta?: unknown) => {
      errors.push({ code: msg, meta });
    }) as Logger['error']
  };
  return Object.assign(log, { errors });
}

async function setStamp(db: DbClient, key: string, iso: string): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, 'test', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by`,
    [key, JSON.stringify(iso)]
  );
}

async function clearSeal(db: DbClient): Promise<void> {
  await db.execute(`DELETE FROM settings WHERE key = '${ALERTS_SEAL_KEY}'`);
}

async function linkManagerChat(db: DbClient, chatId: string): Promise<void> {
  await db.execute(
    `INSERT INTO staff_bot_links (id, code, staff_id, chat_id, status, created_by)
     VALUES (?, ?, ?, ?, 'linked', 'test')`,
    [`55000000-0000-0000-0000-00000000000${chatId.length}`, `alert-link-${chatId}`, MANAGER_ID, chatId]
  );
}

describe('هشدار خودکار — رانش مُهر تلاش/موفقیت (§۳-۱۱)', () => {
  it('رانش ده‌روزه در درگاه announcements → هشدار error + logger.error + اعلان مدیر + مُهر ارزیابی', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    await clearSeal(db);
    const now = Date.now();
    // مُهر تلاش تازه، مُهر موفقیت کهنه — فاصله از آستانهٔ ۶ساعتهٔ درگاه گذشته است
    await setStamp(db, 'cp_sync.last_attempt_at', new Date(now - 1 * 3600_000).toISOString());
    await setStamp(db, 'cp_sync.last_sync_at', new Date(now - 10 * 86_400_000).toISOString());
    await linkManagerChat(db, 'mgr-chat-1');

    const health = createHealthService({ db, cpConfigured: true, envName: 'test' });
    const log = recordingLogger();
    const services = (A.app as unknown as { __services?: { notify: { enqueueOwnerAlert(t: string, d: string): Promise<number>; dispatchPending(l?: number): Promise<{ processed: number; sent: number; failed: number; skipped: number }> } } }).__services!;
    const outcome = await runAlertCycle({ db, health, notify: services.notify, logger: log, clientErrorsMax: null });

    expect(outcome.disabled).toBe(false);
    expect(outcome.alerts).toHaveLength(1);
    expect(outcome.alerts[0].code).toBe('cp_seal_drift');
    expect(outcome.alerts[0].severity).toBe('error');
    expect(outcome.alerts[0].message).toContain('اعلان‌های شبکه');
    expect(outcome.alerts[0].message).toContain('بی‌صدا');
    expect(log.errors.map((e) => e.code)).toContain('alert.cp_seal_drift');
    expect(outcome.enqueued).toBe(1);

    // اعلان روی همان کانال دایجست (اینجا: درگاه داخلی چون بات تنظیم نیست) صف و همان‌جا ارسال شده است
    const notif = await db.queryOne<{ channel: string; template: string; recipient: string; status: string; payload: string }>(
      `SELECT channel, template, recipient, status, payload FROM notifications WHERE recipient = 'mgr-chat-1' ORDER BY rowid DESC LIMIT 1`
    );
    expect(notif?.channel).toBe('internal');
    expect(notif?.template).toBe('generic');
    expect(notif?.status).toBe('sent');
    expect(notif?.payload).toContain('رانش مُهر');

    // مُهر ارزیابی حتی در صورت صفر هشدار هم باید بنشیند — نشانِ «دیدیم و چیزی نبود»
    expect(await readAlertsSeal(db)).toBeTruthy();
    expect(outcome.evaluated_at).toBeTruthy();
  });

  it('پنل زنده هم همان هشدار را دارد — حکم پنل و کرون از یک منطق مشتق می‌شود', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const now = Date.now();
    await setStamp(db, 'cp_sync.last_attempt_at', new Date(now - 2 * 3600_000).toISOString());
    await setStamp(db, 'cp_sync.last_sync_at', new Date(now - 9 * 86_400_000).toISOString());
    const health = createHealthService({ db, cpConfigured: true, envName: null });
    const panel = await health.panel();
    expect(panel.alerts.map((a) => a.code)).toEqual(['cp_seal_drift']);
  });

  it('سالم: تلاش و موفقیت هم‌جوار → هیچ هشدار و هیچ logger.error؛ مُهر ارزیابی باز هم نوشته می‌شود', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    await clearSeal(db);
    const now = Date.now();
    await setStamp(db, 'cp_sync.last_attempt_at', new Date(now - 5 * 60_000).toISOString());
    await setStamp(db, 'cp_sync.last_sync_at', new Date(now - 1 * 60_000).toISOString());

    const health = createHealthService({ db, cpConfigured: true, envName: null });
    const log = recordingLogger();
    const services = (A.app as unknown as { __services?: { notify: { enqueueOwnerAlert(t: string, d: string): Promise<number>; dispatchPending(l?: number): Promise<{ processed: number; sent: number; failed: number; skipped: number }> } } }).__services!;
    const outcome = await runAlertCycle({ db, health, notify: services.notify, logger: log, clientErrorsMax: null });

    expect(outcome.alerts).toHaveLength(0);
    expect(log.errors).toHaveLength(0);
    expect(outcome.enqueued).toBe(0);
    expect(await readAlertsSeal(db)).toBeTruthy();
  });
});

describe('هشدار خودکار — جهش خطاهای مرورگر', () => {
  it('۳ خطای مرورگر با آستانهٔ ۲ → هشدار warning؛ با پیش‌فرض ۱۰۰ → هیچ هشداری', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    for (let i = 0; i < 3; i++) {
      await db.execute(`INSERT INTO client_errors (message) VALUES (?)`, [`boom-${i}`]);
    }
    const health = createHealthService({ db, cpConfigured: false, envName: null, clientErrorsMax: 2 });
    const panel = await health.panel();
    expect(panel.counts.client_errors_24h).toBe(3);
    expect(panel.alerts).toHaveLength(1);
    expect(panel.alerts[0].code).toBe('client_errors_spike');
    expect(panel.alerts[0].severity).toBe('warning');
    expect(panel.alerts[0].message).toContain('۲۴ ساعت');

    // همان داده با پیش‌فرض ۱۰۰: بی‌هشدار — عدد پیش‌فرض از env/پیش‌فرض می‌آید نه از حدس
    const healthDefault = createHealthService({ db, cpConfigured: false, envName: null });
    expect((await healthDefault.panel()).alerts).toHaveLength(0);
  });
});

describe('هشدار خودکار — kill-switch و قرارداد مُهر', () => {
  it('ALERTS_DISABLED راستین → هیچ ارزیابی، هیچ اعلان، هیچ مُهر', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    await clearSeal(db);
    const now = Date.now();
    await setStamp(db, 'cp_sync.last_attempt_at', new Date(now - 1 * 3600_000).toISOString());
    await setStamp(db, 'cp_sync.last_sync_at', new Date(now - 10 * 86_400_000).toISOString());
    await linkManagerChat(db, 'mgr-chat-2');

    const health = createHealthService({ db, cpConfigured: true, envName: null });
    const log = recordingLogger();
    const services = (A.app as unknown as { __services?: { notify: { enqueueOwnerAlert(t: string, d: string): Promise<number>; dispatchPending(l?: number): Promise<{ processed: number; sent: number; failed: number; skipped: number }> } } }).__services!;
    const outcome = await runAlertCycle({ db, health, notify: services.notify, logger: log, alertsDisabled: '1' });

    expect(outcome.disabled).toBe(true);
    expect(outcome.alerts).toHaveLength(0);
    expect(outcome.enqueued).toBe(0);
    expect(log.errors).toHaveLength(0);
    expect(await readAlertsSeal(db)).toBeNull();
    const rows = await db.query<{ id: string }>(`SELECT id FROM notifications`);
    expect(rows).toHaveLength(0);
  });

  it('GET /api/health/panel آرایهٔ alerts و مُهر آخرین ارزیابی را می‌دهد (فقط‌مدیر، همان قرارداد پنل)', async () => {
    const A = createTestApp();
    const mgr = await asRole(A, 'manager');
    const res1 = await mgr.get('/api/health/panel');
    expect(res1.status).toBe(200);
    const d1 = (res1.body as { data: { alerts: unknown[]; alerts_last_evaluated_at: string | null } }).data;
    expect(Array.isArray(d1.alerts)).toBe(true);
    expect(d1.alerts).toHaveLength(0); // هارنس: CP خاموش و خطای مرورگری نیست — بی‌هشدار
    expect(d1.alerts_last_evaluated_at).toBeNull();

    // مُهر ارزیابی بنشینیم → پنل همان را نشان می‌دهد
    const db = createDb(A.env.DB as never);
    const iso = new Date().toISOString();
    await setStamp(db, ALERTS_SEAL_KEY, iso);
    const res2 = await mgr.get('/api/health/panel');
    const d2 = (res2.body as { data: { alerts_last_evaluated_at: string | null } }).data;
    expect(d2.alerts_last_evaluated_at).toBe(iso);
  });
});

describe('پارس env هشدار', () => {
  it('ALERT_CLIENT_ERRORS_MAX: نبود/نامعتبر → پیش‌فرض ۱۰۰ · صفر → هر خطا هشدار · مثبت → همان', () => {
    expect(parseClientErrorsMax(undefined)).toBe(ALERT_CLIENT_ERRORS_MAX_DEFAULT);
    expect(parseClientErrorsMax(null)).toBe(ALERT_CLIENT_ERRORS_MAX_DEFAULT);
    expect(parseClientErrorsMax('')).toBe(ALERT_CLIENT_ERRORS_MAX_DEFAULT);
    expect(parseClientErrorsMax('abc')).toBe(ALERT_CLIENT_ERRORS_MAX_DEFAULT);
    expect(parseClientErrorsMax('-1')).toBe(ALERT_CLIENT_ERRORS_MAX_DEFAULT);
    expect(parseClientErrorsMax('0')).toBe(0);
    expect(parseClientErrorsMax('50')).toBe(50);
    expect(parseClientErrorsMax(50)).toBe(50);
  });

  it('ALERTS_DISABLED فقط رشتهٔ راستین خاموش می‌کند', () => {
    expect(alertsDisabledFlag(undefined)).toBe(false);
    expect(alertsDisabledFlag('')).toBe(false);
    expect(alertsDisabledFlag('0')).toBe(false);
    expect(alertsDisabledFlag('false')).toBe(false);
    expect(alertsDisabledFlag('1')).toBe(true);
    expect(alertsDisabledFlag('TRUE')).toBe(true);
    expect(alertsDisabledFlag('yes')).toBe(true);
    expect(alertsDisabledFlag('on')).toBe(true);
  });
});
