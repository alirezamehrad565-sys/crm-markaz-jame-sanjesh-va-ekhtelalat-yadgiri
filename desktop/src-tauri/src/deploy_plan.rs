//! deploy_plan.rs — برنامهٔ اعمال مایگریشن‌ها با پیگیری «چه فایلی اعمال شده» (رفع CEN-3 / بند ۰-۹)
//!
//! مشکل: deploy اسکیما روی D1 قطعه‌قطعه است؛ شکست در میانه + تلاش دوبارهٔ خام، chunkهای
//! قبلی را دوباره اعمال می‌کند و روی ALTER TABLE ADD COLUMN های ساده خطای
//! duplicate column name می‌دهد (SQLite «ADD COLUMN IF NOT EXISTS» ندارد).
//! راه‌حل: جدول زیرساختی __deploy_applied در همان پایگاه D1 — تنها توسط ابزار deploy
//! ساخته می‌شود و هرگز جزو migrations/ نیست — سپس برنامهٔ صریح: کدام فایل Skip،
//! کدام Fresh، کدام تغییرکرده و کدام نیازمند بازنشانی است.
//!
//! این ماژول pure است: فقط std + sha2 (تنها وابستهٔ مجازِ جدید؛ pure-Rust، بدون کتابخانهٔ
//! سیستم) و هیچ ورودی تائوری ندارد — تست‌های واحد در scripts/rust-tests همین فایل را با
//! #[path] بارگذاری می‌کنند؛ کامپایل کامل در CI (desktop-build) انجام می‌شود.
//!
//! فرض کلیدی برای ReapplyChanged و NeedsReset: مایگریشن‌های رسمی مخزن افزودنی‌اند —
//! CREATE TABLE/INDEX و ALTER TABLE ADD COLUMN — پس اعمال دوبارهٔ فایلِ تغییرکرده بی‌ضرر
//! است، به شرطی که محتوای جدید هم افزودنی بماند (قرارداد مایگریشن‌های مخزن؛ گیت
//! check-d1-compat ناسازگاری را می‌گیرد).

use sha2::{Digest, Sha256};

/// DDL جدول پیگیری — زیرساختِ ابزار deploy؛ پیشوند __ تا با نام مایگریشن‌ها قاطی نشود
pub const DEPLOY_APPLIED_DDL: &str =
    "CREATE TABLE IF NOT EXISTS __deploy_applied (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)";

/// یک فایل مایگریشن آمادهٔ اعمال — checksum همیشه SHA-256 hex محتوای SQL است
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationFile {
    pub name: String,
    pub sql: String,
    pub checksum: String,
}

/// یک رکورد «قبلاً اعمال شده» از جدول __deploy_applied
/// checksum = None یعنی رکورد قدیمی/بدون اثر انگشت — نمی‌دانیم چه چیزی اعمال شده
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedRecord {
    pub name: String,
    pub checksum: Option<String>,
    pub applied_at: String,
}

/// تصمیم برنامه برای یک فایل
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeployAction {
    /// همین فایل با همین checksum قبلاً اعمال شده — کاری نکن (کلید رفع CEN-3)
    Skip,
    /// هنوز اعمال نشده — از اول اعمال شود
    ApplyFresh,
    /// همنام اما checksum عوض شده — دوباره اعمال می‌شود؛ بی‌ضرر چون مایگریشن‌ها افزودنی‌اند
    /// (فرض مستند در سربرگ ماژول)
    ReapplyChanged,
    /// رکوردی هست اما checksum ناشناخته/قدیمی است — مثل ReapplyChanged دوباره اعمال می‌شود
    NeedsReset,
}

