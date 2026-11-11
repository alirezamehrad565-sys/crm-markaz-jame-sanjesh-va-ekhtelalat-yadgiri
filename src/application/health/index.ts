// ماژول پنل سلامت — ف۱ طرح ارتقا (CP-3): وضعیت سامانه + وضعیت لینک CP از مُهرهای موجود
export { createHealthService } from './service';
export type { HealthService, HealthPanelData, HealthChannelStatus, HealthDeps } from './service';
export { registerHealthRoutes } from './routes';
