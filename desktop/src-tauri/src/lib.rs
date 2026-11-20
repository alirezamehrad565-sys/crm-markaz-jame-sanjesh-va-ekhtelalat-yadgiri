//! lib.rs — پوستهٔ دسکتاپ مرکز جامع (فاز ۲ + v1.26.0 راه‌اندازی نخست؛ docs/rust/first-run-and-cloud.md)
//!
//! v1.26.0 — قرارداد بوت عوض شد: پنجره هرگز روی صفحهٔ خالی نمی‌ماند. frontendDist فقط
//! صفحهٔ بوت (boot-dist) است که با desktop_status وضعیت موتور را می‌پرسد؛ شکست موتور =
//! وضعیت صریح Failed{message, log_tail} با سه کنش (تلاش دوباره / پوشهٔ داده / پیام به سازنده).
//! productName حالا ASCII است (Markaz-Jame-Desktop) — مسیر فارسی نصب، workerd را روی ویندوز
//! در خواندن کانفیگ می‌کشت (docs/rust/first-run-and-cloud.md §۰).
//!
//! فاز A (docs/rust/server-cloud-update-design.md §۱) — قرارداد وضعیت سرور محلی: آینهٔ
//! EngineStatusMirror از همان نگهبان موجود تغذیه می‌شود (FSM دوم نیست) و با فرمان
//! engine_status و رویداد engine:status به فرانت می‌رسد؛ engine_restart مسیر صادقانهٔ
//! بوت موجود را می‌رود و open_data_dir در ویندوز با CREATE_NO_WINDOW باز می‌کند.
//!
//! کامپایل در CI (cargo در محیط سندباکس جاری نیست) — گیت ساختاری desktop:check
//! هم‌گامی فایل‌ها را می‌گیرد و کامپایل واقعی در خط CI با Rust stable انجام می‌شود.

mod cf_deploy;
mod deploy_plan;
mod engine;
mod engine_watchdog;
// ۱.۲۷.۱۳ — چرخهٔ عمر موتور با Windows Job Object (P0-3 ممیزی §۳) — فقط ویندوز؛
// جاب cargo-check/test لینوکسی CI این ماژول را نمی‌بیند و بدون آن کامپایل می‌شود.
#[cfg(windows)]
mod job_object;
mod secure_store;

use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// وضعیت موتور محلی — نگه‌داری سایدکار تا خروج اپ (Drop = خاموشی تمیز)
pub struct LocalEngineSlot(Mutex<Option<engine::LocalEngine>>);

