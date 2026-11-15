/**
 * v1.26.0 — هماهنگ‌ساز سینک میز: لایهٔ زمان‌بندی/مقاوم دور runner (rust-f9/f11)
 * سند طراحی: docs/rust/first-run-and-cloud.md §۴ — ماتریس کامل خرابی‌ها
 *
 * runner و client و ورکر دست‌نخورده می‌مانند؛ این لایه فقط «چه وقت، با چه حالتی»:
 *   ۱) دورهٔ پایه (۳۰دقیقه) + backoff نمایی ۳۰s→۶h با لرزش ±۲۰٪ روی خطای شبکه/سرور
 *   ۲) قرنطینه روی auth_error — تلاش خودکار متوقف؛ خروج فقط با تغییر اعتبار یا تلاش دستی
 *   ۳) گات نسخه روی 426/کد NODE_MIN_VERSION — paused_version تا آپدیت برنامه
 *   ۴) ingest_error → backoff کوتاه ۶۰s (بدون پیشروی cursor — runner خودش حفظ می‌کند)
 *   ۵) وضعیت CoordinatorState در انبار پیشرفت — پنل همان را نمایش می‌دهد
 * همه‌چیز نرم: هیچ تابعی throw نمی‌کند و هیچ فراخوانی هم‌زمان دوباره وارد نمی‌شود.
 */
import type { CatchUpOutcome, NodeSyncRunner, PushNowOutcome, SyncNowOutcome } from './runner.js';
import type { NodeSyncStore } from '../node-sync-client/client.js';

export type SyncMode = 'auto' | 'quarantined' | 'paused_version';
export type SyncFailureKind =
  | 'none'
  | 'network'
  | 'server'
  | 'throttled'
  | 'auth'
  | 'version'
  | 'ingest'
  | 'unconfigured';

/** وضعیت هماهنگ‌ساز — فیلدهای v1 پنل دست‌نخورده؛ این وضعیت جدا انبار می‌شود */
export interface CoordinatorState {
  v: 1;
  mode: SyncMode;
  consecutive_failures: number;
  next_attempt_at: string | null;
  backoff_ms: number;
  last_error_kind: SyncFailureKind;
  last_run_at: string | null;
  updated_at: string | null;
}

/** کلید انبار وضعیت هماهنگ‌ساز — جدا از SyncStatusV1 runner */
export const SYNC_COORD_KEY = 'nodesync:coordinator-v1';

export const COORD_INTERVAL_MS_DEFAULT = 30 * 60_000;
export const COORD_BASE_BACKOFF_MS = 30_000;
export const COORD_MAX_BACKOFF_MS = 6 * 60 * 60_000;
export const COORD_INGEST_BACKOFF_MS = 60_000;

export interface CoordinatorOptions {
  runner: NodeSyncRunner;
  /** انبار وضعیت — پیش‌فرض localStorage؛ آزمون با فِیک */
  progressStorage?: NodeSyncStore;
  now?: () => Date;
  intervalMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  ingestBackoffMs?: number;
  /** زمان‌سنج تزریق‌پذیر — پیش‌فرض setTimeout؛ آزمون بدون ساعت واقعی */
  scheduleFn?: (fn: () => void, delayMs: number) => () => void;
  /** لرزش backoff — فقط آزمون (پیش‌فرض Math.random) */
  jitter?: () => number;
}

export interface SyncCoordinator {
  start(): void;
  stop(): void;
  /** تلاش دستی — همیشه مجاز، حتی در قرنطینه/گات نسخه */
  runNow(): Promise<{ pull: SyncNowOutcome; push: PushNowOutcome | null }>;
  /**
   * rust-f14 — دورهٔ جبرانی بوت: هر دو جهت تا تخلیهٔ کامل یا سقف (runner.catchUp) — همیشه
   * مجاز حتی در قرنطینه/گات نسخه (هم‌قاعدهٔ runNow دستی)؛ همان ماتریس خرابی روی وضعیت
   * می‌نشیند و تیک دوره‌ای عادی را برنامه‌ریزی می‌کند. هیچ مسیری throw نمی‌کند.
   */
  runCatchUp(): Promise<{ catchup: CatchUpOutcome }>;
  /** پس از ذخیرهٔ اعتبار تازه: خروج از قرنطینه + صفرکردن backoff + تلاش فوری */
  notifyCredentialsChanged(): void;
  state(): CoordinatorState;
}

