// گزارش رشد جدول‌ها (ف۴ طرح ارتقا — بهداشت داده): شمارش روزانه در کرون + خواندن فقط‌مدیر
// زمینه: طرح §۵-۳ — «دیتابیس بی‌سیاستِ نگه‌داری، بمب ساعتی است». شمارش COUNT(*) همهٔ جدول‌های
// کاربری فقط داخل چرخهٔ شبانهٔ digest رخ می‌دهد (هرگز مسیر درخواست) و در جدول فقط-افزودنیِ
// table_growth_snapshots (مایگریشن 0107) با UPSERT هم‌روز idempotent می‌نشیند؛ مُهر ۲۴ساعتهٔ
// settings (growth.last_snapshot_at) دوباره‌کاری را می‌بندد. خواندن: GET /api/growth/report فقط‌مدیر.
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';

/** کلید settings برای مُهر ۲۴ساعتهٔ شمارش (هم‌الگوی cp_sync.last_attempt_at) */
export const GROWTH_SNAPSHOT_SEAL_KEY = 'growth.last_snapshot_at';
/** فاصلهٔ مجاز بین دو شمارش بر حسب ساعت — دوباره‌کاری صفر حتی با اجرای تکراری کرون */
export const GROWTH_SEAL_HOURS = 24;
/** خودِ جدول شمارش، خودش را نمی‌شمارد (پیشگیری از حلقهٔ خودارجاعی در دادهٔ تاریخی) */
export const GROWTH_TABLE_SELF = 'table_growth_snapshots';

// ─── برچسب سیاست نگه‌داری هر جدول شناخته‌شده (خروجی گزارش — مبنای §۳-۱۵ و P1-4) ───
// جدول‌های شناخته‌نشده «بی‌سیاست» می‌گیرند — و این دقیقاً کارکرد گزارش است: بی‌سیاست‌ها را لو می‌دهد.
const TABLE_POLICIES: Record<string, string> = {
  audit_log: '۱۸۰ روز', // ف۴ — pruneOld شبانه (P1-4)
  rum_events: '۹۰ روز', // نگه‌داری تله‌متری (۱.۲۵.۶۶)
  client_errors: '۹۰ روز', // نگه‌داری تله‌متری (۱.۲۵.۶۶)
  network_content: 'فقط-افزودنی', // حذف فیزیکی ممنوع — بایگانی active=0 (§۳-۱۵)
  game_links: 'پاکسازی دوره‌ای', // games.maintenance — لینک منقضی هر شب
  game_preview_tokens: 'پاکسازی دوره‌ای', // games.maintenance — توکن منقضی هر شب
  login_throttle: 'پاکسازی دوره‌ای', // پاکسازی lazy روی هر تلاش ورود
  [GROWTH_TABLE_SELF]: 'بازنویسی روزانه (خودپایش)' // ف۴ — UPSERT هم‌روز؛ رشد ~۱×تعداد-جدول در روز
};

const POLICY_UNKNOWN = 'بی‌سیاست';

export function policyOfTable(name: string): string {
  return TABLE_POLICIES[name] ?? POLICY_UNKNOWN;
}

export interface GrowthCaptureResult {
  /** آیا به‌خاطر مُهر ۲۴ساعته رد شد؟ */
  skipped: boolean;
  reason?: 'sealed';
  /** مُهر آخرین شمارش ثبت‌شده — در حالت skipped معنا دارد */
  last_snapshot_at?: string | null;
  /** تعداد جدول‌های شمارش‌شده (در حالت skipped صفر) */
  tables: number;
}

export interface GrowthTableReport {
  table_name: string;
  policy: string;
  /** آخرین شمارش ثبت‌شده از جدول snapshots — هیچ snapshotی = null */
  latest_count: number | null;
  /** تاریخ مُهرِ همان شمارش ('YYYY-MM-DD') */
  latest_date: string | null;
  /** رشد از مبنای ≤۷ روز پیش — مبنای کهنه نبود = null */
  delta_7d: number | null;
  /** رشد از مبنای ≤۳۰ روز پیش */
  delta_30d: number | null;
  /** میانگین رشد روزانه (ترجیح پنجرهٔ ۷روز؛ وگرنه ۳۰روز؛ وگرنه null) */
  avg_daily: number | null;
  /** شمارش زندهٔ همین لحظه — فقط‌مدیر و کمیاب؛ قطعی D1 = null */
  live_count: number | null;
}

