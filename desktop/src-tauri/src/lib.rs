//! lib.rs — پوستهٔ دسکتاپ مرکز جامع (فاز ۲ + v1.26.0 راه‌اندازی نخست؛ docs/rust/first-run-and-cloud.md)
//!
//! v1.26.0 — قرارداد بوت عوض شد: پنجره هرگز روی صفحهٔ خالی نمی‌ماند. frontendDist فقط
//! صفحهٔ بوت (boot-dist) است که با desktop_status وضعیت موتور را می‌پرسد؛ شکست موتور =
//! وضعیت صریح Failed{message, log_tail} با سه کنش (تلاش دوباره / پوشهٔ داده / پیام به سازنده).
//! productName حالا ASCII است (Markaz-Jame-Desktop) — مسیر فارسی نصب، workerd را روی ویندوز
//! در خواندن کانفیگ می‌کشت (docs/rust/first-run-and-cloud.md §۰).
//!
//! کامپایل در CI (cargo در محیط سندباکس جاری نیست) — گیت ساختاری desktop:check
//! هم‌گامی فایل‌ها را می‌گیرد و کامپایل واقعی در خط CI با Rust stable انجام می‌شود.

mod cf_deploy;
mod deploy_plan;
mod engine;
mod engine_watchdog;
mod secure_store;

use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// وضعیت موتور محلی — نگه‌داری سایدکار تا خروج اپ (Drop = خاموشی تمیز)
pub struct LocalEngineSlot(Mutex<Option<engine::LocalEngine>>);

/// v1.26.0 — وضعیت صریح بوت برای صفحهٔ بوت (سه حالت، هیچ حالت خاموشی نیست)
#[derive(Clone)]
pub enum EnginePhase {
    Booting,
    Ready { port: u16, base_url: String },
    Failed { message: String, log_tail: String },
}

pub struct AppState {
    phase: Mutex<EnginePhase>,
    /// شمارهٔ نسل بوت — جلوگیری از نتیجهٔ کهنهٔ یک تلاشِ ردشده (engine_retry)
    generation: AtomicU32,
}

impl AppState {
    fn new() -> Self {
        Self { phase: Mutex::new(EnginePhase::Booting), generation: AtomicU32::new(0) }
    }
    fn set_phase(&self, p: EnginePhase) {
        if let Ok(mut guard) = self.phase.lock() {
            *guard = p;
        }
    }
}

/// کپی بازگشتی با std — بوت نخست: d1-seed مایگریت‌شدهٔ CI → data dir کاربر
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

/// راز per-install — v1.27.۰۳ حذف شد: موتور adapter راز نشست را مثل حالت توسعه در جدول
/// settings (کلید sys_auth_secret) می‌سازد و نگه می‌دارد — یک منبع حقیقت برای هر دو مسیر.

/// v1.26.0 — دم لاگ موتور برای گزارش خرابی (حداکثر ۴KB انتهای فایل)
/// v1.27.۰۳ — نام فایل engine.log (سایدکار node؛ کارفرما قبلاً workerd.log داشت)
fn read_log_tail(data_dir: &Path) -> String {
    let p = data_dir.join("engine.log");
    let Ok(meta) = std::fs::metadata(&p) else { return String::new() };
    let take = meta.len().min(4096) as u64;
    let Ok(mut f) = std::fs::File::open(&p) else { return String::new() };
    use std::io::{Read, Seek, SeekFrom};
    if f.seek(SeekFrom::End(-(take as i64))).is_err() {
        return String::new();
    }
    let mut buf = vec![0u8; take as usize];
    if f.read_exact(&mut buf).is_err() {
        return String::new();
    }
    String::from_utf8_lossy(&buf).trim().to_string()
}

