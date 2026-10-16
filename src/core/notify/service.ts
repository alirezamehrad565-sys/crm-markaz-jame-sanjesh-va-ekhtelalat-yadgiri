/**
 * هستهٔ اعلان و کلاینت بات بله — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// هسته صف اعلان — enqueue با idempotency + dispatch با کانال تزریقی
// قوانین:
// * کانال‌ها با registerChannel تزریق می‌شوند (بدون وابستگی مستقیم به بله)
// * dispatch هرگز throw نمی‌کند — خطای هر رکورد مستقل ثبت می‌شود
// * dedup_key یعنی «حداکثر یک پیام از این نوع» (idempotency یادآوری‌ها)

import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import type {
  DispatchSummary,
  NotificationRecord,
  NotificationStatus
} from '@core/shared';
import { MAX_DISPATCH_ATTEMPTS } from '@core/shared';
import { renderTemplate } from './templates';
import {
  insertNotification,
  markNotificationFailed,
  markNotificationSent,
  markNotificationSkipped,
  notificationStatusCounts,
  releaseAllDrafts,
  releaseNotificationById,
  retryFailedNotifications,
  selectNotificationById,
  selectNotifications,
  selectPendingNotifications,
  stalePendingToSkipped
} from './repository';
import type { NotificationRow } from './repository';
import type { EnqueueInput, NotifyChannel, NotifyListFilters, SendResult } from './types';

export interface NotifyDeps {
  db: DbClient;
  logger: Logger;
  /** برای تست‌ها قابل تزریق است */
  now?: () => Date;
  /** حداکثر تلاش هر رکورد (پیش‌فرض: ثابت سراسری) */
  maxAttempts?: number;
}

export interface EnqueueOutcome {
  id: string | null;
  duplicate: boolean;
}

export interface NotifyService {
  /** ثبت کانال ارسال — هر کانال فقط یک‌بار (آخرین تزریق برنده است) */
  registerChannel(channel: NotifyChannel): void;
  /** کانال ثبت‌شده یا null */
  getChannel(name: string): NotifyChannel | null;
  /** ساخت رکورد pending — با dedup_key تکراری، رکورد جدید نمی‌سازد */
  enqueue(input: EnqueueInput): Promise<EnqueueOutcome>;
  /** ارسال همه pendingهای آماده (send_at گذشته یا فوری) — خروجی همیشه جمع کامل است */
  dispatchPending(limit?: number): Promise<DispatchSummary>;
  /** failedها را دوباره صف می‌کند */
  retryFailed(limit?: number): Promise<number>;
  /** — رهاسازی یک رکورد (ارسال فوری؛ از failed هم) — true اگر وضعیت تغییر کرد */
  release(id: string): Promise<boolean>;
  /** — رهاسازی همهٔ پیش‌نویس‌ها (send_at آینده) — تعداد رهاسازی‌شده */
  releaseAllDrafts(): Promise<number>;
  list(filters: NotifyListFilters): Promise<NotificationRecord[]>;
  getById(id: string): Promise<NotificationRecord | null>;
  stats(): Promise<Record<NotificationStatus, number>>;
}

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('UNIQUE') || msg.includes('unique');
}

