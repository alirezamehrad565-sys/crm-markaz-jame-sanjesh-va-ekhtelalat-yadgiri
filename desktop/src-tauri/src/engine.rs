//! engine.rs — موتور محلی (سایدکار workerd) — فاز ۲ خط rust
//! طراحی: docs/rust/design.md §۲ و §۴ — بایند فقط loopback، پورت ۸۷۸۷ پیش‌فرض
//! (اگر اشغال بود پورت آزاد بعدی)، سلامت /health، خاموشی با Drop.
//!
//! کامپایل در CI (cargo در محیط سندباکس جاری نیست) — گیت ساختاری desktop:check
//! هم‌گامی فایل‌ها را می‌گیرد و کامپایل واقعی در خط CI با Rust stable انجام می‌شود.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// پورت پیش‌فرض موتور محلی — همان devUrl پوسته (tauri.conf.json)
const DEFAULT_PORT: u16 = 8787;

pub struct LocalEngine {
    child: Child,
    pub port: u16,
}

/// پیدا کردن باینری workerd: متغیر محیطی ← کنار برنامه (سایدکار نصاب: ریشه و binaries/) ←
/// مسیرهای توسعهٔ node_modules. rust-f13: در tauri dev فایل سایدکار پسوند هدف دارد
/// (workerd-<target>) و در نصاب NSIS نام بدون پسوند هدف کنار exe (یا زیر binaries/) می‌نشیند.
fn find_workerd_binary() -> Option<PathBuf> {
    if let Ok(from_env) = std::env::var("CENTER_WORKERD_BIN") {
        let p = PathBuf::from(from_env);
        if p.is_file() {
            return Some(p);
        }
    }
    let exe_name = if cfg!(windows) { "workerd.exe" } else { "workerd" };
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let mut candidates = vec![exe_dir.join(exe_name), exe_dir.join("binaries").join(exe_name)];
    // سایدکار با نام هدف — شکل dev تائوری: binaries/workerd-<target>
    if let Ok(entries) = std::fs::read_dir(exe_dir.join("binaries")) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().starts_with("workerd") {
                candidates.push(entry.path());
            }
        }
    }
    for c in &candidates {
        if c.is_file() {
            return Some(c.clone());
        }
    }
    // مسیر توسعه — از ریشهٔ مخزن (دو سطح بالاتر از desktop/src-tauri)
    let dev_root = exe_dir
        .ancestors()
        .find(|a| a.join("node_modules/workerd/bin").is_dir())
        .map(|a| a.to_path_buf());
    if let Some(root) = dev_root {
        let dev = root.join("node_modules/workerd/bin/workerd");
        if dev.is_file() {
            return Some(dev);
        }
    }
    None
}

/// پورت آزاد روی loopback: ۸۷۸۷ پیش‌فرض، وگرنه پورت گذرا از هستهٔ سیستم
pub fn free_port() -> u16 {
    if TcpListener::bind(("127.0.0.1", DEFAULT_PORT)).is_ok() {
        return DEFAULT_PORT;
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(DEFAULT_PORT)
}

/// یک پروب HTTP ساده با std — بدون وابستگی جدید؛ فقط سطر وضعیت پاسخ خوانده می‌شود
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

impl LocalEngine {
    /// بالا آوردن workerd با کانفیگ capnp-text تولیدشده (scripts/engine/config.mjs)
    /// مسیر کانفیگ با CENTER_ENGINE_CONFIG بازنویسی می‌شود؛ پیش‌فرض: کنار برنامه.
    pub fn start(config_path: &Path) -> Result<Self, String> {
        let binary = find_workerd_binary()
            .ok_or_else(|| "باینری workerd پیدا نشد (CENTER_WORKERD_BIN یا کنار برنامه)".to_string())?;
        let config = std::env::var("CENTER_ENGINE_CONFIG")
            .map(PathBuf::from)
            .unwrap_or_else(|_| config_path.to_path_buf());
        if !config.is_file() {
            return Err(format!("کانفیگ موتور محلی یافت نشد: {}", config.display()));
        }
        let port = free_port();
        // --experimental برای فلگ experimental سرویس D1 (همان آرگومان‌های scripts/engine/engine.mjs)
        // خاموشی فقط با Drop ساختار LocalEngine (kill + wait) — std::process::Command
        // متد kill_on_drop ندارد (API توکیو است) و نیازش هم نیست.
        // rust-f13 — stderr سایدکار به data/workerd.log (کنار کانفیگ) می‌رود تا خرابی نصاب
        // قابل تشخیص باشد؛ stdout بی‌صدا.
        let mut cmd = Command::new(&binary);
        cmd.args(["serve", "--experimental", config.to_string_lossy().as_ref()])
            .stdout(Stdio::null());
        match std::fs::File::options()
            .create(true)
            .append(true)
            .open(config.parent().unwrap_or(Path::new(".")).join("workerd.log"))
        {
            Ok(f) => {
                cmd.stderr(Stdio::from(f));
            }
            Err(_) => {
                cmd.stderr(Stdio::null());
            }
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("spawn workerd ناموفق: {e}"))?;
        Ok(Self { child, port })
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

/// خاموشی تمیز با Drop — خروج اپ یا drop شدن وضعیت، workerd را می‌بندد
/// (kill + wait — معادل kill_on_drop توکیو، با std).
impl Drop for LocalEngine {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