/// v1.26.0 — وضعیت صریح بوت برای صفحهٔ بوت (سه حالت، هیچ حالت خاموشی نیست)
/// M4 — واریانت چهارم Degraded: اپ اصلی سالم و کار می‌کند اما ورکر بازی‌ها پایین است
/// (پروب مستقل gamesPort — نگهبان خودش بازگشت/ری‌استارت را مدیریت می‌کند)
#[derive(Clone)]
pub enum EnginePhase {
    Booting,
    Ready { port: u16, base_url: String },
    Degraded { port: u16, base_url: String },
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

/// فاز A — رشته‌های وضعیت قرارداد engine_status: دقیقاً واژگان واقعی سورس — واریانت‌های
/// EnginePhase همین فایل (Booting/Ready/Degraded/Failed) + Restarting از رویداد
/// engine:restarting نگهبان. FSM ده‌وضعیتی §۷ سند install-runtime-audit هنوز کامل پیاده
/// نشده (PRECHECK/VALIDATING/… داخل همین چرخهٔ بوت جاری رخ می‌دهند) — آینه فقط وضعیت‌های
/// واقعاً موجود را گزارش می‌کند تا هرگز وضعیتی که سورس نمی‌سازد جعل نشود.
const STATE_BOOTING: &str = "Booting";
const STATE_READY: &str = "Ready";
const STATE_DEGRADED: &str = "Degraded";
const STATE_FAILED: &str = "Failed";
const STATE_RESTARTING: &str = "Restarting";

/// دلیل Degraded قرارداد §۱-۱ سند طراحی — فقط ورکر بازی‌ها پایین است (سرویس اصلی سالم)
const DEGRADED_REASON_GAMES: &str = "games_unhealthy";

/// فاز A — snapshot آینهٔ وضعیت سرور محلی (محتوای قرارداد engine_status / engine:status).
/// پورت‌ها مُهر بوت‌اند: ری‌استارت نگهبان در EnginePhase هم پورت قبلی را نگه می‌دارد و
/// آینه همان رفتار را منعکس می‌کند (به‌روزرسانی پورت فقط در بوت موفق بعدی).
#[derive(Clone)]
pub struct EngineStatusSnapshot {
    state: String,
    port: Option<u16>,
    games_port: Option<u16>,
    started_at_unix: u64,
    last_event_at_unix: u64,
    degraded_reason: Option<String>,
    app_version: String,
    /// ۱.۲۷.۱۳ — خودآزمایی بوت (P0-2): نسخهٔ موتور از پایانهٔ قابلیت‌ها (P0-1) پس از سبزشدن —
    /// None تا بوت موفق/پروب ناکام؛ صفحهٔ بوت و پنل سلامت ناهم‌خوانی را با همین می‌سازند
    engine_version: Option<String>,
}

impl EngineStatusSnapshot {
    /// وضعیت اولیه — اگر موتور هرگز بوت نشده باشد: Booting با پیام‌های خالی (port/reason =
    /// null و مُهرها صفر — هیچ رویدادی هنوز نیامده است)
    fn booting() -> Self {
        Self {
            state: STATE_BOOTING.to_string(),
            port: None,
            games_port: None,
            started_at_unix: 0,
            last_event_at_unix: 0,
            degraded_reason: None,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            engine_version: None,
        }
    }
}

/// فاز A — آینهٔ مدیریت‌شدهٔ وضعیت سرور محلی: منبع حقیقت همان نگهبان engine.rs است
/// (رویدادهای EngineEventSink + نتیجهٔ بوت در lib.rs)؛ اینجا فقط بازتاب آن نگه داشته
/// می‌شود تا فرمان engine_status بدون وضعیت جهانی تازه، آخرین وضعیت را بدهد.
pub struct EngineStatusMirror(pub Mutex<EngineStatusSnapshot>);

impl EngineStatusMirror {
    fn new() -> Self {
        Self(Mutex::new(EngineStatusSnapshot::booting()))
    }
}

/// فاز A — نگاشت خالص رویداد نگهبان → (state، degraded_reason) — تابع بدون I/O و بدون ساعت
/// برای آزمون واحد. بازوی پایانی «ناشناخته» است: Down (تسلیم نگهبان) و هر رویداد آیندهٔ
/// نگهبان به امن‌ترین حالت صریح Failed می‌روند — هرگز وقتی از سلامت مطمئن نیستیم Ready
/// نشان نمی‌دهیم. degradedReason طبق قرارداد فقط برای Degraded «games_unhealthy» است.
fn watchdog_event_status(ev: &engine_watchdog::WatchdogEvent) -> (String, Option<String>) {
    match ev {
        engine_watchdog::WatchdogEvent::Restarting { .. } => {
            (STATE_RESTARTING.to_string(), None)
        }
        // بازگشت سلامت (پس از ری‌استارت نگهبان یا خودبه‌خود) → Ready؛ دلیل Degraded پاک می‌شود
        engine_watchdog::WatchdogEvent::Restored
        | engine_watchdog::WatchdogEvent::DegradedRecovered => (STATE_READY.to_string(), None),
        engine_watchdog::WatchdogEvent::Degraded { .. } => {
            (STATE_DEGRADED.to_string(), Some(DEGRADED_REASON_GAMES.to_string()))
        }
        // ناشناخته/تسلیم نگهبان — Failed بدون دلیل (پیام صریح از مسیر engine:down می‌آید)
        _ => (STATE_FAILED.to_string(), None),
    }
}

/// فاز A — JSON کامل قرارداد §۱-۱ سند طراحی: همان شکل مثال سند (state/port/gamesPort/
/// startedAtUnix/lastEventAtUnix/degradedReason/appVersion). فیلدهای غیر-Copy با clone صریح
/// می‌آیند تا snapshot وام گرفته‌شده (داخل قفل آینه) دست‌نخورده بماند.
fn engine_status_json(s: &EngineStatusSnapshot) -> serde_json::Value {
    serde_json::json!({
        "state": s.state.clone(),
        "port": s.port,
        "gamesPort": s.games_port,
        "startedAtUnix": s.started_at_unix,
        "lastEventAtUnix": s.last_event_at_unix,
        "degradedReason": s.degraded_reason.clone(),
        "appVersion": s.app_version.clone(),
        "engineVersion": s.engine_version.clone(),
    })
}

/// فاز A — نقطهٔ واحد به‌روزرسانی آینه + emit رویداد تائوری «engine:status» با payload JSON
/// کامل؛ هر تغییر وضعیت آینه بلافاصله از همین تابع به تائوری می‌رسد (emit بیرون از قفل).
fn set_engine_status(app: &tauri::AppHandle, f: impl FnOnce(&mut EngineStatusSnapshot)) {
    let payload = {
        let mirror = app.state::<EngineStatusMirror>();
        let mut guard = match mirror.0.lock() {
            Ok(g) => g,
            Err(_) => return, // قفل مسموم — آینه تا بوت/رویداد بعدی دست‌نخورده می‌ماند
        };
        f(&mut guard);
        guard.last_event_at_unix = unix_now();
        engine_status_json(&guard)
    };
    let _ = app.emit("engine:status", payload);
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
/// فاز A — بازگشت: (موتور، پورت‌های نهایی از read_engine_ports) — پورت‌ها برای آینهٔ وضعیت
/// (Ready در spawn_engine_boot) برمی‌گردند؛ None یعنی کانفیگ خوانده نشد (پورت اصلی motor.port می‌ماند).
fn boot_engine(app: &tauri::AppHandle) -> Result<(engine::LocalEngine, Option<(u16, u16)>), String> {
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
                // v1.27.۰۵ — ریشهٔ خطای نسخهٔ بستهٔ ۱.۲۷.۰۴: تیپل قبلی دنبال central/worker.js و
                // central/games.js بود در حالی که مونتاژ (build-installer-runtime.mjs) باندل‌های
                // موتور را در bundles/ می‌گذارد — پوشهٔ central/ فقط دارایی «ساخت سرور مرکزی» است
                // (central-worker.js + schema.sql — میراث v1.26.0، ربطی به موتور محلی ندارد).
                // گیت قرارداد (desktop-check ⑩ + installer-sim) از این پس هم‌گامی دو سمت را می‌سنجد.
                engine_res.join("bundles/worker.js"),
                engine_res.join("bundles/games.js"),
                engine_res.join("public"),
                data_dir,
            )
        };
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("ساخت data dir: {e}"))?;

    // بوت نخست: دیتابیس مایگریت‌شدهٔ زمان بسته‌بندی (d1-seed) → data dir — در نصب کاربر
    // مایگریشن از قبل اعمال شده (engine-server پوشهٔ migrations مخزن را ندارد و رد می‌کند).
    // اگر کاربر قبلاً دیتا دارد، دست نمی‌خوریم. v1.27.۰۳: همین فایل را shim D1 (node:sqlite)
    // باز می‌کند — مسیر قطعی d1/miniflare-D1DatabaseObject/<hash>.sqlite عین پشتهٔ workerd.
    //
    // کپی اتمیک — دو ریسکی که این بلوک می‌بندد: ① کپیِ ناقصِ قطع‌شده: اگر اپ وسط کپی مستقیم
    // به d1 بسته/قطع شود، پوشهٔ d1 ناقص روی دیسک می‌ماند و بوت بعدی به‌خاطر «وجود» همان پوشهٔ
    // ناقص دیگر کپی نمی‌کند → دیتابیس خراب برای همیشه؛ پس کپی به staging (d1.staging) می‌رود
    // و پیش از جابه‌جایی، سلامتش وارسی می‌شود (زیرپوشهٔ miniflare-D1DatabaseObject با حداقل
    // یک فایل .sqlite — عین چیزی که shim D1 با node:sqlite باز می‌کند؛ d1SqlitePath در
    // engine-paths.mjs). ② rename اتمیک همان volume: انتقال staging → d1 با std::fs::rename
    // است و هر دو زیر data_dir (یک volume) اند؛ پس d1 یا کامل است یا هنوز نیست — هیچ حالت
    // میانی روی دیسک دیده نمی‌شود و بوت بعدی اگر d1 نیست، از stagingِ تمیز از سر می‌گیرد.
    // هر شکست (کپی/وارسی/rename) staging را پاک می‌کند تا اجرای بعدی حتماً تمیز شروع کند.
    if !data_dir.join("d1").exists() {
        let staging = data_dir.join("d1.staging");
        // ماندهٔ staging اجرای قبلی هر چه هست کامل حذف می‌شود (قطعی: دیر یا زود پاک می‌شود)
        if staging.exists() {
            let removed = if staging.is_dir() {
                std::fs::remove_dir_all(&staging)
            } else {
                std::fs::remove_file(&staging)
            };
            removed.map_err(|e| format!("حذف staging ماندهٔ d1-seed: {e}"))?;
        }
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
            copy_dir_recursive(&seed, &staging).map_err(|e| {
                let _ = std::fs::remove_dir_all(&staging); // اجرای بعدی تمیز شروع کند
                format!("کپی d1-seed: {e}")
            })?;
            // وارسی حداقلی سلامت staging — زیرپوشهٔ miniflare-D1DatabaseObject با حداقل یک
            // فایل .sqlite؛ بدون آن، rename یعنی گذاشتن دیتابیسِ بی‌بنیاد در بوت‌های بعدی
            let do_dir = staging.join("miniflare-D1DatabaseObject");
            let has_sqlite = std::fs::read_dir(&do_dir)
                .map(|entries| {
                    entries.filter_map(|e| e.ok()).any(|e| {
                        let p = e.path();
                        p.is_file() && p.extension().map(|x| x == "sqlite").unwrap_or(false)
                    })
                })
                .unwrap_or(false);
            if !has_sqlite {
                let _ = std::fs::remove_dir_all(&staging); // اجرای بعدی تمیز شروع کند
                return Err("کپی d1-seed: staging ناقص است — زیرپوشهٔ miniflare-D1DatabaseObject با فایل .sqlite در آن نیست".to_string());
            }
            // انتقال اتمیک: staging و d1 هر دو زیر data_dir و روی همان volume اند — rename
            // دایرکتوریِ مقصدِ ناموجود، جابه‌جایی اتمیک است (d1 هنوز وجود ندارد؛ جایگزینی نیست)
            std::fs::rename(&staging, &data_dir.join("d1")).map_err(|e| {
                let _ = std::fs::remove_dir_all(&staging); // اجرای بعدی تمیز شروع کند
                format!("انتقال d1.staging به d1: {e}")
            })?;
        }
    }

    let node = engine::find_node_binary()?;
    let launch = engine::EngineLaunch { node, server_js, main_bundle, games_bundle, public_dir, data_dir };
    let motor = engine::LocalEngine::start(launch.clone(), sink)?;
    // F — ثبت نتیجهٔ نصب در dataDir/install-manifest.json — بهترین تلاش: شکست ثبت نباید بوت را
    // بشکند؛ نتیجه برای پشتیبانی/Repair است. اینجا انتظار کانفیگ (wait_engine_config در
    // LocalEngine::start) موفق شده و پورت‌های نهایی دوباره از همان engine-config.json خوانده می‌شود.
    // فاز A — همان پورت‌ها برای آینهٔ وضعیت برگردانده می‌شوند (یک خواندن، دو مصرف).
    let ports = read_engine_ports(&launch.data_dir);
    if let Some((port, games_port)) = ports {
        let _ = write_install_manifest(&launch.data_dir, &launch, port, games_port);
    }
    Ok((motor, ports))
}

