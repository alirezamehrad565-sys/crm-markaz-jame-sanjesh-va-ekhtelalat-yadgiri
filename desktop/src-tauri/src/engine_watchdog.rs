//! engine_watchdog.rs — نگهبان موتور محلی: ماشین وضعیت pure ری‌استارت (رفع ENG-1 / P0)
//!
//! workerd اگر در میانهٔ کار بمیرد، تا امروز هیچ چیزی آن را بالا نمی‌آورد. این ماژول فقط
//! «تصمیم» را می‌گیرد (بدون I/O و بدون ساعت دیواری — زمان‌ها ورودی‌اند) و engine.rs اجرایش
//! می‌کند. پذیرش critique:
//! - انتظارها ۲/۵/۱۰ ثانیه؛ سقف ۳ تلاش در پنجرهٔ ۱۰ دقیقه‌ای؛ پس از سقف: GiveUp
//! - پنجره از نخستین خرابیِ رشتهٔ فعلی لنگر می‌خورد؛ اگر از آن لنگر بیش از ۱۰ دقیقه بگذرد
//!   → ResetWindow (شمارش از صفر) — حتی اگر خرابی‌های میانی هنوز «تازه» باشند
//! - پس از GiveUp: وضعیت صریح خطا + فقط راه‌اندازی دوبارهٔ دستی (engine_retry در lib.rs)
//! - هر تصمیم در engine.rs با eprintln ثبت می‌شود (بازرسی) و رکوردش در تاریخچه می‌ماند
//!
//! pure و std-only — تست‌های واحد در scripts/rust-tests همین فایل را با #[path] بارگذاری
//! می‌کنند؛ کامپایل کامل در CI (desktop-build) انجام می‌شود.

/// سیاست نگهبان — همان مقادیر پذیرش critique: انتظار ۲/۵/۱۰ ثانیه، سقف ۳ تلاش، پنجرهٔ ۱۰ دقیقه
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WatchdogPolicy {
    pub backoffs_ms: [u64; 3],
    pub max_attempts: u32,
    pub window_ms: u64,
}

impl Default for WatchdogPolicy {
    fn default() -> Self {
        Self { backoffs_ms: [2_000, 5_000, 10_000], max_attempts: 3, window_ms: 10 * 60_000 }
    }
}

/// یک ری‌استارت انجام‌شده — هم برای سنجش پنجره هم بازرسی
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestartRecord {
    /// زمان مشاهدهٔ خروج فرزند (لنگر پنجره) — میلی‌ثانیهٔ یونیکس
    pub exit_at_ms: u64,
    /// انتظاری که برای همین تلاش رعایت شد
    pub delay_ms: u64,
}

/// تصمیم ماشین وضعیت پس از مرگ فرزند
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchdogAction {
    /// فرزند را با این انتظار دوباره بالا بیاور
    Restart(u64),
    /// سقف تلاش‌ها در پنجره پر شد — وضعیت خطای صریح و فقط راه‌اندازی دوبارهٔ دستی
    GiveUp,
    /// پنجرهٔ ۱۰ دقیقه‌ای از نخستین خرابی گذشته — تاریخچه را خالی کن و تازه شروع کن
    ResetWindow,
}

/// رویداد نگهبان برای UI/لاگ — engine.rs این‌ها را به رخدادهای تائوری
/// («engine:restarting» / «engine:restored» / «engine:down» /
/// «engine:degraded» / «engine:degraded_recovered») می‌برد
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchdogEvent {
    /// ری‌استارت در نوبت است — attempt شمارهٔ تلاش در رشتهٔ فعلی است
    Restarting { attempt: u32, delay_ms: u64 },
    /// موتور پس از ری‌استارت دوباره سالم شد
    Restored,
    /// سقف تلاش‌ها پر شد — وضعیت صریح پایین‌بودن موتور
    Down { attempts: u32 },
    /// M4 — ورکر بازی‌ها چند دَور پیاپی پاسخ نداد اما سرویس اصلی سالم است —
    /// وضعیت Degraded (بدون ری‌استارت؛ اپ کار می‌کند، فقط بخش بازی‌ها پایین است)
    Degraded { fails: u32 },
    /// M4 — ورکر بازی‌ها بدون ری‌استارت خودش دوباره سالم شد — بازگشت به Ready
    DegradedRecovered,
}

