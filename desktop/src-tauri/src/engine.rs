//! engine.rs — موتور محلی دسکتاپ (سایدکار node + engine-server) — فاز ۲ خط rust + نگهبان
//! ری‌استارت (رفع ENG-1). طراحی: docs/rust/design.md §۲ و §۴ — بایند فقط loopback، پورت
//! ۸۷۸۷ پیش‌فرض (اگر اشغال بود موتور خودش پورت آزاد می‌گیرد و در engine-config.json می‌نویسد).
//!
//! v1.27.۰۳ — تعویض موتور: workerd (باینری بومی خارجی) از مسیر دسکتاپ حذف شد. دو گزارش
//! نصاب واقعی + issueهای باز upstream (workerd#4668/#7581 — access violation 0xc0000005 هنگام
//! init روی برخی ویندوزها، حتی با redist تازه) نشان داد این وابستگی بومی قابل‌اعتماد نیست.
//! حالا پوسته، `engine-server.js` (باندل engine.mjs با موتور درون‌پروسه‌ای — scripts/engine/)
//! را با سایدکار node اجرا می‌کند: همان باندل‌های ورکر (Hono + D1) روی shim کامل D1 از
//! node:sqlite روی همان فایل SQLite — دادهٔ کاربر بدون تبدیل حفظ می‌شود. خواندن پورت‌های
//! واقعی از dataDir/engine-config.json (قرارداد با engine.mjs — پورت‌های resolve‌شده نهایی).
//!
//! نگهبان (engine_watchdog.rs): اگر موتور در میانهٔ کار بمیرد، با انتظار ۲/۵/۱۰ ثانیه دوباره
//! بالا می‌آید؛ سقف ۳ تلاش در پنجرهٔ ۱۰ دقیقه‌ای؛ پس از سقف رویداد engine:down و وضعیت صریح
//! Failed در lib.rs. خاموشی عمدی (خروج اپ / Drop) با پرچم stop شناخته می‌شود و هرگز
//! ری‌استارت نمی‌خواهد — کد خروج ملاک نیست، پرچم ملاک است.
//!
//! M4 — سلامت مستقل Games Worker: نگهبان هر دَور پایش (۵ ثانیه) سلامت اصلی و بازی‌ها را
//! جداگانه می‌سنجد (هر دو /health روی loopback). سیاست محافظه‌کار Degraded: فقط بازی‌ها
//! ۳ دَور پیاپی ناسالم با اپ سالم → وضعیت Degraded + رویداد engine:degraded (بدون
//! ری‌استارت — اپ کار می‌کند)؛ برگشت سلامت → engine:degraded_recovered و بازگشت به Ready؛
//! اگر ۳ دَور دیگر (مجموعاً ~۶ دَور) هم ناسالم ماند → یک‌بار ری‌استارت کودک با همان مسیر
//! موجود (رویداد engine:restarting موجود) و صفرشدن شمارش‌ها. خروج خود کودک → همان مسیر
//! نگهبان اصلی؛ سلامت اصلی ناموفق → همان مسیر موجود (هیچ تغییر رفتاری).
//!
//! کامپایل در CI (cargo در محیط سندباکس جاری نیست) — گیت ساختاری desktop:check
//! هم‌گامی فایل‌ها را می‌گیرد و کامپایل واقعی در خط CI با Rust stable انجام می‌شود.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::deploy_plan::sha256_hex;
use crate::engine_watchdog::{next_action, now_ms, RestartRecord, WatchdogAction, WatchdogEvent};

/// پورت پیش‌فرض موتور محلی — همان devUrl پوسته (tauri.conf.json)
const DEFAULT_PORT: u16 = 8787;

/// پورت پیش‌فرض سرویس بازی‌ها — به موتور «درخواست» می‌شود؛ اگر اشغال بود موتور پورت دیگری
/// می‌گیرد و نهایی را در engine-config.json می‌نویسد (Rust همان را می‌خواند).
const DEFAULT_GAMES_PORT: u16 = 8788;

/// گام پولینگ نگهبان برای دیدن خروج فرزند — هم‌تراز با گام انتظار سلامت
const SUPERVISE_POLL_MS: u64 = 500;

/// مهلت سالم‌شدن پس از هر ری‌استارت — همان سقف بوت نخست (۳۰ ثانیه)
const RESTART_HEALTH_TIMEOUT: Duration = Duration::from_secs(30);