/// F — خواندن پورت‌های نهایی از dataDir/engine-config.json (قرارداد engine.mjs) — همان فایلی
/// که wait_engine_config در engine.rs منتظرش می‌ماند؛ پس از بوت موفق یک‌بار خوانده می‌شود.
/// ناموفق = None (ثبت manifest بهترین تلاش است و نباید بوت را درگیر کند).
fn read_engine_ports(data_dir: &Path) -> Option<(u16, u16)> {
    let text = std::fs::read_to_string(data_dir.join("engine-config.json")).ok()?;
    let v = serde_json::from_str::<serde_json::Value>(&text).ok()?;
    let port = v.get("port").and_then(|p| p.as_u64()).map(|p| p as u16);
    let games = v.get("gamesPort").and_then(|p| p.as_u64()).map(|p| p as u16);
    Some((port?, games?))
}

/// F — الان به ثانیهٔ یونیکس (SystemTime — بدون وابستگی جدید)
fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// F — نسخهٔ سایدکار node با اجرای «node --version» — عین الگوی CREATE_NO_WINDOW در
/// verify_runtime_integrity (engine.rs)؛ بدون پیشوند v (هم‌قرارداد nodeVersion در manifest
/// نصاب). هر شکست → None (در JSON می‌شود null — نبود نسخه نباید ثبت manifest را بشکند).
fn node_version(node: &Path) -> Option<String> {
    let mut cmd = std::process::Command::new(node);
    cmd.arg("--version");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let got = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if got.is_empty() {
        return None;
    }
    Some(got.strip_prefix('v').unwrap_or(&got).to_string())
}

/// F — ثبت نتیجهٔ نصب در dataDir/install-manifest.json (بستن ردیف ۱۱ جدول اختلاف ممیزی):
/// پشتیبانی/Repair می‌تواند نسخهٔ اپ، زمان نصب/آخرین بوت، نسخهٔ node، پورت‌های نهایی، هش
/// manifest نصاب و هش/حجم فایل‌های رانتایم را بدون اجرای اپ بخواند. نوشتن اتمیک: ابتدا
/// install-manifest.json.tmp سپس rename — عین الگوی staging d1 در boot_engine (tmp و مقصد
/// هر دو زیر data_dir و روی یک volume اند). installedAtUnix از فایل قبلی حفظ می‌شود (نصب
/// همان است) و lastBootAtUnix هر بوت تازه می‌شود. فایل‌های رانتایم: بوت موفق یعنی همه
/// هست‌اند — هر غایب بدون ردیف در files می‌آید و نامش فقط در آرایهٔ missing ثبت می‌شود.
fn write_install_manifest(
    data_dir: &Path,
    launch: &engine::EngineLaunch,
    port: u16,
    games_port: u16,
) -> Result<(), String> {
    let manifest_path = data_dir.join("install-manifest.json");
    // installedAtUnix قبلی — اگر فایل موجود و پارس‌شدنی بود همان مقدار می‌ماند، وگرنه الان
    let installed_at = std::fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("installedAtUnix").and_then(|x| x.as_u64()))
        .unwrap_or_else(unix_now);

    // هش manifest نصاب (engine-runtime-manifest.json کنار engine-server.js) — حالت توسعه ندارد
    let engine_dir = launch
        .server_js
        .parent()
        .ok_or_else(|| "مسیر باندل موتور فاقد پوشهٔ والد است".to_string())?;
    let runtime_manifest_sha =
        std::fs::read(engine_dir.join("engine-runtime-manifest.json"))
            .ok()
            .map(|bytes| crate::deploy_plan::sha256_hex(&bytes));

    // فایل‌های رانتایم — {name, sha256, bytes}؛ غایب → بدون ردیف (نامش در missing می‌آید)
    let index_html = launch.public_dir.join("index.html");
    let mut files: Vec<serde_json::Value> = Vec::new();
    let mut missing: Vec<String> = Vec::new();
    for path in [&launch.server_js, &launch.main_bundle, &launch.games_bundle, &index_html] {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());
        if let Ok(bytes) = std::fs::read(path) {
            files.push(serde_json::json!({
                "name": name,
                "sha256": crate::deploy_plan::sha256_hex(&bytes),
                "bytes": bytes.len(),
            }));
        } else {
            missing.push(name);
        }
    }

    let mut manifest = serde_json::json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "installedAtUnix": installed_at,
        "lastBootAtUnix": unix_now(),
        "node": { "version": node_version(&launch.node) },
        "ports": { "port": port, "gamesPort": games_port },
        "runtimeManifestSha256": runtime_manifest_sha,
        "files": files,
    });
    if !missing.is_empty() {
        manifest["missing"] = serde_json::json!(missing);
    }

    let pretty = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("ساخت JSON برای install-manifest.json ناموفق بود: {e}"))?;
    let tmp = data_dir.join("install-manifest.json.tmp");
    std::fs::write(&tmp, pretty.as_bytes())
        .map_err(|e| format!("نوشتن install-manifest.json.tmp ناموفق بود: {e}"))?;
    // انتقال اتمیک — rename مقصد موجود را هم جایگزین می‌کند (MoveFileEx با REPLACE_EXISTING
    // در ویندوز؛ rename(2) در یونیکس) — یا manifest کامل تازه است یا قبلی دست‌نخورده مانده
    std::fs::rename(&tmp, &manifest_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp); // ماندهٔ tmp باقی نماند — اجرای بعدی تمیز بنویسد
        format!("انتقال install-manifest.json.tmp به install-manifest.json ناموفق بود: {e}")
    })?;
    Ok(())
}

/// پیام شکست بوت — v1.27.۰۳: موتور adapter است؛ کرش بومی workerd از مسیر دسکتاپ حذف شده و
/// شکست بوت معمولاً یعنی کانفیگ ندادن در مهلت (ببین dataDir/engine.log) یا نبود فایل‌های رانتایم.
fn boot_failure_message(_log_tail: &str) -> String {
    "موتور محلی ظرف ۳۰ ثانیه آماده نشد — جزئیات در dataDir/engine.log است؛ «تلاش دوباره» را بزنید و اگر تکرار شد، گزارش خرابی را با دکمهٔ «پیام به سازنده» بفرستید. دیتای شما دست‌نخورده است.".to_string()
}

