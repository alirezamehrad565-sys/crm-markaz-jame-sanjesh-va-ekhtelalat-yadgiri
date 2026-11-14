/**
 * rust-f3 — نقطهٔ ورود ماژول توتوریال (چانک lazy خط rust)
 *
 * هوک‌های وب (app.js و views/settings.js) فقط با گارد globalThis.__DESKTOP_SHELL__ === true
 * و dynamic import به این ماژول می‌رسند؛ در وب تولیدی چانک تور هرگز fetch نمی‌شود.
 *
 * صادرات عمومی:
 *   maybeStartTutorial   — آغاز/ادامهٔ تور (ورود نخست از app.js)
 *   tutorialRerunSection — بخش «اجرای دوبارهٔ راهنمای شروع» (انتهای renderSettings)
 */

export { TUTORIAL_FEATURE, tutorialFlagEnabled, desktopShellChannel } from './flags.js';
export type { TutorialFeatureFlags } from './flags.js';
export {
  allTutorialSteps,
  stepsForRole,
  supportedRole,
  MANAGER_STEPS,
  SECRETARY_STEPS,
  THERAPIST_STEPS
} from './steps.js';
export type { TutorialRole, TutorialStep } from './steps.js';
export {
  TUTORIAL_STATE_KEY,
  advanceTutorialState,
  completeTutorialState,
  emptyTutorialState,
  loadTutorialState,
  localStorageStore,
  resetTutorialState,
  setTutorialStore,
  skipTutorialState,
  startTutorialState,
  tutorialShouldAutoStart
} from './state.js';
export type { TutorialStateRecord, TutorialStatus, TutorialStore } from './state.js';
export {
  buildRerunSection,
  defaultTutorialDocument,
  faDigits
} from './dom-build.js';
export type { TutDocument, TutElement, TutRect } from './dom-build.js';
export {
  createTutorialOverlay,
  closeTutorialOverlay,
  isTutorialOverlayOpen
} from './overlay.js';
export type { TutorialOverlay, TutorialOverlayHandlers } from './overlay.js';
export { maybeStartTutorial, setTutorialDepsForTests, tutorialTargetRect } from './run.js';
export type { RunOptions, TutorialDeps, TutorialStartResult, TutorialUser } from './run.js';

import type { TutDocument, TutElement } from './dom-build.js';
import { buildRerunSection, defaultTutorialDocument } from './dom-build.js';
import { closeTutorialOverlay } from './overlay.js';
import { supportedRole } from './steps.js';
import { resetTutorialState } from './state.js';
import { maybeStartTutorial } from './run.js';

/**
 * بخش تنظیمات «اجرای دوبارهٔ راهنمای شروع» — انتهای renderSettings در پوستهٔ دسکتاپ.
 * نقش پشتیبانی‌نشده (ناظر) بخش خالی می‌گیرد؛ در وب این تابع هرگز صدا زده نمی‌شود.
 * کلیک دکمه: reset وضعیت + آغاز اجباری تور از داشبورد.
 */
export function tutorialRerunSection(userRole?: string | null): TutElement | null {
  const doc: TutDocument | null = defaultTutorialDocument();
  if (!doc) return null;
  return buildRerunSection(doc, () => {
    try {
      closeTutorialOverlay();
      resetTutorialState();
      void maybeStartTutorial({ role: supportedRole(userRole ?? null) ?? undefined }, { force: true });
    } catch {
      /* اجرای دوباره هرگز تنظیمات را نمی‌شکند */
    }
  });
}
