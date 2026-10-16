/**
 * ماژول پروندهٔ دانش‌آموز — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول student-profile — تنها نقطه import ماژول‌های دیگر

export { createStudentProfileService } from './service';
export { registerRoutes } from './routes';
export type {
  NewSchoolInput,
  NewStudentInput,
  School,
  Student,
  StudentDirectoryStats,
  StudentProfileDeps,
  StudentProfileService,
  StudentSearchFilters,
  UpdateSchoolInput,
  UpdateStudentInput
} from './types';