export interface GrowthReport {
  generated_at: string;
  /** مُهر آخرین شمارش شبانه از settings */
  last_snapshot_at: string | null;
  /** تعداد روزهای متمایزی که شمارش ثبت شده */
  snapshot_days: number;
  tables: GrowthTableReport[];
}

export interface GrowthDeps {
  db: DbClient;
  logger: Logger;
}

/** فهرست جدول‌های کاربری — هم‌قرارداد backup.listTables + حذف _cf_% (جدول داخلی D1 خواندنی نیست از Worker) */
async function listUserTables(db: DbClient): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
      ORDER BY name`
  );
  return rows.map((r) => r.name);
}

async function readIsoStamp(db: DbClient, key: string): Promise<string | null> {
  try {
    const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    if (!row) return null;
    const parsed: unknown = JSON.parse(row.value);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function writeIsoStamp(db: DbClient, key: string, iso: string): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, 'growth-cron', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [key, JSON.stringify(iso)]
  );
}

/** شمارش زندهٔ دفاعی — قطعی جدول فقط null، هرگز throw */
async function liveCount(db: DbClient, table: string): Promise<number | null> {
  try {
    const row = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`);
    return row?.n ?? null;
  } catch {
    return null;
  }
}

/** فاصلهٔ دو تاریخ 'YYYY-MM-DD' بر حسب روز (حداقل ۱ — تقسیم بر صفر نمی‌بینیم) */
function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 1;
  return Math.max(1, Math.round((to - from) / 86_400_000));
}

export interface GrowthService {
  /**
   * شمارش روزانه — فقط از چرخهٔ کرون digest صدا زده می‌شود. مُهر ۲۴ساعته دارد؛
   * اجرای تکراری همان روز هیچ کوئری COUNT اضافه‌ای اجرا نمی‌کند.
   */
  captureDaily(): Promise<GrowthCaptureResult>;
  /** گزارش فقط‌مدیر — آخرین شمارش + دلتاهای ۷/۳۰ روز + میانگین روزانه + شمارش زنده + برچسب سیاست */
  report(): Promise<GrowthReport>;
}

