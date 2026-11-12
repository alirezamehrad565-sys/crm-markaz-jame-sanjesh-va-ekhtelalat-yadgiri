/**
 * rust-f3 — فلگ ویژگی «توتوریال اولیه»
 *
 * قید طلایی فاز ۳: رفتار تولید وب بایت‌به‌بایت ثابت می‌ماند — فلگ پیش‌فرض خاموش است و
 * هیچ DOM، fetch یا تغییر مسیری از تور رخ نمی‌دهد. فعال‌سازی فقط با هر دو شرط زیر:
 *   ۱) فلگ استاتیک TUTORIAL_FEATURE.enabled (در بیلد وب هرگز true نمی‌شود)
 *   ۲) کانال اجرا: متغیر جهانی __DESKTOP_SHELL__ === true (پوستهٔ دسکتاپ Tauri آن را ست می‌کند)
 * دفاع دوکاناله یعنی حتی اگر یکی از دو لایه جا بماند، تور در وب بالا نمی‌آید.
 */

/** فلگ استاتیک ویژگی — تنها منبع حقیقت «ساخته شد یا نه». در وب خاموش می‌ماند. */
export interface TutorialFeatureFlags {
  enabled: boolean;
}

export const TUTORIAL_FEATURE: TutorialFeatureFlags = { enabled: false };

/** خواندن باریک کانال پوستهٔ دسکتاپ — بدون any و بدون فرض وجود window. */
export function desktopShellChannel(): boolean {
  return (globalThis as Record<string, unknown>)['__DESKTOP_SHELL__'] === true;
}

/**
 * گات نهایی: تور فقط وقتی مجاز است که هر دو کانال فعال باشند.
 * (فلگ استاتیک + کانال __DESKTOP_SHELL__) — آزمون منفی/مثبت در tutorial-gate.test.ts
 */
export function tutorialFlagEnabled(): boolean {
  return TUTORIAL_FEATURE.enabled === true && desktopShellChannel() === true;
}
