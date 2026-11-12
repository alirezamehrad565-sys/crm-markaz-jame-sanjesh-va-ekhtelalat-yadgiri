// scripts/engine/engine.mjs — CLI موتور محلی مرکز جامع (فاز ۲ خط rust — docs/rust/design.md §۴)
//
//   node scripts/engine/engine.mjs --port 8787 --data-dir <مسیر> [--games-port 8788] [--seed]
//
// ترتیب: مایگریشن → (اختیاری) seed نمایشی → تولید کانفیگ capnp-text → spawn workerd
// → انتظار /health (۳۰ ثانیه) → اجرا تا سیگنال؛ خاموشی تمیز با SIGTERM/SIGINT.
// هر دو بایند فقط روی 127.0.0.1 هستند (design.md §۸).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildEngineConfig } from './config.mjs';
import { REPO_ROOT, d1SqlitePath } from './engine-paths.mjs';
import { applyMigrations } from './apply-migrations.mjs';

function parseArgs(argv) {
  const out = { port: 8787, gamesPort: 8788, dataDir: path.join(REPO_ROOT, 'engine-data'), seed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--games-port') out.gamesPort = Number(argv[++i]);
    else if (a === '--data-dir') out.dataDir = path.resolve(argv[++i]);
    else if (a === '--seed') out.seed = true;
    else if (a === '--help') out.help = true;
  }
  return out;
}

/** runtime-secret مشترک دو ورکر: از settings می‌خواند و اگر نبود می‌سازد و می‌نویسد */
function resolveAuthSecret(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'sys_auth_secret' LIMIT 1`).get();
    if (row) {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === 'string' && parsed) return parsed;
    }
    const secret = randomBytes(32).toString('hex');
    db.prepare(`INSERT INTO settings (key, value) VALUES ('sys_auth_secret', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(secret));
    return secret;
  } finally {
    db.close();
  }
}

function findWorkerdBinary() {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules/workerd/bin/workerd'),
    path.join(REPO_ROOT, 'node_modules/@cloudflare/workerd-linux-64/bin/workerd'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('باینری workerd پیدا نشد — npm install را اجرا کنید');
}

async function waitHealth(url, child, timeoutMs = 30_000) {
  const started = Date.now();
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`workerd پیش از آماده شدن خارج شد (کد ${child.exitCode}) — لاگ: dataDir/workerd.log`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // هنوز بالا نیامده — دوباره
    }
    if (Date.now() - started > timeoutMs) throw new Error(`/health بعد از ${timeoutMs}ms پاسخ نداد — لاگ: dataDir/workerd.log`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function runEngine(opts) {
  const dbPath = d1SqlitePath(opts.dataDir);
  mkdirSync(opts.dataDir, { recursive: true });

  // ۱) مایگریشن idempotent با همان migrations/ رسمی
  const mig = applyMigrations(dbPath);
  console.log(`[engine] مایگریشن‌ها: ${mig.appliedCount} اعمال شد (از ${mig.total})`);

  // ۲) seed نمایشی — فقط با --seed یا اجرای اول
  if (opts.seed || !existsSync(dbPath)) {
    const { seedDemo } = await import('./seed-demo.mjs');
    const s = seedDemo(dbPath);
    console.log(`[engine] seed نمایشی: ${s.usersCreated} کاربر (manager/secretary/therapist — رمز ۱۲۳۴)`);
  }

  // ۳) secret مشترک + کانفیگ capnp-text
  const authSecret = resolveAuthSecret(dbPath);
  const configText = await buildEngineConfig({ port: opts.port, gamesPort: opts.gamesPort, dataDir: opts.dataDir, authSecret });
  const configPath = path.join(opts.dataDir, 'workerd.capnp');
  writeFileSync(configPath, configText);

  // ۴) spawn workerd — لاگ در dataDir/workerd.log
  const bin = findWorkerdBinary();
  const logFd = openSync(path.join(opts.dataDir, 'workerd.log'), 'a');
  const child = spawn(bin, ['serve', '--experimental', `--import-path=${path.join(REPO_ROOT, 'node_modules/workerd')}`, configPath], { stdio: ['ignore', logFd, logFd] });
  const base = `http://127.0.0.1:${opts.port}`;
  console.log(`[engine] workerd بالا آمد — اپ: ${base} | بازی‌ها: http://127.0.0.1:${opts.gamesPort} | داده: ${opts.dataDir}`);

  // ۵) انتظار سلامت
  await waitHealth(`${base}/health`, child);
  console.log('[engine] /health سبز است');

  // ۶) خاموشی تمیز — SIGTERM/SIGINT و خروج اپ
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[engine] خاموشی تمیز (${signal})...`);
    child.kill('SIGTERM');
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => {
      clearTimeout(forceTimer);
      console.log('[engine] workerd خاموش شد');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[engine] workerd ناگهان خارج شد (کد ${code} سیگنال ${signal})`);
      process.exit(1);
    }
  });
  return child;
}

// اجرای مستقیم
if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('استفاده: node scripts/engine/engine.mjs --port 8787 --data-dir <مسیر> [--games-port 8788] [--seed]');
  } else {
    await runEngine(opts);
  }
}
