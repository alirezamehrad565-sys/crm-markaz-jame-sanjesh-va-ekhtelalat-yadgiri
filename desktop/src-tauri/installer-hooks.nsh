; هوک‌های نصاب NSIS — v1.27.02
; قرارداد تائوری: macroهای NSIS_HOOK_* توسط تائوری به اسکریپت نصاب تزریق می‌شوند.
;
; ۱.۲۷.۰۲ — پس از نصب، Microsoft Visual C++ Redistributable x64 با ارتقای مجوز (runas → UAC)
; اجرا می‌شود. این رایج‌ترین رفع کرش راه‌اندازی workerd روی ویندوز است
; (issueهای cloudflare/workerd#4668 و #7581 — access violation 0xc0000005 هنگام init).
; نکته‌ها:
; - ExecWait نمی‌تواند فایل manifest=requireAdministrator را از نصاب unelevated اجرا کند
;   (خطای 740) — به همین دلیل ExecShell با verb «runas» به‌کار رفته است؛ UAC یک‌بار می‌آید.
; - اگر کاربر UAC را رد کند، نصب برنامه کامل می‌ماند و صفحهٔ راه‌اندازی در صورت کرش بومی،
;   راهنمای دستی (مسیر فایل + پیام فارسی از boot_failure_message در lib.rs) نشان می‌دهد.
; - نصب redist به‌صورت machine-wide است؛ در نبود مجوز مدیر فقط با رد UAC به مشکل می‌خورد.
!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "بررسی پیش‌نیازهای موتور محلی (Microsoft Visual C++ Redistributable)…"
  ExecShell "runas" "$INSTDIR\resources\redist\vc_redist.x64.exe" "/install /passive /norestart" SW_SHOWNORMAL
  DetailPrint "پیش‌نیازهای موتور محلی بررسی شد — اگر UAC را رد کرده‌اید، فایل resources\redist\vc_redist.x64.exe را دستی اجرا کنید."
!macroend
