// server/cli.ts
import { readFileSync as readFileSync2, statSync } from "node:fs";

// src/core/db/node-d1.ts
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
function loadSqlite() {
  const mod = process.getBuiltinModule?.(
    "node:sqlite"
  );
  if (!mod) {
    try {
      const require2 = createRequire(import.meta.url);
      return require2("node:sqlite");
    } catch {
      throw new Error("node:sqlite \u062F\u0631 \u0627\u06CC\u0646 \u0646\u0633\u062E\u0647 Node \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A (\u0646\u06CC\u0627\u0632: >=22.5)");
    }
  }
  return mod;
}
var { DatabaseSync } = loadSqlite();
function normalizeParam(p) {
  if (p === void 0) return null;
  if (typeof p === "boolean") return p ? 1 : 0;
  if (p === null || typeof p === "string" || typeof p === "number" || typeof p === "bigint") {
    return p;
  }
  if (p instanceof Uint8Array) return Buffer.from(p);
  throw new TypeError(`\u067E\u0627\u0631\u0627\u0645\u062A\u0631 \u063A\u06CC\u0631\u0642\u0627\u0628\u0644 bind \u0628\u0631\u0627\u06CC NodeD1: ${typeof p}`);
}
function isRowReturning(sql) {
  return /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(sql);
}
var NodeD1PreparedStatement = class _NodeD1PreparedStatement {
  constructor(store, sql, params) {
    this.store = store;
    this.sql = sql;
    this.params = params;
  }
  store;
  sql;
  params;
  bind(...params) {
    return new _NodeD1PreparedStatement(this.store, this.sql, params);
  }
  /** @internal برای batch بدون ساخت مجدد statement */
  execSync() {
    const stmt = this.store.prepare(this.sql);
    const params = this.params.map(normalizeParam);
    if (isRowReturning(this.sql)) {
      const rows = stmt.all(...params);
      return { rows, changes: 0 };
    }
    const info = stmt.run(...params);
    return { rows: [], changes: Number(info.changes) };
  }
  async all() {
    const { rows } = this.execSync();
    return { results: rows, meta: { duration: 0, changes: 0 } };
  }
  async first(colName) {
    const { rows } = this.execSync();
    const first = rows[0];
    if (first === void 0) return null;
    if (colName !== void 0) return first[colName] ?? null;
    return first;
  }
  async run() {
    const stmt = this.store.prepare(this.sql);
    const params = this.params.map(normalizeParam);
    const info = stmt.run(...params);
    return {
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid), duration: 0 }
    };
  }
  async raw() {
    const { rows } = this.execSync();
    return rows.map((r) => Object.values(r));
  }
};
var NodeD1 = class _NodeD1 {
  constructor(store) {
    this.store = store;
  }
  store;
  /** باز کردن (در صورت نیاز ساخت) دیتابیس فایلی با تنظیمات پروداکشن */
  static open(dbPath) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const store = new DatabaseSync(dbPath);
    store.exec("PRAGMA journal_mode = WAL;");
    store.exec("PRAGMA synchronous = NORMAL;");
    store.exec("PRAGMA foreign_keys = ON;");
    store.exec("PRAGMA busy_timeout = 5000;");
    return new _NodeD1(store);
  }
  prepare(sql) {
    return new NodeD1PreparedStatement(this.store, sql, []);
  }
  async batch(statements) {
    if (statements.length === 0) return [];
    const results = [];
    this.store.exec("BEGIN IMMEDIATE");
    try {
      for (const stmt of statements) {
        const { changes } = stmt.execSync();
        results.push({ success: true, meta: { changes, rows_affected: changes, duration: 0 } });
      }
      this.store.exec("COMMIT");
      return results;
    } catch (err) {
      this.store.exec("ROLLBACK");
      throw err;
    }
  }
  /** دسترسی خام (بکاپ/بازیابی/import) — خارج از اینترفیس D1 */
  get rawStore() {
    return this.store;
  }
  /** بستن تمیز دیتابیس (خاموشی نرم سرور) */
  close() {
    try {
      this.store.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
    }
    this.store.close();
  }
};

