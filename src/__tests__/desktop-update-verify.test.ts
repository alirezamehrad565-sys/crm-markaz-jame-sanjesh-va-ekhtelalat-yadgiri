// ۱.۲۶.۴ — VER-2: تأیید دو مرحله‌ای ارتقای میز (بکاپ خودکار → اجرا → مهر → جایگزینی/برگشت)
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
// @ts-expect-error — ماژول plain mjs موتور
import { applyMigrations } from '../../scripts/engine/apply-migrations.mjs';
// @ts-expect-error — ماژول plain mjs موتور
import { d1SqlitePath } from '../../scripts/engine/engine-paths.mjs';
// @ts-expect-error — ماژول plain mjs اسکریپت ارتقای میز
import { preUpdateBackup, applyDesktopUpdate, promoteCandidate, readSeal, writeSeal } from '../../scripts/desktop/update-verify.mjs';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'update-verify-data-'));
  dirs.push(dir);
  applyMigrations(d1SqlitePath(dir));
  return dir;
}

function candidateRoot(version: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'update-candidate-'));
  dirs.push(dir);
  mkdirSync(path.join(dir, 'src', 'core'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'core', 'version.ts'), `export const APP_VERSION = '${version}';\n`);
  return dir;
}

describe('بکاپ خودکار پیش از ارتقا (reuse نویسندهٔ db-snapshot)', () => {
  it('پشتیبان تأییدشده می‌گیرد؛ پایگاه غایب → توقف با پیام فارسی', () => {
    const dataDir = freshDataDir();
    const dbPath = d1SqlitePath(dataDir);
    const db = new DatabaseSync(dbPath);
    db.prepare(`INSERT INTO settings (key, value) VALUES ('probe', '"v"')`).run();
    db.close();
    const r = preUpdateBackup(dataDir);
    expect(r.ok).toBe(true);
    expect(r.name).toMatch(/^backup-\d{8}-\d{6}\.db$/);

    const empty = mkdtempSync(path.join(tmpdir(), 'update-empty-'));
    dirs.push(empty);
    const fail = preUpdateBackup(empty);
    expect(fail.ok).toBe(false);
    expect(fail.message).toContain('پشتیبان');
  });
});

describe('تأیید دو مرحله‌ای: اجرا → مهر → جایگزینی', () => {
  it('پروب سبز → مهر با نسخه‌ها و پشتیبان؛ بدون liveRoot فقط مهر می‌نشیند', async () => {
    const dataDir = freshDataDir();
    const cand = candidateRoot('9.9.9-test');
    const r = await applyDesktopUpdate({
      candidateRoot: cand,
      dataDir,
      keepCandidate: true,
      probeFn: async () => ({ ok: true, version: '9.9.9-test' })
    });
    expect(r.ok).toBe(true);
    expect(r.phase).toBe('sealed-only');
    const seal = readSeal(dataDir);
    expect(seal.to_version).toBe('9.9.9-test');
    expect(seal.verified).toBe(true);
    expect(seal.health_rounds.length).toBe(3);
    expect(seal.backup).toMatch(/^backup-\d{8}-\d{6}\.db$/);
  }, 30_000);

  it('پروب سرخ → برگشت با پیام فارسی؛ نامزد پاک می‌شود و مهر نمی‌نشیند', async () => {
    const dataDir = freshDataDir();
    const cand = candidateRoot('0.0.1-broken');
    const r = await applyDesktopUpdate({
      candidateRoot: cand,
      dataDir,
      probeFn: async () => ({ ok: true, version: 'WRONG' }) // راند اول نسخهٔ ناهمخوان → ناکام
    });
    expect(r.ok).toBe(false);
    expect(r.phase).toBe('verify');
    expect(r.message).toContain('نسخهٔ قبلی');
    expect(existsSync(cand)).toBe(false); // نامزد ناکام پاک‌سازی شد
    expect(readSeal(dataDir)).toBeNull();
  }, 30_000);

  it('جایگزینی: زندهٔ کهنه به live.retired-<ts> می‌رود (حذف نمی‌شود)', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'update-live-'));
    dirs.push(base);
    const live = path.join(base, 'live');
    const cand = path.join(base, 'candidate');
    mkdirSync(live);
    mkdirSync(cand);
    writeFileSync(path.join(live, 'old.txt'), 'old');
    writeFileSync(path.join(cand, 'new.txt'), 'new');
    const r = promoteCandidate(cand, live);
    expect(r.ok).toBe(true);
    expect(existsSync(path.join(live, 'new.txt'))).toBe(true);
    expect(existsSync(path.join(r.retired!, 'old.txt'))).toBe(true);
  });

  it('مهر JSON کامل و خواندنی است', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'seal-'));
    dirs.push(dir);
    const p = writeSeal(dir, { from_version: '1.26.3', to_version: '1.27.0', verified: true, health_rounds: [], backup: 'x' });
    const seal = JSON.parse(readFileSync(p, 'utf8'));
    expect(seal.from_version).toBe('1.26.3');
    expect(seal.sealed_at).toBeTruthy();
  });
});
