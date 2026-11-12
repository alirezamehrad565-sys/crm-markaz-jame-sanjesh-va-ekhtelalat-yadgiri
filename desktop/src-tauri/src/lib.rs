//! lib.rs — پوستهٔ دسکتاپ مرکز جامع (فاز ۲ — موتور محلی؛ docs/rust/phases.md)
//!
//! فاز ۱: پنجرهٔ وب‌ویو + فرمان سلامت. فاز ۲: موتور محلی (سایدکار workerd) روی loopback
//! بالا می‌آید و پس از سبز شدن /health، پنجره به http://127.0.0.1:<port>/ سوییچ می‌کند
//! (docs/rust/design.md §۲ و §۴) — قرارداد هم‌ریشته بودن API با تولید حفظ می‌شود.
//!
//! کامپایل در CI (cargo در محیط سندباکس جاری نیست) — گیت ساختاری desktop:check
//! هم‌گامی فایل‌ها را می‌گیرد و کامپایل واقعی در خط CI با Rust stable انجام می‌شود.

mod engine;

use std::sync::Mutex;
use tauri::Manager;

/// وضعیت موتور محلی — نگه‌داری سایدکار تا خروج اپ (Drop = خاموشی تمیز)
pub struct EngineState(Mutex<Option<engine::LocalEngine>>);

/// فرمان سلامت پوسته — وضعیت موتور محلی را هم گزارش می‌کند
#[tauri::command]
fn desktop_health(state: tauri::State<EngineState>) -> serde_json::Value {
    let engine = state
        .0
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|e| serde_json::json!({ "port": e.port, "baseUrl": e.base_url() })));
    serde_json::json!({ "ok": true, "module": "desktop-shell", "phase": 2, "engine": engine })
}

/// بالا آوردن موتور محلی در thread جدا و ناوبری پنجره به loopback پس از سلامت
fn start_engine_in_background(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        // کانفیگ capnp-text تولیدشدهٔ موتور محلی (پیش‌فرض: کنار برنامه؛ در توسعه با CENTER_ENGINE_CONFIG)
        let config = std::env::var("CENTER_ENGINE_CONFIG")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir().join("workerd.capnp"));
        match engine::LocalEngine::start(&config) {
            Ok(motor) => {
                let port = motor.port;
                let base = motor.base_url();
                if !motor.wait_healthy(std::time::Duration::from_secs(30)) {
                    eprintln!("[desktop] موتور محلی ظرف ۳۰ ثانیه سالم نشد");
                    return; // drop وضعیت محلی → خاموشی سایدکار
                }
                if let Some(state) = app.try_state::<EngineState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = Some(motor);
                    }
                }
                // سوییچ پنجره به loopback — قرارداد هم‌ریشته بودن API با تولید (design.md §۲)
                if let Some(window) = app.get_webview_window("main") {
                    let js = format!("location.replace('{base}/')");
                    let _ = window.eval(&js);
                }
                eprintln!("[desktop] موتور محلی روی پورت {port} آماده است");
            }
            Err(msg) => {
                // در توسعه بدون کانفیگ تولیدشده، پنجره روی پوستهٔ استاتیک می‌ماند — گیت فاز ۲ با engine:smoke است
                eprintln!("[desktop] موتور محلی بالا نیامد: {msg}");
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .manage(EngineState(Mutex::new(None)))
        .setup(|app| {
            start_engine_in_background(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_health])
        .run(tauri::generate_context!())
        .expect("خطای راه‌اندازی پوستهٔ دسکتاپ");
}