// src/core/db/selfhost-migrate.ts
import { readdirSync, readFileSync } from "node:fs";
import path2 from "node:path";
var TRACKING_TABLE = "_selfhost_migrations";
var SCHEMA_SENTINEL_TABLE = "staff";
function applySelfhostMigrations(store, migrationsDir, log = () => void 0) {
  store.exec(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
  );
  const appliedRows = store.prepare(`SELECT name FROM ${TRACKING_TABLE}`).all();
  const applied = new Set(appliedRows.map((r) => r.name));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`\u0647\u06CC\u0686 \u0641\u0627\u06CC\u0644 \u0645\u0647\u0627\u062C\u0631\u062A\u06CC \u062F\u0631 ${migrationsDir} \u06CC\u0627\u0641\u062A \u0646\u0634\u062F`);
  if (applied.size === 0) {
    const sentinel = store.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(SCHEMA_SENTINEL_TABLE);
    if (sentinel !== void 0) {
      const insert = store.prepare(
        `INSERT INTO ${TRACKING_TABLE} (name, applied_at) VALUES (?, ?)`
      );
      const now = (/* @__PURE__ */ new Date()).toISOString();
      store.exec("BEGIN IMMEDIATE");
      try {
        for (const f of files) insert.run(f, now);
        store.exec("COMMIT");
      } catch (err) {
        store.exec("ROLLBACK");
        throw err;
      }
      log(`\u0627\u0633\u06A9\u0645\u0627\u06CC \u0645\u0648\u062C\u0648\u062F (dump) \u0634\u0646\u0627\u0633\u0627\u06CC\u06CC \u0634\u062F \u2014 ${files.length} \u0645\u0647\u0627\u062C\u0631\u062A \u0628\u062F\u0648\u0646 \u0627\u062C\u0631\u0627 \u062B\u0628\u062A \u0634\u062F`);
      return { applied: [], skipped: 0, assumedFromSchema: true };
    }
  }
  const newlyApplied = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(path2.join(migrationsDir, f), "utf8");
    try {
      store.exec(sql);
      store.prepare(`INSERT INTO ${TRACKING_TABLE} (name, applied_at) VALUES (?, ?)`).run(f, (/* @__PURE__ */ new Date()).toISOString());
      newlyApplied.push(f);
      log(`\u2713 \u0645\u0647\u0627\u062C\u0631\u062A \u0627\u0639\u0645\u0627\u0644 \u0634\u062F: ${f}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`\u0645\u0647\u0627\u062C\u0631\u062A ${f} \u0634\u06A9\u0633\u062A \u062E\u0648\u0631\u062F: ${msg}`);
    }
  }
  return { applied: newlyApplied, skipped: files.length - newlyApplied.length, assumedFromSchema: false };
}

// server/env.ts
import path3 from "node:path";
import { fileURLToPath } from "node:url";
var HERE = path3.dirname(fileURLToPath(import.meta.url));
var ROOT_DIR = path3.resolve(HERE, "..");
function loadSelfhostConfig(env = process.env) {
  const dataDir = env.DATA_DIR ?? path3.join(ROOT_DIR, "data");
  return {
    dataDir,
    dbPath: path3.join(dataDir, "app.db"),
    port: Number(env.PORT ?? 3e3),
    host: env.HOST ?? "0.0.0.0",
    publicDir: env.PUBLIC_DIR ?? path3.join(ROOT_DIR, "public"),
    migrationsDir: env.MIGRATIONS_DIR ?? path3.join(ROOT_DIR, "migrations"),
    manualCron: env.CRON_MANUAL === "1",
    clinicName: env.CLINIC_NAME || void 0,
    publicBaseUrl: env.PUBLIC_BASE_URL || void 0,
    baleBotToken: env.BALE_BOT_TOKEN || void 0,
    baleWebhookSecret: env.BALE_WEBHOOK_SECRET || void 0,
    authSecret: env.AUTH_SECRET || void 0
  };
}

// server/cli.ts
var cfg = loadSelfhostConfig();
var [, , cmd, arg] = process.argv;
function usage() {
  console.log("\u0627\u0633\u062A\u0641\u0627\u062F\u0647:");
  console.log("  node dist/cli.js migrate            \u0627\u0639\u0645\u0627\u0644 \u0645\u0647\u0627\u062C\u0631\u062A\u200C\u0647\u0627\u06CC \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631");
  console.log("  node dist/cli.js sql <file.sql>     \u0627\u062C\u0631\u0627\u06CC \u0641\u0627\u06CC\u0644 SQL (bootstrap \u06CC\u0627 \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC dump)");
  console.log("  node dist/cli.js status             \u0648\u0636\u0639\u06CC\u062A \u0645\u0647\u0627\u062C\u0631\u062A\u200C\u0647\u0627 + \u0634\u0645\u0627\u0631\u0634 \u062C\u062F\u0648\u0644\u200C\u0647\u0627");
  process.exit(1);
}
function open() {
  const d1 = NodeD1.open(cfg.dbPath);
  console.log(`\u062F\u06CC\u062A\u0627\u0628\u06CC\u0633: ${cfg.dbPath}`);
  return d1;
}
function status(d1) {
  const store = d1.rawStore;
  const mig = store.prepare("SELECT COUNT(*) AS n FROM _selfhost_migrations").get().n;
  console.log(`\u0645\u0647\u0627\u062C\u0631\u062A\u200C\u0647\u0627\u06CC \u062B\u0628\u062A\u200C\u0634\u062F\u0647: ${mig}`);
  const tables = store.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_selfhost_migrations' ORDER BY name`
  ).all();
  console.log(`\u062C\u062F\u0648\u0644\u200C\u0647\u0627: ${tables.length}`);
  for (const t of tables) {
    try {
      const row = store.prepare(`SELECT COUNT(*) AS n FROM "${t.name.replace(/"/g, '""')}"`).get();
      console.log(`  ${t.name.padEnd(34)} ${row.n}`);
    } catch {
      console.log(`  ${t.name.padEnd(34)} (\u062E\u0637\u0627 \u062F\u0631 \u0634\u0645\u0627\u0631\u0634)`);
    }
  }
  console.log(`\u062D\u062C\u0645 \u0641\u0627\u06CC\u0644 \u062F\u06CC\u062A\u0627\u0628\u06CC\u0633: ${(statSync(cfg.dbPath).size / 1024 / 1024).toFixed(1)}MB`);
}
switch (cmd) {
  case "migrate": {
    const d1 = open();
    const out = applySelfhostMigrations(d1.rawStore, cfg.migrationsDir, (m) => console.log(m));
    console.log(
      out.assumedFromSchema ? "\u0627\u0633\u06A9\u0645\u0627 \u0627\u0632 dump \u0645\u0648\u062C\u0648\u062F \u0628\u0648\u062F \u2014 \u0647\u0645\u0647\u0654 \u0645\u0647\u0627\u062C\u0631\u062A\u200C\u0647\u0627 \u062B\u0628\u062A \u0634\u062F\u0646\u062F (\u0628\u062F\u0648\u0646 \u0627\u062C\u0631\u0627)." : `\u0627\u0639\u0645\u0627\u0644\u200C\u0634\u062F\u0647: ${out.applied.length} \xB7 \u0627\u0632 \u0642\u0628\u0644 \u0645\u0648\u062C\u0648\u062F: ${out.skipped}`
    );
    break;
  }
  case "sql": {
    if (!arg) usage();
    const d1 = open();
    const sql = readFileSync2(arg, "utf8");
    const store = d1.rawStore;
    const t0 = Date.now();
    store.exec("PRAGMA foreign_keys = OFF;");
    try {
      store.exec(sql);
    } finally {
      store.exec("PRAGMA foreign_keys = ON;");
    }
    console.log(`\u2713 \u0641\u0627\u06CC\u0644 \u0627\u062C\u0631\u0627 \u0634\u062F: ${arg} (${(sql.length / 1024).toFixed(0)}KB\u060C ${Date.now() - t0}ms)`);
    break;
  }
  case "status": {
    const d1 = open();
    status(d1);
    break;
  }
  default:
    usage();
}
