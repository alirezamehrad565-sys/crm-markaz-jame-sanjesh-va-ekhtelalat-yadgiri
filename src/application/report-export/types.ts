import type { AuditWriter } from '@core/audit';
import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';

/* موج ۳ طرح ارتقای پرونده (طرح C «پروندهٔ ناشر» — PROFILE-UPGRADE-DESIGN §۵):
   اسناد خروجی نسخه‌دار. snapshot-first: هر خروجی سند قطعی با شمارهٔ سالانهٔ مرکزی،
   هش SHA-256 و امضاکنندهٔ لحظهٔ قطعی‌سازی؛ بازخوانی فقط از snapshot نه دادهٔ زنده.
   سازندهٔ گزارش تزریقی است (قرارداد «نه وابستگی ماژولی domain→domain» — هم‌الگوی formulationOt). */
export interface ReportSnapshotDeps {
  db: DbClient;
  audit: AuditWriter;
  buildReport: (pathId: string, actor: AuthContext) => Promise<unknown>;
  now?: () => Date;
}

export interface ReportSnapshotRecord {
  id: string;
  studentId: string;
  templateKey: string;
  pathId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  reportNo: string;
  contentHash: string;
  hashVerified: boolean; // بازمحاسبهٔ هش در لحظهٔ خواندن — «بازتولید عین محتوا» گیت موج ۳
  signedBy: string | null;
  signedName: string | null;
  signedRole: string | null;
  createdAt: string;
  sections: unknown;
}

export interface ReportExportService {
  create(studentId: string, input: { pathId: string }, actor: AuthContext): Promise<ReportSnapshotRecord>;
  list(studentId: string): Promise<ReportSnapshotRecord[]>;
  getOne(studentId: string, id: string): Promise<ReportSnapshotRecord>;
}