/// M4 — چند دَور پیاپی ناسالمیِ ورکر بازی‌ها (با اپ اصلی سالم) وضعیت Degraded می‌گیرد
/// (هر دَور = RUNTIME_POLL_EVERY گام SUPERVISE_POLL_MS = ۵ ثانیه؛ ۳ دَور ≈ ۱۵ ثانیه)
const GAMES_DEGRADED_ROUNDS: u32 = 3;

/// M4 — پس از ۳ دَور دیگر (مجموعاً ~۶ دَور ≈ ۳۰ ثانیه) یک‌بار ری‌استارت کودک با همان مسیر موجود
const GAMES_RESTART_ROUNDS: u32 = 6;

/// فاصلهٔ پایش زمان اجرا (مُهر ری‌استارت/سلامت بازی‌ها) — ۱۰ گام پولینگ = ۵ ثانیه
const RUNTIME_POLL_EVERY: u32 = 10;

/// گیرندهٔ رویدادهای نگهبان — lib.rs آن را به رخدادهای تائوری (engine:restarting و…) می‌بندد
pub type EngineEventSink = Arc<dyn Fn(WatchdogEvent) + Send + Sync>;

/// v1.27.۰۳ — همهٔ مسیرهای لازم برای spawn موتور adapter (بوت نخست و هر ری‌استارت نگهبان)
#[derive(Clone)]
pub struct EngineLaunch {
    /// سایدکار node (نصاب) یا node سیستم (توسعه)
    pub node: PathBuf,
    /// باندل موتور: engine-server.js در resources/engine
    pub server_js: PathBuf,
    /// data dir کاربر (کانفیگ/لاگ/دیتابیس این‌جاست)
    pub data_dir: PathBuf,
    /// باندل ورکر اصلی (Hono) — در نصاب: resources/engine/bundles/worker.js (v1.27.۰۵ — قبلاً central/ بود؛ گیت ⑩)
    pub main_bundle: PathBuf,
    /// باندل ورکر بازی‌ها — در نصاب: resources/engine/bundles/games.js (v1.27.۰۵ — قبلاً central/ بود؛ گیت ⑩)
    pub games_bundle: PathBuf,
    /// پوشهٔ public برای سرویس استاتیک
    pub public_dir: PathBuf,
}

pub struct LocalEngine {
    pub port: u16,
    /// پرچم خاموشی عمدی — Drop و خروج اپ آن را می‌گذارند؛ روی true نگهبان هیچ ری‌استارتی نمی‌کند
    stop: Arc<AtomicBool>,
    /// کودک جاری — بین thread نگهبان و Drop مشترک؛ قفل فقط برای try_wait/kill کوتاه نگه داشته می‌شود
    child_slot: Arc<Mutex<Option<Child>>>,
}

/// پیدا کردن باینری node: متغیر محیطی ← کنار برنامه (سایدکار نصاب: ریشه و binaries/).
/// v1.27.۰۴ — خروجی Result و بدون حدس PATH در نصاب: گزارش واقعی EISDIR (lstat 'C:') نشان داد
/// نودی که از PATH/شیم میانی بالا می‌آید ممکن است argv دست‌خورده بگیرد؛ شکست صریح با پیام فارسی
/// بهتر از اجرای کور است. PATH فقط در حالت توسعه (CENTER_ENGINE_REPO) مجاز است.
pub fn find_node_binary() -> Result<PathBuf, String> {
    if let Ok(from_env) = std::env::var("CENTER_NODE_BIN") {
        let p = PathBuf::from(from_env);
        if p.is_file() {
            return Ok(p);
        }
    }
    let exe_name = if cfg!(windows) { "node.exe" } else { "node" };
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf())) {
        let mut candidates = vec![exe_dir.join(exe_name), exe_dir.join("binaries").join(exe_name)];
        if let Ok(entries) = std::fs::read_dir(exe_dir.join("binaries")) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                if name.to_string_lossy().starts_with("node") {
                    candidates.push(entry.path());
                }
            }
        }
        for c in &candidates {
            if c.is_file() {
                return Ok(c.clone());
            }
        }
    }
    // توسعه — node روی PATH (همان nodeی که npm/cargo-check با آن کار می‌کند)
    if std::env::var("CENTER_ENGINE_REPO").is_ok() {
        return Ok(PathBuf::from(exe_name));
    }
    Err("سایدکار node.exe کنار برنامه یافت نشد — نصب رانتایم ناقص است؛ نصاب را دوباره اجرا کنید و اگر تکرار شد «پیام به سازنده» را بزنید.".to_string())
}

