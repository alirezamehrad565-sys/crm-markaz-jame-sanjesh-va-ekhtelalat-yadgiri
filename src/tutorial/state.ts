/**
 * rust-f3 — وضعیت توتوریال در localStorage
 *
 * چرخهٔ وضعیت:  not_started → active → completed | skipped
 * و «اجرای دوباره» از تنظیمات با reset به not_started برمی‌گردد.
 * کلید ذخیره: tutorial_state — JSON سه‌فیلدی (status/stepIndex/updatedAt).
 *
 * انبار (store) تزریق‌پذیر است تا آزمون‌ها بدون مرورگر و بدون localStorage واقعی اجرا شوند
 * (محیط vitest پروژه node است و lib DOM در tsconfig نیست).
 */

export type TutorialStatus = 'not_started' | 'active' | 'completed' | 'skipped';

export interface TutorialStateRecord {
  status: TutorialStatus;
  /** نمای گام جاری (فقط برای active معنا دارد) */
  stepIndex: number;
  /** نقشی که تور برایش آغاز شده */
  role: string | null;
  /** آخرین به‌روزرسانی (ISO) */
  updatedAt: string | null;
}

/** کلید ثابت ذخیره‌سازی — تغییرش یعنی شکستن سازگاری، ممنوع */
export const TUTORIAL_STATE_KEY = 'tutorial_state';

/** قرارداد حداقلی انبار — localStorage واقعی این قرارداد را دارد */
export interface TutorialStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** انبار پیش‌فرض: localStorage مرورگر — با گارد کامل تا در هر محیطی بی‌خطر باشد */
export const localStorageStore: TutorialStore = {
  getItem(key) {
    try {
      const ls = (globalThis as { localStorage?: TutorialStore }).localStorage;
      return ls ? ls.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const ls = (globalThis as { localStorage?: TutorialStore }).localStorage;
      if (ls) ls.setItem(key, value);
    } catch {
      /* حافظهٔ پر یا غیرفعال — تور نباید به‌خاطرش بشکند */
    }
  },
  removeItem(key) {
    try {
      const ls = (globalThis as { localStorage?: TutorialStore }).localStorage;
      if (ls) ls.removeItem(key);
    } catch {
      /* بی‌اثر */
    }
  }
};

let activeStore: TutorialStore = localStorageStore;

/** جایگزینی انبار (تزریق وابستگی آزمون‌ها / اتصال از run.ts) — null یعنی بازگشت به پیش‌فرض */
export function setTutorialStore(store: TutorialStore | null): void {
  activeStore = store ?? localStorageStore;
}

/** وضعیت آغازین وقتی هیچ رکوردی نیست یا رکورد خراب است */
export function emptyTutorialState(): TutorialStateRecord {
  return { status: 'not_started', stepIndex: 0, role: null, updatedAt: null };
}

/** خواندن وضعیت — هر ورودی ناسالم (JSON شکسته، status ناشناخته، ایندکس منفی) = وضعیت آغازین */
export function loadTutorialState(): TutorialStateRecord {
  let raw: string | null = null;
  try {
    raw = activeStore.getItem(TUTORIAL_STATE_KEY);
  } catch {
    return emptyTutorialState();
  }
  if (!raw) return emptyTutorialState();
  try {
    const parsed = JSON.parse(raw) as Partial<TutorialStateRecord> | null;
    if (!parsed || typeof parsed !== 'object') return emptyTutorialState();
    const status = parsed.status;
    if (status !== 'not_started' && status !== 'active' && status !== 'completed' && status !== 'skipped') {
      return emptyTutorialState();
    }
    const stepIndex = typeof parsed.stepIndex === 'number' && Number.isFinite(parsed.stepIndex) && parsed.stepIndex >= 0
      ? Math.trunc(parsed.stepIndex)
      : 0;
    const role = typeof parsed.role === 'string' ? parsed.role : null;
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    return { status, stepIndex, role, updatedAt };
  } catch {
    return emptyTutorialState();
  }
}

/** نوشتن وضعیت — تنها نقطهٔ نوشتن این ماژول */
function persist(rec: TutorialStateRecord): TutorialStateRecord {
  const withTime: TutorialStateRecord = { ...rec, updatedAt: new Date().toISOString() };
  try {
    activeStore.setItem(TUTORIAL_STATE_KEY, JSON.stringify(withTime));
  } catch {
    /* نوشتن ناموفق — وضعیت درون‌حافظه‌ای همین پاس برمی‌گردد */
  }
  return withTime;
}

/** آغاز تور: از not_started به active. اگر فعال باشد دست‌نخورده برمی‌گردد (ادامه از محل قطع) */
export function startTutorialState(role: string | null): TutorialStateRecord {
  const cur = loadTutorialState();
  if (cur.status === 'active') return cur;
  return persist({ status: 'active', stepIndex: 0, role, updatedAt: cur.updatedAt });
}

/** جلو رفتن گام — تنها در وضعیت active معتبر است */
export function advanceTutorialState(stepIndex: number): TutorialStateRecord {
  const cur = loadTutorialState();
  if (cur.status !== 'active') return cur;
  return persist({ ...cur, stepIndex: Math.max(0, Math.trunc(stepIndex)) });
}

/** اتمام تور — تنها از active */
export function completeTutorialState(): TutorialStateRecord {
  const cur = loadTutorialState();
  if (cur.status !== 'active') return cur;
  return persist({ ...cur, status: 'completed', stepIndex: 0 });
}

/** رد کردن تور — تنها از active؛ «رد کردن» هیچ مسیری را قفل نمی‌کند، فقط وضعیت ثبت می‌شود */
export function skipTutorialState(): TutorialStateRecord {
  const cur = loadTutorialState();
  if (cur.status !== 'active') return cur;
  return persist({ ...cur, status: 'skipped', stepIndex: 0 });
}

/** پاک‌سازی برای «اجرای دوبارهٔ راهنمای شروع» — به not_started برمی‌گردد */
export function resetTutorialState(): TutorialStateRecord {
  return persist(emptyTutorialState());
}

/** آیا تور برای کاربرِ فعلی باید بالا بیاید؟ (not_started یا نیمه‌کارهٔ همان نقش) */
export function tutorialShouldAutoStart(role: string | null): boolean {
  const cur = loadTutorialState();
  if (cur.status === 'not_started') return true;
  if (cur.status === 'active' && (cur.role === null || cur.role === role)) return true;
  return false;
}
