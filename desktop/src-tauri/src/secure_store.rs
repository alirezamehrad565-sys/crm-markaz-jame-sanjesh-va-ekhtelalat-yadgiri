//! secure_store.rs — rust-f7: مخزن امن رازهای اتصال ابر
//!
//! کلید نود (node_key) و توکن Cloudflare (cf_token) هرگز در localStorage یا
//! فایل پروژه ذخیره نمی‌شوند — فقط در Credential Manager ویندوز از طریق crate
//! keyring. کامپایل در CI (cargo در سندباکس نیست)؛ گیت ساختاری desktop:check
//! هم‌گامی را می‌گیرد.
//!
//! سمت کلاینت: src/cloud-setup/state.ts → tauriSecureStore() با پل
//! __TAURI_INTERNALS__.invoke('desktop_secure_store', …).

use keyring::Entry;

/// نام سرویس در Credential Manager — ثابت تا مهاجرت‌ها را بشکند
const SERVICE: &str = "center-desktop-cloud-conn";

/// فقط این کلیدها مجازند — سوراخ‌سازی خدمات سیستم‌عامل ممنوع (دفاع در عمق)
const ALLOWED_KEYS: [&str; 2] = ["node_key", "cf_token"];

fn entry(key: &str) -> Result<Entry, String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("کلید مجاز نیست: {key}"));
    }
    Entry::new(SERVICE, key).map_err(|e| format!("دسترسی به مخزن امن ممکن نشد: {e}"))
}

/// کنش‌های مخزن امن: get / set / delete — پاسخ خطا همیشه پیام فارسی
#[tauri::command]
pub fn desktop_secure_store(
    action: String,
    key: String,
    value: Option<String>,
) -> Result<Option<String>, String> {
    match action.as_str() {
        "get" => match entry(&key)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("خواندن راز ممکن نشد: {e}")),
        },
        "set" => {
            let v = value.ok_or_else(|| "مقدار راز خالی است.".to_string())?;
            if v.trim().is_empty() {
                return Err("مقدار راز خالی است.".to_string());
            }
            entry(&key)?
                .set_password(v.trim())
                .map_err(|e| format!("ذخیرهٔ راز ممکن نشد: {e}"))?;
            Ok(None)
        }
        "delete" => match entry(&key)?.delete_credential() {
            Ok(()) => Ok(None),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("حذف راز ممکن نشد: {e}")),
        },
        other => Err(format!("کنش ناشناخته: {other}")),
    }
}
