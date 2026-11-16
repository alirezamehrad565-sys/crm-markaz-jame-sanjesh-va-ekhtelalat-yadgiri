// src/domain/assessment-blocks/service.ts — ۱.۲۵.۷۶ بلوک نوبت سنجش (خواست کارفرما)
//
// مدیر بازهٔ «از ساعت — تا ساعت» برای سنجش رزرو می‌کند و درمانگران درگیر را ثبت می‌کند.
// ۱.۲۵.۷۷ — خواست کارفرما: بلوک با فهرست درمانگر، فقط نوبتِ همان درمانگرها را سد می‌کند و
// این سد برای «هیچ نقشی» رد شدنی نیست — حتی مدیر/ناظر (سنجشِ خودِ مدیر، خودِ همین بلوک است).
// بلوک بدون فهرست = سدِ زمانیِ کل بازه برای درمانگر/منشی (رفتار ۱.۲۵.۷۶؛ مدیر/ناظر معاف).
// سدِ سخت در create/move/resize سرویس نوبت و نرم (تداخل شمرده‌شده) در کپی هفته اعمال می‌شود.
//
// تداخل با آفست ثابت +3:30 تهران محاسبه می‌شود (tehranMinuteWindow — سامانه DST ندارد،
// هم‌قرارداد tehranDayRange). بلوک‌ها فقط برای «آیندهٔ ثبت» سد هستند؛ نوبت‌های موجود دست‌نخورده
// می‌مانند (مدیر خودش لغو/جابه‌جا می‌کند).
import { NotFoundError, ValidationError } from '@core/errors';
import { tehranMinuteWindow, tehranYmdOf, minuteToLabel } from '@core/shared';
import { inParamChunks, inPlaceholders } from '@core/db/in-chunks'; // ۱.۲۵.۷۶ — دروازهٔ IN-list (هم‌الگوی appointment-core)
import type { AuthContext } from '@core/shared';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { AssessmentBlock, AssessmentBlockCreateInput, AssessmentBlockDeps } from './types';

/** id مانند بقیهٔ domain با crypto جهانی (هم‌الگوی appointment-core — سازگار Workers و Node) */
const newId = (): string => crypto.randomUUID();

