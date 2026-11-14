// src/application/system/error-package.ts — سازندهٔ «گزارش خطا برای پشتیبانی» (۴-۲)
//
// بستهٔ ZIP بدون وابستگی تازه (STORE — zip.ts) با این محتوا:
//   status.json        — نسخهٔ اپ/موتور، نسخهٔ مرکز از آینهٔ وضعیت سینک (اگر دسترس‌پذیر)،
//                        شمارش pending ارسال/دریافت سینک، ENV، لحظهٔ ساخت
//   human-events.txt   — دم لاگ رویدادهای انسانی فارسی (صفٔ sys_human_events — ۴-۳)
//   audit-tail.txt     — دم audit_log (آخرین ۱۰۰ رویداد ممیزی سامانه)
//   client-errors-tail.txt — دم خطاهای مرورگر (تنها لاگ درون‌دسترسِ ورکر؛ لاگ stderr موتور
//                        یعنی workerd.log روی دیسکِ ناظر است و از داخل سندباکس ورکر خواندنی
//                        نیست — این محدودیت در readme بسته صادقانه نوشته شده است)
//   readme.txt         — توضیح فارسی بسته برای ادمین و پشتیبانی
import { APP_VERSION } from '@core/version';
import type { DbClient } from '@core/db';
import { readHumanEvents } from '@core/human-events';
import { NODE_SYNC_STATUS_MIRROR_KEY } from '../../node-sync-runner/status'; // فقط-خواندنی؛ اصلاح نمی‌شود
import { buildStoreZip, zipText } from './zip';
import type { ZipEntry } from './zip';

/** سقف دم‌ها — بسته باید سبک بماند */
const AUDIT_TAIL = 100;
const CLIENT_ERRORS_TAIL = 50;
const HUMAN_EVENTS_TAIL = 200;

/** شکل status.json — صادقانه؛ ناشناخته‌ها null می‌آیند نه حدس */
export interface ErrorPackageStatus {
  generated_at: string;
  app_version: string;
  engine_version: string;
  env: string | null;
  center_version: string | null;
  pending_push: number | null;
  pending_pull: number | null;
}

/** خواندن نرم آینهٔ وضعیت سینک از settings (هم‌کلید rust-f14؛ بدون zod تا ماژول مرکزی دست‌نخورده بماند) */
async function readSyncMirrorSoft(db: DbClient): Promise<{ version?: { center?: string }; push_watermark?: string } | null> {
  try {
    const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
      NODE_SYNC_STATUS_MIRROR_KEY
    ]);
    if (!row?.value) return null;
    const parsed: unknown = JSON.parse(row.value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as { version?: { center?: string }; push_watermark?: string };
  } catch {
    return null;
  }
}

/**
 * شمارش نرم pending_push — همان قاعدهٔ rust-f14 (client_errors بعد از watermark + دو بکت
 * لحظه‌ای) بدون تغییر آن ماژول؛ خطا/جدول غایب = null (نامعلوم، نه صفرِ دروغین).
 */
async function pendingPushSoft(db: DbClient, watermark: string | null | undefined): Promise<number | null> {
  try {
    let count = 0;
    if (watermark) {
      const cutoff = watermark.slice(0, 19).replace('T', ' ');
      const row = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM client_errors WHERE occurred_at > ?', [cutoff]);
      count += Number(row?.n ?? 0);
    } else {
      const row = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM client_errors');
      count += Number(row?.n ?? 0);
    }
    const nowIso = new Date().toISOString();
    const ahead = (at: string): boolean => !watermark || Date.parse(at) > Date.parse(watermark);
    if (ahead(`${nowIso.slice(0, 13)}:00:00Z`)) count += 1;
    if (ahead(`${nowIso.slice(0, 10)}T00:00:00Z`)) count += 1;
    return count;
  } catch {
    return null;
  }
}

