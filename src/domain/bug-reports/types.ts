// ─── گزارش باگ سامانه به پشتیبانی CP: نوع‌ها ───
// بازاعمال ۱.۲۵.۵۱ روی درخت ۱.۲۵.۵۳ — قرارداد گیرندهٔ CP (m7) در core/shared/constants.
import type { BugReportSeverity } from '@core/shared';

export type { BugReportSeverity };

/** وضعیت چرخهٔ ارسال: open = در صف ارسال به CP · sent = تحویل پشتیبانی شبکه */
export type BugReportStatus = 'open' | 'sent';

export interface BugReportRecord {
  id: string;
  staffId: string | null;
  staffName: string | null;
  areas: string[];
  severity: BugReportSeverity;
  description: string | null;
  page: string | null;
  appVersion: string | null;
  status: BugReportStatus;
  forwardError: string | null;
  createdAt: string;
  forwardedAt: string | null;
}

export interface BugReportCreateInput {
  areas: string[];
  severity: BugReportSeverity;
  description?: string | null;
  page?: string | null;
  appVersion?: string | null;
}

/** سرویس گزارش باگ — فقط DB محلی؛ ارسال به CP در @app/bug-report-forward است */
export interface BugReportService {
  create(
    actor: { id: string; name?: string | null },
    input: BugReportCreateInput,
    opts?: { now?: string }
  ): Promise<BugReportRecord>;
  list(opts?: { limit?: number }): Promise<BugReportRecord[]>;
  listOpen(limit: number): Promise<BugReportRecord[]>;
  markSent(id: string, forwardedAt: string): Promise<void>;
  markForwardError(id: string, error: string): Promise<void>;
}
