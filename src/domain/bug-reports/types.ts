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
  // ۱.۲۵.۵۷ — پاسخ پشتیبانی شبکه (pull از CP m8)؛ فقط-خواندنی روی نود
  replyText: string | null;
  replyBy: string | null;
  replyAt: string | null;
}

/** آیتم pull پاسخ‌ها از CP — هم‌قرارداد NodeFeedbackReplyItem سمت CP (m8)؛
 *  id همان bug_reports.id است (CP آن را node_report_id می‌شناسد) */
export interface BugReportReplyItem {
  id: string;
  status?: 'new' | 'read';
  reply_text: string | null;
  reply_by: string | null;
  reply_at: string | null;
  updated_at?: string;
}

export interface BugReportCreateInput {
  areas: string[];
  severity: BugReportSeverity;
  description?: string | null;
  page?: string | null;
  appVersion?: string | null;
}

/** سرویس گزارش باگ — فقط DB محلی؛ ارسال/دریافت به CP در @app/bug-report-forward است */
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
  /** UPSERT پاسخ‌های پشتیبانی (کلید = خودِ گزارش) با گارد تازگی reply_at؛ تعداد ردیف به‌روزشده را می‌دهد */
  applyReplies(items: BugReportReplyItem[]): Promise<number>;
}
