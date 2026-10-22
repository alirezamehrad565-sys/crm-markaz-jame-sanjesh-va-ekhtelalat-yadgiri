/**
 * ماژول بانک تمرین — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های بانک تمرین — مالک جدول‌های exercises / exercise_tags /
// exercise_assignments / exercise_files (blob پیش‌فرض D1) و کاربر bot_menu_state
// بستهٔ تمرینی (exercise_packages) + بستهٔ تکلیف (exercise_batches)

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, TagRef } from '@core/shared';
import type { ObjectStore } from '@core/storage';

export type ExerciseFormat = 'worksheet' | 'game' | 'instruction';

export type AssignmentVia = 'bot' | 'panel';
/** -c — وضعیت corrected اضافه شد (تصحیح با بازخورد متنی — ستون DB بدون CHECK است) */
export type AssignmentStatus = 'assigned' | 'done' | 'corrected' | 'cancelled';
export interface ExerciseFileMeta {
  filename: string;
  mime: string;
  size: number;
}

/** رکورد تمرین — شکل پاسخ API (camelCase) */
export interface ExerciseRecord {
  id: string;
  title: string;
  description: string | null;
  format: ExerciseFormat;
  published: boolean;
  /** — لینک بازی/تمرین آنلاین بیرونی (سرویس خارجی) */
  externalUrl: string | null;
  tags: TagRef[];
  /** فایل اصلی — آینهٔ اولین پیوست (سازگاری بات/لینک خانواده) */
  file: ExerciseFileMeta | null;
  /** — همهٔ پیوست‌ها به ترتیب ثبت */
  files: ExerciseFileMetaWithId[];
  /** — آمار مصرف: چند بار برای دانش‌آموزان ارسال شده */
  assignCount?: number;
  createdBy: string;
  /** — m166: هم‌ساز (سازندهٔ دوم) — امتیاز تولید محتوا بین این دو نصف می‌شود */
  coCreatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewExerciseFileInput {
  filename: string;
  mimeType: string;
  contentB64: string;
}

/** — فایل باینری مستقیم (مسیر multipart پخش‌جریانی — بدون concat کامل) */
export interface NewExerciseFileBytesInput {
  filename: string;
  mimeType: string;
  /** قطعات باینری به‌ترتیب — پیوستهٔ آن‌ها = فایل کامل */
  segments: Uint8Array[];
  /** مجموع طول قطعات — برای اعتبارسنجی بدون دست‌زدن به محتوا */
  size: number;
}

/** — پیوست با شناسه (برای دانلود/حذف تکی) */
export interface ExerciseFileMetaWithId extends ExerciseFileMeta {
  id: string;
}

export interface NewExerciseInput {
  title: string;
  description?: string | null;
  format: ExerciseFormat;
  externalUrl?: string | null;
  tagIds?: string[];
  /** — m166: هم‌ساز (سازندهٔ دوم) — باید کارمند فعال و مخالف سازندهٔ اصلی باشد */
  coCreatedBy?: string | null;
  published?: boolean;
  file?: NewExerciseFileInput | null;
}

export interface UpdateExerciseInput {
  title?: string;
  description?: string | null;
  format?: ExerciseFormat;
  externalUrl?: string | null;
  tagIds?: string[];
  /** — m166: هم‌ساز — undefined یعنی دست نزن؛ null یعنی بردار */
  coCreatedBy?: string | null;
  published?: boolean;
}

/** — m140: ورودی انتقال مالکیت تمرین (مسیر اختصاصی مدیر) */
export interface ReassignExerciseInput {
  staffId: string;
  reason?: string | null;
}

/** — m140: نتیجهٔ انتقال مالکیت — unchanged=true یعنی مالک از قبل همان بود (بدون نوشتن) */
export interface ReassignExerciseResult {
  record: ExerciseRecord;
  unchanged: boolean;
}

export interface ListExercisesFilters {
  /** جستجوی متنی در عنوان و توضیح */
  q?: string;
  /** فیلتر یک برچسب (پایه یا اختلال یا هر برچسب دیگر) */
  tagId?: string;
  /** — فیلتر چندبرچسبی با منطق AND (ناوبری تو در تو: اختلال + پایه) */
  tagIds?: string[];
  /** فقط منتشرشده‌ها (مصرف بات) */
  publishedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/** — شمارش تمرین‌های هر برچسب + کل (کاشی‌های دستهٔ اختلال در ناوبری تو در تو) */
export interface ExerciseFacets {
  counts: Record<string, number>;
  total: number;
}

export interface ExerciseListResult {
  items: ExerciseRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ExerciseCategoryGroup {
  disorder: TagRef[];
  grade: TagRef[];
  other: TagRef[];
}

// ─── بستهٔ تمرینی (پروتکل) ───

/** آیتم بسته — تمرین به‌همراه نام (شکل پاسخ API) */
export interface PackageItem {
  exerciseId: string;
  exerciseTitle: string;
  format: ExerciseFormat;
  position: number;
}

/** رکورد بستهٔ تمرینی — پاسخ API (camelCase) */
export interface ExercisePackageRecord {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  tags: TagRef[];
  items: PackageItem[];
  /** آمار مصرف — چند بار این بسته ارسال شده */
  sendCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewPackageInput {
  title: string;
  description?: string | null;
  exerciseIds: string[];
  tagIds?: string[];
  published?: boolean;
}

export interface UpdatePackageInput {
  title?: string;
  description?: string | null;
  exerciseIds?: string[];
  tagIds?: string[];
  published?: boolean;
}

export interface ListPackagesFilters {
  q?: string;
  tagId?: string;
  publishedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PackageListResult {
  items: ExercisePackageRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** پیشنهاد برچسب‌محور برای یک دانش‌آموز — همان الگوی چک‌لیست */
export interface ExerciseSuggestion {
  exercise: ExerciseRecord;
  matched: { id: string; name: string }[];
  score: number;
}

export interface PackageSuggestion {
  pkg: ExercisePackageRecord;
  matched: { id: string; name: string }[];
  score: number;
}

export interface StudentExerciseSuggestions {
  exercises: ExerciseSuggestion[];
  packages: PackageSuggestion[];
}

// ─── بستهٔ تکلیف (یک ارسال چندتمرینه) ───

/** وضعیت هر تمرین در بستهٔ تکلیف — snapshot برای پروفایل */
export interface BatchItemRecord {
  assignmentId: string;
  exerciseId: string;
  exerciseTitle: string;
  format: ExerciseFormat;
  /** — لینک بازی/تمرین آنلاین بیرونی */
  externalUrl: string | null;
  status: AssignmentStatus;
  feedback: string | null;
  gradedAt: string | null;
  /** آخرین بازگشتی خانواده برای این تکلیف */
  submission: {
    id: string;
    filename: string | null;
    note: string | null;
    createdAt: string;
  } | null;
}

/** رکورد بستهٔ تکلیف — پاسخ API پروفایل */
export interface BatchRecord {
  id: string;
  studentId: string;
  studentName: string;
  packageId: string | null;
  title: string;
  note: string | null;
  assignedBy: string;
  assignedByName: string | null;
  assignedVia: AssignmentVia;
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
  items: BatchItemRecord[];
}

export interface CreateBatchInput {
  studentId: string;
  packageId?: string | null;
  exerciseIds?: string[];
  note?: string | null;
  /** staff id یا class:<classId> — معلم مدرسه ردیف staff ندارد */
  assignedBy: string;
  via: AssignmentVia;
}

/** — ناظر ارسال بستهٔ تکلیف — در api-routing به هستهٔ صف اعلان وصل می‌شود */
export interface BatchSendObserverInput {
  studentId: string;
  chats: string[];
  template: 'homework_assigned';
  vars: { studentName: string; extra: string };
  dedupBase: string;
}
export type BatchSendObserver = (input: BatchSendObserverInput) => Promise<number>;

export interface AssignExerciseInput {
  exerciseId: string;
  studentId: string;
  /** staff id یا class:<classId> — معلم مدرسه ردیف staff ندارد */
  assignedBy: string;
  via: AssignmentVia;
  note?: string | null;
}

export interface AssignmentRecord {
  id: string;
  exerciseId: string;
  exerciseTitle: string;
  studentId: string;
  studentName: string;
  assignedBy: string;
  via: AssignmentVia;
  note: string | null;
  status: AssignmentStatus;
  createdAt: string;
  // ─── c — تصحیح تکلیف ───
  feedback: string | null;
  gradedBy: string | null;
  gradedByName: string | null;
  gradedAt: string | null;
}

// ─── حلقهٔ بازگشت فایل ───

/** رکورد نتیجهٔ بازگشتی خانواده — پاسخ API پنل (camelCase) */
export interface SubmissionRecord {
  id: string;
  assignmentId: string;
  exerciseId: string;
  exerciseTitle: string;
  studentId: string;
  studentName: string;
  file: ExerciseFileMeta | null;
  note: string | null;
  sourceChatId: string | null;
  createdAt: string;
  /** -c — وضعیت تکلیف مادر + بازخورد تصحیح (پنل) */
  assignment: {
    status: AssignmentStatus;
    feedback: string | null;
    gradedAt: string | null;
  };
}

export interface AddSubmissionInput {
  assignmentId: string;
  studentId: string;
  file: NewExerciseFileInput;
  /** چت بلهٔ فرستنده (ولیّ) */
  sourceChatId?: string | null;
  /** کپشن پیام خانواده */
  note?: string | null;
}

export interface ListSubmissionsFilters {
  studentId?: string;
  assignmentId?: string;
  limit?: number;
}

/** مقصود پیام رسانه‌ای خانواده — تصمیم قطعی مسیر (auto/pick/extra/none) */
export type SubmissionTarget =
  | { mode: 'auto'; assignment: AssignmentRecord }
  | { mode: 'pick'; assignments: AssignmentRecord[] }
  | { mode: 'extra'; assignment: AssignmentRecord }
  | { mode: 'none' };

export interface ExerciseBankDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** ذخیرهٔ فایل — D1 پیش‌فرض، R2 با binding */
  storage: ObjectStore;
  /** secret امضای لینک دانلود خانواده (HMAC) */
  downloadSecret: string;
  /** — آدرس عمومی سایت برای لینک دانلود در پیام بستهٔ تکلیف — خالی یعنی بدون لینک */
  publicBaseUrl?: string | null;
  /** — ساعت فعلی (تست‌پذیری پنجرهٔ پیوست) */
  now?: () => Date;
}

/** — سقف‌های بارگذاری برای پنل (از meta خوانده می‌شود) */
export interface ExerciseUploadLimits {
  storage: 'd1' | 'r2';
  maxFileBytes: number;
  maxFilesPerUpload: number;
}

export interface ExerciseBankService {
  /** نام آداپتر ذخیرهٔ فعال — برای meta پنل */
  readonly storageName: 'd1' | 'r2';

