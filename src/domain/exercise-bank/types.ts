import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, TagRef } from '@core/shared';
import type { ObjectStore } from '@core/storage';

export type ExerciseFormat = 'worksheet' | 'game' | 'instruction';

export type AssignmentVia = 'bot' | 'panel';
export type AssignmentStatus = 'assigned' | 'done' | 'corrected' | 'cancelled';
export interface ExerciseFileMeta {
  filename: string;
  mime: string;
  size: number;
}

export interface ExerciseRecord {
  id: string;
  title: string;
  description: string | null;
  format: ExerciseFormat;
  published: boolean;
  externalUrl: string | null;
  tags: TagRef[];
  file: ExerciseFileMeta | null;
  files: ExerciseFileMetaWithId[];
  assignCount?: number;
  createdBy: string;
  coCreatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewExerciseFileInput {
  filename: string;
  mimeType: string;
  contentB64: string;
}

export interface NewExerciseFileBytesInput {
  filename: string;
  mimeType: string;
  segments: Uint8Array[];
  size: number;
}

export interface ExerciseFileMetaWithId extends ExerciseFileMeta {
  id: string;
}

export interface NewExerciseInput {
  title: string;
  description?: string | null;
  format: ExerciseFormat;
  externalUrl?: string | null;
  tagIds?: string[];
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
  coCreatedBy?: string | null;
  published?: boolean;
}

export interface ReassignExerciseInput {
  staffId: string;
  reason?: string | null;
}

export interface ReassignExerciseResult {
  record: ExerciseRecord;
  unchanged: boolean;
}

export interface ListExercisesFilters {
  q?: string;
  tagId?: string;
  tagIds?: string[];
  publishedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

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

export interface PackageItem {
  exerciseId: string;
  exerciseTitle: string;
  format: ExerciseFormat;
  position: number;
}

export interface ExercisePackageRecord {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  tags: TagRef[];
  items: PackageItem[];
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

export interface BatchItemRecord {
  assignmentId: string;
  exerciseId: string;
  exerciseTitle: string;
  format: ExerciseFormat;
  externalUrl: string | null;
  status: AssignmentStatus;
  feedback: string | null;
  gradedAt: string | null;
  submission: {
    id: string;
    filename: string | null;
    note: string | null;
    createdAt: string;
  } | null;
}

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
  assignedBy: string;
  via: AssignmentVia;
}

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
  feedback: string | null;
  gradedBy: string | null;
  gradedByName: string | null;
  gradedAt: string | null;
}

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
  sourceChatId?: string | null;
  note?: string | null;
}

export interface ListSubmissionsFilters {
  studentId?: string;
  assignmentId?: string;
  limit?: number;
}

export type SubmissionTarget =
  | { mode: 'auto'; assignment: AssignmentRecord }
  | { mode: 'pick'; assignments: AssignmentRecord[] }
  | { mode: 'extra'; assignment: AssignmentRecord }
  | { mode: 'none' };

export interface ExerciseBankDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  storage: ObjectStore;
  downloadSecret: string;
  publicBaseUrl?: string | null;
  now?: () => Date;
}

export interface ExerciseUploadLimits {
  storage: 'd1' | 'r2';
  maxFileBytes: number;
  maxFilesPerUpload: number;
}

export interface ExerciseBankService {
  readonly storageName: 'd1' | 'r2';

  listPackages(filters: ListPackagesFilters, actor: AuthContext): Promise<PackageListResult>;
  getPackageById(id: string): Promise<ExercisePackageRecord | null>;
  createPackage(input: NewPackageInput, actor: AuthContext): Promise<ExercisePackageRecord>;
  updatePackage(id: string, input: UpdatePackageInput, actor: AuthContext): Promise<ExercisePackageRecord>;
  softDeletePackage(id: string, actor: AuthContext): Promise<void>;

  suggestForStudent(studentId: string): Promise<StudentExerciseSuggestions>;
  createBatch(input: CreateBatchInput, actor: AuthContext): Promise<BatchRecord>;
  listBatches(filters: { studentId: string; limit?: number }): Promise<BatchRecord[]>;
  sendBatch(batchId: string, input: { note?: string | null }, actor: AuthContext): Promise<{ sent: number; targets: string[] }>;
  setSendObserver(observer: BatchSendObserver | null): void;

  readonly limits: ExerciseUploadLimits;

  list(filters: ListExercisesFilters, actor: AuthContext): Promise<ExerciseListResult>;
  facets(): Promise<ExerciseFacets>;
  getById(id: string): Promise<ExerciseRecord | null>;
  create(input: NewExerciseInput, actor: AuthContext): Promise<ExerciseRecord>;
  update(id: string, input: UpdateExerciseInput, actor: AuthContext): Promise<ExerciseRecord>;
  reassign(id: string, input: ReassignExerciseInput, actor: AuthContext): Promise<ReassignExerciseResult>;
  softDelete(id: string, actor: AuthContext): Promise<void>;
  putFile(id: string, file: NewExerciseFileInput, actor: AuthContext): Promise<ExerciseRecord>;
  addFiles(id: string, files: NewExerciseFileBytesInput[], actor: AuthContext): Promise<ExerciseRecord>;
  beginChunkedUpload(
    id: string,
    input: { filename: string; mimeType: string; size: number },
    actor: AuthContext
  ): Promise<{ fileId: string }>;
  putUploadChunk(id: string, fileId: string, seq: number, bytes: Uint8Array, actor: AuthContext): Promise<{ received: number }>;
  completeChunkedUpload(id: string, fileId: string, actor: AuthContext): Promise<ExerciseRecord>;
  deleteAttachment(id: string, fileId: string, actor: AuthContext): Promise<ExerciseRecord>;
  getAttachmentFile(id: string, fileId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
  getFile(id: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
  getPublicFile(id: string, token: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
  mintDownloadToken(exerciseId: string, fileId?: string | null): Promise<string>;
  verifyDownloadToken(token: string): Promise<{ exerciseId: string; fileId: string | null } | null>;
  categories(): Promise<ExerciseCategoryGroup>;
  assign(input: AssignExerciseInput, actor: AuthContext): Promise<AssignmentRecord>;
  listAssignments(filters: { studentId?: string; exerciseId?: string; limit?: number }): Promise<AssignmentRecord[]>;

  gradeAssignment(assignmentId: string, input: { feedback: string }, actor: AuthContext): Promise<AssignmentRecord>;
  setGradeObserver(observer: (record: AssignmentRecord) => Promise<void>): void;

  resolveSubmissionTarget(studentIds: string[]): Promise<SubmissionTarget>;
  addSubmission(input: AddSubmissionInput, actor: AuthContext): Promise<SubmissionRecord>;
  listSubmissions(filters: ListSubmissionsFilters): Promise<SubmissionRecord[]>;
  getSubmissionFile(submissionId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
}
