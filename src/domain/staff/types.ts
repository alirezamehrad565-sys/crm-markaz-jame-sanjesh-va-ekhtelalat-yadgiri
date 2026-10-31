import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, StaffRole } from '@core/shared';

export interface StaffMember {
  id: string;
  fullName: string;
  role: StaffRole;
  active: boolean;
  notifyEnabled: boolean;
  phone: string | null;
  nationalId: string | null;
  username: string | null;
  email: string | null;
  createdAt: string;
}

export interface NewStaffInput {
  fullName: string;
  phone?: string | null; // ناظر بدون تلفن؛ بقیهٔ نقش‌ها در اسکیما الزام می‌شود
  nationalId?: string | null; // ناظر بدون کد ملی
  username: string;
  password?: string;
  role: StaffRole;
  notifyEnabled?: boolean;
}

export interface UpdateStaffInput {
  fullName?: string;
  phone?: string;
  nationalId?: string;
  username?: string;
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
  remove(id: string, actor: AuthContext): Promise<void>;
}