export function createNotifyService(deps: NotifyDeps): NotifyService {
  const { db, logger } = deps;
  const log = logger.child('notify');
  const now = deps.now ?? (() => new Date());
  const maxAttempts = deps.maxAttempts ?? MAX_DISPATCH_ATTEMPTS;

  const channels = new Map<string, NotifyChannel>();

  return {
    registerChannel(channel: NotifyChannel): void {
      channels.set(channel.name, channel);
      log.info('channel.registered', { channel: channel.name });
    },

    getChannel(name: string): NotifyChannel | null {
      return channels.get(name) ?? null;
    },

    async enqueue(input: EnqueueInput): Promise<EnqueueOutcome> {
      const nowIso = now().toISOString();

      // best-effort idempotency: چک قبل از insert؛ مسابقه (race) با UNIQUE index پوشش داده می‌شود
      if (input.dedupKey) {
        const existing = await db.queryOne<{ id: string }>(
          'SELECT id FROM notifications WHERE dedup_key = ?',
          [input.dedupKey]
        );
        if (existing) return { id: existing.id, duplicate: true };
      }

      const id = crypto.randomUUID();
      try {
        await db.execute(
          ...spreadInsert(
            insertNotification({
              id,
              channel: input.channel,
              template: input.template,
              recipient: input.recipient ?? null,
              studentId: input.studentId ?? null,
              appointmentId: input.appointmentId ?? null,
              staffId: input.staffId ?? null,
              payload: input.payload,
              dedupKey: input.dedupKey ?? null,
              sendAt: input.sendAt ?? null,
              nowIso
            })
          )
        );
        return { id, duplicate: false };
      } catch (err) {
        if (input.dedupKey && isUniqueViolation(err)) {
          log.warn('enqueue.duplicate.race', { dedupKey: input.dedupKey });
          return { id: null, duplicate: true };
        }
        throw err;
      }
    },

    async dispatchPending(limit = 50): Promise<DispatchSummary> {
      const nowIso = now().toISOString();
      const summary: DispatchSummary = { processed: 0, sent: 0, failed: 0, skipped: 0 };

      // رکوردهای خسته (تلاش زیاد) از صف خارج می‌شوند
      await db.execute(...spreadInsert(stalePendingToSkipped(maxAttempts, nowIso)));

      const pending = await db
        .query<NotificationRow>(...spreadInsert(selectPendingNotifications(limit, maxAttempts, nowIso)))
        .then((rows) => rows.map(rowFromDb));

      for (const row of pending) {
        summary.processed += 1;

        const channel = channels.get(row.channel);
        if (!channel) {
          await db.execute(
            ...spreadInsert(markNotificationFailed(row.id, 'CHANNEL_UNAVAILABLE', nowIso))
          );
          summary.failed += 1;
          continue;
        }

        if (!row.recipient) {
          await db.execute(
            ...spreadInsert(markNotificationSkipped(row.id, 'NO_RECIPIENT', nowIso))
          );
          summary.skipped += 1;
          continue;
        }

        let text: string;
        try {
          text = renderTemplate(row.template as NotificationRecord['template'], row.payload);
        } catch {
          text = renderTemplate('generic', { extra: 'پیام سامانه' });
        }

        let result: SendResult;
        try {
          result = await channel.send({ to: row.recipient, text });
        } catch (err) {
          // قرارداد کانال: نباید throw کند — اما محافظت می‌کنیم
          result = { ok: false, error: err instanceof Error ? err.message : 'UNKNOWN' };
        }

        if (result.ok) {
          await db.execute(
            ...spreadInsert(markNotificationSent(row.id, result.externalId ?? null, nowIso))
          );
          summary.sent += 1;
        } else {
          await db.execute(
            ...spreadInsert(markNotificationFailed(row.id, result.error ?? 'SEND_FAILED', nowIso))
          );
          summary.failed += 1;
          log.warn('dispatch.failed', { id: row.id, channel: row.channel, error: result.error });
        }
      }

      if (summary.processed > 0) {
        log.info('dispatch.done', { ...summary });
      }
      return summary;
    },

    async retryFailed(limit = 50): Promise<number> {
      const res = await db.execute(...spreadInsert(retryFailedNotifications(limit, now().toISOString())));
      const changes = (res.meta as { changes?: number } | undefined)?.changes ?? 0;
      log.info('retry.queued', { count: changes });
      return changes;
    },

    /** — ارسال فوری یک رکورد از Outbox */
    async release(id: string): Promise<boolean> {
      const res = await db.execute(...spreadInsert(releaseNotificationById(id, now().toISOString())));
      const changes = (res.meta as { changes?: number } | undefined)?.changes ?? 0;
      return changes > 0;
    },

    /** — ارسال فوری همهٔ پیش‌نویس‌ها */
    async releaseAllDrafts(): Promise<number> {
      const res = await db.execute(...spreadInsert(releaseAllDrafts(now().toISOString())));
      const changes = (res.meta as { changes?: number } | undefined)?.changes ?? 0;
      return changes;
    },

    async list(filters: NotifyListFilters): Promise<NotificationRecord[]> {
      const rows = await db.query<NotificationRow>(
        ...spreadInsert(
          selectNotifications({
            status: filters.status,
            studentId: filters.studentId,
            appointmentId: filters.appointmentId,
            limit: Math.min(filters.limit ?? 50, 200)
          })
        )
      );
      return rows.map(rowFromDb);
    },

    async getById(id: string): Promise<NotificationRecord | null> {
      const row = await db.queryOne<NotificationRow>(...spreadInsert(selectNotificationById(id)));
      return row ? rowFromDb(row) : null;
    },

    async stats(): Promise<Record<NotificationStatus, number>> {
      const rows = await db.query<{ status: string; count: number }>(
        ...spreadInsert(notificationStatusCounts())
      );
      const out: Record<NotificationStatus, number> = {
        pending: 0,
        sent: 0,
        failed: 0,
        skipped: 0
      };
      for (const r of rows) {
        if (r.status in out) out[r.status as NotificationStatus] = r.count;
      }
      return out;
    }
  };
}

// ───────────── helpers ─────────────

/** اجرای statement builder به شکل execute(sql, params) */
function spreadInsert(stmt: { sql: string; params: unknown[] }): [string, unknown[]] {
  return [stmt.sql, stmt.params];
}

/** payload JSON دیتابیس → آبجکت */
function rowFromDb(row: NotificationRow): NotificationRecord {
  let payload: NotificationRecord['payload'] = {};
  try {
    payload = JSON.parse(row.payload) as NotificationRecord['payload'];
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    channel: row.channel as NotificationRecord['channel'],
    template: row.template as NotificationRecord['template'],
    recipient: row.recipient,
    studentId: row.student_id,
    appointmentId: row.appointment_id,
    staffId: row.staff_id,
    payload,
    status: row.status as NotificationStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    dedupKey: row.dedup_key,
    sendAt: row.send_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
