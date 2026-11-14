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
//! کامپایل در CI (cargo در محیط سندباکس جاری نیست) — گیت ساختاری desktop:check
//! هم‌گامی فایل‌ها را می‌گیرد و کامپایل واقعی در خط CI با Rust stable انجام می‌شود.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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

/// ENG-4 — چند شکست پیاپیِ پایش بازی‌ها «مرگ» شمرده می‌شود (پایش هر ۵ ثانیه)
const GAMES_FAIL_THRESHOLD: u32 = 2;

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
    /// باندل ورکر اصلی (Hono) — در نصاب: resources/engine/central/worker.js
    pub main_bundle: PathBuf,
    /// باندل ورکر بازی‌ها — در نصاب: resources/engine/central/games.js
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

/// پیدا کردن باینری node: متغیر محیطی ← کنار برنامه (سایدکار نصاب: ریشه و binaries/) ←
/// مسیر توسعه «node» روی PATH. rust-f13 الگوی workerd: سایدکار در dev پسوند هدف دارد
/// (node-<target>) و در نصاب NSIS نام بدون پسوند هدف کنار exe می‌نشیند.
pub fn find_node_binary() -> PathBuf {
    if let Ok(from_env) = std::env::var("CENTER_NODE_BIN") {
        let p = PathBuf::from(from_env);
        if p.is_file() {
            return p;
        }
    }
    let exe_name = if cfg!(windows) { "node.exe" } else { "node" };
    if let Ok(exe_dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf())) {
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
                return c.clone();
            }
        }
    }
    // توسعه — node روی PATH (همان nodeی که npm/cargo-check با آن کار می‌کند)
    PathBuf::from(exe_name)
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
/// stderr/stdout به data/engine.log می‌رود تا خرابی نصاب قابل تشخیص باشد؛ stdout خروجی عملیاتی
/// engine.mjs هم در همان لاگ بنشیند (Rust از stdout چیزی نمی‌خواند).
fn spawn_engine(plan: &EngineLaunch) -> Result<Child, String> {
    let mut cmd = Command::new(&plan.node);
    cmd.arg(&plan.server_js)
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
        .stdout(Stdio::null());
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
    cmd.spawn()
        .map_err(|e| format!("spawn موتور محلی ناموفق: {e}"))
}