function memoryStore(): NodeSyncStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function defaultProgressStorage(): NodeSyncStore {
  const g = globalThis as { localStorage?: NodeSyncStore };
  return g.localStorage ?? memoryStore();
}

function defaultSchedule(fn: () => void, delayMs: number): () => void {
  const id = setTimeout(fn, Math.max(0, delayMs));
  return () => clearTimeout(id);
}

function emptyState(): CoordinatorState {
  return {
    v: 1,
    mode: 'auto',
    consecutive_failures: 0,
    next_attempt_at: null,
    backoff_ms: 0,
    last_error_kind: 'none',
    last_run_at: null,
    updated_at: null
  };
}

export function createSyncCoordinator(opts: CoordinatorOptions): SyncCoordinator {
  const progress = opts.progressStorage ?? defaultProgressStorage();
  const now = opts.now ?? (() => new Date());
  const scheduleFn = opts.scheduleFn ?? defaultSchedule;
  const jitter = opts.jitter ?? (() => 0.8 + Math.random() * 0.4);
  const intervalMs = opts.intervalMs ?? COORD_INTERVAL_MS_DEFAULT;
  const baseBackoffMs = opts.baseBackoffMs ?? COORD_BASE_BACKOFF_MS;
  const maxBackoffMs = opts.maxBackoffMs ?? COORD_MAX_BACKOFF_MS;
  const ingestBackoffMs = opts.ingestBackoffMs ?? COORD_INGEST_BACKOFF_MS;

  let cancelTimer: (() => void) | null = null;
  let running = false;

  function readState(): CoordinatorState {
    try {
      const raw = progress.getItem(SYNC_COORD_KEY);
      if (!raw) return emptyState();
      const p = JSON.parse(raw) as Partial<CoordinatorState>;
      if (p?.v !== 1) return emptyState();
      const mode = p.mode === 'quarantined' || p.mode === 'paused_version' ? p.mode : 'auto';
      return { ...emptyState(), ...p, mode, v: 1 };
    } catch {
      return emptyState();
    }
  }

  function writeState(st: CoordinatorState): void {
    try {
      progress.setItem(SYNC_COORD_KEY, JSON.stringify({ ...st, updated_at: now().toISOString() }));
    } catch {
      /* انبار ناموفق = نرم — وضعیت در حافظهٔ همین فرایند باقی می‌ماند */
    }
  }

  function delayFor(st: CoordinatorState, kind: SyncFailureKind): number {
    if (kind === 'ingest') return ingestBackoffMs;
    if (st.consecutive_failures <= 0) return intervalMs;
    const raw = baseBackoffMs * Math.pow(2, Math.min(st.consecutive_failures - 1, 12));
    return Math.round(Math.min(raw, maxBackoffMs) * jitter());
  }

  function scheduleNext(st: CoordinatorState): void {
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
    if (st.mode !== 'auto') return; // قرنطینه/گات نسخه = بدون تلاش خودکار
    const delay = Math.max(
      1000,
      st.next_attempt_at ? Date.parse(st.next_attempt_at) - now().getTime() : intervalMs
    );
    cancelTimer = scheduleFn(() => {
      void runNow();
    }, delay);
  }

  function classify(pull: SyncNowOutcome, push: PushNowOutcome | null): SyncFailureKind {
    if (pull.status === 'auth_error') return 'auth';
    if (pull.status === 'http_error') {
      if (pull.http === 426) return 'version';
      if (pull.code === 'NODE_MIN_VERSION') return 'version';
      if (pull.http === 429 || pull.http >= 500) return 'server';
      return 'server';
    }
    if (pull.status === 'network_error') return 'network';
    if (pull.status === 'ingest_error') return 'ingest';
    if (pull.status === 'unconfigured') return 'unconfigured';
    // pull ok — حالا push (اگر اجرا شده باشد) می‌تواند به‌تنهایی بد باشد
    if (push) {
      if (push.status === 'network_error') return 'network';
      if (push.status === 'outbox_error') return 'server';
      if (push.status === 'push_failed') {
        if (push.code === 'auth_error') return 'auth';
        if (push.code === 'throttled') return 'throttled';
        return 'server';
      }
    }
    return 'none';
  }

  /** ماتریس مشترک خرابی → وضعیت بعدی (هم‌ریتم §۴ سند طراحی) — هم runNow هم runCatchUp همین را دارند */
  function applyOutcome(st: CoordinatorState, kind: SyncFailureKind): CoordinatorState {
    const next: CoordinatorState = { ...st, last_run_at: now().toISOString(), last_error_kind: kind };
    if (kind === 'none' || kind === 'unconfigured') {
      next.mode = 'auto';
      next.consecutive_failures = 0;
      next.backoff_ms = intervalMs;
      next.next_attempt_at = new Date(now().getTime() + intervalMs).toISOString();
    } else if (kind === 'auth' || kind === 'version') {
      next.mode = kind === 'auth' ? 'quarantined' : 'paused_version';
      next.consecutive_failures = st.consecutive_failures + 1;
      next.next_attempt_at = null; // فقط تلاش دستی
      next.backoff_ms = 0;
    } else {
      // network / server / throttled / ingest — backoff نمایی (تلاش خودکار ادامه دارد)
      next.mode = 'auto';
      next.consecutive_failures = st.consecutive_failures + 1;
      const delay = delayFor(next, kind);
      next.backoff_ms = delay;
      next.next_attempt_at = new Date(now().getTime() + delay).toISOString();
    }
    return next;
  }

  async function runNow(): Promise<{ pull: SyncNowOutcome; push: PushNowOutcome | null }> {
    if (running) {
      const st = readState();
      return { pull: { status: 'network_error', message: 'دورهٔ قبلی هنوز در جریان است' }, push: null };
    }
    running = true;
    let pull: SyncNowOutcome;
    let push: PushNowOutcome | null = null;
    try {
      pull = await opts.runner.syncNow();
      if (pull.status === 'ok' || pull.status === 'unconfigured') {
        push = await opts.runner.pushNow();
      }
    } finally {
      running = false;
    }

    const next = applyOutcome(readState(), classify(pull, push));
    writeState(next);
    scheduleNext(next);
    opts.runner.mirrorStatus?.(); // rust-f14 — آینهٔ تازه با مود نهایی (اختیاری؛ فیک‌های آزمون ندارند)
    return { pull, push };
  }

  /** نگاشت خروجی catch-up به نوع خرابی — همان داوری classify با شکل CatchUpOutcome */
  function classifyCatchUp(o: CatchUpOutcome): SyncFailureKind {
    if (o.status === 'ok') return 'none';
    if (o.status === 'unconfigured') return 'unconfigured';
    if (o.status === 'auth_error') return 'auth';
    if (o.status === 'version_error') return 'version';
    if (o.status === 'http_error') return o.http === 426 || o.code === 'NODE_MIN_VERSION' ? 'version' : 'server';
    if (o.status === 'network_error') return 'network';
    if (o.status === 'ingest_error') return 'ingest';
    // push_failed — کد پاکت می‌گوید چه بود (هم‌قاعدهٔ شاخهٔ push در classify)
    if (o.code === 'auth_error') return 'auth';
    if (o.code === 'throttled') return 'throttled';
    return 'server';
  }

  /** خروجی نرم برای مسیر هم‌زمان/runner بدون catchUp — هیچ throwی (قرارداد drill §۳-۱۱) */
  function blockedCatchUpOutcome(message: string): CatchUpOutcome {
    return {
      status: 'network_error',
      phase: 'pull',
      http: null,
      code: null,
      message,
      pages: 0,
      items_pulled: 0,
      by_domain: {},
      batches: 0,
      items_pushed: 0,
      duplicates_pushed: 0,
      pull_done: false,
      push_done: false
    };
  }

  /**
   * rust-f14 — دورهٔ جبرانی (catch-up): هر دو جهت تا تخلیهٔ کامل یا سقف. همیشه مجاز حتی در
   * قرنطینه/گات نسخه (هم‌قاعدهٔ runNow دستی)؛ وضعیت با همان ماتریس خرابی به‌روز می‌شود و
   * تیک دوره‌ای عادی بعدش برنامه‌ریزی می‌شود. هیچ مسیری throw نمی‌کند.
   */
  async function runCatchUp(): Promise<{ catchup: CatchUpOutcome }> {
    if (running || typeof (opts.runner as { catchUp?: unknown }).catchUp !== 'function') {
      return {
        catchup: blockedCatchUpOutcome(running ? 'دورهٔ قبلی هنوز در جریان است' : 'runner بدون دورهٔ جبرانی است')
      };
    }
    running = true;
    let outcome: CatchUpOutcome;
    try {
      outcome = await opts.runner.catchUp();
    } catch {
      // catchUp قرارداداً throw نمی‌کند؛ این فقط سپر دفاعی است — نرم
      outcome = blockedCatchUpOutcome('خطای ناشناخته در دورهٔ جبرانی');
    } finally {
      running = false;
    }
    const next = applyOutcome(readState(), classifyCatchUp(outcome));
    writeState(next);
    scheduleNext(next);
    opts.runner.mirrorStatus?.(); // آینهٔ تازه با مود نهایی — قرنطینه/گات نسخه از همین‌جا دیده می‌شود
    return { catchup: outcome };
  }

  return {
    start() {
      const st = readState();
      scheduleNext(st);
    },
    stop() {
      if (cancelTimer) {
        cancelTimer();
        cancelTimer = null;
      }
    },
    runNow,
    runCatchUp,
    notifyCredentialsChanged() {
      const st = readState();
      if (st.mode === 'quarantined') {
        // اعتبار تازه ذخیره شد — قرنطینه تمام؛ تلاش فوری برنامه‌ریزی می‌شود
        writeState({
          ...st,
          mode: 'auto',
          consecutive_failures: 0,
          backoff_ms: 0,
          last_error_kind: 'none',
          next_attempt_at: new Date(now().getTime() + 1000).toISOString()
        });
      }
      this.start();
    },
    state() {
      return readState();
    }
  };
}

