// ماژول پنل سلامت — ف۱ طرح ارتقا (CP-3): وضعیت سامانه + وضعیت لینک CP از مُهرهای موجود
// ف۵ (P0-3) — هشدار خودکار روی رانش مُهر تلاش/موفقیت + جهش خطاهای مرورگر (alerts.ts)
export { createHealthService } from './service';
export type { HealthService, HealthPanelData, HealthChannelStatus, HealthDeps, HealthAlert } from './service';
export { registerHealthRoutes } from './routes';
export {
  runAlertCycle,
  deriveAlerts,
  readAlertsSeal,
  parseClientErrorsMax,
  alertsDisabledFlag,
  ALERTS_SEAL_KEY,
  ALERT_CLIENT_ERRORS_MAX_DEFAULT
} from './alerts';
export type { AlertCycleOutcome, AlertCycleDeps } from './alerts';
