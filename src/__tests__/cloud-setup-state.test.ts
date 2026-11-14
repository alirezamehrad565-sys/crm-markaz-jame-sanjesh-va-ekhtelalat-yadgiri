/**
 * rust-f7 — آزمون وضعیت اتصال ابر و مخزن امن
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLOUD_CONN_KEY,
  SECRET_NODE_KEY,
  completeCloudSetup,
  emptyCloudRecord,
  insecureFallbackStore,
  loadCloudRecord,
  localStorageStore,
  resolveSecureStore,
  saveCloudRecord,
  stampVerify,
  tauriSecureStore
} from '../cloud-setup/state.js';

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
});

describe('فرادادهٔ اتصال ابر', () => {
  it('رکورد خالی با نسخهٔ ۱ و setup_done=false', () => {
    const r = emptyCloudRecord();
    expect(r.version).toBe(1);
    expect(r.setup_done).toBe(false);
    expect(r.worker_url).toBeNull();
  });

  it('ذخیره/بارگذاری رفت‌وبرگشت کامل', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k)
    };
    const r = stampVerify(
      { ...emptyCloudRecord(), worker_url: 'https://w.example', node_code: 'DESKTOP:x' },
      'last_node_verify',
      'ok',
      '2026-01-01T00:00:00Z'
    );
    saveCloudRecord(completeCloudSetup(r, false), store);
    const loaded = loadCloudRecord(store);
    expect(loaded.setup_done).toBe(true);
    expect(loaded.worker_url).toBe('https://w.example');
    expect(loaded.last_node_verify?.outcome).toBe('ok');
    expect(loaded.updatedAt).not.toBeNull();
  });

  it('مقدار خراب/نسخهٔ ناشناخته = رکورد خالی، هرگز throw', () => {
    const broken = {
      getItem: () => 'not-json{',
      setItem: () => {},
      removeItem: () => {}
    };
    expect(loadCloudRecord(broken)).toEqual(emptyCloudRecord());
    const wrongVersion = {
      getItem: () => JSON.stringify({ version: 9 }),
      setItem: () => {},
      removeItem: () => {}
    };
    expect(loadCloudRecord(wrongVersion)).toEqual(emptyCloudRecord());
  });

  it('پایان با skip هم setup_done می‌شود و اعتباری ذخیره نمی‌کند', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k)
    };
    saveCloudRecord(completeCloudSetup(emptyCloudRecord(), true), store);
    const loaded = loadCloudRecord(store);
    expect(loaded.setup_done).toBe(true);
    expect(loaded.node_key_set).toBe(false);
  });

  it('fallback ناامن با پیشوند نشان‌دار کار می‌کند', async () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k)
    };
    const secure = insecureFallbackStore(store);
    await secure.set(SECRET_NODE_KEY, 'nk_live_x');
    expect(store.getItem(`__CLOUD_INSECURE__:${SECRET_NODE_KEY}`)).toBe('nk_live_x');
    expect(await secure.get(SECRET_NODE_KEY)).toBe('nk_live_x');
    await secure.delete(SECRET_NODE_KEY);
    expect(await secure.get(SECRET_NODE_KEY)).toBeNull();
  });

  it('resolveSecureStore مخزن پوسته را ترجیح می‌دهد', async () => {
    const calls: string[] = [];
    (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        calls.push(`${cmd}:${String(args?.['action'])}`);
        return null;
      }
    };
    const res = await resolveSecureStore(localStorageStore);
    expect(res.insecure).toBe(false);
    expect(calls.some((c) => c.startsWith('desktop_secure_store:get'))).toBe(true);
  });

  it('resolveSecureStore بدون پوسته = fallback ناامن با نشان صریح', async () => {
    const res = await resolveSecureStore(localStorageStore);
    expect(res.insecure).toBe(true);
  });

  it('tauriSecureStore خطای فرمان را به بالا می‌فرستد (برای probe)', async () => {
    (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke: async () => {
        throw new Error('boom');
      }
    };
    const s = tauriSecureStore();
    expect(s).not.toBeNull();
    await expect(s!.get('node_key')).rejects.toThrow('boom');
  });
});