/// گیرندهٔ رویدادهای نگهبان موتور → رخداد تائوری برای پوسته + وضعیت صریح پس از تسلیم.
/// نام رخدادها: engine:restarting {attempt, delay_ms} / engine:restored {port} /
/// engine:down {attempts} — پس از engine:down فاز به Failed می‌رود (وضعیت صریح بوت) و
/// «تلاش دوباره» همان engine_retry است. M4: engine:degraded / engine:degraded_recovered
/// برای ناسالمی مستقل ورکر بازی‌ها با سرویس اصلی سالم — فاز بین Ready و Degraded جابه‌جا
/// می‌شود (پورت/base_url همان می‌مانَد؛ اپ اصلی کار می‌کند). اگر نسل بوت عوض شده باشد،
/// نوشتن فاز نادیده گرفته می‌شود تا نتیجهٔ کهنهٔ نگهبان، بوت تازه را خراب نکند.
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
                // M4 — پورت از Ready یا Degraded خوانده می‌شود؛ پس از ری‌استارت سالم، فاز
                // Degraded (در صورت بودن) به Ready برمی‌گردد
                let cur = app.state::<AppState>().phase.lock().ok().map(|g| g.clone());
                let port = cur.as_ref().and_then(|p| match p {
                    EnginePhase::Ready { port, .. } | EnginePhase::Degraded { port, .. } => Some(*port),
                    _ => None,
                });
                let _ = app.emit("engine:restored", serde_json::json!({ "port": port }));
                if !stale {
                    if let Some(EnginePhase::Degraded { port, base_url }) = cur {
                        app.state::<AppState>().set_phase(EnginePhase::Ready { port, base_url });
                    }
                }
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
            engine_watchdog::WatchdogEvent::Degraded { .. } => {
                // M4 — فقط ورکر بازی‌ها پایین است (سرویس اصلی سالم) — بدون ری‌استارت؛
                // پیام فارسی کوتاه برای بنر پنل سلامت
                let _ = app.emit(
                    "engine:degraded",
                    serde_json::json!({
                        "kind": "games_worker",
                        "message": "ورکر بازی‌ها پاسخ نمی‌دهد — سرویس اصلی سالم است",
                    }),
                );
                if !stale {
                    // Ready → Degraded با حفظ پورت/base_url؛ اگر فاز Failed است دست نمی‌خوریم
                    if let Ok(mut guard) = app.state::<AppState>().phase.lock() {
                        if let EnginePhase::Ready { port, base_url } = guard.clone() {
                            *guard = EnginePhase::Degraded { port, base_url };
                        }
                    }
                }
            }
            engine_watchdog::WatchdogEvent::DegradedRecovered => {
                // M4 — ورکر بازی‌ها بدون ری‌استارت دوباره سالم شد — بازگشت به Ready
                let _ = app.emit(
                    "engine:degraded_recovered",
                    serde_json::json!({
                        "kind": "games_worker",
                        "message": "ورکر بازی‌ها دوباره پاسخ می‌دهد — همه‌چیز سالم است",
                    }),
                );
                if !stale {
                    if let Ok(mut guard) = app.state::<AppState>().phase.lock() {
                        if let EnginePhase::Degraded { port, base_url } = guard.clone() {
                            *guard = EnginePhase::Ready { port, base_url };
                        }
                    }
                }
            }
        }
        // فاز A — آینهٔ وضعیت: هر رویداد نگهبان → وضعیت متناظر + emit «engine:status» با
        // payload JSON کامل (نقطهٔ واحد = set_engine_status). رویدادهای نگهبانِ نسل کهنه
        // (پس از engine_retry) آینه را خراب نمی‌کنند — همان گارد نسلِ فازهای بالا.
        if !stale {
            let (ev_state, ev_reason) = watchdog_event_status(&ev);
            set_engine_status(&app, |st| {
                st.state = ev_state;
                st.degraded_reason = ev_reason;
            });
        }
    })
}

/// v1.26.0 — فرمان وضعیت برای صفحهٔ بوت (هم‌قرارداد boot-dist/index.html)
#[tauri::command]
fn desktop_status(app: tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let phase = state.phase.lock().map(|g| g.clone()).unwrap_or(EnginePhase::Booting);
    let version = env!("CARGO_PKG_VERSION").to_string();
    // ۱.۲۷.۱۳ — خودآزمایی بوت (P0-2): نسخهٔ موتور از آینه — None تا بوت موفق؛ صفحهٔ بوت
    // ناهم‌خوانی را فقط وقتی هر دو معلوم‌اند نشان می‌دهد (پروب نرم — هرگز بوت را نمی‌سد)
    let engine_version = app
        .state::<EngineStatusMirror>()
        .0
        .lock()
        .ok()
        .and_then(|g| g.engine_version.clone());
    match phase {
        EnginePhase::Booting => {
            serde_json::json!({ "phase": "booting", "version": version, "engineVersion": engine_version })
        }
        EnginePhase::Ready { port, base_url } => {
            serde_json::json!({ "phase": "ready", "version": version, "engineVersion": engine_version, "port": port, "base_url": base_url })
        }
        // M4 — Degraded همان شکل ready را دارد (اپ اصلی کار می‌کند)؛ فقط phase عوض است
        EnginePhase::Degraded { port, base_url } => {
            serde_json::json!({ "phase": "degraded", "version": version, "engineVersion": engine_version, "port": port, "base_url": base_url })
        }
        EnginePhase::Failed { message, log_tail } => {
            serde_json::json!({ "phase": "failed", "version": version, "engineVersion": engine_version, "message": message, "log_tail": log_tail })
        }
    }
}

/// فاز A — قرارداد وضعیت سرور محلی (docs/rust/server-cloud-update-design.md §۱-۱): همان JSON
/// آینهٔ EngineStatusMirror — بدون وضعیت جهانی تازه، منبعش همان نگهبان است. اگر موتور هرگز
/// بوت نشده باشد آینه در وضعیت اولیهٔ Booting است (پیام‌های خالی: پورت/دلیل null، مُهرها صفر).
#[tauri::command]
fn engine_status(app: tauri::AppHandle) -> serde_json::Value {
    let snapshot = app
        .state::<EngineStatusMirror>()
        .0
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| EngineStatusSnapshot::booting());
    engine_status_json(&snapshot)
}

