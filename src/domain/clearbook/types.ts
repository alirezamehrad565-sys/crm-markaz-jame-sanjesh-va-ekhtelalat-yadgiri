import type { AuthContext, ClearbookPlanStatus } from '@core/shared';

// ─── m188 — کلر بوک مرکز: انواع ماژول ───

export interface ClearbookAttachmentMeta {
  id: string;
  filename: string;
  mime: string;
  size: number;
  kind: 'image' | 'doc';
  caption: string | null;
}

export interface ClearbookEntryRecord {
  id: string;
  planId: string | null;
  title: string;
  body: string;
  eventDate: string; // Gregorian YMD
  tags: string[];
  attachments: ClearbookAttachmentMeta[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClearbookPlanEvidence {
  count: number;
  thumbs: { entryId: string; fileId: string }[]; // تا ۳ عکس آخر برای پیش‌نمایش کارت
}

export interface ClearbookPlanRecord {
  id: string;
  title: string;
  adminActions: string;
  centerActions: string;
  fromDate: string; // Gregorian YMD
  toDate: string | null;
  status: ClearbookPlanStatus;
  tag: string | null;
  sortOrder: number;
  evidence: ClearbookPlanEvidence;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClearbookEntryListOpts {
  from?: string; // YMD inclusive
  to?: string; // YMD inclusive
  tag?: string;
  q?: string;
  planId?: string;
  limit: number;
  offset: number;
}

export interface ClearbookNewEntryInput {
  title: string;
  body: string;
  eventDate: string;
  planId: string | null;
  tags: string[];
}

export interface ClearbookUpdateEntryInput {
  title?: string;
  body?: string;
  eventDate?: string;
  planId?: string | null;
  tags?: string[];
}

export interface ClearbookNewPlanInput {
  title: string;
  adminActions: string;
  centerActions: string;
  fromDate: string;
  toDate: string | null;
  status: ClearbookPlanStatus;
  tag: string | null;
}

export interface ClearbookUpdatePlanInput {
  title?: string;
  adminActions?: string;
  centerActions?: string;
  fromDate?: string;
  toDate?: string | null;
  status?: ClearbookPlanStatus;
  tag?: string | null;
}

export interface ClearbookFileBytesInput {
  filename: string;
  mimeType: string;
  segments: Uint8Array[];
  size: number;
}

export interface ClearbookService {
  // خط زمانی — رویدادها
  listEntries(opts: ClearbookEntryListOpts): Promise<{ items: ClearbookEntryRecord[]; hasMore: boolean }>;
  getEntry(id: string): Promise<ClearbookEntryRecord | null>;
  createEntry(input: ClearbookNewEntryInput, actor: AuthContext): Promise<ClearbookEntryRecord>;
  updateEntry(id: string, input: ClearbookUpdateEntryInput, actor: AuthContext): Promise<ClearbookEntryRecord>;
  removeEntry(id: string, actor: AuthContext): Promise<{ id: string }>;

  // پیوست‌ها
  addFiles(id: string, files: ClearbookFileBytesInput[], actor: AuthContext): Promise<ClearbookEntryRecord>;
  beginChunkedUpload(id: string, input: { filename: string; mimeType: string; size: number }, actor: AuthContext): Promise<{ fileId: string }>;
  putUploadChunk(id: string, fileId: string, seq: number, bytes: Uint8Array, actor: AuthContext): Promise<{ received: number }>;
  completeChunkedUpload(id: string, fileId: string, actor: AuthContext): Promise<ClearbookEntryRecord>;
  updateAttachmentCaption(id: string, fileId: string, caption: string | null, actor: AuthContext): Promise<ClearbookEntryRecord>;
  deleteAttachment(id: string, fileId: string, actor: AuthContext): Promise<ClearbookEntryRecord>;
  getAttachmentFile(id: string, fileId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string; kind: string } | null>;

  // تقویم اجرایی — فازها
  listPlans(): Promise<ClearbookPlanRecord[]>;
  createPlan(input: ClearbookNewPlanInput, actor: AuthContext): Promise<ClearbookPlanRecord>;
  updatePlan(id: string, input: ClearbookUpdatePlanInput, actor: AuthContext): Promise<ClearbookPlanRecord>;
  removePlan(id: string, actor: AuthContext): Promise<{ id: string }>;
  reorderPlans(ids: string[], actor: AuthContext): Promise<{ count: number }>;
  seedTemplate(startYear: number, actor: AuthContext): Promise<{ count: number }>;
  copyYear(fromYear: number, toYear: number, actor: AuthContext): Promise<{ count: number }>;

  // فیلترها
  listTags(): Promise<{ tag: string; count: number }[]>;
  listYears(): Promise<number[]>;
}
