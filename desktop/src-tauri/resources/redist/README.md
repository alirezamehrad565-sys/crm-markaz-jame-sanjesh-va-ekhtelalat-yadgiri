# resources/redist — پیش‌نیازهای بومی ویندوز (v1.27.02)

این پوشه هنگام **مونتاژ رانتایم نصاب** (`scripts/desktop/build-installer-runtime.mjs --target
x86_64-pc-windows-msvc`) پر می‌شود — در مخزن فقط همین سند هست تا الگوی `resources/redist/*`
در tauri-build روی همهٔ پلتفرم‌ها (از جمله cargo check لینوکس) همیشه حداقل یک فایل داشته باشد.

- **vc_redist.x64.exe** — آخرین Microsoft Visual C++ Redistributable x64، دانلودشده از
  `https://aka.ms/vs/17/release/vc_redist.x64.exe` (هش SHA-256 در مانیفست ثبت می‌شود).
  رفع رایج کرش راه‌اندازی workerd روی ویندوز — issueهای `cloudflare/workerd#4668` و `#7581`.
- نصاب NSIS پس از نصب (هوک POSTINSTALL در `desktop/src-tauri/installer-hooks.nsh`) آن را با
  ارتقای مجوز اجرا می‌کند؛ اگر کاربر UAC را رد کند، این فایل در پوشهٔ نصب می‌ماند و صفحهٔ
  راه‌اندازی در صورت کرش بومی مسیر دستی را نشان می‌دهد.

نکته: این فایل را دستی جایگزین نکنید — نسخهٔ رسمی مایکروسافت در بیلد دانلود و هش می‌شود
(جزئیات و ریسک‌های باقی‌مانده: `docs/rust/windows-risks.md`).
