/**
 * سرویس تنظیمات مرکز — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// ماژول تنظیمات — مالک WRITE جدول settings
// بازه کاری مرکز «عمدتاً ثابت» است → یک‌جا در تنظیمات تعریف و به همه کارکنان اعمال می‌شود.
// قوانین:
// * هر کلید مقدار JSON دارد؛ مقادیر غایب = DEFAULT_SETTINGS / DEFAULT_CENTER_HOURS
// * بازه‌های مرکز روی شبکه ۱۵ دقیقه‌ای و بدون هم‌پوشانی (خطای سخت ۴۰۹ — مثل working-hours)
// * هر تغییر audit می‌شود

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, CenterHourRange, CenterSettings, ScreeningTargetConfig, ScoringConfig, ScoringWeights } from '@core/shared';
import {
  DEFAULT_CENTER_HOURS,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  TEHRAN_OFFSET_MINUTES
} from '@core/shared';
import { ConflictError } from '@core/errors';
import { findOverlap } from '@domain/working-hours/rules';
import type { WorkingHoursService } from '@domain/working-hours';
// پیش‌فرض‌های موتور امتیازدهی از تک‌منبع حقیقت (worker/scoring.js) می‌آیند
import {
  ADMIN_USAGE_CAP,
  CONTENT_FORMULA,
  SCORING_EPOCH,
  USAGE_FORMULA
} from '../../../worker/scoring.js';

export interface SettingsDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** برای «اعمال روی همه کارکنان» */
  workingHours: WorkingHoursService;
  /** fallback نام مرکز از env (اگر در DB تنظیم نشده باشد) */
  envClinicName?: string;
  /** meta فقط-خواندنی زیرساخت اعلان */
  baleConfigured: boolean;
  webhookEnabled: boolean;
}

export interface UpdateSettingsInput {
  clinicName?: string;
  defaultReminderHours?: number;
  notifyOnCreate?: boolean;
  notifyOnMove?: boolean;
  notifyOnCancel?: boolean;
  notifyDigest?: boolean;
  notifyWaitlist?: boolean;
  /** — شماره تماس عمومی مرکز */
  clinicPhone?: string;
  /** — ساعت ارسال پیش‌نویس اعلان نوبت جدید (0..23 تهران) */
  notifyBatchHour?: number;
  /** — جایگزینی کامل بازه‌های شاخص سنجش (سال/ماه شمسی) */
  screeningTargets?: ScreeningTargetConfig[];
}

/** — ورودی به‌روزرسانی پیکربندی امتیازدهی (PUT /api/settings/scoring) */
export interface UpdateScoringConfigInput {
  /** تاریخ شروع شمارش امتیاز — YYYY-MM-DD میلادیِ روز تهران */
  epochYmd: string;
  weights: ScoringWeights;
}

export interface SettingsService {
  /** خواندن کامل تنظیمات (با اعمال پیش‌فرض‌ها) */
  get(): Promise<CenterSettings>;
  /** به‌روزرسانی تنظیمات متنی/عددی/بولی */
  update(input: UpdateSettingsInput, actor: AuthContext): Promise<CenterSettings>;
  /** بازه کاری مرکز — پیش‌فرض ۹–۱۷ */
  getCenterHours(): Promise<CenterHourRange[]>;
  /** جایگزینی کامل بازه کاری مرکز (اتمیک) */
  replaceCenterHours(items: CenterHourRange[], actor: AuthContext): Promise<CenterHourRange[]>;
  /** اعمال بازه مرکز روی برنامه هفتگی همه کارکنان فعال */
  applyCenterHoursToAllStaff(actor: AuthContext): Promise<{ staffCount: number; ranges: number }>;
  /** خواندن سریع نام مرکز (برای قالب پیام‌ها) */
  getClinicName(): Promise<string>;
  /** — شماره تماس عمومی مرکز (خالی = ثبت نشده) */
  getClinicPhone(): Promise<string>;
  /** — ساعت ارسال پیش‌نویس اعلان نوبت جدید (0..23 تهران) */
  getBatchHour(): Promise<number>;
  /** خواندن سریع پرچم‌های اعلان چرخه حیات */
  getNotifyFlags(): Promise<{ onCreate: boolean; onMove: boolean; onCancel: boolean; digestEnabled: boolean; waitlistEnabled: boolean; defaultReminderHours: number }>;
  /** — کلید قطع بانک تمرین (جریان بات + ثبت تکلیف) */
  getExerciseBankEnabled(): Promise<boolean>;
  /** — شاخص سنجش: بازه‌های هدف (سال/ماه شمسی) — مسیر سریع برای داشبورد */
  getScreeningTargets(): Promise<ScreeningTargetConfig[]>;
  /** — پیکربندی امتیازدهی همکاران (تاریخ شروع + وزن‌ها — فقط مدیر) */
  getScoringConfig(): Promise<ScoringConfig>;
  /** — به‌روزرسانی پیکربندی امتیازدهی (فقط مدیر) */
  updateScoringConfig(input: UpdateScoringConfigInput, actor: AuthContext): Promise<ScoringConfig>;
}