/// برنامهٔ deploy: برای هر فایل (به ترتیب ورودی — قطعی) یک تصمیم می‌دهد.
/// dedup-safe: نام تکراری در files فقط بار اول می‌آید (اولین occurrence ملاک)؛
/// رکوردهای تکراری در applied هم مسئله‌ساز نیستند — اگر حتی یکی از آن‌ها checksum
/// یکسان داشت فایل Skip می‌شود، وگرنه اولویت: checksum متفاوت → ReapplyChanged،
/// checksum ناشناخته → NeedsReset، هیچ رکوردی → ApplyFresh.
pub fn plan_deploy(
    applied: &[AppliedRecord],
    files: &[MigrationFile],
) -> Vec<(String, DeployAction)> {
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(files.len());
    for f in files {
        if !seen.insert(f.name.as_str()) {
            continue; // نام تکراری — اولین occurrence ملاک است
        }
        let mut same = false;
        let mut changed = false;
        let mut unknown = false;
        for a in applied {
            if a.name != f.name {
                continue;
            }
            match &a.checksum {
                Some(c) if c == &f.checksum => same = true,
                Some(_) => changed = true,
                None => unknown = true,
            }
        }
        let action = if same {
            DeployAction::Skip
        } else if changed {
            DeployAction::ReapplyChanged
        } else if unknown {
            DeployAction::NeedsReset
        } else {
            DeployAction::ApplyFresh
        };
        out.push((f.name.clone(), action));
    }
    out
}