/// rust-f13 + v1.27.۰۳ — بوت موتور دسکتاپ: مسیرهای سایدکار node و باندل engine-server از
/// resources/engine، کپی d1-seed در بوت نخست، و اجرای EngineLaunch. هیچ capnp و هیچ قالب
/// متنی دیگر در کار نیست — قرارداد موتور: CLI + dataDir/engine-config.json (پورت‌های نهایی).
/// توسعه: با CENTER_ENGINE_REPO مسیرهای مخزن مصرف می‌شود (باندل‌ها از worker/ و public از ریشه).
fn boot_engine(app: &tauri::AppHandle) -> Result<engine::LocalEngine, String> {
    // رویدادهای نگهبان موتور → رخداد تائوری برای پوسته (engine:restarting / engine:restored /
    // engine:down) — نسل بوت برای نادیده گرفتن نوشتهٔ کهنه پس از engine_retry ضبط می‌شود
    let gen = app.state::<AppState>().generation.load(Ordering::SeqCst);
    let sink = engine_event_sink(app.clone(), gen);

    let (server_js, main_bundle, games_bundle, public_dir, data_dir) =
        if let Ok(repo) = std::env::var("CENTER_ENGINE_REPO") {
            // توسعه: همه‌چیز از مخزن — همان چیزی که engine-smoke در حالت adapter می‌سنجد
            let repo = std::path::PathBuf::from(repo);
            (
                repo.join("scripts/engine/engine-server.js"),
                repo.join("worker/bundle.js"),
                repo.join("worker/games-bundle.js"),
                repo.join("public"),
                repo.join("engine-data"),
            )
        } else {
            let engine_res = app
                .path()
                .resource_dir()
                .map_err(|e| format!("resource_dir: {e}"))?
                .join("resources")
                .join("engine");
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("app_data_dir: {e}"))?;
            (
                engine_res.join("engine-server.js"),
                engine_res.join("central/worker.js"),
                engine_res.join("central/games.js"),
                engine_res.join("public"),
                data_dir,
            )
        };
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("ساخت data dir: {e}"))?;

    // بوت نخست: دیتابیس مایگریت‌شدهٔ زمان بسته‌بندی (d1-seed) → data dir — در نصب کاربر
    // مایگریشن از قبل اعمال شده (engine-server پوشهٔ migrations مخزن را ندارد و رد می‌کند).
    // اگر کاربر قبلاً دیتا دارد، دست نمی‌خوریم. v1.27.۰۳: همین فایل را shim D1 (node:sqlite)
    // باز می‌کند — مسیر قطعی d1/miniflare-D1DatabaseObject/<hash>.sqlite عین پشتهٔ workerd.
    if !data_dir.join("d1").exists() {
        let seed = if std::env::var("CENTER_ENGINE_REPO").is_ok() {
            std::env::var("CENTER_ENGINE_REPO")
                .map(|r| std::path::PathBuf::from(r).join("desktop/src-tauri/resources/engine/d1-seed"))
                .unwrap_or_default()
        } else {
            let engine_res = app
                .path()
                .resource_dir()
                .map_err(|e| format!("resource_dir: {e}"))?
                .join("resources")
                .join("engine");
            engine_res.join("d1-seed")
        };
        if seed.is_dir() {
            copy_dir_recursive(&seed, &data_dir.join("d1"))
                .map_err(|e| format!("کپی d1-seed: {e}"))?;
        }
    }

    let node = engine::find_node_binary()?;
    let launch = engine::EngineLaunch { node, server_js, main_bundle, games_bundle, public_dir, data_dir };
    engine::LocalEngine::start(launch, sink)
}

/// پیام شکست بوت — v1.27.۰۳: موتور adapter است؛ کرش بومی workerd از مسیر دسکتاپ حذف شده و
/// شکست بوت معمولاً یعنی کانفیگ ندادن در مهلت (ببین dataDir/engine.log) یا نبود فایل‌های رانتایم.
fn boot_failure_message(_log_tail: &str) -> String {
    "موتور محلی ظرف ۳۰ ثانیه آماده نشد — جزئیات در dataDir/engine.log است؛ «تلاش دوباره» را بزنید و اگر تکرار شد، گزارش خرابی را با دکمهٔ «پیام به سازنده» بفرستید. دیتای شما دست‌نخورده است.".to_string()
}

