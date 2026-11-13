//! cf_deploy.rs — v1.26.0 ماژول «ساخت سرور مرکزی روی حساب کلادفلر کاربر»
//! طراحی: docs/rust/first-run-and-cloud.md §۳
//!
//! ورودی: توکن API کلادفلر (فقط به api.cloudflare.com می‌رود؛ هرگز لاگ/ذخیره نمی‌شود).
//! گام‌ها: verify → حساب → D1 (ساخت/یافتن markaz-central) → اعمال schema.sql قطعه‌قطعه →
//! آپلود ماژول central-worker.js با bindings (DB/AUTH_SECRET/NODE_SETUP_TOKEN) →
//! فعال‌سازی workers.dev → انتظار /healthz.
//! خروجی ساختاریافته: {ok, worker_url, admin_setup_token, auth_secret, steps[]} —
//! هرگز Err خام نمی‌دهد (UI ویزار همیشه نتیجهٔ کامل می‌گیرد).
//!
//! دارایی‌ها از رانتایم نصاب خوانده می‌شوند: resources/engine/central/{central-worker.js, schema.sql}
//! (در build-installer-runtime.mjs ساخته می‌شوند — §۶ سند طراحی).

use serde_json::{json, Value};
use tauri::Manager;

const CF_API: &str = "https://api.cloudflare.com/client/v4";
const D1_NAME: &str = "markaz-central";
const COMPAT_DATE: &str = "2024-09-23";
const QUERY_CHUNK_BYTES: usize = 60_000;

/// یک گام ثبت‌شده در لاگ deploy — هم برای UI هم عیب‌یابی
struct Step {
    name: &'static str,
    ok: bool,
    detail: String,
}

fn steps_value(steps: &[Step]) -> Value {
    Value::Array(
        steps
            .iter()
            .map(|s| json!({ "step": s.name, "ok": s.ok, "detail": s.detail }))
            .collect(),
    )
}

/// راز تصادفی — هم‌الگوی lib.rs (SipHash بر کلید تصادفی OS؛ فقط loopback-محور)
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

