//! job_object.rs — ۱.۲۷.۱۳ چرخهٔ عمر موتور با Windows Job Object (P0-3 سند ممیزی §۳)
//!
//! هدف: پایان «موتور جامانده» — node موتور اگر پوسته بدون خاموشی تمیز بمیرد (پانیک با
//! panic="abort" در پروفایل ریلیز، TerminateProcess، قطع برق)، تا نسخهٔ قبل فقط در نصبِ بعدی
//! با هوک NSIS جارو می‌شد (installer-hooks.nsh — ریشهٔ «موتور کهنه با SPA تازه»).
//! این ماژول هر کودک موتور را در یک Job Object ویندوزی با پرچم KILL_ON_JOB_CLOSE می‌گذارد:
//! هر کسی که آخرین هندل Job را ببندد، هسته همهٔ اعضا را می‌کشد — مرگ سختِ پوسته هم هندل‌ها را
//! می‌بندد، پس کودک یتیم نمی‌ماند. روی ویندوز ۸ به بالا Job تو در تو مجاز است (هدف نصاب ویندوز ۱۰+).
//!
//! طراحی (ممیزی §۳-ب): FFI خالص با extern "system" روی kernel32 — بدون crate تازه، هم‌راستا با
//! قاعدهٔ Cargo («تنها وابستهٔ جدید مجاز» فقط با توجیه). شکست انتساب غیرمهلک است: job_guard_for
//! در engine.rs آن را ثبت می‌کند و مسیر kill عادی (TerminateProcess + wait) دست‌نخورده می‌ماند.
//! کامپایل فقط روی ویندوز (cfg در lib.rs)؛ جاب cargo-check/test لینوکسی CI این فایل را نمی‌بیند.

#![allow(non_snake_case, non_camel_case_types)] // نام‌های Win32 به‌صورت اصلی حفظ می‌شوند

use std::os::windows::io::RawHandle;

/// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE — بستن آخرین هندل Job → کشتن همهٔ اعضا (winbase.h)
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
/// JobObjectExtendedLimitInformation — کلاس اطلاعات Job (winbase.h JOBOBJECTINFOCLASS)
const JOB_OBJECT_INFO_CLASS_EXTENDED_LIMIT: i32 = 9;

/// JOBOBJECT_BASIC_LIMIT_INFORMATION (winbase.h) — بخش اول ساختار گسترده
#[repr(C)]
#[derive(Clone, Copy)]
struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    PerProcessUserTimeLimit: i64,
    PerJobUserTimeLimit: i64,
    LimitFlags: u32,
    MinimumWorkingSetSize: usize,
    MaximumWorkingSetSize: usize,
    ActiveProcessLimit: u32,
    /// ULONG_PTR
    Affinity: usize,
    PriorityClass: u32,
    SchedulingClass: u32,
}

/// IO_COUNTERS (winbase.h) — بخش دوم ساختار گسترده
#[repr(C)]
#[derive(Clone, Copy)]
struct IO_COUNTERS {
    ReadOperationCount: u64,
    WriteOperationCount: u64,
    OtherOperationCount: u64,
    ReadTransferCount: u64,
    WriteTransferCount: u64,
    OtherTransferCount: u64,
}

/// JOBOBJECT_EXTENDED_LIMIT_INFORMATION (winbase.h) — چیدمان دقیق API ویندوز؛
/// فقط LimitFlags مقدار می‌گیرد و بقیه صفر می‌ماند (mem::zeroed).
#[repr(C)]
#[derive(Clone, Copy)]
struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION,
    IoInfo: IO_COUNTERS,
    ProcessMemoryLimit: usize,
    JobMemoryLimit: usize,
    PeakProcessMemoryUsed: usize,
    PeakJobMemoryUsed: usize,
}

extern "system" {
    fn CreateJobObjectW(lpJobAttributes: *mut core::ffi::c_void, lpName: *const u16) -> RawHandle;
    fn SetInformationJobObject(
        hJob: RawHandle,
        JobObjectInformationClass: i32,
        lpJobObjectInformation: *const core::ffi::c_void,
        cbJobObjectInformationLength: u32,
    ) -> i32;
    fn AssignProcessToJobObject(hJob: RawHandle, hProcess: RawHandle) -> i32;
    fn CloseHandle(hObject: RawHandle) -> i32;
}

/// نگه‌دارندهٔ هندل Job — Drop آن CloseHandle می‌زند و با KILL_ON_JOB_CLOSE همهٔ اعضا
/// کشته می‌شوند. عمرش = عمر کودک در EngineChild (engine.rs) — بستن با kill_child/Drop.
pub struct JobGuard {
    handle: RawHandle,
}

impl JobGuard {
    /// ساخت Job تازه با KILL_ON_JOB_CLOSE و انتساب پروسهٔ کودک.
    /// ورودی: خروجی Child::as_raw_handle (std) — شکست بازکردن هندل هم خطای صریح می‌شود.
    /// پانویس انتساب: اگر پوسته خودش درون یک Job سخت‌گیر باشد، ویندوز ۸+ انتساب تو در تو را
    /// می‌پذیرد؛ شکستش (ACCESS_DENIED روی پالیسی‌های قدیمی) از مسیر Err بیرون می‌آید و
    /// غیرمهلک باقی می‌ماند (فراخواننده فقط ثبت می‌کند).
    pub fn assign(child_handle: std::io::Result<RawHandle>) -> Result<JobGuard, String> {
        let h_process =
            child_handle.map_err(|e| format!("بازکردن هندل پروسهٔ کودک ناموفق بود: {e}"))?;
        unsafe {
            let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
            if job.is_null() {
                return Err("ساخت Job Object ناموفق بود (kernel32)".to_string());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JOB_OBJECT_INFO_CLASS_EXTENDED_LIMIT,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                let _ = CloseHandle(job);
                return Err("تنظیم KILL_ON_JOB_CLOSE روی Job ناموفق بود".to_string());
            }
            if AssignProcessToJobObject(job, h_process) == 0 {
                let _ = CloseHandle(job);
                return Err(
                    "انتساب پروسهٔ کودک به Job ناموفق بود (Job والد سخت‌گیر یا هندل بی‌دسترسی؟)"
                        .to_string(),
                );
            }
            Ok(JobGuard { handle: job })
        }
    }
}

impl Drop for JobGuard {
    fn drop(&mut self) {
        // بستن آخرین هندل → هسته همهٔ اعضا (کودک و هر فرزندِ فرزند) را می‌کشد
        if !self.handle.is_null() {
            unsafe {
                let _ = CloseHandle(self.handle);
            }
            self.handle = std::ptr::null_mut();
        }
    }
}

// هندل Job ویندوزی process-wide است (نه thread-affine) و فقط در Drop مصرف می‌شود؛
// انتقال مالکیت بین رشته‌ها امن است — هم‌الگو با std::process::Child که خودش Send است.
// بدون این، EngineChild هنگام عبور به رشتهٔ نگهبان/بوت E0277 می‌گیرد (RawHandle !Send است).
unsafe impl Send for JobGuard {}

// هیچ آزمون واحد FFI این‌جا نیست: اجرای واقعی Job فقط روی ویندوز معنا دارد و در جاب
// windows-build CI (کامپایل) + نصب واقعی پوشش داده می‌شود؛ ساختار داده و ثابت‌ها pure هستند.