/** برچسب فارسی حالت هماهنگ‌ساز برای پنل تنظیمات */
export function modeFa(mode: SyncMode): string {
  switch (mode) {
    case 'auto':
      return 'خودکار';
    case 'quarantined':
      return 'قرنطینه — کلید نود پذیرفته نشد';
    case 'paused_version':
      return 'موقفا — برای سینک، برنامه را به‌روز کنید';
  }
}

/**
 * خوانندهٔ سبک وضعیت هماهنگ‌ساز برای پنل — بدون ساخت runner/زمان‌سنج.
 * انبار غایب/خراب = حالت خالی خودکار (نرم).
 */
export function readCoordinatorState(storage?: NodeSyncStore): CoordinatorState {
  let progress = storage;
  if (!progress) {
    const g = globalThis as { localStorage?: NodeSyncStore };
    progress = g.localStorage ?? memoryStore();
  }
  try {
    const raw = progress.getItem(SYNC_COORD_KEY);
    if (!raw) return emptyState();
    const p = JSON.parse(raw) as Partial<CoordinatorState>;
    if (p?.v !== 1) return emptyState();
    const mode = p.mode === 'quarantined' || p.mode === 'paused_version' ? p.mode : 'auto';
    return { ...emptyState(), ...p, mode, v: 1 };
  } catch {
    return emptyState();
  }
}