impl LocalEngine {
    /// بالا آوردن موتور adapter با مشخصات کامل اجرا (EngineLaunch).
    /// on_event: گیرندهٔ رویدادهای نگهبان — در lib.rs به emit تائوری بسته می‌شود.
    /// v1.27.۰۳: پس از spawn منتظر engine-config.json می‌ماند تا پورت نهایی معلوم شود.
    pub fn start(launch: EngineLaunch, on_event: EngineEventSink) -> Result<Self, String> {
        if !launch.server_js.is_file() {
            return Err(format!("باندل موتور یافت نشد: {}", launch.server_js.display()));
        }
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
/// ENG-4: همان thread پایش مُهر ری‌استارت پنل و سلامت سرویس بازی‌ها را هم انجام می‌دهد
/// (هر دو سرویس در یک پروسهٔ موتور هستند؛ ری‌استارتِ هر دو = spawn دوبارهٔ همان child).
fn supervise(
    plan: EngineLaunch,
    port: u16,
    games_port: u16,
    stop: Arc<AtomicBool>,
    child_slot: Arc<Mutex<Option<Child>>>,
    on_event: EngineEventSink,
) {
    std::thread::spawn(move || {
        let mut history: Vec<RestartRecord> = Vec::new();
        // وضعیت پایش بازی‌ها — آینهٔ engine_watchdog.rs (بک‌آف ۲/۵/۱۰، کاپ ۳، پنجرهٔ ۱۰د)
        let mut games_history: Vec<RestartRecord> = Vec::new();
        let mut games_fails: u32 = 0;
        let mut tick: u32 = 0;
        loop {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            std::thread::sleep(Duration::from_millis(SUPERVISE_POLL_MS));
            tick += 1;
            // پایش زمان اجرا هر ۵ ثانیه — ① مُهر ری‌استارت پنل (خروج عمدی، حساب کرش ندارد)
            // ② سلامت سرویس بازی‌ها با اپ سالم (ENG-4)
            if tick % RUNTIME_POLL_EVERY == 0 && !stop.load(Ordering::SeqCst) {
                if restart_scheduled_once(port) {
                    eprintln!("[desktop] ری‌استارت سامانه از پنل درخواست شد — خاموشی تمیز و بالا آوردن دوباره");
                    on_event(WatchdogEvent::Restarting { attempt: 0, delay_ms: 0 });
                    kill_child(&child_slot);
                    history.clear();
                    games_history.clear();
                    games_fails = 0;
                    match spawn_engine(&plan) {
                        Ok(new_child) => {
                            if let Ok(mut guard) = child_slot.lock() {
                                *guard = Some(new_child);
                            }
                            // پس از ری‌استارت پنل هم پورت نهایی ممکن است عوض شود — دوباره کانفیگ
                            let Some((new_port, new_games)) =
                                wait_engine_config(&plan.data_dir, RESTART_HEALTH_TIMEOUT)
                            else {
                                kill_child(&child_slot);
                                eprintln!("[desktop] پس از ری‌استارت پنل کانفیگ نیامد — تلاش دوبارهٔ نگهبان");
                                continue;
                            };
                            if wait_healthy_while(new_port, &stop, RESTART_HEALTH_TIMEOUT) {
                                on_event(WatchdogEvent::Restored);
                                eprintln!("[desktop] ری‌استارت پنل کامل شد — موتور دوباره روی پورت {new_port} آماده است");
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
                    if games_fails > 0 || !games_history.is_empty() {
                        eprintln!("[desktop] سرویس بازی‌ها دوباره سالم است — شمارش نگهبان از صفر");
                    }
                    games_fails = 0;
                    games_history.clear();
                } else if main_ok {
                    games_fails += 1;
                    if games_fails >= GAMES_FAIL_THRESHOLD {
                        games_fails = 0;
                        let now = now_ms();
                        let mut decision = next_action(&games_history, now, now);
                        if let WatchdogAction::ResetWindow = decision {
                            games_history.clear();
                            decision = next_action(&games_history, now, now);
                        }
                        match decision {
                            WatchdogAction::GiveUp => {
                                eprintln!("[desktop] نگهبان بازی‌ها تسلیم شد — ۳ تلاش در پنجرهٔ ۱۰ دقیقه بی‌نتیجه؛ بخش اداری سالم مانده و فقط «تلاش دوبارهٔ» دستی اثر می‌کند");
                                on_event(WatchdogEvent::Down { attempts: games_history.len() as u32 });
                            }
                            WatchdogAction::ResetWindow => {}
                            WatchdogAction::Restart(delay_ms) => {
                                let attempt = games_history.len() as u32 + 1;
                                eprintln!("[desktop] سرویس بازی‌ها ناسالم است — ری‌استارت تا {} ثانیه دیگر (تلاش {})", delay_ms / 1000, attempt);
                                on_event(WatchdogEvent::Restarting { attempt, delay_ms });
                                games_history.push(RestartRecord { exit_at_ms: now, delay_ms });
                                if sleep_interruptible(Duration::from_millis(delay_ms), &stop) {
                                    kill_child(&child_slot);
                                    match spawn_engine(&plan) {
                                        Ok(new_child) => {
                                            if let Ok(mut guard) = child_slot.lock() {
                                                *guard = Some(new_child);
                                            }
                                            let Some((new_port, _)) =
                                                wait_engine_config(&plan.data_dir, RESTART_HEALTH_TIMEOUT)
                                            else {
                                                kill_child(&child_slot);
                                                continue;
                                            };
                                            if wait_healthy_while(new_port, &stop, RESTART_HEALTH_TIMEOUT) {
                                                games_history.clear();
                                                on_event(WatchdogEvent::Restored);
                                                eprintln!("[desktop] سرویس بازی‌ها پس از ری‌استارت دوباره آماده است");
                                            } else if !stop.load(Ordering::SeqCst) {
                                                kill_child(&child_slot);
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("[desktop] spawn دوبارهٔ موتور برای بازی‌ها ناموفق بود: {e}");
                                        }
                                    }
                                }
                            }
                        }
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
