// ۱.۲۶.۴ — بازسازی خودکار بی‌صدا از بکاپ (باقی‌ماندهٔ موج ۳ / DB-1) — آزمون مسیر بوت واقعی
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { setTimeout as delay } from 'node:timers/promises';
// @ts-expect-error — plain mjs موتور
import { applyMigrations } from '../../scripts/engine/apply-migrations.mjs';
// @ts-expect-error — ماژول plain mjs موتور (بدون declaration)
import { takeSnapshot, ensureDbIntegrityOrRestore, newestVerifiedSnapshot, snapshotCorruptFile } from '../../scripts/engine/db-snapshot.mjs';
// @ts-expect-error — plain mjs موتور
import { d1SqlitePath } from '../../scripts/engine/engine-paths.mjs';

function newDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'engine-restore-'));
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function makeDbWithData(dataDir: string): string {
  const dbPath = d1SqlitePath(dataDir);
  applyMigrations(dbPath);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO settings (key, value) VALUES ('restore_probe', '"v1"')`).run();
  db.close();
  return dbPath;
}

function readProbe(dbPath: string): string | null {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'restore_probe'`).get() as { value: string } | undefined;
    return row ? String(JSON.parse(row.value)) : null;
  } finally {
    db.close();
  }
}

describe('db-snapshot — نویسندهٔ پشتیبان فایل‌سطح موتور', () => {
  it('پشتیبان تأییدشده می‌گیرد و چرخش ۷تایی را اجرا می‌کند', () => {
    const dataDir = newDataDir();
    dirs.push(dataDir);
    const dbPath = makeDbWithData(dataDir);
    for (let i = 0; i < 9; i += 1) {
      const r = takeSnapshot(dbPath, dataDir, { log: (m: string) => process.stdout.write(`[snap ${i}] ${m}\n`) });
      expect(r.ok, `i=${i} name=${r.name} path=${r.path}`).toBe(true);
      expect(r.verified).toBe(true);
    }
    const backups = readdirSync(path.join(dataDir, 'backups')).filter((f) => f.endsWith('.db'));
    expect(backups.length).toBe(7); // نگه‌داری ۷ فایل — قدیمی‌ترها حذف
    expect(newestVerifiedSnapshot(path.join(dataDir, 'backups'))).not.toBeNull();
  });

  it('فایل خراب پشتیبان نمی‌شود (تأیید quick_check)', () => {
    const dataDir = newDataDir();
    dirs.push(dataDir);
    const dbPath = path.join(dataDir, 'broken.sqlite');
    writeFileSync(dbPath, 'این یک فایل پایگاه نیست — آشغال دودویی برای آزمون');
    const r = takeSnapshot(dbPath, dataDir, { log: () => {} });
    expect(r.ok).toBe(false);
  });

  it('نشانهٔ فایل آسیب‌دیده گرفته می‌شود و هیچ‌چیز حذف نمی‌شود', () => {
    const dataDir = newDataDir();
    dirs.push(dataDir);
    const dbPath = makeDbWithData(dataDir);
    writeFileSync(dbPath, Buffer.from('corrupted-garbage-content-for-test', 'utf8'));
    const snap = snapshotCorruptFile(dbPath);
    expect(snap).not.toBeNull();
    expect(snap!.endsWith('.corrupt-')).toBe(false);
    expect(snap).toContain('.corrupt-');
    expect(existsSync(snap!)).toBe(true);
    expect(existsSync(dbPath)).toBe(true); // فایل اصلی حذف/بازنویسی نشده
  });

  it('بازسازی خودکار: خراب → نشانه → بازیابی پشتیبان → داده سالم + پیام فارسی + audit', () => {
    const dataDir = newDataDir();
    dirs.push(dataDir);
    const dbPath = makeDbWithData(dataDir);
    const snap = takeSnapshot(dbPath, dataDir, { log: () => {} });
    expect(snap.ok).toBe(true);
    // دادهٔ پس از پشتیبان — باید پس از بازسازی گم شود (بازسازی به لحظهٔ پشتیبان برمی‌گردد)
    const db = new DatabaseSync(dbPath);
    db.prepare(`INSERT INTO settings (key, value) VALUES ('after_backup', '"lost"')`).run();
    db.close();
    writeFileSync(dbPath, Buffer.from('garbage-not-a-sqlite-file-at-all', 'utf8'));
    for (const side of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      if (existsSync(side)) rmSync(side, { force: true });
    }

    const fatalMsgs: string[] = [];
    const r = ensureDbIntegrityOrRestore(dbPath, dataDir, {
      log: () => {},
      fatal: (msg: string) => {
        fatalMsgs.push(msg);
        throw new Error(msg);
      }
    });
    expect(r.restored).not.toBeNull();
    expect(r.restored!.message).toContain('پایگاه داده آسیب دیده بود');
    expect(r.restored!.message).toContain('بازسازی شد');
    expect(r.restored!.corrupt_snapshot).toContain('.corrupt-');
    expect(readProbe(dbPath)).toBe('v1'); // دادهٔ لحظهٔ پشتیبان برگشته است
    // ردیف audit بازسازی در همان پایگاه ثبت شده باشد
    const auditDb = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = auditDb.prepare(`SELECT action FROM audit_log WHERE action = 'db.restore_from_backup'`).get();
      expect(row).toBeTruthy();
    } finally {
      auditDb.close();
    }
    expect(fatalMsgs).toHaveLength(0);
  });

  it('بدون هیچ پشتیبانی: بوت متوقف می‌شود با پیام فارسی (مسیر منفی)', () => {
    const dataDir = newDataDir();
    dirs.push(dataDir);
    const dbPath = makeDbWithData(dataDir);
    writeFileSync(dbPath, Buffer.from('garbage-not-a-sqlite-file', 'utf8'));
    // هیچ backups/ نساخته‌ایم
    let fatalMsg: string | null = null;
    expect(() => {
      ensureDbIntegrityOrRestore(dbPath, dataDir, {
        log: () => {},
        fatal: (msg: string) => {
          fatalMsg = msg;
          throw new Error(msg);
        }
      });
    }).toThrow();
    expect(fatalMsg).toContain('پشتیبان');
    expect(fatalMsg).toContain('بوت متوقف شد');
  });
});

