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

/// راز per-install (۶۴ hex = ۳۲ بایت) بدون وابستهٔ جدید — هر فراخوانی RandomState کلید
/// تصادفی OS می‌گیرد؛ چهار خروجی SipHash پشت‌سرهم. فقط loopback و هرگز خارج دستگاه نمی‌رود.
fn random_hex_secret() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut out = String::with_capacity(64);
    for i in 0..4u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(i);
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

/// راز نشست در data dir (auth-secret.txt) — بوت نخست ساخته می‌شود و تا پاک‌سازی ثابت است
fn read_or_create_auth_secret(data_dir: &Path) -> Result<String, String> {
    let p = data_dir.join("auth-secret.txt");
    if let Ok(existing) = std::fs::read_to_string(&p) {
        let t = existing.trim().to_string();
        if t.len() >= 32 {
            return Ok(t);
        }
    }
    let secret = random_hex_secret();
    std::fs::write(&p, &secret).map_err(|e| format!("نوشتن راز ناموفق: {e}"))?;
    Ok(secret)
}

/// v1.26.0 — دم لاگ workerd برای گزارش خرابی (حداکثر ۴KB انتهای فایل)
fn read_log_tail(data_dir: &Path) -> String {
    let p = data_dir.join("workerd.log");
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

/// rust-f13 — بوت موتور از رانتایم نصاب: قالب capnp توکن‌دار در resources/engine، جایگزینی
/// سه توکن (data dir / public داخل نصاب / راز per-install)، کپی d1-seed در بوت نخست، و
/// start سایدکار. Rust هیچ دانشی از ساختار capnp ندارد — فقط جایگزینی رشته و نوشتن فایل.
fn boot_engine(app: &tauri::AppHandle) -> Result<engine::LocalEngine, String> {
    // رویدادهای نگهبان موتور → رخداد تائوری برای پوسته (engine:restarting / engine:restored /
    // engine:down) — نسل بوت برای نادیده گرفتن نوشتهٔ کهنه پس از engine_retry ضبط می‌شود
    let gen = app.state::<AppState>().generation.load(Ordering::SeqCst);
    let sink = engine_event_sink(app.clone(), gen);
    // توسعه: با CENTER_ENGINE_CONFIG کانفیگ از پیش تولیدشده (engine.mjs) مصرف می‌شود
    if let Ok(dev_config) = std::env::var("CENTER_ENGINE_CONFIG") {
        let p = std::path::PathBuf::from(dev_config);
        if p.is_file() {
            return engine::LocalEngine::start(&p, sink);
        }
    }

    let engine_res = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?
        .join("resources")
        .join("engine");
    let template = engine_res.join("workerd.capnp.template");
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("ساخت data dir: {e}"))?;

    // بوت نخست: دیتابیس مایگریت‌شدهٔ زمان بسته‌بندی (d1-seed) → data dir — در نصب کاربر
    // Node وجود ندارد؛ مایگریشن باید از قبل اعمال شده باشد. اگر کاربر قبلاً دیتا دارد، دست نمی‌خوریم.
    if !data_dir.join("d1").exists() {
        let seed = engine_res.join("d1-seed");
        if seed.is_dir() {
            copy_dir_recursive(&seed, &data_dir.join("d1"))
                .map_err(|e| format!("کپی d1-seed: {e}"))?;
        }
    }

    let secret = read_or_create_auth_secret(&data_dir)?;
    let tmpl = std::fs::read_to_string(&template)
        .map_err(|e| format!("خواندن قالب capnp ({template:?}): {e}"))?;
    let final_capnp = tmpl
        .replace("__CENTER_DATA_DIR__", &data_dir.to_string_lossy())
        .replace(
            "__CENTER_PUBLIC_DIR__",
            &engine_res.join("public").to_string_lossy(),
        )
        .replace("__CENTER_AUTH_SECRET__", &secret);
    let capnp_path = data_dir.join("workerd.capnp");
    std::fs::write(&capnp_path, final_capnp).map_err(|e| format!("نوشتن capnp: {e}"))?;
    engine::LocalEngine::start(&capnp_path, sink)
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
                        message: "موتور محلی ظرف ۳۰ ثانیه سالم نشد — احتمالاً workerd بلافاصله اجرا را قطع کرده است.".to_string(),
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