interface SettingRow {
  key: string;
  value: string;
}

// ── تبدیل تاریخ شروع شمارش (روز تهران ↔ cutoff UTC) ──────────────────

/** روز تهران (YYYY-MM-DD) → نیمه‌شب تهران به UTC «YYYY-MM-DD HH:MM:SS» */
function epochUtcOfTehranYmd(ymd: string): string {
  const utcMs = Date.parse(`${ymd}T00:00:00.000Z`) - TEHRAN_OFFSET_MINUTES * 60_000;
  return new Date(utcMs).toISOString().slice(0, 19).replace('T', ' ');
}

/** cutoff UTC «YYYY-MM-DD HH:MM:SS» → روز تهران (YYYY-MM-DD) */
function tehranYmdOfEpochUtc(epoch: string): string {
  const ms = Date.parse(`${epoch.replace(' ', 'T')}Z`) + TEHRAN_OFFSET_MINUTES * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** وزن ذخیره‌شدهٔ معتبر — عدد صحیح در بازه، وگرنه undefined */
function sanitizeWeight(v: unknown, max = 10_000): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
}

/** پیش‌فرض وزن‌ها — از خود موتور امتیاز (تک‌منبع حقیقت) */
function defaultScoringWeights(): ScoringWeights {
  const w: Record<string, number> = {};
  for (const x of [...CONTENT_FORMULA.production, ...CONTENT_FORMULA.usage, ...CONTENT_FORMULA.reference]) {
    w[x.key] = x.weight;
  }
  w.baseAction = 1; // — هر اقدام پایه ۱ امتیاز
  w.adminCap = ADMIN_USAGE_CAP;
  return w as unknown as ScoringWeights;
}

/** وزن‌های ذخیره‌شدهٔ سالم + پرکردن غایب‌ها با پیش‌فرض */
function mergeScoringWeights(stored: unknown): ScoringWeights {
  const base = defaultScoringWeights();
  if (!stored || typeof stored !== 'object') return base;
  const s = stored as Record<string, unknown>;
  const out = { ...base };
  for (const key of Object.keys(base)) {
    const v = sanitizeWeight(s[key], key === 'adminCap' ? 100_000 : 10_000);
    if (v !== undefined) (out as Record<string, number>)[key] = v;
  }
  return out;
}

