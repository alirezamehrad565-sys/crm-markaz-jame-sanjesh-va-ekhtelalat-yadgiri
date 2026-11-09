// ─── کتابخانهٔ شبکه (محور دوم): انواع ماژول ───
// محتوای همرسان‌شدهٔ محلی (origin='local': تمرین/کارت آماده، طرح درمان، سند خام)
// + برگزیده‌های توزیع‌شده از کنترل‌پلین (origin='cp'، فقط با پیشوند cp-content-).
// قرارداد CP: docs/cp-node-content-hub.md

export const CONTENT_KINDS = ['exercise', 'plan', 'doc'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  exercise: 'تمرین / کارت آماده',
  plan: 'طرح درمان',
  doc: 'سند خام'
};

/** وضعیت ردیف‌های محلی: پیش‌نویس → صف همرسانی → همرسانده‌شده؛ withdrawn = کنارگذاری */
export type ContentStatus = 'draft' | 'queued' | 'submitted' | 'withdrawn' | 'published';

export interface NetworkContentRecord {
  id: string;
  kind: ContentKind;
  kindLabel: string;
  title: string;
  summary: string;
  /** JSON ساختارمند محتوا — رشتهٔ خام برای نمایش فرمت‌شده در کلاینت */
  body: string;
  tags: string[];
  origin: 'local' | 'cp';
  status: ContentStatus;
  sourceCenter: string | null;
  sourceRef: string | null;
  active: boolean;
  submittedAt: string | null;
  syncedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentListOpts {
  kind?: ContentKind;
  origin?: 'local' | 'cp';
  q?: string;
  limit: number;
  offset: number;
}

export interface NewContentInput {
  kind: ContentKind;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  sourceRef?: string | null;
  /** true = مستقیم به صف همرسانی (draft نمی‌ماند) */
  queueNow?: boolean;
}

export interface ContentListResult {
  items: NetworkContentRecord[];
  hasMore: boolean;
  /** شمارنده‌های سریع برای کلاینت (برچسب تب‌ها) */
  counts: { local: number; network: number };
}

export interface NetworkContentDeps {
  db: import('@core/db').DbClient;
  audit: import('@core/audit').AuditWriter;
}

export interface NetworkContentService {
  list(opts: ContentListOpts): Promise<ContentListResult>;
  get(id: string): Promise<NetworkContentRecord | null>;
  create(actor: { id: string }, input: NewContentInput): Promise<NetworkContentRecord>;
  /** draft/withdrawn → queued (ارسال به شبکه؛ push واقعی در ماژول سینک CP) */
  queue(actor: { id: string }, id: string): Promise<NetworkContentRecord>;
  /** queued/submitted → withdrawn (کنارگذاری محلی؛ ردیف cp هرگز) */
  withdraw(actor: { id: string }, id: string): Promise<NetworkContentRecord>;
}
