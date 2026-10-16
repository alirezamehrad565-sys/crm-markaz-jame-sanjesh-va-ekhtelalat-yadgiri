/**
 * ماژول کارکنان — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Public types of the staff module — owner of the `staff` table ( / v۲: )
//: ایمیل دیگر ورود نیست — تلفن + کد ملی + نام کاربری + رمز جایگزین شدند.

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, StaffRole } from '@core/shared';

export interface StaffMember {
  id: string;
  fullName: string;
  role: StaffRole;
  active: boolean;
  /** — دریافت اعلان‌های بله (نوبت جدید/تغییر/لغو) */
  notifyEnabled: boolean;
  /** — شماره تلفن (اجباری در تعریف) */
  phone: string | null;
  /** — کد ملی (اجباری در تعریف؛ اعتبارسنجی checksum) */
  nationalId: string | null;
  /** — نام کاربری صفحه ورود (قابل ویرایش) */
  username: string | null;
  /** legacy — فقط برای مسیر Cloudflare Access؛ برای کارکنان جدید مقدار synthetic است */
  email: string | null;
  createdAt: string;
}

export interface NewStaffInput {
  fullName: string;
  phone: string;
  nationalId: string;
  username: string;
  /** اختیاری — خالی = رمز پیش‌فرض ۱۲۳۴ */
  password?: string;
  role: StaffRole;
  notifyEnabled?: boolean;
}

export interface UpdateStaffInput {
  fullName?: string;
  phone?: string;
  nationalId?: string;
  username?: string;
  /** ناموجود یا خالی = رمز فعلی حفظ می‌شود */
  password?: string;
  role?: StaffRole;
  notifyEnabled?: boolean;
}

export interface StaffDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface StaffService {
  list(filters: { active?: boolean }): Promise<StaffMember[]>;
  getById(id: string): Promise<StaffMember | null>;
  create(input: NewStaffInput, actor: AuthContext): Promise<StaffMember>;
  update(id: string, patch: UpdateStaffInput, actor: AuthContext): Promise<StaffMember>;
  setActive(id: string, active: boolean, actor: AuthContext): Promise<StaffMember>;
  /** — حذف کامل همکار بدون سابقه — خودِ بازیگر/آخرین مدیر/ارجاع‌دار → ConflictError */
  remove(id: string, actor: AuthContext): Promise<void>;
}