/// پاکت استاندارد CF v4 — success=false یعنی خطای ساختاریافته
async fn cf_call(
    client: &reqwest::Client,
    token: &str,
    method: reqwest::Method,
    url: &str,
    json_body: Option<Value>,
) -> Result<Value, String> {
    let mut req = client
        .request(method, url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json");
    if let Some(b) = json_body {
        req = req.json(&b);
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("شبکه: {e}"))?;
    let status = res.status();
    let body: Value = res.json().await.map_err(|e| format!("پاسخ JSON نشد ({status}): {e}"))?;
    let success = body.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
    if !success {
        let msg = body
            .get("errors")
            .and_then(|e| e.get(0))
            .map(|e| {
                format!(
                    "{} (کد {:?})",
                    e.get("message").and_then(|m| m.as_str()).unwrap_or("خطای ناشناخته"),
                    e.get("code").and_then(|c| c.as_i64()).unwrap_or(0)
                )
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(msg);
    }
    Ok(body.get("result").cloned().unwrap_or(Value::Null))
}

/// جداکنندهٔ دستورهای SQL — آگاه از نقل‌قول تک (با '' escape)، کامنت خطی و بلوکی.
/// مایگریشن‌های مخزن هیچ trigger BEGIN/END ندارند؛ برای همان سطح سادگی طراحی شده است.
fn split_statements(sql: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut chars = sql.chars().peekable();
    let mut in_single = false;
    let mut in_line_comment = false;
    let mut in_block = false;
    while let Some(c) = chars.next() {
        if in_line_comment {
            cur.push(c);
            if c == '\n' {
                in_line_comment = false;
            }
            continue;
        }
        if in_block {
            cur.push(c);
            if c == '*' && chars.peek() == Some(&'/') {
                cur.push(chars.next().unwrap());
                in_block = false;
            }
            continue;
        }
        if in_single {
            cur.push(c);
            if c == '\'' {
                if chars.peek() == Some(&'\'') {
                    cur.push(chars.next().unwrap()); // '' = نقل‌قول escape‌شده
                } else {
                    in_single = false;
                }
            }
            continue;
        }
        match c {
            '-' if chars.peek() == Some(&'-') => {
                cur.push(c);
                cur.push(chars.next().unwrap());
                in_line_comment = true;
            }
            '/' if chars.peek() == Some(&'*') => {
                cur.push(c);
                cur.push(chars.next().unwrap());
                in_block = true;
            }
            '\'' => {
                in_single = true;
                cur.push(c);
            }
            ';' => {
                let t = cur.trim();
                if !t.is_empty() {
                    out.push(t.to_string());
                }
                cur.clear();
            }
            _ => cur.push(c),
        }
    }
    let t = cur.trim();
    if !t.is_empty() {
        out.push(t.to_string());
    }
    out
}

/// قطعه‌بندی دستورها برای POST /d1/query — هر قطعه تا ~۶۰KB، هرگز تهی نیست
fn chunk_statements(statements: Vec<String>) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut cur = String::new();
    for st in statements {
        if !cur.is_empty() && cur.len() + st.len() + 2 > QUERY_CHUNK_BYTES {
            chunks.push(cur.clone());
            cur.clear();
        }
        cur.push_str(&st);
        cur.push_str(";\n");
    }
    if !cur.trim().is_empty() {
        chunks.push(cur);
    }
    chunks
}

/// فرم آپلود ماژول: بخش metadata + بخش worker.js (نام بخش باید با main_module یکی باشد)
fn build_upload_form(metadata: &str, worker_js: &str) -> Result<reqwest::multipart::Form, String> {
    let meta_part = reqwest::multipart::Part::text(metadata.to_string())
        .file_name("metadata.json")
        .mime_str("application/json")
        .map_err(|e| format!("mime متادیتا: {e}"))?;
    let module_part = reqwest::multipart::Part::text(worker_js.to_string())
        .file_name("worker.js")
        .mime_str("application/javascript+module")
        .map_err(|e| format!("mime ماژول: {e}"))?;
    Ok(reqwest::multipart::Form::new().part("metadata", meta_part).part("worker.js", module_part))
}

#[tauri::command]
pub async fn cloudflare_deploy(
    app: tauri::AppHandle,
    token: String,
    account_id: Option<String>,
    script_name: Option<String>,
) -> serde_json::Value {
    let token = token.trim().to_string();
    let script_name = {
        let raw = script_name.unwrap_or_else(|| D1_NAME.to_string());
        let sanitized: String = raw
            .trim()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
            .collect();
        if sanitized.is_empty() {
            D1_NAME.to_string()
        } else {
            sanitized
        }
    };

    let mut steps: Vec<Step> = Vec::new();
    let fail = |steps: &Vec<Step>, msg: String| -> serde_json::Value {
        json!({ "ok": false, "message": msg, "steps": steps_value(steps) })
    };

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
    {
        Ok(c) => c,
        Err(e) => return fail(&steps, format!("ساخت کلاینت HTTP ناموفق: {e}")),
    };

    // — گام ۱: اعتبارسنجی توکن —
    let verified = cf_call(&client, &token, reqwest::Method::POST, &format!("{CF_API}/user/tokens/verify"), None).await;
    if let Err(e) = verified {
        steps.push(Step { name: "verify_token", ok: false, detail: e.clone() });
        return fail(&steps, format!("توکن کلادفلر پذیرفته نشد: {e}"));
    }
    steps.push(Step { name: "verify_token", ok: true, detail: "توکن معتبر است".into() });

    // — گام ۲: حساب —
    let accounts = match cf_call(&client, &token, reqwest::Method::GET, &format!("{CF_API}/accounts"), None).await {
        Ok(v) => v,
        Err(e) => {
            steps.push(Step { name: "accounts", ok: false, detail: e.clone() });
            return fail(&steps, format!("فهرست حساب‌ها نگرفته شد: {e}"));
        }
    };
    let account_id = resolve_account(&accounts, account_id.as_deref(), &mut steps);
    let account_id = match account_id {
        Ok(id) => id,
        Err(msg) => return fail(&steps, msg),
    };

    // — گام ۳: پایگاه D1 —
    let db_id = match ensure_d1(&client, &token, &account_id, &mut steps).await {
        Ok(id) => id,
        Err((step_name, msg)) => {
            steps.push(Step { name: step_name, ok: false, detail: msg.clone() });
            return fail(&steps, msg);
        }
    };

    // — گام ۴: اسکیما —
    let app_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let central_dir = app_dir.join("resources").join("engine").join("central");
    let schema_path = central_dir.join("schema.sql");
    let schema_sql = std::fs::read_to_string(&schema_path);
    let schema_sql = match schema_sql {
        Ok(s) if !s.trim().is_empty() => s,
        Ok(_) => return fail(&steps, format!("schema.sql خالی است: {}", schema_path.display())),
        Err(e) => return fail(&steps, format!("خواندن schema.sql ({}) ناموفق: {e}", schema_path.display())),
    };
    let chunks = chunk_statements(split_statements(&schema_sql));
    let total = chunks.len();
    for (i, chunk) in chunks.iter().enumerate() {
        let res = cf_call(
            &client,
            &token,
            reqwest::Method::POST,
            &format!("{CF_API}/accounts/{account_id}/d1/database/{db_id}/query"),
            Some(json!({ "sql": chunk })),
        )
        .await;
        if let Err(e) = res {
            steps.push(Step { name: "schema", ok: false, detail: format!("قطعه {}/{}: {e}", i + 1, total) });
            return fail(&steps, format!("اعمال اسکیما در قطعهٔ {}/{} شکست خورد: {e}", i + 1, total));
        }
        steps.push(Step { name: "schema", ok: true, detail: format!("قطعه {}/{} اعمال شد", i + 1, total) });
    }

    // — گام ۵: آپلود ورکر —
    let worker_path = central_dir.join("central-worker.js");
    let worker_js = std::fs::read_to_string(&worker_path);
    let worker_js = match worker_js {
        Ok(s) if !s.trim().is_empty() => s,
        _ => return fail(&steps, format!("central-worker.js یافت نشد یا خالی است: {}", worker_path.display())),
    };
    let auth_secret = random_hex_secret();
    let setup_token = random_hex_secret();
    let metadata = json!({
        "main_module": "worker.js",
        "compatibility_date": COMPAT_DATE,
        "bindings": [
            { "type": "d1", "name": "DB", "id": db_id },
            { "type": "secret_text", "name": "AUTH_SECRET", "text": auth_secret },
            { "type": "secret_text", "name": "NODE_SETUP_TOKEN", "text": setup_token }
        ]
    });
    let form = match build_upload_form(&metadata.to_string(), &worker_js) {
        Ok(f) => f,
        Err(e) => {
            steps.push(Step { name: "worker_upload", ok: false, detail: e.clone() });
            return fail(&steps, format!("آماده‌سازی فرم آپلود ناموفق: {e}"));
        }
    };
    let upload = client
        .put(format!("{CF_API}/accounts/{account_id}/workers/scripts/{script_name}"))
        .header("Authorization", format!("Bearer {token}"))
        .multipart(form)
        .send()
        .await;
    let upload = match upload {
        Ok(res) => res,
        Err(e) => {
            steps.push(Step { name: "worker_upload", ok: false, detail: e.to_string() });
            return fail(&steps, format!("آپلود ورکر ناموفق: {e}"));
        }
    };
    let status = upload.status();
    let body: Value = upload.json().await.unwrap_or(Value::Null);
    if status != 200 && status != 201 {
        let msg = body
            .get("errors")
            .and_then(|e| e.get(0))
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("خطای نامشخص")
            .to_string();
        steps.push(Step { name: "worker_upload", ok: false, detail: format!("HTTP {status}: {msg}") });
        return fail(&steps, format!("آپلود ورکر رد شد (HTTP {status}): {msg}"));
    }
    steps.push(Step { name: "worker_upload", ok: true, detail: format!("ماژول {script_name} آپلود شد") });

    // — گام ۶: دامنهٔ workers.dev —
    let sub = match cf_call(&client, &token, reqwest::Method::GET, &format!("{CF_API}/accounts/{account_id}/workers/subdomain"), None).await {
        Ok(v) => v
            .get("subdomain")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string(),
        Err(e) => {
            steps.push(Step { name: "subdomain", ok: false, detail: e.clone() });
            return fail(&steps, format!("گرفتن subdomain ناموفق: {e}"));
        }
    };
    if sub.is_empty() {
        steps.push(Step { name: "subdomain", ok: false, detail: "subdomain حساب خالی است".into() });
        return fail(&steps, "حساب کلادفلر subdomain workers.dev ندارد — در داشبورد کلادفلر فعالش کنید.".to_string());
    }
    let _ = cf_call(
        &client,
        &token,
        reqwest::Method::POST,
        &format!("{CF_API}/accounts/{account_id}/workers/scripts/{script_name}/subdomain"),
        Some(json!({ "enabled": true, "previews_enabled": false })),
    )
    .await; // اگر قبلاً فعال باشد رد می‌شود — نرم رد می‌کنیم
    let worker_url = format!("https://{script_name}.{sub}.workers.dev");
    steps.push(Step { name: "subdomain", ok: true, detail: worker_url.clone() });

    // — گام ۷: انتظار سلامت —
    let mut healthy = false;
    for _ in 0..12 {
        if client
            .get(format!("{worker_url}/healthz"))
            .timeout(std::time::Duration::from_secs(6))
            .send()
            .await
            .map(|r| r.status() == 200)
            .unwrap_or(false)
        {
            healthy = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
    if !healthy {
        steps.push(Step { name: "healthz", ok: false, detail: "پاسخ 200 نشد در ۶۰ ثانیه".into() });
        return fail(&steps, format!("ورکر ساخته شد ولی {worker_url}/healthz پاسخ نداد — چند دقیقه بعد در ویزار «آزمون اتصال» را بزنید (deploy ممکن است به‌کندی منتشر شود)."));
    }
    steps.push(Step { name: "healthz", ok: true, detail: "سرور مرکزی پاسخ می‌دهد".into() });

    json!({
        "ok": true,
        "worker_url": worker_url,
        "admin_setup_token": setup_token,
        "auth_secret": auth_secret,
        "steps": steps_value(&steps)
    })
}

/// انتخاب حساب: صریح ← تک‌حساب ← خطا با فهرست نام‌ها
fn resolve_account(accounts: &Value, explicit: Option<&str>, steps: &mut Vec<Step>) -> Result<String, String> {
    let arr = accounts.as_array().cloned().unwrap_or_default();
    if let Some(want) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        for a in &arr {
            if a.get("id").and_then(|v| v.as_str()) == Some(want) {
                steps.push(Step { name: "accounts", ok: true, detail: want.to_string() });
                return Ok(want.to_string());
            }
        }
        return Err(format!("حساب «{want}» در این توکن نیست — account_id را چک کنید."));
    }
    if arr.len() == 1 {
        let id = arr[0].get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = arr[0].get("name").and_then(|v| v.as_str()).unwrap_or("");
        steps.push(Step { name: "accounts", ok: true, detail: format!("{name} ({id})") });
        if id.is_empty() {
            return Err("شناسهٔ حساب خالی بود".into());
        }
        return Ok(id);
    }
    let names: Vec<String> = arr
        .iter()
        .map(|a| {
            format!(
                "{} ({})",
                a.get("name").and_then(|v| v.as_str()).unwrap_or("?"),
                a.get("id").and_then(|v| v.as_str()).unwrap_or("?")
            )
        })
        .collect();
    Err(if names.is_empty() {
        "این توکن به هیچ حسابی دسترسی ندارد — مجوز Account Settings:Read را بدهید.".into()
    } else {
        format!("چند حساب با این توکن در دسترس است؛ شناسهٔ حساب را وارد کنید:\n{}", names.join("\n"))
    })
}

/// یافتن یا ساخت پایگاه markaz-central — خروجی: uuid
async fn ensure_d1(
    client: &reqwest::Client,
    token: &str,
    account_id: &str,
    steps: &mut Vec<Step>,
) -> Result<String, (&'static str, String)> {
    let list = cf_call(
        client,
        token,
        reqwest::Method::GET,
        &format!("{CF_API}/accounts/{account_id}/d1/database"),
        None,
    )
    .await
    .map_err(|e| ("d1_list", format!("فهرست پایگاه‌های D1 نگرفته شد: {e}")))?;

    if let Some(arr) = list.as_array() {
        for db in arr {
            if db.get("name").and_then(|n| n.as_str()) == Some(D1_NAME) {
                let id = db.get("uuid").and_then(|u| u.as_str()).unwrap_or("").to_string();
                if !id.is_empty() {
                    steps.push(Step { name: "d1", ok: true, detail: format!("{D1_NAME} موجود بود ({id})") });
                    return Ok(id);
                }
            }
        }
    }
    let created = cf_call(
        client,
        token,
        reqwest::Method::POST,
        &format!("{CF_API}/accounts/{account_id}/d1/database"),
        Some(json!({ "name": D1_NAME })),
    )
    .await
    .map_err(|e| ("d1_create", format!("ساخت پایگاه D1 ناموفق: {e}")))?;
    let id = created
        .get("uuid")
        .and_then(|u| u.as_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() {
        return Err(("d1_create", "پاسخ ساخت D1 شناسه نداشت".into()));
    }
    steps.push(Step { name: "d1", ok: true, detail: format!("{D1_NAME} ساخته شد ({id})") });
    Ok(id)
}
