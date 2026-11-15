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
 * rust-f7 — کانال ویژگی‌های پوسته: پوستهٔ Rust پیش از ناوبری
 * __DESKTOP_FEATURES__ = { tutorial: true, setup: true } را تزریق می‌کند.
 * در وب هیچ‌کدام ست نمی‌شود، پس تور همان‌جا خاموش می‌ماند (حکم فاز ۳).
 */
export function shellFeatureEnabled(key: 'tutorial' | 'setup'): boolean {
  if (!desktopShellChannel()) return false;
  const features = (globalThis as Record<string, unknown>)['__DESKTOP_FEATURES__'] as
    | { tutorial?: boolean; setup?: boolean }
    | undefined;
  return features?.[key] === true;
}

/**
 * گات نهایی: تور با فلگ استاتیک (بیلد اختصاصی آینده) «یا» کانال ویژگی پوسته
 * فعال می‌شود — در وب هر دو خاموش‌اند. آزمون منفی/مثبت در tutorial-gate.test.ts
 */
export function tutorialFlagEnabled(): boolean {
  return TUTORIAL_FEATURE.enabled === true || shellFeatureEnabled('tutorial');
}
