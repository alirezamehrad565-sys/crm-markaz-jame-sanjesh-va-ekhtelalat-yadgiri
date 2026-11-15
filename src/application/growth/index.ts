// ماژول گزارش رشد جدول‌ها — ف۴ طرح ارتقا (بهداشت داده): شمارش روزانه در کرون + گزارش فقط‌مدیر
export { createGrowthService, policyOfTable, GROWTH_SNAPSHOT_SEAL_KEY, GROWTH_SEAL_HOURS, GROWTH_TABLE_SELF } from './service';
export type { GrowthService, GrowthCaptureResult, GrowthReport, GrowthTableReport, GrowthDeps } from './service';
export { registerGrowthRoutes } from './routes';
