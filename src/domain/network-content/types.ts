// ─── کتابخانهٔ شبکه (محور دوم): انواع ماژول ───
// محتوای همرسان‌شدهٔ محلی (origin='local': تمرین/کارت آماده، طرح درمان، سند خام)
// + برگزیده‌های توزیع‌شده از کنترل‌پلین (origin='cp'، فقط با پیشوند cp-content-).
// قرارداد CP: docs/cp-node-content-hub.md

// 1.25.48 m6 — گونه‌های کامل کتابخانه هم‌قرارداد با CP: card=document/clearbook هم می‌آیند
// (doc محلی سر جایش است) — بازسازی CHECK در مایگریشن 0099 انجام شده است.
export const CONTENT_KINDS = ['exercise', 'card', 'document', 'plan', 'doc', 'clearbook'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  exercise: 'تمرین / کارت آماده',
  card: 'بازی آماده',
  document: 'سند خام',
  plan: 'طرح درمان',
  doc: 'سند خام',
  clearbook: 'کلر بوک مرکز'
};

/** امتیاز شناسنامه — مولدِ سامانهٔ کلاینت مبدأ (فرمول v1)؛ fallback CP برچسب می‌خورد */
export interface NetworkScore {
  score: number;
  refs: number;
  uses: number;
  refScore: number;
  useScore: number;
  formulaVersion: number;
  source: string;
  generatedAt?: string | null;
}

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
  /** زیردستهٔ واقعی ماژول مبدأ — calendar/phase برای کلربوک (m6) */
  subcategory: string | null;
  /** طراح تمرین — پایان‌بندی اعتبار اثر در زیرمجموعه (m6) */
  authorName: string | null;
  coAuthorName: string | null;
  fileName: string | null;
  fileSize: number | null;
  externalUrl: string | null;
  /** شناسنامهٔ JSON مبدأ (امتیاز/فازها/سنجه‌ها) */
  quality: Record<string, unknown> | null;
  /** امتیاز استخراج‌شدهٔ شناسنامه — null یعنی مبدأ امتیاز نفرستاده */
  score: NetworkScore | null;
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
  /** m6 — افزودن برگزیدهٔ شبکه (کارت آماده) به بانک کارت محلی با حفظ اثر طراح */
  installFromNetwork(actor: { id: string }, id: string): Promise<{ localExerciseId: string; title: string }>;
  /** m6 — فایل آیتم CP (فقط-خواندنی با کلید نود)؛ undefined = در دسترس نیست */
  cpFile(id: string): Promise<{ bytes: ArrayBuffer; mime: string; fileName: string } | undefined>;
}
