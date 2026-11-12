/**
 * rust-f3 — مغز اجرای تور: maybeStartTutorial
 *
 * ورود نخست: هوک انتهای app.js فقط در پوستهٔ دسکتاپ (__DESKTOP_SHELL__) این تابع را با
 * dynamic import صدا می‌زند؛ login.js پس از ورود موفق location.reload() می‌زند، پس این
 * فراخوانی روی بوتِ پس از نشست معتبر رخ می‌دهد = «ورود نخست». وب: گات فلگ در نخستین
 * خط برمی‌گردد — نه DOM، نه fetch، نه تغییر مسیر (قید طلایی فاز ۳).
 *
 * قاعدهٔ «هرگز مسیر قفل نشود»: ناوبری با روتر (location.hash) انجام می‌شود و کاربر در
 * تمام طول تور آزاد است هر مسیری برود یا تور را رد کند؛ اگر عنصر هدف پیدا نشود هم تور
 * با حباب مرکزی ادامه می‌یابد — هیچ خطایی مسیر یا UI را قفل نمی‌کند.
 */

import { tutorialFlagEnabled } from './flags.js';
import { createTutorialOverlay, closeTutorialOverlay } from './overlay.js';
import type { TutorialOverlay } from './overlay.js';
import type { TutDocument, TutRect } from './dom-build.js';
import { defaultTutorialDocument, findStepTarget } from './dom-build.js';
import { stepsForRole, supportedRole } from './steps.js';
import type { TutorialRole, TutorialStep } from './steps.js';
import { TUTORIAL_STATE_KEY } from './state.js';
import {
  advanceTutorialState,
  completeTutorialState,
  loadTutorialState,
  setTutorialStore,
  skipTutorialState,
  startTutorialState,
  tutorialShouldAutoStart
} from './state.js';
import type { TutorialStore } from './state.js';

export interface TutorialUser {
  role?: string | null;
}

/** وابستگی‌های تزریق‌پذیر — در تولید همه از پیش‌فرض‌های واقعی می‌آیند */
export interface TutorialDeps {
  doc: TutDocument | null;
  navigate: (hash: string) => void;
  store: TutorialStore;
  /** انتظار برای رندر نمای مقصد پیش از هایلایت (پیش‌فرض: وقفهٔ کوتاه) */
  waitForView: () => Promise<void>;
}