/// v1.26.0 — تلاش دوبارهٔ بوت از صفحهٔ بوت؛ نتیجهٔ نسل‌های کهنه نادیده گرفته می‌شود
#[tauri::command]
fn engine_retry(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    {
        let phase = state.phase.lock().map(|g| g.clone()).unwrap_or(EnginePhase::Booting);
        // بوت در جریان است یا موتور آماده (حتی Degraded — M4: اپ اصلی کار می‌کند و
        // بازگشت/ری‌استارت بازی‌ها را نگهبان خودش مدیریت می‌کند) — کاری نکن
        if matches!(phase, EnginePhase::Booting | EnginePhase::Ready { .. } | EnginePhase::Degraded { .. }) {
            return;
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

/// فاز A — فرمان راه‌اندازی دوباره از UI (design §۱-۱: «همان مسیر نگهبان موجود، بدون مسیر
/// تازهٔ کد اجرا»). LocalEngine توقف/ری‌استارت عمومی ندارد (خاموشی فقط با Dropِ slot است) —
/// پس دکمهٔ کاذب نمی‌سازیم: موتور در حال اجرا (Ready/Degraded — M4: Degraded هم اجراست) با
/// پیام صادقانهٔ فارسی رد می‌شود؛ Failed یا هرگز-بوت‌نشده به همان مسیر بوت موجود (engine_retry)
/// می‌رود. حالت Booting هم رد می‌شود — بوت دوم روی همان dataDir یعنی ریسک شناخته‌شدهٔ دو موتور.
#[tauri::command]
fn engine_restart(app: tauri::AppHandle) -> Result<(), String> {
    let phase = app
        .state::<AppState>()
        .phase
        .lock()
        .map(|g| g.clone())
        .unwrap_or(EnginePhase::Booting);
    match phase {
        EnginePhase::Booting => Err(
            "راه‌اندازی موتور محلی همین حالا در جریان است — چند لحظه صبر کنید.".to_string(),
        ),
        EnginePhase::Ready { .. } | EnginePhase::Degraded { .. } => Err(
            "سرور در حال اجراست؛ برای راه‌اندازی دوباره برنامه را ببندید و باز کنید".to_string(),
        ),
        // Failed/هرگز — دقیقاً همان مسیر بوت موجود: slot بسته می‌شود، نسل تازه، spawn_engine_boot
        EnginePhase::Failed { .. } => {
            engine_retry(app);
            Ok(())
        }
    }
}

/// v1.26.0 — باز کردن پوشهٔ داده در File Explorer (برای دیدن engine.log)
/// فاز A — ویندوز: explorer.exe با الگوی CREATE_NO_WINDOW (عین node_version) تا باز کردن
/// پوشه هرگز پنجرهٔ کنسول گذرا نسازد؛ لینوکس xdg-open، مک open. خطا → Err فارسی.
#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("ساخت data dir: {e}"))?;
    let opened = if cfg!(target_os = "windows") {
        let mut cmd = std::process::Command::new("explorer.exe");
        cmd.arg(&dir);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        cmd.spawn().is_ok()
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

// ─────────────────────────────────────────────────────────────────────────────
// فاز B — راز اتصال ابری (docs/rust/server-cloud-update-design.md §۲-۳/§۲-۴)
// راز ENGINE_CLOUD_SECRET هرگز در فایل JSON ساده ذخیره نمی‌شود — فقط در
// Credential Manager ویندوز / Secret Service از طریق crate keyring (همان الگوی
// secure_store.rs) و تنها مسیر مصرفش تزریق به env پروسهٔ موتور پیش از بوت است.
// هیچ secretی در لاگ/audit/پیام فرانت نمی‌آید — کلید نمایش فقط ۴ کاراکتر آخر.
// ─────────────────────────────────────────────────────────────────────────────

/// نام سرویس در مخزن امن سیستم‌عامل — ثابت تا مهاجرت‌ها را بشکند
const CLOUD_SECRET_SERVICE: &str = "Markaz-Jame-Desktop";
/// نام کاربر (کلید) راز اتصال ابری در همان سرویس
const CLOUD_SECRET_USER: &str = "cloud-sync-secret";
/// نام متغیر محیطی که راز از آن به پروسهٔ موتور می‌رسد (خواننده: engine.mjs)
const ENGINE_CLOUD_SECRET_VAR: &str = "ENGINE_CLOUD_SECRET";
/// حداقل طول راز قابل ذخیره — راز کوتاه‌تر با پیام فارسی رد می‌شود
const CLOUD_SECRET_MIN_LEN: usize = 12;
/// ماسک کلیدهای کوتاه‌تر از ۴ کاراکتر — هیچ نویسه‌ای لو نمی‌رود
const CLOUD_SECRET_MASK_ONLY: &str = "●●●●";

/// فاز B — ماسک خالص راز برای نمایش در UI (بدون I/O و بدون ساعت — آزمون‌پذیر):
/// None/خالی → None؛ کوتاه‌تر از ۴ نویسه → فقط «●●●●»؛ ۴ نویسه و بیشتر →
/// ۴ کاراکتر آخر با برش یونیکد-امن (روی مرز نویسه، نه بایت — حروف فارسی/ایموجی امن‌اند).
fn mask_secret(value: Option<&str>) -> Option<String> {
    let raw = value?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() < 4 {
        return Some(CLOUD_SECRET_MASK_ONLY.to_string());
    }
    Some(chars[chars.len() - 4..].iter().collect())
}

/// فاز B — خواندن راز کامل برای تزریق به env موتور (فقط تزریق؛ هرگز در پاسخ فرمان/لاگ نمی‌آید).
/// NoEntry (هرگز ست نشده) → None؛ هر خطای دیگر مخزن → None (نیامدن راز نباید بوت را بشکند —
/// اپ آن‌گاه «secret_present=false» گزارش می‌کند و هم‌گامی ابری خاموش می‌ماند).
fn read_cloud_secret_for_engine() -> Option<String> {
    let entry = keyring::Entry::new(CLOUD_SECRET_SERVICE, CLOUD_SECRET_USER)
        .map_err(|e| format!("دسترسی به مخزن امن ممکن نشد: {e}"))
        .ok()?;
    match entry.get_password() {
        Ok(v) => {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Err(keyring::Error::NoEntry) => None,
        Err(_) => None,
    }
}

/// فاز B — ثبت بی‌راز کنش‌های راز در dataDir/desktop-audit.log (یک خط: مُهر|دامنه|کنش).
/// فقط نام کنش ثبت می‌شود — مقدار راز هرگز به این فایل نمی‌رود. بهترین‌تلاش: شکست ثبت
/// کنش را رد نمی‌کند (راز واقعاً ذخیره/حذف شده و پیام کاربر مستقل از این لاگ است).
fn append_cloud_audit(data_dir: &Path, action: &str) {
    use std::io::Write;
    let line = format!("{}|cloud|{}\n", unix_now(), action);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join("desktop-audit.log"))
    {
        let _ = f.write_all(line.as_bytes());
    }
}

/// فاز B — ذخیرهٔ راز اتصال ابری در مخزن امن سیستم‌عامل. خالی/کوتاه‌تر از ۱۲ نویسه → Err فارسی.
/// اگر موتور همین حالا اجراست (Ready/Degraded) راز ذخیره می‌شود اما تا بوت بعدی اعمال
/// نمی‌شود — پیام صادقانهٔ «برای اعمال، برنامه را ببندید و باز کنید» برمی‌گردد.
#[tauri::command]
fn cloud_secret_set(app: tauri::AppHandle, value: String) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err("راز اتصال ابری نمی‌تواند خالی باشد.".to_string());
    }
    if trimmed.chars().count() < CLOUD_SECRET_MIN_LEN {
        return Err(format!(
            "راز اتصال ابری باید دست‌کم {CLOUD_SECRET_MIN_LEN} کاراکتر باشد."
        ));
    }
    let entry = keyring::Entry::new(CLOUD_SECRET_SERVICE, CLOUD_SECRET_USER)
        .map_err(|e| format!("دسترسی به مخزن امن ممکن نشد: {e}"))?;
    entry
        .set_password(&trimmed)
        .map_err(|e| format!("ذخیرهٔ راز ممکن نشد: {e}"))?;
    if let Ok(dir) = app.path().app_data_dir() {
        append_cloud_audit(&dir, "cloud_secret_set");
    }
    let phase = app
        .state::<AppState>()
        .phase
        .lock()
        .map(|g| g.clone())
        .unwrap_or(EnginePhase::Booting);
    if matches!(phase, EnginePhase::Ready { .. } | EnginePhase::Degraded { .. }) {
        Ok("راز ذخیره شد — برای اعمال، برنامه را ببندید و باز کنید".to_string())
    } else {
        Ok("راز ذخیره شد".to_string())
    }
}

/// فاز B — خواندن راز برای نمایش در UI: فقط ماسک (۴ کاراکتر آخر یا ●●●●).
/// راز هرگز کامل از این فرمان بیرون نمی‌رود؛ غایب → null.
#[tauri::command]
fn cloud_secret_get() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(CLOUD_SECRET_SERVICE, CLOUD_SECRET_USER)
        .map_err(|e| format!("دسترسی به مخزن امن ممکن نشد: {e}"))?;
    match entry.get_password() {
        Ok(v) => Ok(mask_secret(Some(&v))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("خواندن راز ممکن نشد: {e}")),
    }
}

/// فاز B — حذف راز از مخزن امن؛ غایب بودن (NoEntry) هم موفق شمرده می‌شود (حذف دوباره بی‌ضرر).
#[tauri::command]
fn cloud_secret_delete(app: tauri::AppHandle) -> Result<(), String> {
    let entry = keyring::Entry::new(CLOUD_SECRET_SERVICE, CLOUD_SECRET_USER)
        .map_err(|e| format!("دسترسی به مخزن امن ممکن نشد: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("حذف راز ممکن نشد: {e}")),
    }
    if let Ok(dir) = app.path().app_data_dir() {
        append_cloud_audit(&dir, "cloud_secret_delete");
    }
    Ok(())
}

/// فرمان سلامت پوسته — وضعیت موتور محلی را هم گزارش می‌کند (سازگار با فاز ۲)
#[tauri::command]
fn desktop_health(app: tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let phase = state.phase.lock().map(|g| g.clone()).unwrap_or(EnginePhase::Booting);
    let engine = match phase {
        // M4 — Degraded هم مثل Ready گزارش می‌شود: اپ اصلی روی همان base_url کار می‌کند
        EnginePhase::Ready { port, ref base_url } | EnginePhase::Degraded { port, ref base_url } => {
            Some(serde_json::json!({ "port": port, "baseUrl": base_url }))
        }
        _ => None,
    };
    serde_json::json!({ "ok": true, "module": "desktop-shell", "phase": 2, "engine": engine })
}

/// بالا آوردن موتور محلی در thread جدا؛ هر سه خروجی (ready/timeout/fail) وضعیت صریح می‌سازند.
/// فاز A — آینهٔ وضعیت هم در هر سه خروجی به‌روز می‌شود: هر بوت تازه از Booting شروع می‌شود
/// (engine_status هرگز وضعیت کهنهٔ بوت قبلی را نمی‌دهد)، بوت موفق Ready + پورت‌های
/// read_engine_ports و شکست بوت Failed با همان پیام موجود در degradedReason.
fn spawn_engine_boot(app: tauri::AppHandle) {
    set_engine_status(&app, |st| {
        *st = EngineStatusSnapshot::booting();
    });
    let gen = app.state::<AppState>().generation.load(Ordering::SeqCst);
    std::thread::spawn(move || {
        // فاز B — تزریق راز ابری به env پروسهٔ موتور، پیش از هر بوت: مخزن امن موجود →
        // set_var؛ غایب → remove_var (راز کهنهٔ اجرای قبلی/توسعه نباید بی‌حذف بماند).
        // تنها مصرف read_cloud_secret_for_engine همین‌جاست — راز هرگز در لاگ/audit/پیام
        // نمی‌آید و موتور آن را فقط به‌عنوان env (ENGINE_CLOUD_SECRET) به اپ می‌رساند.
        match read_cloud_secret_for_engine() {
            Some(secret) => std::env::set_var(ENGINE_CLOUD_SECRET_VAR, secret),
            None => std::env::remove_var(ENGINE_CLOUD_SECRET_VAR),
        }
        let state = app.state::<AppState>();
        let finish_stale = |state: &AppState| {
            state.generation.load(Ordering::SeqCst) != gen
        };
        match boot_engine(&app) {
            Ok((motor, ports)) => {
                let port = motor.port;
                let base = motor.base_url();
                let games_port = ports.map(|(_, g)| g);
                if !motor.wait_healthy(std::time::Duration::from_secs(30)) {
                    if finish_stale(&state) {
                        return;
                    }
                    let data_dir = app
                        .path()
                        .app_data_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."));
                    let tail = read_log_tail(&data_dir);
                    let msg = boot_failure_message(&tail);
                    state.set_phase(EnginePhase::Failed {
                        message: msg.clone(),
                        log_tail: tail,
                    });
                    // فاز A — شکست بوت: پیام موجود → Failed با همان دلیل در آینه
                    set_engine_status(&app, |st| {
                        st.state = STATE_FAILED.to_string();
                        st.degraded_reason = Some(msg);
                    });
                    return; // drop وضعیت محلی → خاموشی سایدکار
                }
                if let Ok(mut slot) = app.state::<LocalEngineSlot>().0.lock() {
                    *slot = Some(motor);
                }
                // ۱.۲۷.۱۳ — خودآزمایی بوت (P0-2): پس از سبزشدن، نسخهٔ موتور از پایانهٔ قابلیت‌ها
                // (P0-1) خوانده می‌شود و در آینهٔ وضعیت می‌نشیند؛ شکست پروب نرم است (None —
                // بوت هرگز از این نسخه نمی‌شکند) و پنل سلامت/صفحهٔ بوت از همین خوراک می‌گیرند.
                let engine_version = engine::engine_capabilities_version(port);
                if finish_stale(&state) {
                    return;
                }
                state.set_phase(EnginePhase::Ready { port, base_url: base.clone() });
                // فاز A — بوت موفق: Ready + پورت‌های نهایی از read_engine_ports (پورت اصلی
                // motor.port همان مقدار کانفیگ است؛ نبود کانفیگ = فقط پورت اصلی ثبت می‌شود)
                set_engine_status(&app, |st| {
                    st.state = STATE_READY.to_string();
                    st.port = ports.map(|(p, _)| p).or(Some(port));
                    st.games_port = games_port;
                    st.started_at_unix = unix_now();
                    st.degraded_reason = None;
                    st.engine_version = engine_version;
                });
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
                state.set_phase(EnginePhase::Failed { message: msg.clone(), log_tail: tail });
                // فاز A — شکست بوت: پیام موجود → Failed با همان دلیل در آینه
                set_engine_status(&app, |st| {
                    st.state = STATE_FAILED.to_string();
                    st.degraded_reason = Some(msg);
                });
                eprintln!("[desktop] موتور محلی بالا نیامد — وضعیت Failed در صفحهٔ بوت نمایش داده می‌شود");
            }
        }
    });
}

/// فاز D-۳ — کانال دستی «بررسی نسخهٔ تازه»: فقط وارسی؛ هیچ دانلود/نصبی از داخل اپ نیست
/// (درس ریسک ۴ — AV ایران). آفلاین/بی‌کلید/خطا → پیام فارسی با state:'error'، هرگز کرش.
#[tauri::command]
async fn check_updates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    let current = app.package_info().version.to_string();
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return Ok(serde_json::json!({ "state": "error", "message": format!("به‌روزرسان آماده نیست — {e}") })),
    };
    let found = match updater.check().await {
        Ok(f) => f,
        Err(e) => return Ok(serde_json::json!({ "state": "error", "message": format!("بررسی نشد — {e}") })),
    };
    Ok(match found {
        None => serde_json::json!({ "state": "latest", "current": current }),
        Some(u) => serde_json::json!({
            "state": "available",
            "current": current,
            "version": u.version,
            "notes": u.body.clone().unwrap_or_default()
        }),
    })
}

