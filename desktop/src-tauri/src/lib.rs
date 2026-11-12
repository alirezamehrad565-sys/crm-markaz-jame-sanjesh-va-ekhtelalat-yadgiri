//! lib.rs — پوستهٔ دسکتاپ مرکز جامع (فاز ۱ — اسکلت؛ docs/rust/phases.md)
//!
//! فاز ۱: پنجرهٔ وب‌ویو + فرمان سلامت. از فاز ۲ این لایه موتور محلی (سایدکار workerd)
//! را با بایند loopback بالا می‌آورد و پنجره به http://127.0.0.1:8787 سوییچ می‌کند
//! (docs/rust/design.md §۲ و §۴) — قرارداد هم‌ریشته بودن API با تولید حفظ می‌شود.

/// فرمان سلامت پوسته — از فاز ۲ کنار /health موتور محلی پینگ می‌شود
#[tauri::command]
fn desktop_health() -> serde_json::Value {
    serde_json::json!({ "ok": true, "module": "desktop-shell", "phase": 1 })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_health])
        .run(tauri::generate_context!())
        .expect("خطای راه‌اندازی پوستهٔ دسکتاپ");
}