const EPOCH_UTC_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function createSettingsService(deps: SettingsDeps): SettingsService {
  const { db, audit, logger } = deps;
  const log = logger.child('settings');

  async function readAll(): Promise<Map<string, unknown>> {
    const rows = await db.query<SettingRow>(`SELECT key, value FROM settings`, []);
    const map = new Map<string, unknown>();
    for (const row of rows) {
      try {
        map.set(row.key, JSON.parse(row.value));
      } catch {
        log.warn('settings.corrupt', { key: row.key });
      }
    }
    return map;
  }

  async function upsertSetting(key: string, value: unknown, actor: AuthContext): Promise<void> {
    await db.execute(
      `INSERT INTO settings (key, value, updated_by, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), actor.staffId]
    );
  }

  return {
    async get(): Promise<CenterSettings> {
      const stored = await readAll();
      const hours = stored.get(SETTING_KEYS.CENTER_HOURS);

      const storedClinic = stored.get(SETTING_KEYS.CLINIC_NAME);
      const clinicName =
        typeof storedClinic === 'string' && storedClinic.trim().length > 0
          ? storedClinic
          : deps.envClinicName ?? DEFAULT_SETTINGS[SETTING_KEYS.CLINIC_NAME];

      const readBool = (key: string, fallback: boolean): boolean => {
        const v = stored.get(key);
        return typeof v === 'boolean' ? v : fallback;
      };
      const hoursSetting = stored.get(SETTING_KEYS.DEFAULT_REMINDER_HOURS);
      const storedTargets = stored.get(SETTING_KEYS.SCREENING_TARGETS);
      const storedPhone = stored.get(SETTING_KEYS.CLINIC_PHONE);
      const storedBatch = stored.get(SETTING_KEYS.NOTIFY_BATCH_HOUR);

      return {
        centerHours: Array.isArray(hours) ? (hours as CenterHourRange[]) : [...DEFAULT_CENTER_HOURS],
        clinicName,
        defaultReminderHours:
          typeof hoursSetting === 'number' ? hoursSetting : DEFAULT_SETTINGS[SETTING_KEYS.DEFAULT_REMINDER_HOURS],
        notifyOnCreate: readBool(SETTING_KEYS.NOTIFY_ON_CREATE, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_ON_CREATE]),
        notifyOnMove: readBool(SETTING_KEYS.NOTIFY_ON_MOVE, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_ON_MOVE]),
        notifyOnCancel: readBool(SETTING_KEYS.NOTIFY_ON_CANCEL, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_ON_CANCEL]),
        notifyDigest: readBool(SETTING_KEYS.NOTIFY_DIGEST, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_DIGEST]),
        notifyWaitlist: readBool(SETTING_KEYS.NOTIFY_WAITLIST, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_WAITLIST]),
        screeningTargets: Array.isArray(storedTargets) ? (storedTargets as ScreeningTargetConfig[]) : [],
        clinicPhone: typeof storedPhone === 'string' ? storedPhone : DEFAULT_SETTINGS[SETTING_KEYS.CLINIC_PHONE],
        notifyBatchHour:
          typeof storedBatch === 'number' ? storedBatch : DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_BATCH_HOUR],
        meta: {
          baleConfigured: deps.baleConfigured,
          webhookEnabled: deps.webhookEnabled
        }
      };
    },

    async update(input: UpdateSettingsInput, actor: AuthContext): Promise<CenterSettings> {
      const before = await this.get();

      if (input.clinicName !== undefined) {
        await upsertSetting(SETTING_KEYS.CLINIC_NAME, input.clinicName.trim(), actor);
      }
      if (input.defaultReminderHours !== undefined) {
        await upsertSetting(SETTING_KEYS.DEFAULT_REMINDER_HOURS, input.defaultReminderHours, actor);
      }
      if (input.notifyOnCreate !== undefined) {
        await upsertSetting(SETTING_KEYS.NOTIFY_ON_CREATE, input.notifyOnCreate, actor);
      }
      if (input.notifyOnMove !== undefined) {
        await upsertSetting(SETTING_KEYS.NOTIFY_ON_MOVE, input.notifyOnMove, actor);
      }
      if (input.notifyOnCancel !== undefined) {
        await upsertSetting(SETTING_KEYS.NOTIFY_ON_CANCEL, input.notifyOnCancel, actor);
      }
      if (input.notifyDigest !== undefined) {
        await upsertSetting(SETTING_KEYS.NOTIFY_DIGEST, input.notifyDigest, actor);
      }
      if (input.notifyWaitlist !== undefined) {
        await upsertSetting(SETTING_KEYS.NOTIFY_WAITLIST, input.notifyWaitlist, actor);
      }
      if (input.clinicPhone !== undefined) {
        await upsertSetting(SETTING_KEYS.CLINIC_PHONE, input.clinicPhone.trim(), actor);
      }
      if (input.notifyBatchHour !== undefined) {
        await upsertSetting(SETTING_KEYS.NOTIFY_BATCH_HOUR, input.notifyBatchHour, actor);
      }
      if (input.screeningTargets !== undefined) {
        await upsertSetting(SETTING_KEYS.SCREENING_TARGETS, input.screeningTargets, actor);
      }

      await audit.log({
        actorId: actor.staffId,
        action: 'settings.update',
        resourceType: 'settings',
        resourceId: 'general',
        changes: {
          clinic_name: { from: before.clinicName, to: input.clinicName ?? before.clinicName },
          default_reminder_hours: {
            from: before.defaultReminderHours,
            to: input.defaultReminderHours ?? before.defaultReminderHours
          },
          notify_on_create: { from: before.notifyOnCreate, to: input.notifyOnCreate ?? before.notifyOnCreate },
          notify_on_move: { from: before.notifyOnMove, to: input.notifyOnMove ?? before.notifyOnMove },
          notify_on_cancel: { from: before.notifyOnCancel, to: input.notifyOnCancel ?? before.notifyOnCancel },
          notify_digest: { from: before.notifyDigest, to: input.notifyDigest ?? before.notifyDigest },
          notify_waitlist: { from: before.notifyWaitlist, to: input.notifyWaitlist ?? before.notifyWaitlist },
          clinic_phone: { from: before.clinicPhone, to: input.clinicPhone ?? before.clinicPhone },
          notify_batch_hour: { from: before.notifyBatchHour, to: input.notifyBatchHour ?? before.notifyBatchHour },
          screening_targets: {
            from: before.screeningTargets.length,
            to: input.screeningTargets?.length ?? before.screeningTargets.length
          }
        }
      });

      return this.get();
    },

    async getCenterHours(): Promise<CenterHourRange[]> {
      const stored = await readAll();
      const hours = stored.get(SETTING_KEYS.CENTER_HOURS);
      return Array.isArray(hours) ? (hours as CenterHourRange[]) : [...DEFAULT_CENTER_HOURS];
    },

    async replaceCenterHours(items: CenterHourRange[], actor: AuthContext): Promise<CenterHourRange[]> {
      const violation = findOverlap(items);
      if (violation) {
        throw new ConflictError('بازه‌های ارسالی با هم هم‌پوشانی دارند');
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO settings (key, value, updated_by, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
          [SETTING_KEYS.CENTER_HOURS, JSON.stringify(items), actor.staffId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'settings.center_hours.replace',
          resourceType: 'settings',
          resourceId: SETTING_KEYS.CENTER_HOURS,
          changes: { ranges: { from: 'previous', to: `${items.length} ranges` } }
        });
      });

      log.info('center_hours.replaced', { count: items.length });
      return items;
    },

    async applyCenterHoursToAllStaff(actor: AuthContext): Promise<{ staffCount: number; ranges: number }> {
      const items = await this.getCenterHours();
      const staffRows = await db.query<{ id: string }>(`SELECT id FROM staff WHERE active = 1`, []);

      let staffCount = 0;
      for (const row of staffRows) {
        await deps.workingHours.replaceWeek(row.id, items, actor);
        staffCount += 1;
      }

      await audit.log({
        actorId: actor.staffId,
        action: 'settings.center_hours.apply_all',
        resourceType: 'settings',
        resourceId: SETTING_KEYS.CENTER_HOURS,
        changes: {
          staff: { from: null, to: staffCount },
          ranges: { from: null, to: items.length }
        }
      });

      log.info('center_hours.applied', { staffCount, ranges: items.length });
      return { staffCount, ranges: items.length };
    },

    async getClinicName(): Promise<string> {
      const row = await db.queryOne<{ value: string }>(
        `SELECT value FROM settings WHERE key = ?`,
        [SETTING_KEYS.CLINIC_NAME]
      );
      if (row) {
        try {
          const parsed = JSON.parse(row.value) as unknown;
          if (typeof parsed === 'string' && parsed.trim().length > 0) return parsed;
        } catch {
          /* corrupt value → fallback */
        }
      }
      return deps.envClinicName ?? DEFAULT_SETTINGS[SETTING_KEYS.CLINIC_NAME];
    },

    /** — شماره تماس عمومی مرکز */
    async getClinicPhone(): Promise<string> {
      const stored = await readAll();
      const v = stored.get(SETTING_KEYS.CLINIC_PHONE);
      return typeof v === 'string' ? v : DEFAULT_SETTINGS[SETTING_KEYS.CLINIC_PHONE];
    },

    /** — ساعت ارسال پیش‌نویس اعلان نوبت جدید */
    async getBatchHour(): Promise<number> {
      const stored = await readAll();
      const v = stored.get(SETTING_KEYS.NOTIFY_BATCH_HOUR);
      return typeof v === 'number' ? v : DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_BATCH_HOUR];
    },

    async getNotifyFlags() {
      const stored = await readAll();
      const readBool = (key: string, fallback: boolean): boolean => {
        const v = stored.get(key);
        return typeof v === 'boolean' ? v : fallback;
      };
      const hours = stored.get(SETTING_KEYS.DEFAULT_REMINDER_HOURS);
      return {
        onCreate: readBool(SETTING_KEYS.NOTIFY_ON_CREATE, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_ON_CREATE]),
        onMove: readBool(SETTING_KEYS.NOTIFY_ON_MOVE, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_ON_MOVE]),
        onCancel: readBool(SETTING_KEYS.NOTIFY_ON_CANCEL, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_ON_CANCEL]),
        digestEnabled: readBool(SETTING_KEYS.NOTIFY_DIGEST, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_DIGEST]),
        waitlistEnabled: readBool(SETTING_KEYS.NOTIFY_WAITLIST, DEFAULT_SETTINGS[SETTING_KEYS.NOTIFY_WAITLIST]),
        defaultReminderHours:
          typeof hours === 'number' ? hours : DEFAULT_SETTINGS[SETTING_KEYS.DEFAULT_REMINDER_HOURS]
      };
    },

    async getExerciseBankEnabled(): Promise<boolean> {
      const stored = await readAll();
      const v = stored.get(SETTING_KEYS.EXERCISE_BANK_ENABLED);
      return typeof v === 'boolean' ? v : DEFAULT_SETTINGS[SETTING_KEYS.EXERCISE_BANK_ENABLED];
    },

    async getScreeningTargets(): Promise<ScreeningTargetConfig[]> {
      const stored = await readAll();
      const v = stored.get(SETTING_KEYS.SCREENING_TARGETS);
      return Array.isArray(v) ? (v as ScreeningTargetConfig[]) : [];
    },

    /** — پیکربندی امتیازدهی: پیش‌فرض موتور + مقدار ذخیره‌شدهٔ مدیر */
    async getScoringConfig(): Promise<ScoringConfig> {
      const row = await db.queryOne<{ value: string }>(
        `SELECT value FROM settings WHERE key = ?`,
        [SETTING_KEYS.SCORING_CONFIG]
      );
      let epoch = SCORING_EPOCH;
      let storedWeights: unknown = null;
      if (row) {
        try {
          const parsed = JSON.parse(row.value) as { epoch?: unknown; weights?: unknown };
          if (typeof parsed?.epoch === 'string' && EPOCH_UTC_RE.test(parsed.epoch)) epoch = parsed.epoch;
          if (parsed?.weights && typeof parsed.weights === 'object') storedWeights = parsed.weights;
        } catch {
          log.warn('scoring_config.corrupt');
        }
      }
      const defaults = defaultScoringWeights();
      return {
        epochYmd: tehranYmdOfEpochUtc(epoch),
        epochUtc: epoch,
        weights: mergeScoringWeights(storedWeights),
        defaults: { epochYmd: tehranYmdOfEpochUtc(SCORING_EPOCH), weights: defaults }
      };
    },

    /** — ذخیرهٔ پیکربندی امتیازدهی (فقط مدیر — در routes اعمال می‌شود) */
    async updateScoringConfig(input: UpdateScoringConfigInput, actor: AuthContext): Promise<ScoringConfig> {
      const before = await this.getScoringConfig();
      const epoch = epochUtcOfTehranYmd(input.epochYmd);
      // فقط وزن‌های شناخته‌شده ذخیره می‌شوند — بقیهٔ کلیدها نادیده گرفته می‌شوند
      const clean = mergeScoringWeights(input.weights as unknown);
      await upsertSetting(SETTING_KEYS.SCORING_CONFIG, { epoch, weights: clean }, actor);
      const changed = (Object.keys(clean) as (keyof ScoringWeights)[]).filter(
        (k) => clean[k] !== before.weights[k]
      ).length;
      await audit.log({
        actorId: actor.staffId,
        action: 'settings.scoring.update',
        resourceType: 'settings',
        resourceId: SETTING_KEYS.SCORING_CONFIG,
        changes: {
          epoch: { from: before.epochUtc, to: epoch },
          weights_changed: { from: null, to: changed }
        }
      });
      log.info('scoring_config.updated', { epoch, weights_changed: changed });
      return this.getScoringConfig();
    }
  };
}
