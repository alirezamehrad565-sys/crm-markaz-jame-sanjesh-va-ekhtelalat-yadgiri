import { describe, it, expect, beforeAll } from 'vitest';
import { APP_VERSION } from '@core/version';
import { DEV_AUTH_SECRET } from '@core/auth/runtime-secret';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  MANAGER_ID,
  ALI_ID,
  SECRETARY_ID,
  STUDENT1_ID
} from '../../test/harness';

describe('/ — auth & session (API واقعی)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('GET /health بدون auth — 200 با ok:true و نسخهٔ سامانه', async () => {
    const api = new Api(A);
    const res = await api.get('/health');
    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe(APP_VERSION);
  });

  it('POST /api/auth/login با رمز درست — token + اطلاعات کاربر', async () => {
    const api = new Api(A);
    const res = await api.post('/api/auth/login', { username: 'manager', password: '1234' });
    expect(res.status).toBe(200);
    const data = (res.body as { data: { token: string; expiresAt: string; staff: Record<string, unknown> } }).data;
    expect(data.token.split('.').length).toBe(3);
    expect(data.staff.id).toBe(MANAGER_ID);
    expect(data.staff.role).toBe('manager');
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('رمز اشتباه — 401 با پیام عامدانه کلی', async () => {
    const api = new Api(A);
    const res = await api.post('/api/auth/login', { username: 'manager', password: 'wrong' });
    expect(res.status).toBe(401);
    const err = res.body as { error: string; message: string };
    expect(err.error).toBe('AUTH_ERROR');
    expect(err.message).toContain('نام کاربری یا رمز');
  });

  it('کاربر ناشناس — همان پیام کلی (نه فاش کردن وجود حساب)', async () => {
    const api = new Api(A);
    const res = await api.post('/api/auth/login', { username: 'no_such_user', password: '1234' });
    expect(res.status).toBe(401);
    const other = await new Api(A).post('/api/auth/login', { username: 'manager', password: 'bad' });
    expect((res.body as { message: string }).message).toBe((other.body as { message: string }).message);
  });

  it('بدون توکن روی /api/* — 401', async () => {
    const api = new Api(A);
    const res = await api.get('/api/me');
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe('AUTH_ERROR');
  });

  it('توکن دستکاری‌شده — 401', async () => {
    const token = await loginToken(A, 'manager');
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}aa`;
    const api = new Api(A).withToken(tampered);
    const res = await api.get('/api/me');
    expect(res.status).toBe(401);
  });

  it('/api/me با توکن معتبر — authContext درست', async () => {
    const api = await asRole(A, 'secretary');
    const res = await api.get('/api/me');
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, string> }).data;
    expect(data.role).toBe('secretary');
    expect(data.staffId).toBe(SECRETARY_ID);
    expect(data.displayName).toBe('زهرا کریمی');
  });

  it('dev bypass با X-Dev-Staff-Id در ENV=development', async () => {
    const res = await A.app.request(
      '/api/me',
      { headers: { 'X-Dev-Staff-Id': ALI_ID } },
      A.env as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { role: string } };
    expect(body.data.role).toBe('therapist');
  });

  it('dev bypass با staff ناموجود — 401', async () => {
    const res = await A.app.request(
      '/api/me',
      { headers: { 'X-Dev-Staff-Id': '99999999-0000-0000-0000-000000000009' } },
      A.env as never
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout با توکن — 200 + رویداد ممیزی auth.logout (: حلقهٔ خروج بسته شد)', async () => {
    const api = await asRole(A, 'manager');
    const res = await api.post('/api/auth/logout');
    expect(res.status).toBe(200);
    const row = A.sql.prepare(
      `SELECT actor_id FROM audit_log WHERE action = 'auth.logout' ORDER BY created_at DESC LIMIT 1`
    ).get() as { actor_id: string } | undefined;
    expect(row?.actor_id).toBe(MANAGER_ID);
  });

  it('POST /api/auth/logout بدون توکن — 401 (: خروج احرازشده است، نه روت عمومی)', async () => {
    const api = new Api(A);
    const res = await api.post('/api/auth/logout');
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe('AUTH_ERROR');
  });

  it('هدر Cache-Control: no-store روی همهٔ /api/*', async () => {
    const api = await asRole(A, 'manager');
    const me = await api.get('/api/me');
    expect(me.cacheControl).toContain('no-store');
    const staff = await api.get('/api/staff');
    expect(staff.cacheControl).toContain('no-store');
  });

  it('مسیر ناشناخته — 404 JSON استاندارد', async () => {
    const api = await asRole(A, 'manager');
    const res = await api.get('/api/definitely/not/here');
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe('NOT_FOUND');
  });

  it('بدنهٔ JSON خراب — 400 (نه 500)', async () => {
    const res = await A.app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid' },
      A.env as never
    );
    expect(res.status).toBe(400);
  });

  it('وبهوک بله با secret نامعتبر — 403 و با secret معتبر — 200', async () => {
    const bad = await A.app.request(
      '/webhook/bale/wrong-secret',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
      A.env as never
    );
    expect(bad.status).toBe(403);
    const good = await A.app.request(
      `/webhook/bale/wh-test-secret`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: { chat: { id: 555 }, text: '/start' } }) },
      A.env as never
    );
    expect(good.status).toBe(200);
    const body = (await good.json()) as { ok: boolean; handled: boolean };
    expect(body.ok).toBe(true);
  });
});

describe('RBAC — نقش‌ها روی endpointهای محافظت‌شده', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
  });

  it('reports فقط مدیر/منشی — همکار ۴۰۳ می‌گیرد', async () => {
    const okManager = await manager.get('/api/reports?from=1404-01-01&to=1404-12-29');
    expect(okManager.status).toBe(200);
    const forbidden = await therapist.get('/api/reports?from=1404-01-01&to=1404-12-29');
    expect(forbidden.status).toBe(403);
    expect((forbidden.body as { error: string }).error).toBe('FORBIDDEN');
  });

  it('PUT تنظیمات فقط مدیر — منشی ۴۰۳', async () => {
    const res = await secretary.put('/api/settings', { clinic_name: 'مرکز آزمایشی' });
    expect(res.status).toBe(403);
  });

  it('dispatch اعلان‌ها فقط مدیر — منشی/همکار ۴۰۳', async () => {
    expect((await secretary.post('/api/notifications/dispatch')).status).toBe(403);
    expect((await therapist.post('/api/notifications/dispatch')).status).toBe(403);
    const ok = await manager.post('/api/notifications/dispatch');
    expect(ok.status).toBe(200);
  });

  it('ساخت برچسب: مدیر و درمانگر مجاز (خواست کاربر)، منشی ۴۰۳؛ خواندن برای همه آزاد است', async () => {
    const list = await therapist.get('/api/tags');
    expect(list.status).toBe(200);
    const byTherapist = await therapist.post('/api/tags', { name: 'برچسب همکار درمانگر', category: 'custom' });
    expect(byTherapist.status).toBe(201);
    const denied = await secretary.post('/api/tags', { name: 'برچسب منشی', category: 'custom' });
    expect(denied.status).toBe(403);
  });

  it('حذف توضیحات روز فقط مدیر — منشی ۴۰۳ ولی ثبت توضیح منشی مجاز است', async () => {
    const note = await secretary.post('/api/working-day/notes', { date: '1404-07-15', body: 'توضیح روز آزمایشی' });
    expect(note.status).toBe(201);
    const noteId = (note.body as { data: { id: string } }).data.id;
    const del = await secretary.delete(`/api/working-day/notes/${noteId}`);
    expect(del.status).toBe(403);
    const delManager = await manager.delete(`/api/working-day/notes/${noteId}`);
    expect(delManager.status).toBe(200);
  });

  it('اعلان عمومی صفحه ورود بدون auth در دسترس است', async () => {
    const api = new Api(A);
    const res = await api.get('/public/announcements');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  // ─── سخت‌سازی امنیتی ───

  it('چرخش نام کاربری از یک IP: پس از ۲۰ خطا، 429 می‌گیرد (throttle دومِ IP)', async () => {
    const loginAs = (username: string) =>
      A.app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.7' },
          body: JSON.stringify({ username, password: 'wrong-pass' })
        },
        A.env as never
      );
    // ۲۰ خطا با ۲۰ نام کاربری متفاوت — همه 401 (هیچ نام کاربری به سقف ۵ نمی‌رسد)
    for (let i = 0; i < 20; i += 1) {
      const res = await loginAs(`rotating-${i}`);
      expect(res.status).toBe(401);
    }
    // تلاش ۲۱م — حتی با نام کاربری تازه — 429
    const blocked = await loginAs('rotating-fresh');
    expect(blocked.status).toBe(429);
    // همان IP با رمز درست هم بلاک است ( brute force با cred جعلی متوقف می‌ماند)
    const blockedValid = await A.app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.7' },
        body: JSON.stringify({ username: 'manager', password: '1234' })
      },
      A.env as never
    );
    expect(blockedValid.status).toBe(429);
    // IP دیگر بی‌تأثیر از این بلاک است
    const otherIp = await A.app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
        body: JSON.stringify({ username: 'manager', password: '1234' })
      },
      A.env as never
    );
    expect(otherIp.status).toBe(200);
  });

  it('limit نامعتبر (?limit=abc) روی نوبت‌های دانش‌آموز — 200 نه 500', async () => {
    const token = await loginToken(A, 'manager');
    const res = await A.app.request(
      `/api/students/${STUDENT1_ID}/appointments?limit=abc`,
      { headers: { authorization: `Bearer ${token}` } },
      A.env as never
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(json.data)).toBe(true);
  });
});

// ─── مایلستون ۱ بخش ۸ (0111) — ابطال سمت‌سرور نشست‌ها ───
// JWT دیگر بی‌حالت نیست: امضای معتبر + ردیف auth_sessions زنده هر دو لازم است.

function decodePayload(token: string): { sid?: string; sub: string } {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { sid?: string; sub: string };
}

/** امضای دستی توکن «قدیمی» بدون sid — دقیقاً شکل صدور پیش از 0111 */
async function signLegacyToken(secret: string): Promise<string> {
  const enc = (o: unknown): string =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const data = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({
    sub: MANAGER_ID, name: 'mgr', role: 'manager', email: 'legacy@test', iat: 1, exp: 9999999999
  })}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `${data}.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

describe('auth_sessions — ابطال سمت‌سرور (0111، مایلستون ۱)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('login: claim sid در توکن + ردیف نشست زنده در DB (revoked_at خالی)', async () => {
    const token = await loginToken(A, 'manager');
    const payload = decodePayload(token);
    const sid = payload.sid as string;
    expect(sid).toBeTruthy();
    const row = A.sql.prepare('SELECT sid, revoked_at, expires_at FROM auth_sessions WHERE sid = ?')
      .get(sid) as { sid: string; revoked_at: string | null; expires_at: string } | undefined;
    expect(row).toBeTruthy();
    expect(row?.revoked_at).toBeNull();
    expect(row && row.expires_at > new Date().toISOString()).toBe(true);
  });

  it('logout: همان توکن بلافاصله ۴۰۱ می‌گیرد و revoked_at ثبت می‌شود', async () => {
    const token = await loginToken(A, 'manager');
    const api = new Api(A).withToken(token);
    expect((await api.get('/api/me')).status).toBe(200);
    expect((await api.post('/api/auth/logout')).status).toBe(200);
    expect((await api.get('/api/me')).status).toBe(401);
    const row = A.sql.prepare('SELECT revoked_at FROM auth_sessions WHERE sid = ?')
      .get(decodePayload(token).sid as string) as { revoked_at: string | null };
    expect(row.revoked_at).not.toBeNull();
  });

  it('نشست‌ها مستقل‌اند: خروج از یکی، دیگری سالم می‌ماند', async () => {
    const t1 = await loginToken(A, 'manager');
    const t2 = await loginToken(A, 'secretary');
    await new Api(A).withToken(t1).post('/api/auth/logout');
    expect((await new Api(A).withToken(t2).get('/api/me')).status).toBe(200);
    expect((await new Api(A).withToken(t1).get('/api/me')).status).toBe(401);
  });

  it('نشست منقضی‌شده در DB (باطل‌سازی دستی/مدیریتی) → ۴۰۱ با JWT سالم', async () => {
    const token = await loginToken(A, 'ali'); // درمانگر (نام کاربری seed هارنس)
    const sid = decodePayload(token).sid as string;
    A.sql.prepare("UPDATE auth_sessions SET expires_at = '2020-01-01T00:00:00.000Z' WHERE sid = ?").run(sid);
    expect((await new Api(A).withToken(token).get('/api/me')).status).toBe(401);
  });

  it('هرس فرصت‌طلب: نشست منقضی قدیمی هنگام لاگین بعدی پاک می‌شود', async () => {
    A.sql.prepare(
      "INSERT INTO auth_sessions (sid, staff_id, issued_at, expires_at, revoked_at) VALUES ('expired-prune-test', ?, '2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z', NULL)"
    ).run(MANAGER_ID);
    await loginToken(A, 'manager');
    const row = A.sql.prepare("SELECT sid FROM auth_sessions WHERE sid = 'expired-prune-test'").get();
    expect(row).toBeUndefined();
  });

  it('توکن legacy بدون sid (صدور پیش از 0111) → ۴۰۱ با پیام ورود دوباره — سخت‌گیری عمدی', async () => {
    const legacy = await signLegacyToken(DEV_AUTH_SECRET);
    const res = await new Api(A).withToken(legacy).get('/api/me');
    expect(res.status).toBe(401);
    expect((res.body as { message?: string }).message ?? '').toContain('ورود دوباره');
  });
});
