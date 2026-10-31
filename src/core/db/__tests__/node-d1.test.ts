/**
 * تست NodeD1 (درایور سلف‌هاست روی node:sqlite) و اجراکنندهٔ مهاجرت‌ها
 * parity رفتاری با MockD1 — همان قراردادهایی که ۱۳۰۰ تست e2e روی آن سبز است
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { NodeD1 } from '../node-d1';
import { applySelfhostMigrations } from '../selfhost-migrate';

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'noded1-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('NodeD1', () => {
  it('۱ — فایل دیتابیس می‌سازد، PRAGMAها فعال‌اند و داده گرد می‌شود', async () => {
    const dir = tempDir();
    const dbPath = path.join(dir, 'nested', 'app.db');
    const d1 = NodeD1.open(dbPath);
    const store = d1.rawStore;
    expect(store.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(store.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(store.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 });

    store.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const res = await d1.prepare('INSERT INTO t (name) VALUES (?)').bind('علی').run();
    expect(res.success).toBe(true);
    expect(res.meta.changes).toBe(1);
    expect(typeof res.meta.last_row_id).toBe('number');

    const rows = await d1.prepare('SELECT * FROM t WHERE name = ?').bind('علی').all<{ id: number; name: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.name).toBe('علی');

    const one = await d1.prepare('SELECT name FROM t').first<string>('name');
    expect(one).toBe('علی');
    const none = await d1.prepare('SELECT name FROM t WHERE id = 999').first();
    expect(none).toBeNull();

    const raw = await d1.prepare('SELECT id, name FROM t').raw();
    expect(raw).toEqual([[1, 'علی']]);
    d1.close();
  });

  it('۲ — batch تراکنشی است: خطای میانی → rollback کامل', async () => {
    const d1 = NodeD1.open(path.join(tempDir(), 'app.db'));
    d1.rawStore.exec('CREATE TABLE t (v INTEGER UNIQUE)');
    const ok = await d1.batch([d1.prepare('INSERT INTO t (v) VALUES (1)'), d1.prepare('INSERT INTO t (v) VALUES (2)')]);
    expect(ok).toHaveLength(2);
    expect(ok.every((r) => r.success)).toBe(true);

    await expect(
      d1.batch([d1.prepare('INSERT INTO t (v) VALUES (3)'), d1.prepare('INSERT INTO t (v) VALUES (1)')])
    ).rejects.toThrow();
    const n = await d1.prepare('SELECT COUNT(*) AS n FROM t').first<{ n: number }>('n');
    expect(n).toBe(2); // مقدار ۳ ثبت نشده باشد (rollback)
    d1.close();
  });

  it('۳ — بایند BLOB (Uint8Array) گرد می‌شود', async () => {
    const d1 = NodeD1.open(path.join(tempDir(), 'app.db'));
    d1.rawStore.exec('CREATE TABLE b (content BLOB)');
    const bytes = new Uint8Array([0, 1, 2, 255, 128]);
    await d1.prepare('INSERT INTO b (content) VALUES (?)').bind(bytes).run();
    const row = d1.rawStore.prepare('SELECT content FROM b').get() as { content: Uint8Array };
    expect(Buffer.from(row.content)).toEqual(Buffer.from(bytes));
    d1.close();
  });

  it('۴ — null و رشتهٔ خالی پاریتی MockD1', async () => {
    const d1 = NodeD1.open(path.join(tempDir(), 'app.db'));
    d1.rawStore.exec('CREATE TABLE t (a TEXT, b TEXT)');
    await d1.prepare('INSERT INTO t (a, b) VALUES (?, ?)').bind(null, '').run();
    const row = await d1.prepare('SELECT a, b FROM t').first<{ a: string | null; b: string }>();
    expect(row?.a).toBeNull();
    expect(row?.b).toBe('');
    d1.close();
  });
});

describe('applySelfhostMigrations', () => {
  it('۵ — نصب تازه: همه اعمال و ثبت می‌شوند؛ بار دوم رد می‌شوند', () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'migrations'));
    writeFileSync(path.join(dir, 'migrations', '0001_a.sql'), 'CREATE TABLE staff (id TEXT PRIMARY KEY);');
    writeFileSync(path.join(dir, 'migrations', '0002_b.sql'), 'ALTER TABLE staff ADD COLUMN name TEXT;');
    const d1 = NodeD1.open(path.join(dir, 'app.db'));

    const first = applySelfhostMigrations(d1.rawStore, path.join(dir, 'migrations'));
    expect(first.applied).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(first.assumedFromSchema).toBe(false);
    expect((d1.rawStore.prepare('SELECT name FROM _selfhost_migrations ORDER BY name').all() as unknown[]).length).toBe(2);

    const second = applySelfhostMigrations(d1.rawStore, path.join(dir, 'migrations'));
    expect(second.applied).toHaveLength(0);
    expect(second.skipped).toBe(2);
    d1.close();
  });

  it('۶ — dump کامل موجود: اسکیما هست ولی رهگیری خالی → فقط ثبت، بدون اجرا', () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'migrations'));
    writeFileSync(path.join(dir, 'migrations', '0001_a.sql'), 'CREATE TABLE staff (id TEXT PRIMARY KEY);');
    writeFileSync(path.join(dir, 'migrations', '0002_bad.sql'), 'ALTER TABLE staff ADD COLUMN nonexistent_ref TEXT;');
    const d1 = NodeD1.open(path.join(dir, 'app.db'));
    // شبیه‌سازی dump کامل D1: جدول staff از قبل هست
    d1.rawStore.exec('CREATE TABLE staff (id TEXT PRIMARY KEY);');

    const out = applySelfhostMigrations(d1.rawStore, path.join(dir, 'migrations'));
    expect(out.assumedFromSchema).toBe(true);
    expect(out.applied).toHaveLength(0);
    const again = applySelfhostMigrations(d1.rawStore, path.join(dir, 'migrations'));
    expect(again.skipped).toBe(2);
    d1.close();
  });
});