function defaultStore(): TutorialStore {
  const ls = (globalThis as { localStorage?: TutorialStore }).localStorage;
  return ls ?? { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const DEFAULT_DEPS: TutorialDeps = {
  doc: null, // null یعنی «document واقعی در لحظهٔ اجرا»
  navigate(hash) {
    try {
      const loc = (globalThis as { location?: { hash: string } }).location;
      if (loc) loc.hash = hash;
    } catch {
      /* محیط بدون location — بی‌خطر رد می‌شود؛ تور هرگز نمی‌شکند */
    }
  },
  store: defaultStore(),
  waitForView: () => new Promise<void>((resolve) => {
    try {
      setTimeout(() => resolve(), 450); // فرصت رندر نمای lazy (الگوی lazyView روتر وب)
    } catch {
      resolve();
    }
  })
};

export type TutorialStartResult =
  | 'flag_off'         // وب یا پوستهٔ خاموش: هیچ کاری انجام نشد (رفتار تولید دست‌نخورده)
  | 'no_dom'           // کانال فعال است ولی DOM مرورگر در دسترس نیست
  | 'already_done'     // تور پیش‌تر کامل/رد شده و force هم نیامده
  | 'unsupported_role' // ناظر/نقش ناشناخته: تور نقش‌محور ندارد
  | 'started'          // آغاز تازه از گام صفر
  | 'resumed'          // ادامهٔ تور نیمه‌کاره از گام ذخیره‌شده
  | 'rerun';           // اجرای دوباره از تنظیمات (force)

/** جایگزینی وابستگی‌ها برای آزمون‌ها — در تولید هرگز صدا زده نمی‌شود */
export function setTutorialDepsForTests(deps: Partial<TutorialDeps> | null): void {
  if (deps) Object.assign(DEFAULT_DEPS, deps);
  else Object.assign(DEFAULT_DEPS, { doc: null, store: defaultStore() });
}

export interface RunOptions {
  /** اجرای دوباره از تنظیمات: وضعیت reset و تور از صفر */
  force?: boolean;
  deps?: Partial<TutorialDeps>;
}

/**
 * نقطهٔ ورود تور. همیشه بی‌استثنا برمی‌گردد (خطاها بلعیده می‌شوند — تور هرگز بوت پنل را
 * نمی‌شکند) و کد نتیجه برمی‌گرداند تا آزمون‌ها و هوک‌ها تکلیفشان روشن باشد.
 */
export async function maybeStartTutorial(
  user: TutorialUser | null | undefined,
  options: RunOptions = {}
): Promise<TutorialStartResult> {
  try {
    // گات دوکاناله — در وب همین‌جا تمام می‌شود: نه DOM، نه fetch، نه تغییر مسیر
    if (!tutorialFlagEnabled()) return 'flag_off';

    const deps: TutorialDeps = { ...DEFAULT_DEPS, ...(options.deps ?? {}) };
    const doc = deps.doc ?? defaultTutorialDocument();
    if (!doc) return 'no_dom';

    const role: TutorialRole | null = supportedRole(user?.role ?? null);
    if (!role) return 'unsupported_role';

    const steps: TutorialStep[] = stepsForRole(role);
    setTutorialStore(deps.store);

    if (options.force === true) {
      closeTutorialOverlay();
      try {
        deps.store.removeItem(TUTORIAL_STATE_KEY);
      } catch {
        /* بی‌اثر */
      }
      return await launch(doc, steps, role, 0, 'rerun', deps);
    }

    const state = loadTutorialState();
    if (!tutorialShouldAutoStart(role)) return 'already_done';

    if (state.status === 'active' && state.role === role) {
      const idx = Math.min(Math.max(0, state.stepIndex), steps.length - 1);
      return await launch(doc, steps, role, idx, 'resumed', deps);
    }
    return await launch(doc, steps, role, 0, 'started', deps);
  } catch {
    return 'flag_off'; // آخرین دفاع: تور هرگز اثر جانبی روی بوت پنل نگذارد
  }
}

async function launch(
  doc: TutDocument,
  steps: TutorialStep[],
  role: TutorialRole,
  startIndex: number,
  code: 'started' | 'resumed' | 'rerun',
  deps: TutorialDeps
): Promise<TutorialStartResult> {
  let startIdx = 0;
  if (code === 'resumed') {
    startIdx = Math.min(Math.max(0, startIndex), steps.length - 1);
    startTutorialState(role); // اگر به هر دلیل active نیست، فعال می‌شود
    advanceTutorialState(startIdx);
  } else {
    startTutorialState(role); // از not_started به active با stepIndex صفر
  }

  let overlay: TutorialOverlay | null = null;
  let index = startIdx;

  const gotoStep = async (i: number, save: boolean) => {
    index = Math.max(0, Math.min(i, steps.length - 1));
    if (save) advanceTutorialState(index);
    const step = steps[index];
    // ناوبری فقط از روتر — hash. اگر کاربر همین مسیر است، hash تکراری بی‌ضرر می‌ماند
    if ((globalThis as { location?: { hash?: string } }).location?.hash !== step.path) {
      deps.navigate(step.path);
    }
    await deps.waitForView();
    overlay?.show(index);
  };

  overlay = createTutorialOverlay(doc, steps, {
    onNext(i: number) {
      if (i >= steps.length - 1) {
        completeTutorialState();
        overlay?.close();
        return;
      }
      void gotoStep(i + 1, true);
    },
    onPrev(i: number) {
      if (i <= 0) return;
      void gotoStep(i - 1, true);
    },
    onSkip() {
      skipTutorialState();
      overlay?.close();
    }
  });

  if (!overlay) return 'no_dom';
  await gotoStep(startIdx, false);
  return code;
}

/** یافتن مستقیم هدف یک گام — برای آزمون‌های یکپارچگی و رفع اشکال دستی */
export function tutorialTargetRect(doc: TutDocument, step: TutorialStep): TutRect | null {
  return findStepTarget(doc, step.selector);
}