/// گیرندهٔ رویدادهای نگهبان موتور → رخداد تائوری برای پوسته + وضعیت صریح پس از تسلیم.
/// نام رخدادها: engine:restarting {attempt, delay_ms} / engine:restored {port} /
/// engine:down {attempts} — پس از engine:down فاز به Failed می‌رود (وضعیت صریح بوت) و
/// «تلاش دوباره» همان engine_retry است. اگر نسل بوت عوض شده باشد، نوشتن فاز نادیده گرفته
/// می‌شود تا نتیجهٔ کهنهٔ نگهبان، بوت تازه را خراب نکند.
fn engine_event_sink(app: tauri::AppHandle, gen: u32) -> engine::EngineEventSink {
    std::sync::Arc::new(move |ev| {
        let stale = app.state::<AppState>().generation.load(Ordering::SeqCst) != gen;
        match &ev {
            engine_watchdog::WatchdogEvent::Restarting { attempt, delay_ms } => {
                let _ = app.emit(
                    "engine:restarting",
                    serde_json::json!({ "attempt": attempt, "delay_ms": delay_ms }),
                );
            }
            engine_watchdog::WatchdogEvent::Restored => {
                let port = app.state::<AppState>().phase.lock().ok().and_then(|g| match &*g {
                    EnginePhase::Ready { port, .. } => Some(*port),
                    _ => None,
                });
                let _ = app.emit("engine:restored", serde_json::json!({ "port": port }));
            }
            engine_watchdog::WatchdogEvent::Down { attempts } => {
                let _ = app.emit("engine:down", serde_json::json!({ "attempts": attempts }));
                if !stale {
                    let data_dir = app
                        .path()
                        .app_data_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."));
                    let tail = read_log_tail(&data_dir);
                    app.state::<AppState>().set_phase(EnginePhase::Failed {
                        message: format!(
                            "موتور محلی پس از {attempts} تلاش خودکار دوباره بسته شد — «تلاش دوباره» را بزنید."
                        ),
                        log_tail: tail,
                    });
                }
            }
        }
    })
}

/// v1.26.0 — فرمان وضعیت برای صفحهٔ بوت (هم‌قرارداد boot-dist/index.html)
#[tauri::command]
fn desktop_status(app: tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let phase = state.phase.lock().map(|g| g.clone()).unwrap_or(EnginePhase::Booting);
    let version = env!("CARGO_PKG_VERSION").to_string();
    match phase {
        EnginePhase::Booting => serde_json::json!({ "phase": "booting", "version": version }),
        EnginePhase::Ready { port, base_url } => {
            serde_json::json!({ "phase": "ready", "version": version, "port": port, "base_url": base_url })
        }
        EnginePhase::Failed { message, log_tail } => {
            serde_json::json!({ "phase": "failed", "version": version, "message": message, "log_tail": log_tail })
        }
    }
}

/// v1.26.0 — تلاش دوبارهٔ بوت از صفحهٔ بوت؛ نتیجهٔ نسل‌های کهنه نادیده گرفته می‌شود
#[tauri::command]
fn engine_retry(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    {
        let phase = state.phase.lock().map(|g| g.clone()).unwrap_or(EnginePhase::Booting);
        if matches!(phase, EnginePhase::Booting | EnginePhase::Ready { .. }) {
            return; // بوت در جریان است یا موتور آماده — کاری نکن
        }
        // موتور قبلی (اگر زنده مانده باشد) با ست‌شدن None می‌میرد
        if let Ok(mut slot) = app.state::<LocalEngineSlot>().0.lock() {
            *slot = None;
        }
    }
    state.set_phase(EnginePhase::Booting);
    state.generation.fetch_add(1, Ordering::SeqCst);
    spawn_engine_boot(app.clone());
}

/// v1.26.0 — باز کردن پوشهٔ داده در File Explorer (برای دیدن workerd.log)
#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("ساخت data dir: {e}"))?;
    let opened = if cfg!(target_os = "windows") {
        std::process::Command::new("explorer").arg(&dir).spawn().is_ok()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(&dir).spawn().is_ok()
    } else {
        std::process::Command::new("xdg-open").arg(&dir).spawn().is_ok()
    };
    if opened {
        Ok(())
    } else {
        Err(format!("باز کردن پوشه ممکن نشد: {}", dir.display()))
    }
}