  // ─── بستهٔ تمرینی ───
  /** فهرست بسته‌ها با فیلتر جستجو/برچسب/انتشار و صفحه‌بندی */
  listPackages(filters: ListPackagesFilters, actor: AuthContext): Promise<PackageListResult>;
  getPackageById(id: string): Promise<ExercisePackageRecord | null>;
  createPackage(input: NewPackageInput, actor: AuthContext): Promise<ExercisePackageRecord>;
  updatePackage(id: string, input: UpdatePackageInput, actor: AuthContext): Promise<ExercisePackageRecord>;
  /** حذف نرم بسته — بسته از بات و فهرست‌ها می‌رود */
  softDeletePackage(id: string, actor: AuthContext): Promise<void>;

  // ─── پیشنهاد برچسب‌محور + بستهٔ تکلیف + ارسال پنل ───
  /** پیشنهاد تمرین/بستهٔ مناسب بر اساس برچسب‌های دانش‌آموز (فقط منتشرشده‌ها) */
  suggestForStudent(studentId: string): Promise<StudentExerciseSuggestions>;
  /** ساخت بستهٔ تکلیف: N تکلیف + افزایش آمار مصرف + audit — ارسال با sendBatch */
  createBatch(input: CreateBatchInput, actor: AuthContext): Promise<BatchRecord>;
  /** فهرست بسته‌های تکلیف دانش‌آموز (پروفایل) — آیتم‌ها با وضعیت و آخرین بازگشتی */
  listBatches(filters: { studentId: string; limit?: number }): Promise<BatchRecord[]>;
  /** ارسال/یادآوری بستهٔ تکلیف به چت ولیّ‌ها با لینک امن دانلود (observer → صف بله) */
  sendBatch(batchId: string, input: { note?: string | null }, actor: AuthContext): Promise<{ sent: number; targets: string[] }>;
  /** ناظر ارسال — در api-routing به هستهٔ صف اعلان وصل می‌شود (الگوی caseEvents) */
  setSendObserver(observer: BatchSendObserver | null): void;