/// پورت آزاد روی loopback: ۸۷۸۷ پیش‌فرض، وگرنه پورت گذرا از هستهٔ سیستم.
/// (فقط برای «درخواست» اولیه به موتور — پورت نهایی از engine-config.json خوانده می‌شود.)
pub fn free_port() -> u16 {
    if TcpListener::bind(("127.0.0.1", DEFAULT_PORT)).is_ok() {
        return DEFAULT_PORT;
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(DEFAULT_PORT)
}

/// پروب HTTP ساده با std — فقط سطر وضعیت پاسخ خوانده می‌شود (بدون وابستگی جدید)
fn health_once(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok().unwrap_or(());
    let req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 256];
    let n = stream.read(&mut head).unwrap_or(0);
    let head = String::from_utf8_lossy(&head[..n]);
    head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")
}

/// ۴-۲ — آیا ری‌استارت از پنل در نوبت است؟ مُهر را endpoint عمومی سبک
/// /api/system/restart-status می‌گوید (ناظر سشن اپ ندارد؛ یک بولین بی‌حساسیت).
fn restart_scheduled_once(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok().unwrap_or(());
    let req = format!("GET /api/system/restart-status HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    // سربرگ + اندکی از بدنه — بدنهٔ کوچک JSON در همان ۱ کیلوبایت اول می‌آید
    let mut buf = [0u8; 1024];
    let n = stream.read(&mut buf).unwrap_or(0);
    let text = String::from_utf8_lossy(&buf[..n]);
    text.contains("\"scheduled\":true")
}

/// v1.27.۰۳ — انتظار engine-config.json (قرارداد engine.mjs): موتور بعد از قطعی پورت‌ها
/// (resolve اشغال ۸۷۸۷/۸۷۸۸) و پیش از سبزشدن /health این فایل را می‌نویسد. Rust پورت‌های
/// نهایی را از همین‌جا می‌خواند — ریسک «پورت اشغال» از ریشه بسته شد (دیگر پورت پیش‌فرضِ
/// فرضی پایش نمی‌شود). بازگشت: (port, games_port). ناموفق = None (تماس‌گیرنده پیام فارسی می‌سازد).
fn wait_engine_config(data_dir: &Path, timeout: Duration) -> Option<(u16, u16)> {
    let path = data_dir.join("engine-config.json");
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                let port = v.get("port").and_then(|p| p.as_u64()).map(|p| p as u16);
                let games = v.get("gamesPort").and_then(|p| p.as_u64()).map(|p| p as u16);
                if let (Some(port), Some(games)) = (port, games) {
                    return Some((port, games));
                }
            }
        }
        std::thread::sleep(Duration::from_millis(SUPERVISE_POLL_MS));
    }
    None
}

/// spawn یک نمونهٔ موتور adapter — node + engine-server.js با پرچم‌های مسیرها.
/// v1.27.۰۴ — ریشه‌یابی گزارش واقعی EISDIR (lstat 'C:'): نود ورودی main را که بعد از
/// path.resolve به «ریشهٔ درایو» برسد، در realpathSync می‌میرد (lstat ریشهٔ درایو بدون
/// بک‌اسلش = EISDIR). خط فرمان ما طبق چیدمان tauri-bundler درست بود، ولی argv در لایهٔ
/// میانی ویندوز (AV/EDR — ریسک #۴ سند ریسک) دست‌خورده بود. رفع ساختاری: **main نسبی** +
/// **cwd صریح روی پوشهٔ باندل** — هیچ مسیر مطلقی به‌عنوان ورودی نود پارس نمی‌شود و کلاس
/// خطا از ریشه می‌میرد؛ بقیهٔ مسیرها (دیتابیس/باندل‌ها) آرگومان‌های برنامهٔ خود ما هستند
/// و مستقیماً با fs خوانده می‌شوند، نه با resolver نود.
/// stderr/stdout به data/engine.log می‌رود؛ پیش از spawn هم خط فرمان کامل در لاگ می‌نشیند
/// تا هر گزارش بعدی خودش را توضیح دهد.
fn spawn_engine(plan: &EngineLaunch) -> Result<Child, String> {
    let engine_dir = plan
        .server_js
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "مسیر باندل موتور فاقد پوشهٔ والد است".to_string())?;
    let main_arg = plan
        .server_js
        .file_name()
        .map(|f| f.to_os_string())
        .ok_or_else(|| "نام فایل باندل موتور نامعتبر است".to_string())?;

    let mut cmd = Command::new(&plan.node);
    cmd.arg(&main_arg)
        .arg("--engine")
        .arg("adapter")
        .arg("--data-dir")
        .arg(&plan.data_dir)
        .arg("--port")
        .arg(DEFAULT_PORT.to_string())
        .arg("--games-port")
        .arg(DEFAULT_GAMES_PORT.to_string())
        .arg("--main-bundle")
        .arg(&plan.main_bundle)
        .arg("--games-bundle")
        .arg(&plan.games_bundle)
        .arg("--public-dir")
        .arg(&plan.public_dir)
        .stdout(Stdio::null())
        .current_dir(&engine_dir);
    // ۱.۲۷.۰۲ — بدون پنجرهٔ کنسول کنار برنامه در ویندوز
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    match std::fs::File::options()
        .create(true)
        .append(true)
        .open(plan.data_dir.join("engine.log"))
    {
        Ok(f) => {
            cmd.stderr(Stdio::from(f));
        }
        Err(_) => {
            cmd.stderr(Stdio::null());
        }
    }
    // تشخیص‌پذیری — خط فرمان کامل پیش از spawn در لاگ می‌نشیند؛ گزارش‌های بعدی خودتوضیح‌اند
    if let Ok(mut f) = std::fs::File::options()
        .create(true)
        .append(true)
        .open(plan.data_dir.join("engine.log"))
    {
        let _ = writeln!(
            f,
            "[desktop] spawn cwd={} cmd={} {} --engine adapter --data-dir {} --port {} --games-port {} --main-bundle {} --games-bundle {} --public-dir {}",
            engine_dir.display(),
            plan.node.display(),
            main_arg.to_string_lossy(),
            plan.data_dir.display(),
            DEFAULT_PORT,
            DEFAULT_GAMES_PORT,
            plan.main_bundle.display(),
            plan.games_bundle.display(),
            plan.public_dir.display(),
        );
    }
    cmd.spawn()
        .map_err(|e| format!("spawn موتور محلی ناموفق: {e}"))
}

