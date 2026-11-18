// src/domain/assessment-blocks/types.ts — ۱.۲۷.۱۴ بلوک نوبت سنجش (خواست کارفرما)
import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

/** یک بازهٔ رزرو سنجش — دقیقه‌ها «از نیمه‌شب تهران» (هم‌واژگان مرکز ساعات کاری) */
export interface AssessmentBlock {
  id: string;
  /** ymd میلادی تهران (YYYY-MM-DD) */
  date: string;
  startMinute: number;
  endMinute: number;
  /** staff_id درمانگران درگیر — ثبت و نمایش؛ سدِ زمانی برای همهٔ همکاران است */
  therapistIds: string[];
  note: string | null;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentBlockCreateInput {
  date: string;
  startMinute: number;
  endMinute: number;
  /** ۱.۲۷.۱۵ — فن‌اوت: برای هر درمانگر یک ردیف/کارت مستقل ساخته می‌شود؛ خالی = سد زمانی کل بازه */
  therapistIds: string[];
  note?: string | null;
}

/** ۱.۲۷.۱۵ — پچ کارت سنجش (درگ/دراپ، کش، جابه‌جایی درمانگر، جزئیات) — قفل خوش‌بینانهٔ نسخه */
export interface AssessmentBlockPatchInput {
  date?: string;
  startMinute?: number;
  endMinute?: number;
  staffId?: string;
  note?: string | null;
  version: number;
}

export interface AssessmentBlockDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface AssessmentBlockService {
  /** ۱.۲۷.۱۵ — فن‌اوت: هر درمانگر ردیف/کارت مستقل خودش را می‌گیرد؛ خروجی آرایهٔ ساخته‌شده‌ها */
  create(input: AssessmentBlockCreateInput, actor: AuthContext): Promise<AssessmentBlock[]>;
  /** ۱.۲۷.۱۵ — پچ کارت (درگ/دراپ، کش، تغییر درمانگر، جزئیات) — قفل خوش‌بینانهٔ نسخه */
  update(id: string, patch: AssessmentBlockPatchInput, actor: AuthContext): Promise<AssessmentBlock>;
  /** از تاریخ تا تاریخ (ymd تهران)؛ هر دو اختیاری — غیاب = کل تاریخ */
  list(from?: string, to?: string): Promise<AssessmentBlock[]>;
  remove(id: string, actor: AuthContext): Promise<void>;
}