function readmeText(status: ErrorPackageStatus): string {
  return [
    'بستهٔ گزارش خطا — سامانهٔ مرکز جامع',
    '===================================',
    '',
    'این بسته برای ارسال به پشتیبانی ساخته شده است و شامل موارد زیر است:',
    '  • status.json — وضعیت فنی لحظهٔ ساخت: نسخهٔ برنامه و موتور، نسخهٔ مرکز (اگر در دسترس باشد)،',
    '    شمار رکوردهای در انتظار هم‌گام‌سازی، و محیط اجرا.',
    '  • human-events.txt — گزارش رویدادهای مهم سامانه به فارسی ساده (ری‌استارت، پشتیبان، بازسازی، سینک).',
    '  • audit-tail.txt — آخرین رویدادهای ممیزی سامانه (۱۰۰ رویداد آخر).',
    '  • client-errors-tail.txt — آخرین خطاهای گزارش‌شده از مرورگر.',
    '',
    'نکته: لاگ خام موتور (workerd.log) روی دیسکِ دستگاه نزد ناظر برنامه نگه‌داری می‌شود و از',
    'داخل سندباکس امن برنامه خواندنی نیست؛ در صورت نیاز، پشتیبانی همان فایل را از پوشهٔ داده',
    'مطالبه می‌کند. هیچ‌یک از محتوای این بسته رمز یا توکن نیست و ارسال آن به پشتیبانی بی‌خطر است.',
    '',
    `نسخهٔ برنامه: ${status.app_version} — لحظهٔ ساخت: ${status.generated_at}`,
    ''
  ].join('\n');
}

/** ساخت محتوای متنی audit tail — بدون هیچ دادهٔ حساس اضافی؛ فقط ستون‌های لاگ */
async function auditTailText(db: DbClient): Promise<string> {
  try {
    const rows = await db.query<{ id: string; created_at: string; actor_id: string; action: string; resource_type: string; resource_id: string }>(
      `SELECT id, created_at, actor_id, action, resource_type, resource_id FROM audit_log
       ORDER BY created_at DESC, id DESC LIMIT ${AUDIT_TAIL}`
    );
    return (
      rows
        .map((r) => `[${r.created_at}] ${r.actor_id} — ${r.action} (${r.resource_type}/${r.resource_id})`)
        .join('\n') + '\n'
    );
  } catch {
    return 'audit_log خوانده نشد\n';
  }
}

/** دم خطاهای مرورگر — جدول 0106؛ ستون‌های فنی بدون محتوای بالینی */
async function clientErrorsTailText(db: DbClient): Promise<string> {
  try {
    const rows = await db.query<{ occurred_at: string; kind: string; message: string }>(
      `SELECT occurred_at, kind, message FROM client_errors
       ORDER BY occurred_at DESC, id DESC LIMIT ${CLIENT_ERRORS_TAIL}`
    );
    return (
      rows
        .map((r) => `[${r.occurred_at}] ${r.kind}: ${String(r.message ?? '').slice(0, 200)}`)
        .join('\n') + '\n'
    );
  } catch {
    return 'client_errors خوانده نشد\n';
  }
}

/** خروجی سازنده — بایت‌های zip + نام فایل پیشنهادی (قرارداد ۴-۲) */
export interface ErrorPackageResult {
  bytes: Uint8Array;
  filename: string;
  status: ErrorPackageStatus;
}

export function errorPackageStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** ساخت کامل بسته — هر جزء best-effort است؛ شکست یک جزء بسته را نمی‌شکند */
export async function buildErrorPackage(db: DbClient, opts: { envName?: string | null } = {}): Promise<ErrorPackageResult> {
  const mirror = await readSyncMirrorSoft(db);
  const status: ErrorPackageStatus = {
    generated_at: new Date().toISOString(),
    app_version: APP_VERSION,
    engine_version: APP_VERSION,
    env: opts.envName ?? null,
    center_version: typeof mirror?.version?.center === 'string' ? mirror.version.center : null,
    pending_push: await pendingPushSoft(db, mirror?.push_watermark ?? null),
    // سینک pull بر پایهٔ cursor است و «شمار رکورد در انتظار دریافتی» سمت مرکز شمرده می‌شود؛
    // از نود برآورد قابل‌اعتمادی ندارد — صادقانه null (طرح: «مشخص نبودن خودش خطاست» ولی
    // عددِ دروغین بدتر است؛ ردیف سینک پنل همین را با state نشان می‌دهد)
    pending_pull: null
  };

  const events = await readHumanEvents(db, HUMAN_EVENTS_TAIL);
  const humanEventsText =
    events.map((e) => `[${e.ts}] ${e.msg} (منبع: ${e.source})`).join('\n') + '\n';

  const entries: ZipEntry[] = [
    { name: 'status.json', data: zipText(JSON.stringify(status, null, 2)) },
    { name: 'human-events.txt', data: zipText(humanEventsText) },
    { name: 'audit-tail.txt', data: zipText(await auditTailText(db)) },
    { name: 'client-errors-tail.txt', data: zipText(await clientErrorsTailText(db)) },
    { name: 'readme.txt', data: zipText(readmeText(status)) }
  ];

  return {
    bytes: buildStoreZip(entries),
    filename: `error-package-${errorPackageStamp()}.zip`,
    status
  };
}
