/**
 * ماژول بانک تمرین — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
//: بانک تمرین و کاربرگ + حلقهٔ تکلیف بله
// طراحی کامل: docs/EXERCISE-BANK.md

export { createExerciseBankService } from './service';
export type { ExerciseBankService } from './service';
export {
  normalizeExerciseTitle,
  estimateBase64Bytes,
  stripDataUrlPrefix,
  isAllowedExerciseMimeType,
  sanitizeFilename,
  validateExerciseFileInput,
  clampPage,
  pageWindow,
  truncateLabel
} from './pure';
export { registerExerciseBankRoutes } from './routes';
export type {
  ExerciseFormat,
  AssignmentVia,
  AssignmentStatus,
  ExerciseRecord,
  ExerciseFileMeta,
  NewExerciseInput,
  UpdateExerciseInput,
  ListExercisesFilters,
  ExerciseListResult,
  ExerciseCategoryGroup,
  AssignExerciseInput,
  AssignmentRecord,
  SubmissionRecord,
  AddSubmissionInput,
  ListSubmissionsFilters,
  SubmissionTarget,
  ExerciseBankDeps,
  NewExerciseFileInput,
  ExercisePackageRecord,
  PackageItem,
  NewPackageInput,
  UpdatePackageInput,
  ListPackagesFilters,
  PackageListResult,
  ExerciseSuggestion,
  PackageSuggestion,
  StudentExerciseSuggestions,
  BatchItemRecord,
  BatchRecord,
  CreateBatchInput
} from './types';