/// v1.27.۰۵ — اعتبارسنجی هش/نسخهٔ رانتایم در برابر manifest نصاب (PRECHECK پوسته):
/// مونتاژ نصاب، هش‌های sha256 و نسخهٔ سایدکار node را در engine-runtime-manifest.json کنار
/// engine-server.js ثبت می‌کند (داخل resources/engine — scripts/desktop/config.mjs — تا glob
/// resources نصاب آن را شحنه کند). اگر manifest نبود، حالت توسعه است (باندل مخزن manifest
/// ندارد) و بی‌خطا رد می‌شود؛ اگر بود، هر ناهم‌گامی یعنی نصب ناقص/خراب — پیش از هر spawn با
/// پیام فارسی نام‌وبنام رد می‌شود تا کاربر به Repair (اجرای دوبارهٔ نصاب) هدایت شود.
fn verify_runtime_integrity(launch: &EngineLaunch) -> Result<(), String> {
    let engine_dir = launch
        .server_js
        .parent()
        .ok_or_else(|| "مسیر باندل موتور فاقد پوشهٔ والد است".to_string())?;
    let manifest_path = engine_dir.join("engine-runtime-manifest.json");
    if !manifest_path.is_file() {
        return Ok(()); // حالت توسعه — باندل مخزن manifest ندارد
    }
    let manifest: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&manifest_path)
            .map_err(|e| format!("خواندن manifest نصاب ناموفق بود: {e}"))?,
    )
    .map_err(|e| format!("manifest نصاب پارس نشد — نصاب را دوباره اجرا کنید (Repair): {e}"))?;
    let expected = |section: &str, field: &str| -> Result<String, String> {
        manifest
            .get(section)
            .and_then(|s| s.get(field))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| {
                format!("فیلد «{section}.{field}» در manifest نصاب نیست — نصاب را دوباره اجرا کنید (Repair).")
            })
    };
    for (file, label, section, field) in [
        (&launch.server_js, "باندل موتور (engine-server.js)", "engineServer", "sha256"),
        (&launch.main_bundle, "باندل ورکر اصلی (bundles/worker.js)", "bundles", "mainSha256"),
        (&launch.games_bundle, "باندل ورکر بازی‌ها (bundles/games.js)", "bundles", "gamesSha256"),
    ] {
        let want = expected(section, field)?;
        let bytes = std::fs::read(file).map_err(|e| format!("خواندن «{label}» ناموفق بود: {e}"))?;
        if sha256_hex(&bytes) != want {
            return Err(format!(
                "هش «{label}» با manifest نصاب هم‌خوان نیست — نصب رانتایم ناقص یا خراب است؛ نصاب را دوباره اجرا کنید (Repair)."
            ));
        }
    }
    // نسخهٔ سایدکار node — فقط اگر manifest ثبتش دارد (manifestهای کهنه این گام را رد می‌کنند)
    if let Some(want_ver) = manifest.get("nodeVersion").and_then(|v| v.as_str()) {
        let mut cmd = Command::new(&launch.node);
        cmd.arg("--version");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let out = cmd
            .output()
            .map_err(|e| format!("اجرای سایدکار node برای وارسی نسخه ناموفق بود — نصاب را دوباره اجرا کنید (Repair): {e}"))?;
        if !out.status.success() {
            return Err(
                "سایدکار node پاسخ «--version» نداد — نصب رانتایم ناقص است؛ نصاب را دوباره اجرا کنید (Repair)."
                    .to_string(),
            );
        }
        let got = String::from_utf8_lossy(&out.stdout);
        let got = got.trim();
        let got = got.strip_prefix('v').unwrap_or(got); // node نسخه را با پیشوند v می‌دهد
        if got != want_ver {
            return Err(format!(
                "نسخهٔ سایدکار node ({got}) با نسخهٔ ثبت‌شده در manifest نصاب ({want_ver}) هم‌خوان نیست — نصاب را دوباره اجرا کنید (Repair)."
            ));
        }
    }
    Ok(())
}