export function createGrowthService(deps: GrowthDeps): GrowthService {
  const { db, logger } = deps;

  return {
    async captureDaily(): Promise<GrowthCaptureResult> {
      // — گارد مُهر ۲۴ساعته: قبل از هر COUNT فقط یک SELECT settings — ارزان و دوباره‌کاری صفر
      const lastIso = await readIsoStamp(db, GROWTH_SNAPSHOT_SEAL_KEY);
      if (lastIso) {
        const ageMs = Date.now() - Date.parse(lastIso);
        if (!Number.isNaN(ageMs) && ageMs >= 0 && ageMs < GROWTH_SEAL_HOURS * 3600 * 1000) {
          return { skipped: true, reason: 'sealed', last_snapshot_at: lastIso, tables: 0 };
        }
      }

      const now = new Date();
      const snapshotDate = now.toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC — تاریخ چرخهٔ شبانه
      const capturedAt = now.toISOString();

      // فهرست جدول‌های کاربری؛ خودِ جدول شمارش بیرون می‌ماند
      const tables = (await listUserTables(db)).filter((t) => t !== GROWTH_TABLE_SELF);

      // شمارش‌ها با گارد تک‌جدولی — قطعی خواندنِ یک جدول عجیب، بقیهٔ snapshot را نمی‌شکند
      const counts: { table: string; rows: number }[] = [];
      for (const t of tables) {
        const n = await liveCount(db, t);
        if (n === null) {
          logger.warn('growth.snapshot.count_failed', { table: t });
          continue;
        }
        counts.push({ table: t, rows: n });
      }

      // UPSERT هم‌روز idempotent — اجرای دوباره فقط بازنویسی می‌کند (کلید مرکب 0107)
      const UPSERT = `INSERT INTO table_growth_snapshots (snapshot_date, table_name, row_count, captured_at)
                      VALUES (?, ?, ?, ?)
                      ON CONFLICT(snapshot_date, table_name) DO UPDATE SET
                        row_count = excluded.row_count, captured_at = excluded.captured_at`;
      const CHUNK = 50; // batchهای کوچک — هم‌الگوی سقف دستورهای backup
      for (let i = 0; i < counts.length; i += CHUNK) {
        const chunk = counts.slice(i, i + CHUNK);
        await db.batch(chunk.map((c) => db.prepare(UPSERT, [snapshotDate, c.table, c.rows, capturedAt])));
      }

      // مُهر ۲۴ساعته — هم‌قرارداد مُهرهای cp-sync
      await writeIsoStamp(db, GROWTH_SNAPSHOT_SEAL_KEY, capturedAt);
      logger.info('growth.snapshot.done', { date: snapshotDate, tables: counts.length });
      return { skipped: false, last_snapshot_at: capturedAt, tables: counts.length };
    },

    async report(): Promise<GrowthReport> {
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const base7 = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
      const base30 = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);

      // فهرست جدول‌ها = اجتماع جدول‌های زنده و جدول‌های شمارش‌شده — نصب تازه هم گزارش پر می‌گیرد
      const liveTables = await listUserTables(db);
      const snapTables = await db.query<{ table_name: string }>(
        'SELECT DISTINCT table_name AS table_name FROM table_growth_snapshots'
      ).catch(() => [] as { table_name: string }[]);
      const names = [...new Set([...liveTables, ...snapTables.map((s) => s.table_name)])].sort();

      const daysRow = await db.queryOne<{ n: number }>(
        'SELECT COUNT(DISTINCT snapshot_date) AS n FROM table_growth_snapshots'
      ).catch(() => null);

      const lastSnapshotIso = await readIsoStamp(db, GROWTH_SNAPSHOT_SEAL_KEY);

      const out: GrowthTableReport[] = [];
      for (const name of names) {
        // آخرین snapshot این جدول
        const latest = await db
          .queryOne<{ row_count: number; snapshot_date: string }>(
            'SELECT row_count, snapshot_date FROM table_growth_snapshots WHERE table_name = ? ORDER BY snapshot_date DESC LIMIT 1',
            [name]
          )
          .catch(() => null);
        // مبنای کهنه: تازه‌ترین snapshot در تاریخِ ≤ پایهٔ پنجره (نبودش = دلتا بی‌معنا → null)
        const ref7 = await db
          .queryOne<{ row_count: number; snapshot_date: string }>(
            'SELECT row_count, snapshot_date FROM table_growth_snapshots WHERE table_name = ? AND snapshot_date <= ? ORDER BY snapshot_date DESC LIMIT 1',
            [name, base7]
          )
          .catch(() => null);
        const ref30 = await db
          .queryOne<{ row_count: number; snapshot_date: string }>(
            'SELECT row_count, snapshot_date FROM table_growth_snapshots WHERE table_name = ? AND snapshot_date <= ? ORDER BY snapshot_date DESC LIMIT 1',
            [name, base30]
          )
          .catch(() => null);

        let delta7: number | null = null;
        if (latest && ref7) delta7 = Number(latest.row_count) - Number(ref7.row_count);
        let delta30: number | null = null;
        if (latest && ref30) delta30 = Number(latest.row_count) - Number(ref30.row_count);

        let avgDaily: number | null = null;
        if (delta7 !== null) avgDaily = Math.round((delta7 / daysBetween(ref7!.snapshot_date, latest!.snapshot_date)) * 10) / 10;
        else if (delta30 !== null) avgDaily = Math.round((delta30 / daysBetween(ref30!.snapshot_date, latest!.snapshot_date)) * 10) / 10;

        out.push({
          table_name: name,
          policy: policyOfTable(name),
          latest_count: latest ? Number(latest.row_count) : null,
          latest_date: latest ? latest.snapshot_date : null,
          delta_7d: delta7,
          delta_30d: delta30,
          avg_daily: avgDaily,
          live_count: await liveCount(db, name)
        });
      }

      // بی‌سیاست‌ها اول — کارکرد اصلی گزارش، لو دادن جدول‌های بدون سیاست نگه‌داری
      out.sort((a, b) => {
        const pa = a.policy === POLICY_UNKNOWN ? 0 : 1;
        const pb = b.policy === POLICY_UNKNOWN ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.table_name.localeCompare(b.table_name);
      });

      return {
        generated_at: nowIso,
        last_snapshot_at: lastSnapshotIso,
        snapshot_days: daysRow?.n ?? 0,
        tables: out
      };
    }
  };
}
