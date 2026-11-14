// src/application/system — دکمه‌های نجات (۴-۲) + بستهٔ خطا
export { registerSystemRoutes, registerSystemPublicRoutes, isRestartScheduled, RESTART_MARKER_KEY } from './routes';
export type { SystemRoutesDeps } from './routes';
export { buildErrorPackage, errorPackageStamp } from './error-package';
export type { ErrorPackageStatus, ErrorPackageResult } from './error-package';
export { buildStoreZip, zipText } from './zip';
export type { ZipEntry } from './zip';
