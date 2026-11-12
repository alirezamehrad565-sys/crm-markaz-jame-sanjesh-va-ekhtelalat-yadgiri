/**
 * rust-f7 — نقطهٔ ورود ماژول «راه‌اندازی نخست و اتصال ابر» (چانک lazy خط rust)
 *
 * هوک‌های وب (app.js و views/settings.js) فقط با گارد globalThis.__DESKTOP_SHELL__
 * و dynamic import به این ماژول می‌رسند؛ در وب تولیدی چانک هرگز fetch نمی‌شود.
 *
 * صادرات عمومی:
 *   maybeRunSetup     — ویزار نخست (app.js، پیش از توتوریال)
 *   cloudSetupSection — بخش «اتصال ابر» (تنظیمات)
 */

export { SETUP_FEATURE, setupFlagEnabled, desktopShellChannel, shellFeatureEnabled } from './flags.js';
export type { SetupFeatureFlags } from './flags.js';
export {
  CLOUD_CONN_KEY,
  SECRET_CF_TOKEN,
  SECRET_NODE_KEY,
  completeCloudSetup,
  emptyCloudRecord,
  insecureFallbackStore,
  loadCloudRecord,
  localStorageStore,
  readSecret,
  resetCloudRecord,
  resolveSecureStore,
  saveCloudRecord,
  setCloudStore,
  stampVerify,
  tauriSecureStore
} from './state.js';
export type {
  CloudConnRecord,
  CloudStore,
  CloudVerifyOutcome,
  SecureStore,
  VerifyStamp
} from './state.js';
export { normalizeWorkerUrl, verifyCloudNode, verifyCloudToken } from './verify.js';
export type { FetchLike, NodeVerifyInput, TokenVerifyInput, VerifyResult } from './verify.js';
export { openSetupWizard } from './wizard.js';
export type { SetupWizardDeps, SetupWizardHandle } from './wizard.js';
export {
  buildCloudSection,
  buildWizardShell,
  csButton,
  csEl,
  csInput,
  csRow,
  defaultCloudDocument,
  outcomeFa,
  renderWizardStep
} from './dom-build.js';
export type { CsDocument, CsElement, WizardRefs } from './dom-build.js';
export { cloudSetupSection, maybeRunSetup, setCloudSetupDepsForTests } from './run.js';
export type { RunDeps, SetupUser } from './run.js';
