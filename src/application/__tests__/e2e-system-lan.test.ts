// آزمون‌های نشانی سرور محلی (۱.۲۷.۲۱): GET /api/system/lan فقط‌مدیر —
// بایندینگ LAN_INFO adapter دسکتاپ → پاکت خوانا · غایب (تولید وب) → lan:null نرم ·
// پارس دفاعی: JSON خراب / پورت نامعتبر → null (کارت پنل نجات «کشف نشد» می‌گیرد، نمی‌شکند)
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../test/harness';
import { parseLanInfo } from '../system/routes';

function lanOf(res: { body: unknown }): unknown {
  return (res.body as { lan: unknown }).lan;
}

describe('GET /api/system/lan — نشانی سرور محلی (فقط‌مدیر)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
    // همان رشتهٔ JSON که adapter دسکتاپ در بوت می‌سازد — قرارداد یکسان با تولید
    A.env.LAN_INFO = JSON.stringify({
      host: '0.0.0.0',
      port: 8787,
      games_port: 8788,
      lan_ips: ['192.168.1.50', '10.0.0.7'],
      main_urls: ['http://192.168.1.50:8787', 'http://10.0.0.7:8787'],
      local_url: 'http://127.0.0.1:8787',
      games_urls: ['http://192.168.1.50:8788', 'http://10.0.0.7:8788'],
      games_local_url: 'http://127.0.0.1:8788',
      boot_at: '2026-11-18T10:00:00.000Z'
    });
  });

  it('مدیر ۲۰۰ می‌گیرد: IPهای LAN + پورت‌های واقعی بوت با قرارداد کامل', async () => {
    const mgr = await asRole(A, 'manager');
    const res = await mgr.get('/api/system/lan');
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store');
    const lan = lanOf(res) as {
      host: string; port: number; games_port: number;
      lan_ips: string[]; main_urls: string[]; local_url: string;
      games_urls: string[]; games_local_url: string; boot_at: string | null;
    };
    expect(lan).not.toBeNull();
    expect(lan.port).toBe(8787);
    expect(lan.games_port).toBe(8788);
    expect(lan.lan_ips).toEqual(['192.168.1.50', '10.0.0.7']);
    expect(lan.main_urls).toEqual(['http://192.168.1.50:8787', 'http://10.0.0.7:8787']);
    expect(lan.local_url).toBe('http://127.0.0.1:8787');
    expect(lan.games_local_url).toBe('http://127.0.0.1:8788');
    expect(lan.boot_at).toBe('2026-11-18T10:00:00.000Z');
  });

  it('درمانگر ۴۰۳ و بی‌احراز ۴۰۱ می‌گیرد', async () => {
    const ther = await asRole(A, 'therapist');
    expect((await ther.get('/api/system/lan')).status).toBe(403);
    expect((await new Api(A).get('/api/system/lan')).status).toBe(401);
  });
});

describe('GET /api/system/lan — بایندینگ غایب/خراب → lan:null (degraded نرم)', () => {
  it('تولید وب (بایندینگ غایب): ۲۰۰ با lan:null — پنل «کشف نشد» می‌گیرد و نمی‌شکند', async () => {
    const A2 = createTestApp();
    const mgr = await asRole(A2, 'manager');
    const res = await mgr.get('/api/system/lan');
    expect(res.status).toBe(200);
    expect(lanOf(res)).toBeNull();
  });

  it('JSON خراب → lan:null؛ پورت نامعتبر → lan:null', async () => {
    expect(parseLanInfo('not-json{')).toBeNull();
    expect(parseLanInfo(JSON.stringify({ port: 'x' }))).toBeNull();
    expect(parseLanInfo(null)).toBeNull();
    expect(parseLanInfo(undefined)).toBeNull();
  });
});