/// فاز D-۳ — بازکردن صفحهٔ ریلیز در مرورگر پیش‌فرض (دانلود دستی نصاب — همیشه موجود)
#[tauri::command]
fn open_release_page() -> Result<(), String> {
    const RELEASE_URL: &str = "https://github.com/alirezamehrad565-sys/crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri/releases/latest";
    let spawned = if cfg!(target_os = "windows") {
        std::process::Command::new("cmd").args(["/C", "start", "", RELEASE_URL]).spawn()
    } else {
        std::process::Command::new("xdg-open").arg(RELEASE_URL).spawn()
    };
    spawned.map(|_| ()).map_err(|e| format!("بازکردن مرورگر ناموفق بود — {e}"))
}

pub fn run() {
    tauri::Builder::default()
        // F — تکی‌نمونه (بستن ریسک #۱۰) — باید اولین plugin زنجیره باشد (پلاگین‌ها به ترتیب
        // ثبت اجرا می‌شوند). نمونهٔ دوم بلافاصله بسته می‌شود و این کالبک در نمونهٔ اول اجرا
        // می‌شود: کاربر به پنجرهٔ موجود برمی‌گردد — جلوگیری از دو موتور/دو پنجره روی یک dataDir.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        // فاز D — OTA (بعد از تکی‌نمونه — ترتیب پلاگین‌ها: single_instance اولین می‌ماند).
        // کلید عمومی از پیکربندی tauri.conf.json (plugins.updater.pubkey) خوانده می‌شود؛ ثبت باید
        // inline باشد چون Builder پلاگین updater تایپ TauriPlugin<_, Config> می‌سازد (درس E0308 CI).
        // تزریق کلید واقعی در CI هنگام بیلد انجام می‌شود؛ بی‌کلید = کانال خودکار بی‌اثر در runtime
        // (خطا با پیام فارسی در check_updates گرفته می‌شود)، کانال دستی سالم.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(LocalEngineSlot(Mutex::new(None)))
        .manage(AppState::new())
        // فاز A — آینهٔ وضعیت سرور محلی (قرارداد engine_status / engine:status)
        .manage(EngineStatusMirror::new())
        .setup(|app| {
            spawn_engine_boot(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_health,
            desktop_status,
            engine_status,
            engine_retry,
            engine_restart,
            open_data_dir,
            cf_deploy::cloudflare_deploy,
            secure_store::desktop_secure_store,
            // فاز B — راز اتصال ابری (keyring؛ فقط ماسک به فرانت می‌آید)
            cloud_secret_set,
            cloud_secret_get,
            cloud_secret_delete,
            // فاز D — OTA کانال دستی (فقط وارسی + بازکردن مرورگر)
            check_updates,
            open_release_page
        ])
        .run(tauri::generate_context!())
        .expect("خطای راه‌اندازی پوستهٔ دسکتاپ");
}

#[cfg(test)]
mod tests {
    use super::{boot_failure_message, engine_status_json, watchdog_event_status, EngineStatusSnapshot, write_install_manifest};
    use crate::deploy_plan::sha256_hex;
    use crate::engine_watchdog::WatchdogEvent;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    /// F — دایرکتوری موقت بدون وابستگی: temp_dir + pid + شمارندهٔ AtomicU32 — تست‌های موازی
    /// هر کدام دایرکتوری جدا می‌گیرند و ماندهٔ اجرای قبلی هر چه هست پاک می‌شود.
    fn temp_dir(tag: &str) -> PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "center-desktop-{}-{}-{}",
            tag,
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("ساخت دایرکتوری موقت تست");
        dir
    }

    /// فایل‌های ساختگی موتور در دایرکتوری موقت — عین چهار فایل رانتایم بوت واقعی
    fn fake_engine_files(dir: &Path) {
        let public = dir.join("public");
        std::fs::create_dir_all(&public).expect("ساخت public");
        std::fs::write(dir.join("engine-server.js"), b"server-bundle").expect("نوشتن engine-server.js");
        std::fs::write(dir.join("worker.js"), b"main-bundle").expect("نوشتن باندل اصلی");
        std::fs::write(dir.join("games.js"), b"games-bundle").expect("نوشتن باندل بازی‌ها");
        std::fs::write(public.join("index.html"), b"<html></html>").expect("نوشتن index.html");
    }

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

    /// F — ثبت manifest: فایل ساخته می‌شود، JSON پارس می‌شود، appVersion درست، files کامل
    /// (۴ فایل با هش/حجم)، هش manifest نصاب ثبت می‌شود، فراخوانی دوم installedAtUnix را حفظ
    /// می‌کند و lastBootAtUnix جلو می‌رود، و tmp باقی نمی‌ماند.
    #[test]
    fn write_install_manifest_creates_and_preserves_installed_at() {
        let dir = temp_dir("manifest");
        fake_engine_files(&dir);
        // manifest نصاب ساختگی — runtimeManifestSha256 باید هش همین فایل شود
        std::fs::write(dir.join("engine-runtime-manifest.json"), b"{}").expect("نوشتن manifest نصاب");
        let launch = crate::engine::EngineLaunch {
            node: dir.join("no-such-node"), // مسیر ناموجود — پوشش مسیر شکست بدون panic
            server_js: dir.join("engine-server.js"),
            main_bundle: dir.join("worker.js"),
            games_bundle: dir.join("games.js"),
            public_dir: dir.join("public"),
            data_dir: dir.clone(),
        };

        let path = dir.join("install-manifest.json");
        write_install_manifest(&dir, &launch, 8787, 8788).expect("نوشتن manifest بار اول");
        assert!(path.is_file(), "install-manifest.json ساخته نشد");
        let first: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(&path).expect("خواندن manifest بار اول"),
        )
        .expect("پارس JSON بار اول");
        assert_eq!(first["appVersion"].as_str(), Some(env!("CARGO_PKG_VERSION")));
        assert_eq!(first["ports"]["port"].as_u64(), Some(8787));
        assert_eq!(first["ports"]["gamesPort"].as_u64(), Some(8788));
        assert!(first["node"].is_object(), "node باید آبجکت باشد");
        let files = first["files"].as_array().expect("files باید آرایه باشد");
        assert_eq!(files.len(), 4, "هر چهار فایل رانتایم باید ردیف داشته باشند");
        assert_eq!(files[0]["name"].as_str(), Some("engine-server.js"));
        assert_eq!(
            files[0]["sha256"].as_str(),
            Some(sha256_hex(b"server-bundle").as_str())
        );
        assert_eq!(files[0]["bytes"].as_u64(), Some(b"server-bundle".len() as u64));
        let want_manifest_sha = sha256_hex(b"{}");
        assert_eq!(
            first["runtimeManifestSha256"].as_str(),
            Some(want_manifest_sha.as_str())
        );
        assert!(first.get("missing").is_none(), "همهٔ فایل‌ها هست‌اند — missing نباید باشد");

        // مُهرها ثانیه‌ای‌اند — یک ثانیه منتظر می‌مانیم تا lastBootAtUnix قطعاً جلو برود
        std::thread::sleep(std::time::Duration::from_millis(1100));
        write_install_manifest(&dir, &launch, 8787, 8788).expect("نوشتن manifest بار دوم");
        let second: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(&path).expect("خواندن manifest بار دوم"),
        )
        .expect("پارس JSON بار دوم");
        assert_eq!(
            second["installedAtUnix"].as_u64(),
            first["installedAtUnix"].as_u64(),
            "installedAtUnix باید از فایل قبلی حفظ شود"
        );
        assert!(
            second["lastBootAtUnix"].as_u64() > first["lastBootAtUnix"].as_u64(),
            "lastBootAtUnix باید جلو برود"
        );
        assert!(
            !dir.join("install-manifest.json.tmp").exists(),
            "tmp باید با rename مصرف شود و باقی نماند"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// F — node ناموجود: بدون panic، فایل باز هم ساخته می‌شود و node.version=null است؛
    /// بدون manifest نصاب هم runtimeManifestSha256=null می‌ماند (حالت توسعه).
    #[test]
    fn write_install_manifest_missing_node_yields_null_version() {
        let dir = temp_dir("manifest-no-node");
        fake_engine_files(&dir);
        let launch = crate::engine::EngineLaunch {
            node: dir.join("no-such-node.exe"),
            server_js: dir.join("engine-server.js"),
            main_bundle: dir.join("worker.js"),
            games_bundle: dir.join("games.js"),
            public_dir: dir.join("public"),
            data_dir: dir.clone(),
        };
        write_install_manifest(&dir, &launch, 1234, 5678).expect("ثبت بدون node نباید شکست بخورد");
        let v: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("install-manifest.json")).expect("خواندن manifest"),
        )
        .expect("پارس JSON");
        assert!(v["node"]["version"].is_null(), "node ناموجود باید version=null بدهد");
        assert!(v["runtimeManifestSha256"].is_null(), "بدون manifest نصاب باید null بماند");
        assert_eq!(
            v["files"].as_array().map(|f| f.len()),
            Some(4),
            "فایل‌های رانتایم مستقل از node ثبت می‌شوند"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---------- فاز A — قرارداد وضعیت سرور محلی (engine_status / engine:status) ----------

    /// فاز A — Degraded: وضعیت Degraded با دلیل قراردادی games_unhealthy (ورکر بازی‌ها)
    #[test]
    fn watchdog_degraded_event_maps_with_games_reason() {
        let (state, reason) = watchdog_event_status(&WatchdogEvent::Degraded { fails: 3 });
        assert_eq!(state, "Degraded", "رشتهٔ قرارداد دقیقاً Degraded است");
        assert_eq!(reason.as_deref(), Some("games_unhealthy"), "دلیل قرارداد §۱-۱ سند طراحی");
    }

    /// فاز A — Restarting: ری‌استارت نگهبان (هم چرخهٔ خرابی هم ری‌استارت پنل) → Restarting
    /// بدون دلیل؛ فرانت حالت زرد «در حال بازگشت» می‌سازد
    #[test]
    fn watchdog_restarting_event_maps_to_restarting() {
        let (state, reason) =
            watchdog_event_status(&WatchdogEvent::Restarting { attempt: 2, delay_ms: 5_000 });
        assert_eq!(state, "Restarting", "رشتهٔ قرارداد دقیقاً Restarting است");
        assert!(reason.is_none(), "Restarting دلیل Degraded ندارد");
    }

    /// فاز A — Ready: بازگشت سلامت (پس از ری‌استارت نگهبان یا خودبه‌خودی ورکر بازی‌ها) →
    /// Ready و پاک شدن دلیل Degraded
    #[test]
    fn watchdog_restored_and_recovered_events_map_to_ready() {
        for ev in [WatchdogEvent::Restored, WatchdogEvent::DegradedRecovered] {
            let (state, reason) = watchdog_event_status(&ev);
            assert_eq!(state, "Ready", "بازگشت سلامت باید دقیقاً Ready بدهد");
            assert!(reason.is_none(), "بازگشت سلامت باید دلیل Degraded را پاک کند");
        }
    }

    /// فاز A — ناشناخته: Down (تسلیم نگهبان) از بازوی نگاشت «ناشناخته» می‌گذرد — هر رویداد
    /// ناشناخته/آیندهٔ نگهبان به امن‌ترین حالت صریح Failed می‌رود (هرگز Ready جعل نمی‌شود)
    /// بدون دلیل؛ پیام صریح از مسیر engine:down موجود می‌آید
    #[test]
    fn watchdog_down_and_unknown_events_map_to_failed_without_reason() {
        let (state, reason) = watchdog_event_status(&WatchdogEvent::Down { attempts: 3 });
        assert_eq!(state, "Failed", "تسلیم نگهبان باید دقیقاً Failed بدهد");
        assert!(reason.is_none(), "پیام شکست از رویداد engine:down می‌آید نه آینه");
    }

    /// فاز A — اگر موتور هرگز بوت نشده باشد: JSON قرارداد با state=Booting و پیام‌های خالی
    /// (پورت/دلیل null، مُهرها صفر) و appVersion درست
    #[test]
    fn engine_status_json_never_booted_is_booting_with_empty_messages() {
        let v = engine_status_json(&EngineStatusSnapshot::booting());
        assert_eq!(v["state"].as_str(), Some("Booting"));
        assert!(v["port"].is_null(), "پورت هرگز-بوت‌نشده باید null باشد");
        assert!(v["gamesPort"].is_null(), "gamesPort هرگز-بوت‌نشده باید null باشد");
        assert_eq!(v["startedAtUnix"].as_u64(), Some(0), "بوت رخ نداده — مُهر صفر است");
        assert_eq!(v["lastEventAtUnix"].as_u64(), Some(0));
        assert!(v["degradedReason"].is_null(), "پیام‌های خالی یعنی دلیل null");
        assert_eq!(v["appVersion"].as_str(), Some(env!("CARGO_PKG_VERSION")));
    }

    /// فاز A — شکل کامل JSON قرارداد §۱-۱: همهٔ کلیدهای قرارداد حاضرند و پورت‌ها درست می‌نشینند
    #[test]
    fn engine_status_json_has_full_contract_shape() {
        let mut s = EngineStatusSnapshot::booting();
        s.port = Some(8787);
        s.games_port = Some(8788);
        s.degraded_reason = Some("games_unhealthy".to_string());
        let v = engine_status_json(&s);
        for key in ["state", "port", "gamesPort", "startedAtUnix", "lastEventAtUnix", "degradedReason", "appVersion"] {
            assert!(v.get(key).is_some(), "کلید قرارداد «{key}» در JSON نیست");
        }
        assert_eq!(v["port"].as_u64(), Some(8787));
        assert_eq!(v["gamesPort"].as_u64(), Some(8788));
        assert_eq!(v["degradedReason"].as_str(), Some("games_unhealthy"));
    }

    // ---------- فاز B — راز اتصال ابری (فقط توابع خالص؛ عملیات واقعی keyring در تست ممنوع) ----------

    use super::{
        mask_secret, CLOUD_SECRET_MASK_ONLY, CLOUD_SECRET_MIN_LEN, CLOUD_SECRET_SERVICE,
        CLOUD_SECRET_USER, ENGINE_CLOUD_SECRET_VAR,
    };

    /// فاز B — ثابت‌های قرارداد راز ابری: نام سرویس/کلید مخزن امن و نام env نباید تغییر کند
    /// (تغییرشان یعنی رازهای ذخیره‌شدهٔ کاربران بی‌نشانی می‌شوند)
    #[test]
    fn cloud_secret_constants_are_stable() {
        assert_eq!(CLOUD_SECRET_SERVICE, "Markaz-Jame-Desktop");
        assert_eq!(CLOUD_SECRET_USER, "cloud-sync-secret");
        assert_eq!(ENGINE_CLOUD_SECRET_VAR, "ENGINE_CLOUD_SECRET");
        assert_eq!(CLOUD_SECRET_MIN_LEN, 12);
        assert_eq!(CLOUD_SECRET_MASK_ONLY, "●●●●");
    }

    /// فاز B — ماسک: None و رشتهٔ خالی/فاصله‌دار → None (UI «تنظیم‌نشده» می‌سازد)
    #[test]
    fn mask_secret_none_and_blank_are_none() {
        assert!(mask_secret(None).is_none());
        assert!(mask_secret(Some("")).is_none());
        assert!(mask_secret(Some("    ")).is_none());
    }

    /// فاز B — ماسک: کوتاه‌تر از ۴ نویسه (۱..۳) → فقط ●●●●؛ هیچ نویسه‌ای لو نمی‌رود
    #[test]
    fn mask_secret_short_value_is_fully_hidden() {
        for short in ["a", "ab", "abc"] {
            assert_eq!(
                mask_secret(Some(short)),
                Some("●●●●".to_string()),
                "راز «{short}» باید کاملاً پنهان بماند"
            );
        }
    }

    /// فاز B — ماسک: مرز ۴ و ۱۲ — از ۴ نویسه به بالا دقیقاً ۴ کاراکتر آخر می‌آید
    #[test]
    fn mask_secret_boundary_at_four_and_twelve() {
        assert_eq!(mask_secret(Some("abcd")), Some("abcd".to_string()));
        assert_eq!(mask_secret(Some("abcdefghij12")), Some("ij12".to_string()));
        assert_eq!(mask_secret(Some("abcdefgh123456")), Some("3456".to_string()));
    }

    /// فاز B — ماسک یونیکد-امن: حروف فارسی و ایموجی هرگز وسط نویسه بریده نمی‌شوند
    /// (برش بایتی در این رشته‌ها نویسهٔ شکسته/زبالهٔ UTF-8 می‌سازد)
    #[test]
    fn mask_secret_is_unicode_safe() {
        // ۱۱ نویسهٔ فارسی/ارقام → ۴ کاراکتر آخر: «۲۳۴۵»
        assert_eq!(mask_secret(Some("رمزقوی۱۲۳۴۵")), Some("۲۳۴۵".to_string()));
        // ۶ ایموجی (هر کدام ۴ بایت) → ۴ کاراکتر آخر، نه بایت‌های آخر
        assert_eq!(
            mask_secret(Some("🔑🔑🔑🔑🔑🔑")),
            Some("🔑🔑🔑🔑".to_string())
        );
        // کوتاه یونیکد: دو نویسهٔ فارسی → ●●●●
        assert_eq!(mask_secret(Some("رم")), Some("●●●●".to_string()));
    }

    /// فاز B — خاصیت: ماسک برای هر طولی «هرگز بیش از ۴ کاراکتر لو نمی‌دهد» — خروجی یا
    /// None است یا ●●●● یا دقیقاً پسوند ۴ کاراکتری ورودی
    #[test]
    fn mask_secret_never_leaks_more_than_four_chars() {
        let alphabet = "الفب0123456789XYZ🔑";
        for len in 0..=24usize {
            let input: String = alphabet.chars().take(len).collect();
            let out = mask_secret(Some(&input));
            match out {
                None => assert_eq!(len, 0, "فقط ورودی خالی باید None بدهد"),
                Some(masked) => {
                    let count = masked.chars().count();
                    assert!(count <= 4, "ماسک «{masked}» بیش از ۴ کاراکتر لو می‌دهد");
                    let tail: String = input.chars().rev().take(4).collect::<Vec<_>>()
                        .into_iter().rev().collect();
                    assert!(
                        masked == "●●●●" || masked == tail,
                        "ماسک «{masked}» نه ●●●● است نه ۴ کاراکتر آخر «{tail}»"
                    );
                }
            }
        }
    }
}