  /** — سقف‌های بارگذاری فعال (آداپتر محور) */
  readonly limits: ExerciseUploadLimits;

  /** فهرست تمرین‌ها با فیلتر جستجو/برچسب/انتشار و صفحه‌بندی */
  list(filters: ListExercisesFilters, actor: AuthContext): Promise<ExerciseListResult>;
  /** — شمارش تمرین هر برچسب برای کاشی‌های دسته */
  facets(): Promise<ExerciseFacets>;
  getById(id: string): Promise<ExerciseRecord | null>;
  create(input: NewExerciseInput, actor: AuthContext): Promise<ExerciseRecord>;
  update(id: string, input: UpdateExerciseInput, actor: AuthContext): Promise<ExerciseRecord>;
  /** — m140: انتقال مالکیت تمرین — فقط مدیر؛ ویرایش ساده (update) هرگز created_by را تغییر نمی‌دهد */
  reassign(id: string, input: ReassignExerciseInput, actor: AuthContext): Promise<ReassignExerciseResult>;
  /** حذف نرم — تمرین از بات و فهرست‌ها می‌رود؛ فایل حذف نمی‌شود */
  softDelete(id: string, actor: AuthContext): Promise<void>;
  /** تعویض/ثبت فایل یک تمرین موجود (فایل اصلی — مسیر قدیمی JSON) */
  putFile(id: string, file: NewExerciseFileInput, actor: AuthContext): Promise<ExerciseRecord>;
  /** — افزودن چند فایل به تمرین (multipart باینری) — سقف تعداد و حجم در سرویس */
  addFiles(id: string, files: NewExerciseFileBytesInput[], actor: AuthContext): Promise<ExerciseRecord>;
  /** — شروع بارگذاری پیوستهٔ یک فایل بزرگ — ردیف پیوست ساخته می‌شود */
  beginChunkedUpload(
    id: string,
    input: { filename: string; mimeType: string; size: number },
    actor: AuthContext
  ): Promise<{ fileId: string }>;
  /** — دریافت یک تکهٔ خام (≤ ۱ مگابایت) */
  putUploadChunk(id: string, fileId: string, seq: number, bytes: Uint8Array, actor: AuthContext): Promise<{ received: number }>;
  /** — پایان بارگذاری پیوسته — هم‌خوانی تکه‌ها با حجم اعلام‌شده */
  completeChunkedUpload(id: string, fileId: string, actor: AuthContext): Promise<ExerciseRecord>;
  /** — حذف یک پیوست؛ اگر اصلی بود، قدیمی‌ترین پیوست بعدی اصلی می‌شود */
  deleteAttachment(id: string, fileId: string, actor: AuthContext): Promise<ExerciseRecord>;
  /** — دانلود یک پیوست مشخص برای کارکنان */
  getAttachmentFile(id: string, fileId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
  /** دانلود برای کارکنان (auth پنل) */
  getFile(id: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
  /** دانلود خانواده با توکن امضاشده — فقط تمرین منتشرشده و فعال (: پیوست مشخص هم) */
  getPublicFile(id: string, token: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
  /** ساخت لینک امضاشده برای پیام خانواده (: fileId اختیاری برای پیوست مشخص) */
  mintDownloadToken(exerciseId: string, fileId?: string | null): Promise<string>;
  /** تأیید توکن — معتبر → {exerciseId, fileId}، نامعتبر/منقضی → null */
  verifyDownloadToken(token: string): Promise<{ exerciseId: string; fileId: string | null } | null>;
  /** برچسب‌های فعال به تفکیک دسته (منوی بات + فیلترهای پنل) */
  categories(): Promise<ExerciseCategoryGroup>;
  /** ثبت تکلیف برای دانش‌آموز (ارسال به خانواده در application/notify انجام می‌شود) */
  assign(input: AssignExerciseInput, actor: AuthContext): Promise<AssignmentRecord>;
  listAssignments(filters: { studentId?: string; exerciseId?: string; limit?: number }): Promise<AssignmentRecord[]>;

  // ─── c — تصحیح تکلیف (وضعیت + بازخورد متنی) ───
  /** تصحیح تکلیف انجام‌شده: feedback ثبت، status=corrected، audit و اعلان خانواده (observer) */
  gradeAssignment(assignmentId: string, input: { feedback: string }, actor: AuthContext): Promise<AssignmentRecord>;
  /** ناظر تصحیح — در api-routing به اعلان خانواده وصل می‌شود (خطا عملیات را fail نمی‌کند) */
  setGradeObserver(observer: (record: AssignmentRecord) => Promise<void>): void;

  // ─── حلقهٔ بازگشت فایل ───
  /** تکلیف‌های باز (assigned) دانش‌آموزان متصل یک chat — ورودی تصمیم auto/pick */
  resolveSubmissionTarget(studentIds: string[]): Promise<SubmissionTarget>;
  /** ثبت نتیجهٔ بازگشتی + done شدن تکلیف + audit — بازیگر بات یا پنل */
  addSubmission(input: AddSubmissionInput, actor: AuthContext): Promise<SubmissionRecord>;
  /** فهرست بازگشتی‌ها (پنل) */
  listSubmissions(filters: ListSubmissionsFilters): Promise<SubmissionRecord[]>;
  /** دانلود فایل بازگشتی برای کارکنان */
  getSubmissionFile(submissionId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
}