impl LocalEngine {
    /// بالا آوردن موتور adapter با مشخصات کامل اجرا (EngineLaunch).
    /// on_event: گیرندهٔ رویدادهای نگهبان — در lib.rs به emit تائوری بسته می‌شود.
    /// v1.27.۰۳: پس از spawn منتظر engine-config.json می‌ماند تا پورت نهایی معلوم شود.
    /// v1.27.۰۴: پیش‌بازرسی رانتایم — هر فایل غایب با نام دقیق و پیام فارسی، پیش از هر spawn
    /// (تفکیک «نصب ناقص» از «نود نتوانست main را resolve کند» — درس گزارش EISDIR).
    /// v1.27.۰۵: پس از پیش‌بازرسی، اعتبارسنجی هش سه فایل رانتایم و نسخهٔ سایدکار در برابر
    /// manifest نصاب (verify_runtime_integrity) — نبود manifest (حالت توسعه) بی‌خطا رد می‌شود.
    pub fn start(launch: EngineLaunch, on_event: EngineEventSink) -> Result<Self, String> {
        let mut errs: Vec<String> = Vec::new();
        if !launch.server_js.is_file() {
            errs.push(format!("باندل موتور (engine-server.js) یافت نشد: {}", launch.server_js.display()));
        }
        if !launch.main_bundle.is_file() {
            errs.push(format!("باندل ورکر اصلی یافت نشد: {}", launch.main_bundle.display()));
        }
        if !launch.games_bundle.is_file() {
            errs.push(format!("باندل ورکر بازی‌ها یافت نشد: {}", launch.games_bundle.display()));
        }
        if !launch.public_dir.join("index.html").is_file() {
            errs.push(format!("پوستهٔ کلاینت (public/index.html) یافت نشد: {}", launch.public_dir.display()));
        }
        if !errs.is_empty() {
            return Err(format!(
                "نصب رانتایم ناقص است — «تلاش دوباره» را بزنید و اگر تکرار شد، نصاب را دوباره اجرا کنید؛ جزئیات: {}",
                errs.join(" | ")
            ));
        }
        verify_runtime_integrity(&launch)?;
        std::fs::create_dir_all(&launch.data_dir).map_err(|e| format!("ساخت data dir: {e}"))?;
        let plan = launch;
        let child = spawn_engine(&plan)?;
        let stop = Arc::new(AtomicBool::new(false));
        let child_slot = Arc::new(Mutex::new(Some(child)));
        // خاموشی فقط با Drop ساختار LocalEngine (kill + wait) — std::process::Command
        // متد kill_on_drop ندارد (API توکیو است) و نیازش هم نیست.
        let Some((port, games_port)) = wait_engine_config(&plan.data_dir, RESTART_HEALTH_TIMEOUT) else {
            kill_child(&child_slot);
            return Err(format!(
                "موتور محلی ظرف {} ثانیه کانفیگ (engine-config.json) نداد — لاگ: dataDir/engine.log",
                RESTART_HEALTH_TIMEOUT.as_secs()
            ));
        };
        supervise(plan, port, games_port, Arc::clone(&stop), Arc::clone(&child_slot), on_event);
        Ok(Self { port, stop, child_slot })
    }