/// SHA-256 به شکل hex کوچک — با sha2 (تنها وابستهٔ جدید مجاز؛ pure-Rust)
pub fn sha256_hex(input: &[u8]) -> String {
    let digest = Sha256::digest(input);
    let mut out = String::with_capacity(64);
    for b in digest.iter() {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// نشان مرزی فایل مایگریشن در schema.sql تجمیعی — دقیقاً قالب build-installer-runtime.mjs:
/// «-- ===== migration: <نام‌فایل> =====»
const MARKER_PREFIX: &str = "-- ===== migration: ";
const MARKER_SUFFIX: &str = " =====";

/// تجزیهٔ schema.sql تجمیعی (تولید scripts/desktop/build-installer-runtime.mjs) به فایل‌های
/// مایگریشن همراه با checksum هر فایل.
/// محافظه‌کار: اگر هیچ نشان «migration:» در فایل نبود، یا پیش‌متنِ پیش از نخستین نشان
/// چیزی جز کامنت/خط خالی داشت (خطر افتادن SQL)، کل dump یک فایل واحد با نام schema.sql
/// برمی‌گردد تا هیچ SQLی بی‌صدا از دست نرود.
/// checksum هر فایل = SHA-256 متن SQL بریده‌شده (trim شده) — فقط باید بین دو اجرای deploy
/// با همان دارایی ثابت بماند؛ که می‌ماند.
pub fn split_migration_files(schema_sql: &str) -> Vec<MigrationFile> {
    // یافتن نشان‌ها با آفست بایتی هر سطر — آگاه از CRLF (trim سطر را پاک می‌کند)
    let mut markers: Vec<(usize, String)> = Vec::new();
    let mut preamble_has_sql = false;
    let mut line_start = 0usize;
    loop {
        let line_end = schema_sql[line_start..]
            .find('\n')
            .map(|i| line_start + i)
            .unwrap_or(schema_sql.len());
        let trimmed = schema_sql[line_start..line_end].trim();
        if let Some(rest) = trimmed
            .strip_prefix(MARKER_PREFIX)
            .and_then(|r| r.strip_suffix(MARKER_SUFFIX))
        {
            let name = rest.trim();
            if !name.is_empty() {
                markers.push((line_start, name.to_string()));
            }
        } else if markers.is_empty() && !trimmed.is_empty() && !trimmed.starts_with("--") {
            preamble_has_sql = true;
        }
        if line_end >= schema_sql.len() {
            break;
        }
        line_start = line_end + 1;
    }
    if markers.is_empty() || preamble_has_sql {
        return vec![MigrationFile {
            name: "schema.sql".to_string(),
            sql: schema_sql.trim().to_string(),
            checksum: sha256_hex(schema_sql.trim().as_bytes()),
        }];
    }
    let mut out = Vec::with_capacity(markers.len());
    for (k, (start, name)) in markers.iter().enumerate() {
        // محتوا از پایان سطر نشان تا آغاز نشان بعدی (یا پایان فایل)
        let content_start = schema_sql[*start..]
            .find('\n')
            .map(|i| start + i + 1)
            .unwrap_or(schema_sql.len());
        let content_end = markers
            .get(k + 1)
            .map(|(s, _)| *s)
            .unwrap_or(schema_sql.len());
        let sql = schema_sql[content_start..content_end].trim().to_string();
        out.push(MigrationFile {
            name: name.clone(),
            checksum: sha256_hex(sql.as_bytes()),
            sql,
        });
    }
    out
}

/// زمان فعلی به ثانیهٔ یونیکس — مقدار ستون applied_at
pub fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// ثانیهٔ یونیکس → ISO-8601 UTC («YYYY-MM-DDTHH:MM:SSZ») — بدون وابسته؛
/// تبدیل روز-به-تاریخ با الگوریتم civil_from_days (هاوارد هینانت)
pub fn utc_iso_from_unix(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(name: &str, sql: &str) -> MigrationFile {
        MigrationFile {
            name: name.to_string(),
            sql: sql.to_string(),
            checksum: sha256_hex(sql.as_bytes()),
        }
    }

    fn applied(name: &str, checksum: Option<&str>) -> AppliedRecord {
        AppliedRecord {
            name: name.to_string(),
            checksum: checksum.map(|c| c.to_string()),
            applied_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    /// خالی بودن applied → همه ApplyFresh به همان ترتیب ورودی
    #[test]
    fn empty_applied_all_fresh_in_order() {
        let files = vec![file("a.sql", "CREATE TABLE a;"), file("b.sql", "CREATE TABLE b;")];
        let plan = plan_deploy(&[], &files);
        assert_eq!(plan.len(), 2);
        assert_eq!(plan[0], ("a.sql".to_string(), DeployAction::ApplyFresh));
        assert_eq!(plan[1], ("b.sql".to_string(), DeployAction::ApplyFresh));
    }

    /// ادامه از میانه: k فایل اول اعمال‌شده با checksum یکسان → Skip، بقیه ApplyFresh
    #[test]
    fn resume_midway_skips_applied_prefix() {
        let a = file("0001_a.sql", "CREATE TABLE a;");
        let b = file("0002_b.sql", "CREATE TABLE b;");
        let c = file("0003_c.sql", "CREATE TABLE c;");
        let records = vec![
            applied("0001_a.sql", Some(&a.checksum)),
            applied("0002_b.sql", Some(&b.checksum)),
        ];
        let plan = plan_deploy(&records, &[a, b, c]);
        assert_eq!(plan[0], ("0001_a.sql".to_string(), DeployAction::Skip));
        assert_eq!(plan[1], ("0002_b.sql".to_string(), DeployAction::Skip));
        assert_eq!(plan[2], ("0003_c.sql".to_string(), DeployAction::ApplyFresh));
    }

    /// همنام با checksum متفاوت → ReapplyChanged (فرض افزودنی بودن، مستند در سربرگ)
    #[test]
    fn changed_checksum_reapplies() {
        let f = file("0001_a.sql", "CREATE TABLE a; ALTER TABLE a ADD COLUMN x;");
        let records = vec![applied("0001_a.sql", Some("deadbeef"))];
        let plan = plan_deploy(&records, &[f]);
        assert_eq!(plan[0], ("0001_a.sql".to_string(), DeployAction::ReapplyChanged));
    }

    /// رکورد قدیمی بدون checksum → NeedsReset
    #[test]
    fn legacy_record_without_checksum_needs_reset() {
        let f = file("0001_a.sql", "CREATE TABLE a;");
        let records = vec![applied("0001_a.sql", None)];
        let plan = plan_deploy(&records, &[f]);
        assert_eq!(plan[0], ("0001_a.sql".to_string(), DeployAction::NeedsReset));
    }

    /// نام تکراری در files → فقط بار اول می‌آید و تصمیم بر اساس اولین است
    #[test]
    fn duplicate_file_names_dedup_first_wins() {
        let first = file("0001_a.sql", "CREATE TABLE a;");
        let second = file("0001_a.sql", "CREATE TABLE b;");
        let plan = plan_deploy(&[], &[first, second]);
        assert_eq!(plan.len(), 1);
        assert_eq!(plan[0], ("0001_a.sql".to_string(), DeployAction::ApplyFresh));
    }

    /// رکوردهای تکراری در applied: یکی یکسان، یکی متفاوت → Skip مقدم است
    #[test]
    fn duplicate_applied_records_matching_wins() {
        let f = file("0001_a.sql", "CREATE TABLE a;");
        let records = vec![
            applied("0001_a.sql", Some("deadbeef")),
            applied("0001_a.sql", Some(&f.checksum)),
        ];
        let plan = plan_deploy(&records, &[f]);
        assert_eq!(plan[0], ("0001_a.sql".to_string(), DeployAction::Skip));
    }

    /// بردارهای شناخته‌شده SHA-256
    #[test]
    fn sha256_known_vectors() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    /// تجزیهٔ dump تجمیعی با نشان‌های build-installer-runtime — نام و checksum هر بخش
    #[test]
    fn split_generated_dump_per_file() {
        let dump = "-- schema.sql — تجمیع ۲ مایگریشن رسمی\n\
                    -- مقصد: پایگاه markaz-central — این فایل را دستی ویرایش نکنید.\n\
                    \n-- ===== migration: 0001_a.sql =====\n\
                    CREATE TABLE a;\n\
                    \n-- ===== migration: 0002_b.sql =====\n\
                    CREATE TABLE b;\n";
        let files = split_migration_files(dump);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "0001_a.sql");
        assert_eq!(files[0].sql, "CREATE TABLE a;");
        assert_eq!(files[0].checksum, sha256_hex(b"CREATE TABLE a;"));
        assert_eq!(files[1].name, "0002_b.sql");
        assert_eq!(files[1].sql, "CREATE TABLE b;");
        assert_eq!(files[1].checksum, sha256_hex(b"CREATE TABLE b;"));
    }

    /// بدون نشان (یا پیش‌متن SQLدار) → کل dump یک فایل — هیچ SQLی از دست نمی‌رود
    #[test]
    fn split_without_markers_falls_back_to_single_file() {
        let files = split_migration_files("CREATE TABLE a;\n");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "schema.sql");
        assert_eq!(files[0].sql, "CREATE TABLE a;");
        // پیش‌متن غیرکامنتی پیش از نخستین نشان — مسیر محافظه‌کار
        let risky =
            "PRAGMA foreign_keys=ON;\n-- ===== migration: 0001_a.sql =====\nCREATE TABLE a;\n";
        let files = split_migration_files(risky);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "schema.sql");
    }

    /// بردارهای زمانی ISO-8601 UTC — شامل سال کبیسه
    #[test]
    fn utc_iso_known_vectors() {
        assert_eq!(utc_iso_from_unix(0), "1970-01-01T00:00:00Z");
        assert_eq!(utc_iso_from_unix(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(utc_iso_from_unix(1_709_164_800), "2024-02-29T00:00:00Z");
        assert_eq!(utc_iso_from_unix(1_234_567_890), "2009-02-13T23:31:30Z");
    }

    /// DDL جدول پیگیری — ستون‌ها و کلید اصلی سر جای خودشان‌اند
    #[test]
    fn tracking_ddl_shape() {
        assert!(DEPLOY_APPLIED_DDL.contains("CREATE TABLE IF NOT EXISTS __deploy_applied"));
        assert!(DEPLOY_APPLIED_DDL.contains("name TEXT PRIMARY KEY"));
        assert!(DEPLOY_APPLIED_DDL.contains("checksum TEXT NOT NULL"));
        assert!(DEPLOY_APPLIED_DDL.contains("applied_at TEXT NOT NULL"));
    }
}
