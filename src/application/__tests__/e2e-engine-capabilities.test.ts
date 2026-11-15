// آزمون‌های پایانهٔ قابلیت‌های موتور (۱.۲۷.۱۳ — P0-1 سند ممیزی §۱):
// GET /api/engine/capabilities عمومی و بی‌احراز · قرارداد پاسخ · زنده‌بودنِ نقشهٔ api
// (هر کلید نقشه با فراخوانی واقعی پشتوانه می‌شود تا نقشه نتواند دروغ بگوید)
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api } from '../../test/harness';
import { APP_VERSION } from '@core/version';
import { ENGINE_PUBLIC_API_MAP } from '../engine-capabilities';

describe('پایانهٔ قابلیت‌های موتور — GET /api/engine/capabilities (عمومی)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('بدون نشست ۲۰۰ می‌گیرد: ok، نسخهٔ یکتا، server_ts و نقشهٔ api کامل', async () => {
    const anon = new Api(A);
    const res = await anon.get('/api/engine/capabilities');
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store');
    const body = res.body as {
      ok: boolean;
      version: string;
      server_ts: string;
      api: Record<string, string>;
    };
    expect(body.ok).toBe(true);
    expect(body.version).toBe(APP_VERSION); // منبع یکتای نسخه — نه رشتهٔ دستی
    expect(body.server_ts).toBeTruthy();
    expect(Object.keys(body.api).sort()).toEqual(Object.keys(ENGINE_PUBLIC_API_MAP).sort());
    expect(Object.values(body.api).every((p) => typeof p === 'string' && p.startsWith('/'))).toBe(true);
  });

  it('مسیرهای نقشه واقعاً زنده‌اند — /health و restart-status عمومی ۲۰۰ می‌دهند', async () => {
    const anon = new Api(A);
    const health = await anon.get(ENGINE_PUBLIC_API_MAP.health);
    expect(health.status).toBe(200);
    const restart = await anon.get(ENGINE_PUBLIC_API_MAP.restartStatus);
    expect(restart.status).toBe(200);
  });

  it('مسیرهای نقشه واقعاً زنده‌اند — healthPanel و nodeSyncStatus گیت‌دارند (۴۰۱، نه ۴۰۴)', async () => {
    const anon = new Api(A);
    const panel = await anon.get(ENGINE_PUBLIC_API_MAP.healthPanel);
    expect(panel.status).toBe(401);
    const nodeSync = await anon.get(ENGINE_PUBLIC_API_MAP.nodeSyncStatus);
    expect(nodeSync.status).toBe(401);
  });

  it('نسخهٔ /health و پایانهٔ قابلیت‌ها همیشه یکی است (یک حقیقت، دو مسیر)', async () => {
    const anon = new Api(A);
    const caps = await anon.get('/api/engine/capabilities');
    const health = await anon.get('/health');
    const capsVersion = (caps.body as { version: string }).version;
    const healthVersion = (health.body as { version: string }).version;
    expect(capsVersion).toBe(healthVersion);
  });
});
