//! lib.rs — پوستهٔ دسکتاپ مرکز جامع (فاز ۲ — موتور محلی؛ docs/rust/phases.md)
//!
//! فاز ۱: پنجرهٔ وب‌ویو + فرمان سلامت. فاز ۲: موتور محلی (سایدکار workerd) روی loopback
//! بالا می‌آید و پس از سبز شدن /health، پنجره به http://127.0.0.1:<port>/ سوییچ می‌کند
//! (docs/rust/design.md §۲ و §۴) — قرارداد هم‌ریشته بودن API با تولید حفظ می‌شود.
//!
//! کامپایل در CI (cargo در محیط سندباکس جاری نیست) — گیت ساختاری desktop:check
//! هم‌گامی فایل‌ها را می‌گیرد و کامپایل واقعی در خط CI با Rust stable انجام می‌شود.

mod engine;
mod secure_store;

use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

/// وضعیت موتور محلی — نگه‌داری سایدکار تا خروج اپ (Drop = خاموشی تمیز)
pub struct EngineState(Mutex<Option<engine::LocalEngine>>);

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

/// rust-f13 — بوت موتور از رانتایم نصاب: قالب capnp توکن‌دار در resources/engine، جایگزینی
/// سه توکن (data dir / public داخل نصاب / راز per-install)، کپی d1-seed در بوت نخست، و
/// start سایدکار. Rust هیچ دانشی از ساختار capnp ندارد — فقط جایگزینی رشته و نوشتن فایل.
fn boot_engine(app: &tauri::AppHandle) -> Result<engine::LocalEngine, String> {
    // توسعه: با CENTER_ENGINE_CONFIG کانفیگ از پیش تولیدشده (engine.mjs) مصرف می‌شود
    if let Ok(dev_config) = std::env::var("CENTER_ENGINE_CONFIG") {
        let p = std::path::PathBuf::from(dev_config);
        if p.is_file() {
            return engine::LocalEngine::start(&p);
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
    engine::LocalEngine::start(&capnp_path)
}

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
        match boot_engine(&app) {
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
                // rust-f7: کانال پوسته پیش از ناوبری ست می‌شود — فلگ‌های توتوریال/ویزار
                // در وب خاموش می‌مانند و فقط پوستهٔ واقعی آن‌ها را روشن می‌کند.
                if let Some(window) = app.get_webview_window("main") {
                    let js = format!(
                        "globalThis.__DESKTOP_SHELL__ = true; globalThis.__DESKTOP_FEATURES__ = {{ tutorial: true, setup: true }}; location.replace('{base}/');"
                    );
                    let _ = window.eval(&js);
                }
                eprintln!("[desktop] موتور محلی روی پورت {port} آماده است");
            }
            Err(msg) => {
                // رانتایم نصاب ناقص یا سایدکار غایب — جزئیات در data dir/workerd.log (rust-f13)
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
        .invoke_handler(tauri::generate_handler![desktop_health, secure_store::desktop_secure_store])
        .run(tauri::generate_context!())
        .expect("خطای راه‌اندازی پوستهٔ دسکتاپ");
}
