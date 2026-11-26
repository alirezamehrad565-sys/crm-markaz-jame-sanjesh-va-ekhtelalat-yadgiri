/**
 * نگه‌داری شبانهٔ جدول‌های سیستم — ۱.۲۷.۸۳ (sdt160: data-002 + data-004)
 * الگوی حذف از clientErrors.pruneOld: DELETE با RETURNING → شمارش از طول ردیف‌ها.
 * قرارگیری در چرخهٔ digest: src/index.ts بلوک retention — هر جدول در گارد خطای خودش.
 */
type DbLike = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

/** هرس ردیف‌های کهنه‌تر از cutoff بر ستون زمانی داده‌شده (received_at / day / occurred_at) */
export async function pruneRowsOlderThan(db: DbLike, table: string, column: string, cutoff: string): Promise<number> {
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(column)) {
    throw new Error(`نام جدول/ستون نگه‌داری نامعتبر است: ${table}.${column}`);
  }
  // RETURNING همان ستون زمانی — جدول‌های مقصد لزوماً ستون id ندارند (quota_usage.day تک‌کلید است)
  const rows = await db.query<{ v: string }>(
    `DELETE FROM ${table} WHERE ${column} < ? RETURNING ${column} AS v`,
    [cutoff]
  );
  return rows.length;
}

/** سوییپ chunkهای یتیم تمرین — data-002: کلیدهای exercise/* که در exercise_attachments نیستند.
    دامنه‌های دیگر (clearbook/docs/knowledge) attachment-جدول خودشان را دارند و از سوییپ تمرین
    خارج‌اند؛ پس پیشوند exercise/ گاردِ دامنه است نه فرض محتوا. */
export async function pruneOrphanExerciseChunks(db: DbLike): Promise<number> {
  const rows = await db.query<{ key: string }>(
    `DELETE FROM exercise_file_chunks
      WHERE key LIKE 'exercise/%'
        AND key NOT IN (SELECT file_key FROM exercise_attachments)
      RETURNING key`
  );
  return rows.length;
}

/** برش ISO شبانه — هم‌قالب ستون‌های datetime('now') (YYYY-MM-DD HH:MM:SS) */
export function cutoffIso(daysAgo: number, nowMs: number = Date.now()): string {
  return new Date(nowMs - daysAgo * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
}

/** برش روزشمسی/میلادی YYYY-MM-DD برای ستون‌های day-محور (مثل quota_usage.day) */
export function cutoffYmd(daysAgo: number, nowMs: number = Date.now()): string {
  return new Date(nowMs - daysAgo * 86_400_000).toISOString().slice(0, 10);
}