/// تصمیم بعدی پس از مرگ فرزند — pure؛ ترتیب بررسی: بازنشانی پنجره ← سقف تلاش ← انتظار بعدی.
/// now_ms = زمان فعلی تصمیم‌گیری، exit_at_ms = زمان مشاهدهٔ خروج (هر دو میلی‌ثانیهٔ یونیکس).
pub fn next_action(history: &[RestartRecord], now_ms: u64, exit_at_ms: u64) -> WatchdogAction {
    let policy = WatchdogPolicy::default();
    let Some(first) = history.iter().map(|r| r.exit_at_ms).min() else {
        // رشتهٔ تازه — نخستین تلاش با کوچک‌ترین انتظار
        return WatchdogAction::Restart(policy.backoffs_ms[0]);
    };
    // پنجره از نخستین خرابی رشته لنگر می‌خورد؛ اگر در زمان خرابی یا زمان تصمیم از لنگر
    // گذشته باشد، شمارش از صفر شروع می‌شود (پذیرش: خرابی ۱۱ دقیقه پس از نخستین → بازنشانی)
    if now_ms.saturating_sub(first) > policy.window_ms
        || exit_at_ms.saturating_sub(first) > policy.window_ms
    {
        return WatchdogAction::ResetWindow;
    }
    if history.len() as u32 >= policy.max_attempts {
        return WatchdogAction::GiveUp;
    }
    let idx = history.len().min(policy.backoffs_ms.len() - 1);
    WatchdogAction::Restart(policy.backoffs_ms[idx])
}

/// میلی‌ثانیهٔ فعلی یونیکس — منبع زمان‌های ورودی next_action در engine.rs
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(exit_at_ms: u64, delay_ms: u64) -> RestartRecord {
        RestartRecord { exit_at_ms, delay_ms }
    }

    /// بدون تاریخچه → نخستین تلاش با انتظار ۲ ثانیه
    #[test]
    fn no_history_starts_with_smallest_backoff() {
        assert_eq!(next_action(&[], 1_000, 1_000), WatchdogAction::Restart(2_000));
    }

    /// توالی انتظارها ۲/۵/۱۰ ثانیه
    #[test]
    fn backoff_sequence_is_2_5_10_seconds() {
        let h1 = vec![record(0, 2_000)];
        assert_eq!(next_action(&h1, 5_000, 5_000), WatchdogAction::Restart(5_000));
        let h2 = vec![record(0, 2_000), record(5_000, 5_000)];
        assert_eq!(next_action(&h2, 9_000, 9_000), WatchdogAction::Restart(10_000));
    }

    /// سه خرابی سریع → تلاش چهارم GiveUp است
    #[test]
    fn three_fast_crashes_fourth_gives_up() {
        let history = vec![record(0, 2_000), record(1_000, 5_000), record(2_000, 10_000)];
        assert_eq!(next_action(&history, 3_000, 3_000), WatchdogAction::GiveUp);
    }

    /// خرابی ۱۱ دقیقه پس از نخستین خرابی → پنجره بازنشانی می‌شود (نه GiveUp)
    #[test]
    fn crash_11min_after_first_resets_window() {
        let history = vec![record(0, 2_000), record(60_000, 5_000), record(120_000, 10_000)];
        let action = next_action(&history, 660_000, 660_000);
        assert_eq!(action, WatchdogAction::ResetWindow);
        // پس از بازنشانی، تماس‌گیرنده تاریخچه را خالی می‌کند و تازه شروع می‌شود
        assert_eq!(next_action(&[], 660_000, 660_000), WatchdogAction::Restart(2_000));
    }

    /// مرز دقیق پنجره (هم‌آستان ۱۰ دقیقه) هنوز داخل پنجره است — فقط گذشتِ کامل بازنشانی می‌کند
    #[test]
    fn window_boundary_exact_is_still_inside() {
        let history = vec![record(0, 2_000), record(1_000, 5_000), record(2_000, 10_000)];
        assert_eq!(next_action(&history, 600_000, 600_000), WatchdogAction::GiveUp);
    }

    /// پس از بازنشانی پنجره، حتی با سه رکورد قدیمی، GiveUp صادر نمی‌شود
    #[test]
    fn reset_wins_over_give_up() {
        let history = vec![record(0, 2_000), record(1_000, 5_000), record(2_000, 10_000)];
        assert_ne!(next_action(&history, 700_000, 700_000), WatchdogAction::GiveUp);
    }

    /// زمان تصمیم دیرتر از زمان خروج هم پنجره را می‌سنجد (زمان‌های ناهم‌سو محافظت می‌شوند)
    #[test]
    fn stale_decision_time_also_elapses_window() {
        let history = vec![record(0, 2_000)];
        // خروج تازه است اما تصمیم ۱۱ دقیقه بعد گرفته می‌شود
        assert_eq!(next_action(&history, 660_000, 5_000), WatchdogAction::ResetWindow);
    }
}