    /// پولینگ /health تا سقف مهلت — از thread فراخوانی می‌شود
    pub fn wait_healthy(&self, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if health_once(self.port) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        false
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

/// به‌کارگیری thread نگهبان — detach می‌شود؛ فقط با پرچم stop تمام می‌شود (Drop یا خروج اپ)
/// ENG-4/M4: همان thread پایش مُهر ری‌استارت پنل و سلامت جداگانهٔ دو سرویس را هم انجام می‌دهد
/// (هر دو سرویس در یک پروسهٔ موتور هستند؛ ری‌استارتِ هر دو = spawn دوبارهٔ همان child).
/// پورت‌ها mut اند: پس از هر spawn دوباره از engine-config.json خوانده می‌شوند تا پروب مستقل
/// بازی‌ها همیشه gamesPort نهایی را ببیند (M4).
fn supervise(
    plan: EngineLaunch,
    mut port: u16,
    mut games_port: u16,
    stop: Arc<AtomicBool>,
    child_slot: Arc<Mutex<Option<Child>>>,
    on_event: EngineEventSink,
) {
    std::thread::spawn(move || {
        let mut history: Vec<RestartRecord> = Vec::new();
        // وضعیت پایش بازی‌ها (M4) — شمارش دَورهای ناسالم متوالی + آیا Degraded اعلام شده است
        let mut games_fails: u32 = 0;
        let mut games_degraded = false;
        let mut tick: u32 = 0;
        loop {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            std::thread::sleep(Duration::from_millis(SUPERVISE_POLL_MS));
            tick += 1;
            // پایش زمان اجرا هر ۵ ثانیه — ① مُهر ری‌استارت پنل (خروج عمدی، حساب کرش ندارد)
            // ② سلامت جداگانهٔ اصلی و بازی‌ها (پروب مستقل gamesPort — M4)
            if tick % RUNTIME_POLL_EVERY == 0 && !stop.load(Ordering::SeqCst) {
                if restart_scheduled_once(port) {
                    eprintln!("[desktop] ری‌استارت سامانه از پنل درخواست شد — خاموشی تمیز و بالا آوردن دوباره");
                    on_event(WatchdogEvent::Restarting { attempt: 0, delay_ms: 0 });
                    kill_child(&child_slot);
                    history.clear();
                    games_fails = 0;
                    games_degraded = false;
                    match spawn_engine(&plan) {
                        Ok(new_child) => {
                            if let Ok(mut guard) = child_slot.lock() {
                                *guard = Some(new_child);
                            }
                            // پس از ری‌استارت پنل هم پورت‌های نهایی ممکن است عوض شوند — هر دو از
                            // کانفیگ خوانده می‌شوند (پروب بازی‌ها باید gamesPort تازه را ببیند — M4)
                            let Some((new_port, new_games_port)) =
                                wait_engine_config(&plan.data_dir, RESTART_HEALTH_TIMEOUT)
                            else {
                                kill_child(&child_slot);
                                eprintln!("[desktop] پس از ری‌استارت پنل کانفیگ نیامد — تلاش دوبارهٔ نگهبان");
                                continue;
                            };
                            port = new_port;
                            games_port = new_games_port;
                            if wait_healthy_while(port, &stop, RESTART_HEALTH_TIMEOUT) {
                                on_event(WatchdogEvent::Restored);
                                eprintln!("[desktop] ری‌استارت پنل کامل شد — موتور دوباره روی پورت {port} آماده است");
                            }
                        }
                        Err(e) => {
                            eprintln!("[desktop] spawn دوبارهٔ موتور پس از ری‌استارت پنل ناموفق بود: {e}");
                        }
                    }
                    continue;
                }
                let main_ok = health_once(port);
                let games_ok = health_once(games_port);
                if games_ok {
                    // M4 — برگشت سلامت بازی‌ها: اگر Degraded اعلام شده بود رویداد بازگشت می‌رود و
                    // lib.rs فاز را به Ready برمی‌گرداند؛ در هر حال شمارش‌ها صفر می‌شود
                    if games_degraded {
                        eprintln!("[desktop] ورکر بازی‌ها بدون ری‌استارت دوباره سالم است — بازگشت به Ready");
                        on_event(WatchdogEvent::DegradedRecovered);
                    } else if games_fails > 0 {
                        eprintln!("[desktop] سرویس بازی‌ها دوباره سالم است — شمارش نگهبان از صفر");
                    }
                    games_fails = 0;
                    games_degraded = false;
                } else if main_ok {
                    // M4 — فقط بازی‌ها ناسالم (اپ اصلی سالم): سیاست محافظه‌کار — ۳ دَور پیاپی
                    // → وضعیت Degraded بدون ری‌استارت؛ ۳ دَور دیگر (مجموعاً ~۶) → یک‌بار ری‌استارت.
                    // اپ اصلی در هیچ‌یک از این دو مسیر قطع نمی‌شود.
                    games_fails += 1;
                    if games_fails == GAMES_DEGRADED_ROUNDS {
                        games_degraded = true;
                        eprintln!("[desktop] ورکر بازی‌ها {GAMES_DEGRADED_ROUNDS} دَور پیاپی پاسخ نداد — وضعیت Degraded (سرویس اصلی سالم است)");
                        on_event(WatchdogEvent::Degraded { fails: games_fails });
                    } else if games_fails >= GAMES_RESTART_ROUNDS {
                        eprintln!("[desktop] ورکر بازی‌ها پس از Degraded هم پاسخ نمی‌دهد — ری‌استارت یک‌بارهٔ کودک با همان مسیر موجود");
                        on_event(WatchdogEvent::Restarting { attempt: 1, delay_ms: 0 });
                        kill_child(&child_slot);
                        match spawn_engine(&plan) {
                            Ok(new_child) => {
                                if let Ok(mut guard) = child_slot.lock() {
                                    *guard = Some(new_child);
                                }
                                // پورت‌های نهایی ممکن است پس از spawn دوباره عوض شوند — هر دو از کانفیگ
                                let Some((new_port, new_games_port)) =
                                    wait_engine_config(&plan.data_dir, RESTART_HEALTH_TIMEOUT)
                                else {
                                    kill_child(&child_slot);
                                    eprintln!("[desktop] پس از ری‌استارت بازی‌ها کانفیگ نیامد — تلاش دوبارهٔ نگهبان");
                                    continue;
                                };
                                port = new_port;
                                games_port = new_games_port;
                                if wait_healthy_while(port, &stop, RESTART_HEALTH_TIMEOUT) {
                                    on_event(WatchdogEvent::Restored);
                                    eprintln!("[desktop] ری‌استارت بازی‌ها کامل شد — موتور دوباره روی پورت {port} آماده است");
                                }
                            }
                            Err(e) => {
                                eprintln!("[desktop] spawn دوبارهٔ موتور برای بازی‌ها ناموفق بود: {e}");
                            }
                        }
                        // پس از ری‌استارت شمارش‌ها صفر — اگر بازی‌ها باز ناسالم ماند، چرخهٔ Degraded
                        // تازه از صفر شروع می‌شود (باز هم بدون قطع اپ اصلی؛ مرگ خود کودک → مسیر موجود)
                        games_fails = 0;
                        games_degraded = false;
                        continue; // کودک تازه است — این دَور try_wait لازم نیست (عین مسیر ری‌استارت پنل)
                    }
                }
                // اگر اپ اصلی هم ناسالم بود: مرگ کل پروسه است — شاخهٔ try_wait زیر همان را می‌گیرد
            }
            // خروج فرزند را با قفل کوتاه ببین — پولینگ try_wait مسدودکننده نیست
            let exited = {
                let mut guard = match child_slot.lock() {
                    Ok(g) => g,
                    Err(_) => return, // قفل مسموم — ادامهٔ نظارت بی‌معناست
                };
                match guard.as_mut() {
                    Some(c) => c.try_wait().ok().flatten(),
                    None => None,
                }
            };
            let Some(_status) = exited else { continue };
            // خروج عمدی (خاموشی اپ/Drop) — هرگز ری‌استارت نمی‌خواهد؛ کد خروج ملاک نیست
            if stop.load(Ordering::SeqCst) {
                return;
            }
            handle_unexpected_exit(&plan, port, &stop, &child_slot, &on_event, &mut history);
        }
    });
}

/// مرگ ناگهانی فرزند — تصمیم نگهبان و اجرای آن: انتظار backoff، spawn دوباره، ثبت بازرسی
fn handle_unexpected_exit(
    plan: &EngineLaunch,
    port: u16,
    stop: &AtomicBool,
    child_slot: &Mutex<Option<Child>>,
    on_event: &EngineEventSink,
    history: &mut Vec<RestartRecord>,
) {
    let exit_at = now_ms();
    let mut decision = next_action(history, now_ms(), exit_at);
    if let WatchdogAction::ResetWindow = decision {
        *history = Vec::new();
        eprintln!("[desktop] پنجرهٔ ۱۰ دقیقه‌ای نگهبان موتور گذشت — شمارش تلاش‌ها از صفر");
        decision = next_action(history, now_ms(), exit_at);
    }
    match decision {
        // با تاریخچهٔ خالی این بازو رخ نمی‌دهد — فقط برای کامل بودن match
        WatchdogAction::ResetWindow => {}
        WatchdogAction::Restart(delay_ms) => {
            let attempt = history.len() as u32 + 1;
            eprintln!("[desktop] موتور ناگهانی بسته شد — راه‌اندازی دوباره تا {} ثانیه دیگر", delay_ms / 1000);
            on_event(WatchdogEvent::Restarting { attempt, delay_ms });
            if !sleep_interruptible(Duration::from_millis(delay_ms), stop) {
                return; // خاموشی عمدی در میانهٔ انتظار — کودک مرده و کاری نمانده
            }
            match spawn_engine(plan) {
                Ok(new_child) => {
                    if let Ok(mut guard) = child_slot.lock() {
                        *guard = Some(new_child);
                    }
                    // پورت نهایی ممکن است پس از spawn دوباره عوض شود — از کانفیگ می‌خوانیم
                    let new_port = wait_engine_config(&plan.data_dir, RESTART_HEALTH_TIMEOUT)
                        .map(|(p, _)| p)
                        .unwrap_or(port);
                    if wait_healthy_while(new_port, stop, RESTART_HEALTH_TIMEOUT) {
                        // رشتهٔ خرابی بسته شد — شمارش تلاش‌ها برای حادثهٔ بعدی از صفر
                        *history = Vec::new();
                        eprintln!("[desktop] موتور پس از ری‌استارت دوباره روی پورت {new_port} آماده است");
                        on_event(WatchdogEvent::Restored);
                    } else if stop.load(Ordering::SeqCst) {
                        return; // خاموشی در حین انتظار سلامت — Drop خودش کودک را می‌بندد
                    } else {
                        // بالا نیامد — ببند و به‌عنوان تلاش ناکام ثبت کن تا سقف پنجره پر شود
                        kill_child(child_slot);
                        history.push(RestartRecord { exit_at_ms: now_ms(), delay_ms });
                        eprintln!("[desktop] موتور پس از ری‌استارت ظرف ۳۰ ثانیه سالم نشد — تلاش {attempt} ثبت شد");
                    }
                }
                Err(e) => {
                    history.push(RestartRecord { exit_at_ms: now_ms(), delay_ms });
                    eprintln!("[desktop] spawn دوبارهٔ موتور ناموفق بود — تلاش {attempt} ثبت شد: {e}");
                }
            }
        }
        WatchdogAction::GiveUp => {
            let attempts = history.len() as u32;
            eprintln!("[desktop] نگهبان موتور تسلیم شد — {attempts} تلاش در پنجرهٔ ۱۰ دقیقه بی‌نتیجه بود؛ فقط «تلاش دوبارهٔ» دستی اثر می‌کند");
            on_event(WatchdogEvent::Down { attempts });
            // منتظر خاموشی عمدی بمان — engine_retry پوستهٔ slot را می‌بندد و Drop پرچم را می‌گذارد
            while !stop.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

/// انتظار قابل‌قطع با پرچم خاموشی — false یعنی خاموشی درخواست شده
fn sleep_interruptible(total: Duration, stop: &AtomicBool) -> bool {
    let deadline = Instant::now() + total;
    while Instant::now() < deadline {
        if stop.load(Ordering::SeqCst) {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    !stop.load(Ordering::SeqCst)
}

/// پولینگ /health تا سقف مهلت با پایش پرچم خاموشی — برای انتظار پس از هر ری‌استارت.
/// false یعنی سالم نشد یا خاموشی درخواست شده (تماس‌گیرنده پرچم را دوباره می‌بیند).
fn wait_healthy_while(port: u16, stop: &AtomicBool, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if stop.load(Ordering::SeqCst) {
            return false;
        }
        if health_once(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

/// kill + wait کودک جاری — هم در Drop هم برای پاک‌سازی تلاش ناکام نگهبان
fn kill_child(child_slot: &Mutex<Option<Child>>) {
    if let Ok(mut guard) = child_slot.lock() {
        if let Some(c) = guard.as_mut() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

/// خاموشی تمیز با Drop — خروج اپ یا drop شدن وضعیت، موتور را می‌بندد
/// (kill + wait — معادل kill_on_drop توکیو، با std). پرچم stop هم thread نگهبان را
/// در ≤ یک گام پولینگ تمام می‌کند؛ پس از خاموشی عمدی هیچ ری‌استارتی رخ نمی‌دهد.
impl Drop for LocalEngine {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        kill_child(&self.child_slot);
    }
}