describe('مسیر بوت واقعی engine.mjs با پایگاه خراب — بازسازی بی‌صدا و بوت سبز', () => {
  it('بوت موتور با پایگاه خراب: از پشتیبان بازسازی می‌شود و بالا می‌آید', async () => {
    const dataDir = newDataDir();
    dirs.push(dataDir);
    const dbPath = makeDbWithData(dataDir);
    const snap = takeSnapshot(dbPath, dataDir, { log: () => {} });
    expect(snap.ok).toBe(true);
    writeFileSync(dbPath, Buffer.from('totally-corrupt-db-file', 'utf8'));
    for (const side of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      if (existsSync(side)) rmSync(side, { force: true });
    }

    // پورت آزاد واقعی — هم‌الگوی engine-smoke.mjs
    const net = await import('node:net');
    const port = await new Promise<number>((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const p = (srv.address() as { port: number }).port;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });
    const gamesPort = port + 1;

    const engine = spawn(process.execPath, [
      path.join(process.cwd(), 'scripts/engine/engine.mjs'),
      '--port', String(port), '--games-port', String(gamesPort), '--data-dir', dataDir
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    engine.stdout.on('data', (d) => (log += d));
    engine.stderr.on('data', (d) => (log += d));

    let booted = false;
    for (let i = 0; i < 90 && !booted; i += 1) {
      if (engine.exitCode !== null) break;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) booted = true;
      } catch {
        await delay(500);
      }
    }

    expect(booted).toBe(true);
    expect(log).toContain('پایگاه داده آسیب دیده بود');
    expect(log).toContain('بازسازی شد');
    // نسخهٔ آسیب‌دیده با نشانهٔ .corrupt نگه‌داری شده — داده مقدس است
    const d1Dir = path.join(dataDir, 'd1');
    const corrupt = readdirSync(d1Dir, { recursive: true }).find((f) => String(f).includes('.corrupt-'));
    expect(corrupt).toBeTruthy();
    expect(readProbe(dbPath)).toBe('v1');

    engine.kill('SIGTERM');
    await delay(500);
    if (engine.exitCode === null) engine.kill('SIGKILL');
  }, 180_000);
});
