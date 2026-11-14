/**
 * rust-f7 — آزمون آزمونگرهای اتصال (fetch مک — الگوی makeFetch)
 */
import { describe, expect, it } from 'vitest';
import { normalizeWorkerUrl, verifyCloudNode, verifyCloudToken } from '../cloud-setup/verify.js';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

describe('normalizeWorkerUrl', () => {
  it('https معتبر بدون اسلش انتهایی', () => {
    expect(normalizeWorkerUrl('https://w.example.workers.dev/')).toEqual({
      ok: true,
      url: 'https://w.example.workers.dev'
    });
  });

  it('http بیرونی رد می‌شود (فقط https)', () => {
    expect(normalizeWorkerUrl('http://w.example').ok).toBe(false);
  });

  it('http فقط روی loopback مجاز است', () => {
    expect(normalizeWorkerUrl('http://127.0.0.1:8787').ok).toBe(true);
    expect(normalizeWorkerUrl('http://localhost:8787').ok).toBe(true);
  });

  it('خالی و نامعتبر پیام فارسی دارند', () => {
    expect(normalizeWorkerUrl('   ').ok).toBe(false);
    expect(normalizeWorkerUrl('not a url').ok).toBe(false);
  });
});

describe('verifyCloudNode', () => {
  const good = { workerUrl: 'https://w.example', nodeCode: 'DESKTOP:abc', nodeKey: 'nk_live_x' };

  it('۲۰۰ = اتصال برقرار', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const r = await verifyCloudNode(async (url, init) => {
      seen.push({ url, headers: init?.headers ?? {} });
      return jsonResponse(200, { items: [], next_cursor: null });
    }, good);
    expect(r.ok).toBe(true);
    expect(seen[0].url).toBe('https://w.example/node/pull?domains=announcements&limit=1');
    expect(seen[0].headers['X-CP-Node-Code']).toBe('DESKTOP:abc');
    expect(seen[0].headers['Authorization']).toBe('Bearer nk_live_x');
  });

  it('۴۰۱/۴۰۳ = خطای اعتبار با پیام فارسی', async () => {
    const r = await verifyCloudNode(async () => jsonResponse(401, {}), good);
    expect(r.outcome).toBe('auth_error');
    expect(r.ok).toBe(false);
  });

  it('خطای شبکه = نرم (network_error) بدون throw', async () => {
    const r = await verifyCloudNode(async () => {
      throw new Error('offline');
    }, good);
    expect(r.outcome).toBe('network_error');
  });

  it('۵۰۰ = server_error با کد در پیام', async () => {
    const r = await verifyCloudNode(async () => jsonResponse(503, {}), good);
    expect(r.outcome).toBe('server_error');
    expect(r.message).toContain('503');
  });

  it('کلید خالی حتی fetch هم نمی‌زند', async () => {
    let called = 0;
    const r = await verifyCloudNode(async () => {
      called += 1;
      return jsonResponse(200, {});
    }, { ...good, nodeKey: ' ' });
    expect(called).toBe(0);
    expect(r.outcome).toBe('auth_error');
  });
});

describe('verifyCloudToken', () => {
  it('success=true کلادفلر = معتبر', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const r = await verifyCloudToken(async (url, init) => {
      seen.push({ url, headers: init?.headers ?? {} });
      return jsonResponse(200, { success: true });
    }, { token: 'cf_tok' });
    expect(r.ok).toBe(true);
    expect(seen[0].url).toBe('https://api.cloudflare.com/client/v4/user/tokens/verify');
    expect(seen[0].headers['Authorization']).toBe('Bearer cf_tok');
  });

  it('success=false با جزئیات خطای کلادفلر', async () => {
    const r = await verifyCloudToken(async () => jsonResponse(400, {
      success: false,
      errors: [{ message: 'Invalid Token' }]
    }), { token: 'bad' });
    expect(r.outcome).toBe('invalid_token');
    expect(r.message).toContain('Invalid Token');
  });

  it('قطعی شبکه = نرم', async () => {
    const r = await verifyCloudToken(async () => {
      throw new Error('offline');
    }, { token: 'cf_tok' });
    expect(r.outcome).toBe('network_error');
  });

  it('توکن خالی بدون fetch رد می‌شود', async () => {
    let called = 0;
    const r = await verifyCloudToken(async () => {
      called += 1;
      return jsonResponse(200, { success: true });
    }, { token: '  ' });
    expect(called).toBe(0);
    expect(r.outcome).toBe('invalid_token');
  });
});