interface BlockRow {
  id: string;
  block_date: string;
  start_minute: number;
  end_minute: number;
  therapist_ids: string;
  note: string | null;
  version: number;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToBlock(r: BlockRow): AssessmentBlock {
  let therapistIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.therapist_ids ?? '[]');
    if (Array.isArray(parsed)) therapistIds = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    therapistIds = []; // ردیف خراب → خالی؛ سد به حالت «بدون فهرست» می‌افتد (سدِ زمانی محافظه‌کارانه)
  }
  return {
    id: r.id,
    date: r.block_date,
    startMinute: r.start_minute,
    endMinute: r.end_minute,
    therapistIds,
    note: r.note ?? null,
    version: r.version,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

/** روزهای تهران که پنجرهٔ [startAt,endAt) به آن‌ها می‌خورد — نوبت ≤۲۴۰ دقیقه است، بیشینه ۲ روز */
function tehranYmdsSpanned(startAt: string, endAt: string): string[] {
  const out = new Set<string>();
  out.add(tehranYmdOf(startAt));
  const innerEnd = new Date(Math.max(Date.parse(endAt) - 1, Date.parse(startAt))).toISOString();
  out.add(tehranYmdOf(innerEnd));
  return [...out];
}

/** نخستین تداخل بلوک سنجش با پنجرهٔ پیشنهادی — خالص برای مصرف سدِ سخت و کپی هفته */
export type AssessmentBlockConflictHit = { block: AssessmentBlock; kind: 'involved' | 'time_only' };

/**
 * جست‌وجوی تداخل پنجرهٔ پیشنهادی با بلوک‌های فعال سنجش (۱.۲۵.۷۷ — خواست کارفرما):
 * بلوک با فهرست درمانگر → فقط وقتی «درمانگرِ درگیر» همان هدفِ نوبت است تداخل می‌شمارد (kind: involved)؛
 * بلوک بدون فهرست → تداخلِ زمانیِ کل بازه (kind: time_only). پنجرهٔ نامعتبر/ناقص → null.
 */
export async function findAssessmentBlockConflict(
  db: DbClient,
  window: { startAt: string; endAt: string },
  targetStaffId?: string
): Promise<AssessmentBlockConflictHit | null> {
  const startMs = Date.parse(window.startAt);
  const endMs = Date.parse(window.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  for (const ymd of tehranYmdsSpanned(window.startAt, window.endAt)) {
    const rows = await db.query<BlockRow>(
      'SELECT * FROM assessment_blocks WHERE block_date = ? AND deleted_at IS NULL',
      [ymd]
    );
    for (const row of rows) {
      const blockWin = tehranMinuteWindow(ymd, row.start_minute, row.end_minute);
      const blockStart = Date.parse(blockWin.start);
      const blockEnd = Date.parse(blockWin.end);
      if (blockStart >= endMs || blockEnd <= startMs) continue;
      const block = rowToBlock(row);
      if (block.therapistIds.length > 0) {
        if (targetStaffId && block.therapistIds.includes(targetStaffId)) {
          return { block, kind: 'involved' };
        }
        continue; // درمانگرِ غیردرگیر — آزاد (خواست کارفرمای ۱.۲۵.۷۷)
      }
      return { block, kind: 'time_only' };
    }
  }
  return null;
}

/**
 * سد سخت بلوک سنجش — در create/move/resize سرویس نوبت صدا زده می‌شود. نوبتِ درمانگرِ درگیرِ
 * بازهٔ سنجش برای هیچ نقشی ثبت/جابه‌جا/کش‌دادنی نیست (۱.۲۵.۷۷ — خواست کارفرما)؛ بلوک بدون
 * فهرست برای درمانگر/منشی سدِ زمانی است و مدیر/ناظر معاف‌اند. پیام فارسی ValidationError.
 */
export async function assertNoAssessmentBlockInRange(
  db: DbClient,
  window: { startAt: string; endAt: string },
  actor: AuthContext,
  targetStaffId?: string
): Promise<void> {
  const hit = await findAssessmentBlockConflict(db, window, targetStaffId);
  if (!hit) return;
  const when = `(${minuteToLabel(hit.block.startMinute)} تا ${minuteToLabel(hit.block.endMinute)})`;
  if (hit.kind === 'involved') {
    throw new ValidationError(
      `این بازه برای «سنجش» رزرو شده است ${when} — نوبت‌گیریِ درمانگرِ درگیر در این زمان ممکن نیست.`
    );
  }
  if (actor.role === 'manager' || actor.role === 'supervisor') return; // معافیت جلسهٔ خودِ سنجش (بلوک بدون فهرست)
  throw new ValidationError(
    `این بازه برای «سنجش» رزرو شده است ${when} — ثبت یا جابه‌جایی نوبت در این زمان ممکن نیست؛ با مدیر هماهنگ کنید.`
  );
}

export function createAssessmentBlockService(deps: AssessmentBlockDeps) {
  const { db, audit, logger } = deps;

  const service = {
    async create(input: AssessmentBlockCreateInput, actor: AuthContext): Promise<AssessmentBlock> {
      if (input.endMinute <= input.startMinute) {
        throw new ValidationError('پایان بازهٔ سنجش باید بعد از شروع آن باشد');
      }
      if (input.therapistIds.length > 0) {
        // درمانگران درگیر باید همکار واقعی باشند — فرم از فهرست فعال پر می‌شود؛ این هم لایهٔ دوم است.
        // تکه‌بندی ۹۰تایی (دروازهٔ IN-list — هم‌الگوی assertStudentsInScope در appointment-core)
        let knownCount = 0;
        for (const chunk of inParamChunks(input.therapistIds)) {
          const known = await db.query<{ id: string }>(
            `SELECT id FROM staff WHERE id IN (${inPlaceholders(chunk.length)})`,
            chunk
          );
          knownCount += known.length;
        }
        if (knownCount !== input.therapistIds.length) {
          throw new ValidationError('یک یا چند درمانگرِ درگیر در فهرست همکاران نیست');
        }
      }
      const id = newId();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO assessment_blocks (id, block_date, start_minute, end_minute, therapist_ids, note, version, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [id, input.date, input.startMinute, input.endMinute, JSON.stringify(input.therapistIds), input.note ?? null, actor.staffId, now, now]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'assessment_block.create',
        resourceType: 'assessment_block',
        resourceId: id,
        changes: {
          date: { from: null, to: input.date },
          window: { from: null, to: `${minuteToLabel(input.startMinute)}-${minuteToLabel(input.endMinute)}` },
          therapist_ids: { from: null, to: input.therapistIds }
        }
      });
      logger.child('assessment-blocks').info('block.created', { date: input.date });
      return {
        id,
        date: input.date,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        therapistIds: input.therapistIds,
        note: input.note ?? null,
        version: 1,
        createdBy: actor.staffId,
        createdAt: now,
        updatedAt: now
      };
    },

    async list(from?: string, to?: string): Promise<AssessmentBlock[]> {
      const rows = await db.query<BlockRow>(
        'SELECT * FROM assessment_blocks WHERE deleted_at IS NULL AND block_date >= ? AND block_date <= ? ORDER BY block_date, start_minute',
        [from ?? '0000-01-01', to ?? '9999-12-31']
      );
      return rows.map(rowToBlock);
    },

    async remove(id: string, actor: AuthContext): Promise<void> {
      const row = await db.queryOne<BlockRow>('SELECT * FROM assessment_blocks WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!row) throw new NotFoundError('بلوک سنجش');
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE assessment_blocks SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
        [now, now, id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'assessment_block.remove',
        resourceType: 'assessment_block',
        resourceId: id,
        changes: {
          date: { from: row.block_date, to: row.block_date }
        }
      });
    }
  };
  return service;
}

export type { AssessmentBlockService } from './types';
