/**
 * زمان‌بند cron برای بستر سلف‌هاست — جایگزین Cron Triggers کلادفلر
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * • همان ۴ عبارت wrangler.prod.toml (REMINDER_CRONS + BATCH_CRON + DIGEST_CRON) با منطق
 *   یکسان هندلر `scheduled` در src/index.ts — یعنی پاریتی کامل زمان‌های پروداکشن (UTC).
 * • تیک هر ۲۰ ثانیه؛ هر عبارت در هر دقیقه حداکثر یک بار و بدون هم‌پوشانی اجرا می‌شود.
 * • تریگر دستی /__scheduled فقط با CRON_MANUAL=1 (برای آزمون — در پروداکشن خاموش).
 */
import { BATCH_CRON, DIGEST_CRON, REMINDER_CRONS } from '@core/shared';

export type ScheduledHandler = (event: { cron: string; scheduledTime: number }) => Promise<void>;

export const ALL_CRONS: readonly string[] = [...REMINDER_CRONS, BATCH_CRON, DIGEST_CRON];

/** پارس یک فیلد cron: پشتیبانی از *، a، a-b، a/b، a-b/c و لیست کاما */
export function parseCronField(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`گام نامعتبر در cron: ${part}`);
    let lo = min;
    let hi = max;
    if (rangePart !== '*') {
      const dash = rangePart.indexOf('-');
      if (dash === -1) {
        const v = Number(rangePart);
        if (!Number.isInteger(v) || v < min || v > max) throw new Error(`مقدار نامعتبر در cron: ${part}`);
        lo = v;
        hi = stepPart === undefined ? v : max;
      } else {
        lo = Number(rangePart.slice(0, dash));
        hi = Number(rangePart.slice(dash + 1));
        if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
          throw new Error(`بازهٔ نامعتبر در cron: ${part}`);
        }
      }
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** تطبیق عبارت ۵-فیلدی cron با یک لحظهٔ UTC */
export function cronMatches(expr: string, at: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`عبارت cron باید ۵ فیلد باشد: ${expr}`);
  const minute = parseCronField(fields[0], 0, 59);
  const hour = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const month = parseCronField(fields[3], 1, 12);
  const dow = parseCronField(fields[4], 0, 6); // 0=یکشنبه (مطابق UTC getUTCDay)
  return (
    minute.has(at.getUTCMinutes()) &&
    hour.has(at.getUTCHours()) &&
    dom.has(at.getUTCDate()) &&
    month.has(at.getUTCMonth() + 1) &&
    dow.has(at.getUTCDay())
  );
}

export interface CronScheduler {
  stop(): void;
  /** تریگر دستی یک عبارت (فقط با CRON_MANUAL=1) */
  trigger(expr: string): Promise<boolean>;
}

export function startCrons(
  handler: ScheduledHandler,
  log: (msg: string, meta?: Record<string, unknown>) => void
): CronScheduler {
  const state = new Map<string, { lastKey: string | null; running: boolean }>();
  for (const expr of ALL_CRONS) state.set(expr, { lastKey: null, running: false });

  async function fire(expr: string, at: Date): Promise<void> {
    const st = state.get(expr);
    if (!st || st.running) return;
    const key = `${at.getUTCHours()}:${at.getUTCMinutes()}`;
    if (st.lastKey === key) return;
    st.running = true;
    try {
      await handler({ cron: expr, scheduledTime: at.getTime() });
      log(`cron اجرا شد: ${expr}`);
    } catch (err) {
      log(`cron خطا داد: ${expr}`, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      st.lastKey = key;
      st.running = false;
    }
  }

  const timer = setInterval(() => {
    const now = new Date();
    for (const expr of ALL_CRONS) {
      if (cronMatches(expr, now)) void fire(expr, now);
    }
  }, 20_000);
  timer.unref?.();

  return {
    stop(): void {
      clearInterval(timer);
    },
    async trigger(expr: string): Promise<boolean> {
      if (!ALL_CRONS.includes(expr)) return false;
      await fire(expr, new Date());
      return true;
    }
  };
}
