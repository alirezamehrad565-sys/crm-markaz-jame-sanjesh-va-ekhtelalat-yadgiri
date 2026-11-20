import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import type { NotifyService } from '@core/notify';
import type { AppointmentService } from '@domain/appointment-core';
import type { StudentProfileService } from '@domain/student-profile';
import type { FollowUpsService } from '@domain/followups';
import type { ExerciseBankBot } from './exercise-bank-bot';
import type { ExerciseSubmissionBot } from './exercise-submission-bot';
import type { CaseEventsBot } from './case-events-bot';
import type { AwarenessBot } from './awareness-bot';
import type { NotifyAppDeps } from './service';

// هویت لاگ عملیات خودِ بات — بات نباید با هویت آدم‌ها audit بنویسد
export const BOT_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

type Stmt = { sql: string; params: unknown[] };

// سازنده‌های کوئری @core/notify شیء برمی‌گردانند؛ db.query ارگومن‌های پخش‌شده می‌خواهد
export function spreadStmt(stmt: Stmt): [string, unknown[]] {
  return [stmt.sql, stmt.params];
}

// سبد مشترک بخش‌های سرویس اعلان؛ هر فایل بخش همین را می‌گیرد تا closure دهه‌خطی تکرار نشود
export interface NotifyCtx {
  deps: NotifyAppDeps;
  db: DbClient;
  audit: AuditWriter;
  log: Logger;
  notify: NotifyService;
  now: () => Date;
  appointments: AppointmentService;
  students: StudentProfileService;
  followups: FollowUpsService;
  exbBot: ExerciseBankBot | null;
  subBot: ExerciseSubmissionBot | null;
  clfBot: CaseEventsBot;
  awBot: AwarenessBot;
  readPfState(chatId: string): Promise<{ pfl?: Array<{ e: string; f: string; t: string }> }>;
  writePfState(chatId: string, state: { pfl?: Array<{ e: string; f: string; t: string }> }): Promise<void>;
  studentNamesMap(studentIds: string[]): Promise<Map<string, string>>;
  staffNamesMap(): Promise<Map<string, string>>;
  botDeepLink(code: string): Promise<string | null>;
  botDeepLinkCache(): Promise<string | null>;
}
