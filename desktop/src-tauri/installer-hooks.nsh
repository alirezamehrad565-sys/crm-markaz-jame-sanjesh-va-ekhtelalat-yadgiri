; قلاب‌های نصاب NSIS — v1.27.۱۲ (اشکال گزارش‌شدهٔ کارفرما: موتور پس از ارتقا کهنه می‌ماند)
; علت: پروسهٔ node موتور اگر هنگام نصب (یا به‌صورت جامانده) زنده باشد، فایل‌های
; resources/engine/central/central-worker.js را باز نگه می‌دارد و NSIS جایگزینشان نمی‌کند →
; موتور روی نسخهٔ نخستین نصب می‌ماند (مثلاً ۱.۲۷.۴) با SPA تازه — و مسیرهای تازه (هم‌گامی ابر)
; در موتور کهنه نیست. این قلاب پیش از کپی فایل‌ها فقط پروسه‌های موتور خودِ برنامه را می‌بندد
; (فیلد فرمان شامل engine-server) — به nodeهای دیگر کاربر کاری ندارد. شکستش بی‌خطر است.
; ✋ در NSIS هر $ باید $$$$ نوشته شود تا برای PowerShell به شکل $_ برسد.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "بستن پروسه‌های موتور جامانده تا فایل‌ها جایگزین شوند…"
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'node.exe' -and $$_.CommandLine -match 'engine-server' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  Sleep 700
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'node.exe' -and $$_.CommandLine -match 'engine-server' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  Sleep 700
!macroend