/// فرمان سلامت پوسته — وضعیت موتور محلی را هم گزارش می‌کند (سازگار با فاز ۲)
#[tauri::command]
fn desktop_health(app: tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let phase = state.phase.lock().map(|g| g.clone()).unwrap_or(EnginePhase::Booting);
    let engine = match phase {
        EnginePhase::Ready { port, ref base_url } => {
            Some(serde_json::json!({ "port": port, "baseUrl": base_url }))
        }
        _ => None,
    };
    serde_json::json!({ "ok": true, "module": "desktop-shell", "phase": 2, "engine": engine })
}

/// بالا آوردن موتور محلی در thread جدا؛ هر سه خروجی (ready/timeout/fail) وضعیت صریح می‌سازند
fn spawn_engine_boot(app: tauri::AppHandle) {
    let gen = app.state::<AppState>().generation.load(Ordering::SeqCst);
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let finish_stale = |state: &AppState| {
            state.generation.load(Ordering::SeqCst) != gen
        };
        match boot_engine(&app) {
            Ok(motor) => {
                let port = motor.port;
                let base = motor.base_url();
                if !motor.wait_healthy(std::time::Duration::from_secs(30)) {
                    if finish_stale(&state) {
                        return;
                    }
                    let data_dir = app
                        .path()
                        .app_data_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."));
                    let tail = read_log_tail(&data_dir);
                    state.set_phase(EnginePhase::Failed {
                        message: boot_failure_message(&tail),
                        log_tail: tail,
                    });
                    return; // drop وضعیت محلی → خاموشی سایدکار
                }
                if let Ok(mut slot) = app.state::<LocalEngineSlot>().0.lock() {
                    *slot = Some(motor);
                }
                if finish_stale(&state) {
                    return;
                }
                state.set_phase(EnginePhase::Ready { port, base_url: base.clone() });
                // ناوبری صفحهٔ بوت به loopback — خودِ boot page با desktop_status این را می‌فهمد و
                // location.replace می‌زند؛ اینجا هم برای سازگاری eval همان ناوبری را تزریق می‌کنیم.
                if let Some(window) = app.get_webview_window("main") {
                    let js = format!(
                        "globalThis.__DESKTOP_SHELL__ = true; globalThis.__DESKTOP_FEATURES__ = {{ tutorial: true, setup: true }}; location.replace('{base}/');"
                    );
                    let _ = window.eval(&js);
                }
                eprintln!("[desktop] موتور محلی روی پورت {port} آماده است");
            }
            Err(msg) => {
                if finish_stale(&state) {
                    return;
                }
                let data_dir = app
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
                let tail = read_log_tail(&data_dir);
                state.set_phase(EnginePhase::Failed { message: msg, log_tail: tail });
                eprintln!("[desktop] موتور محلی بالا نیامد — وضعیت Failed در صفحهٔ بوت نمایش داده می‌شود");
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .manage(LocalEngineSlot(Mutex::new(None)))
        .manage(AppState::new())
        .setup(|app| {
            spawn_engine_boot(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_health,
            desktop_status,
            engine_retry,
            open_data_dir,
            cf_deploy::cloudflare_deploy,
            secure_store::desktop_secure_store
        ])
        .run(tauri::generate_context!())
        .expect("خطای راه‌اندازی پوستهٔ دسکتاپ");
}

#[cfg(test)]
mod tests {
    use super::boot_failure_message;

    /// ۱.۲۷.۰۲ — تشخیص هدفمند کرش بومی workerd در لاگ (گزارش نصاب واقعی)
    /// ۱.۲۷.۰۳ — با حذف workerd از مسیر دسکتاپ، پیام شکست بوت عمومی و راهنماست
    #[test]
    fn boot_failure_message_is_actionable() {
        let m = boot_failure_message("");
        assert!(m.contains("۳۰ ثانیه"));
        assert!(m.contains("تلاش دوباره"));
        assert!(m.contains("engine.log"));
        assert!(m.contains("دست‌نخورده"));
    }
}
