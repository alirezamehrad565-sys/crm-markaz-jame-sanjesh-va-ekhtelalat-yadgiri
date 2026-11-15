/**
 * v1.26.0 — ماژول «راه‌اندازی نخست» (docs/rust/first-run-and-cloud.md §۲)
 *
 * دو مسیر با دو گیت متفاوت و عمداً دو تابع ثبت جدا:
 *   registerSetupStatusRoutes   — GET /api/setup/status (عمومی، قبل از authMiddleware)
 *     فقط دو بولین: initialized (راه‌اندازی کامل شده؟) و demo_active (حساب نمایشی هنوز زنده؟)
 *     کاربرد: راهنمای «manager / 1234» در صفحهٔ ورود فقط تا پایان راه‌اندازی؛ وب هم بی‌ضرر است.
 *   registerSetupCompleteRoutes — POST /api/setup/complete (بعد از گیت‌ها، فقط manager)
 *     بدنه: { close_demo?: boolean } — بستن سه حساب نمایشی seed (active=0 + هش تصادفی)
 *     و ثبت settings.setup_completed=1؛ دوبار فراخوانی ۴۰۹ می‌دهد. هر کنش audit دارد.
 *
 * بدون هیچ دادهٔ بالینی در پاسخ — فقط وضعیت راه‌اندازی.
 */
import { z } from 'zod';
import { hashPassword } from '@core/auth';
import { ConflictError } from '@core/errors';
import type { AppHono } from '@core/shared';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

/** سه حساب نمایشی seed-demo.mjs — idهای ثابت؛ بستنِ آن‌ها یعنی ورود با 1234 ناممکن می‌شود */
export const DEMO_STAFF_IDS = [
  '30000000-0000-4000-8000-000000000301', // manager
  '30000000-0000-4000-8000-000000000302', // secretary
  '30000000-0000-4000-8000-000000000303' // therapist
] as const;

const SETUP_DONE_KEY = 'setup_completed';

async function readSetupFlag(db: DbClient, key: string): Promise<boolean> {
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM settings WHERE key = ? LIMIT 1`,
    [key]
  );
  if (!row) return false;
  return String(row.value).trim() === '1';
}

/** وضعیت راه‌اندازی — دو query سبک، بدون هیچ دادهٔ بالینی */
export async function getSetupStatus(db: DbClient): Promise<{ initialized: boolean; demo_active: boolean }> {
  let completed = false;
  try {
    completed = await readSetupFlag(db, SETUP_DONE_KEY);
  } catch {
    completed = false; // DB تازه بدون settings هم «ناآماده» است نه خطا
  }
  if (completed) return { initialized: true, demo_active: false };

  let realStaffActive = 0;
  try {
    // IN-bounded: آرایهٔ محدود به ساخت — DEMO_STAFF_IDS ثابت ماژول با سه شناسهٔ seed است
    const placeholders = DEMO_STAFF_IDS.map(() => '?').join(','); // IN-bounded: ثابت ماژول، سه شناسهٔ seed
    const row = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM staff WHERE active = 1 AND id NOT IN (${placeholders})`,
      [...DEMO_STAFF_IDS]
    );
    realStaffActive = row?.n ?? 0;
  } catch {
    realStaffActive = 0;
  }
  return { initialized: realStaffActive > 0, demo_active: realStaffActive === 0 };
}

export interface SetupCompleteDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

/**
 * بستن راه‌اندازی نخست: بستن حساب‌های نمایشی + پرچم completed. هیچ حساب جدیدی اینجا
 * ساخته نمی‌شود (کارکنان با POST /api/staff ساخته می‌شوند) — این مسیر فقط «قفل» می‌کند.
 */
export async function completeSetup(deps: SetupCompleteDeps, closeDemo: boolean): Promise<{ demo_locked: number }> {
  const { db, audit, logger } = deps;
  if (await readSetupFlag(db, SETUP_DONE_KEY)) {
    throw new ConflictError('راه‌اندازی نخست قبلاً کامل شده است');
  }

  let locked = 0;
  if (closeDemo) {
    // هش رمز تصادفی: ورود با 1234 حتی اگر ردیف دستکاری شود ناممکن می‌شود
    const randomHash = await hashPassword(crypto.randomUUID() + ':' + crypto.randomUUID());
    for (const id of DEMO_STAFF_IDS) {
      const res = await db.query(
        `UPDATE staff SET active = 0, password_hash = ?, updated_at = ? WHERE id = ? AND active = 1`,
        [randomHash, new Date().toISOString(), id]
      );
      // DbClient.query روی UPDATE تعداد تغییرات را نمی‌دهد؛ برای audit، موجود بودن ردیف را جدا می‌پرسیم
      const row = await db.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ?`, [id]);
      if (row) {
        locked += 1;
        await audit.log({
          actorId: row.id,
          action: 'setup.demo_locked',
          resourceType: 'staff',
          resourceId: id,
          changes: { active: { from: 1, to: 0 } }
        });
      }
      void res;
    }
  }

  await db.query(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SETUP_DONE_KEY, '1']
  );
  await audit.log({
    actorId: 'setup',
    action: 'setup.completed',
    resourceType: 'settings',
    resourceId: SETUP_DONE_KEY,
    changes: { close_demo: { from: null, to: closeDemo } }
  });
  logger.info('setup.completed', { close_demo: closeDemo, demo_locked: locked });
  return { demo_locked: locked };
}

export function registerSetupStatusRoutes(app: AppHono, deps: { logger: Logger }): void {
  app.get('/api/setup/status', async (c) => {
    try {
      const st = await getSetupStatus(createDb(c.env.DB));
      return c.json({ data: st }, 200);
    } catch (err) {
      // عمومی است — هرگز ۵۰۰ خام با جزئیات نمی‌دهد
      deps.logger.child('setup').warn('setup.status_failed', {
        error: err instanceof Error ? err.message : String(err)
      });
      return c.json({ data: { initialized: true, demo_active: false } }, 200);
    }
  });
}

const CompleteSchema = z.object({ close_demo: z.boolean().optional().default(true) });

export function registerSetupCompleteRoutes(app: AppHono, deps: SetupCompleteDeps): void {
  app.post('/api/setup/complete', async (c) => {
    const body = CompleteSchema.parse(await c.req.json<unknown>().catch(() => ({})));
    const out = await completeSetup(deps, body.close_demo);
    return c.json({ data: out }, 200);
  });
}
