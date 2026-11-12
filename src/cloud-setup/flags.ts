/**
 * rust-f7 — فلگ ویژگی «راه‌اندازی نخست و اتصال ابر»
 *
 * همان دفاع دوکانالهٔ توتوریال با یک فرق عملیاتی: خط rust در پوسته هر دو ویژگی
 * را با __DESKTOP_FEATURES__ (که lib.rs پیش از ناوبری تزریق می‌کند) روشن می‌کند،
 * چون باندل وب و میز یکی است و فلگ استاتیک در بیلد وب باید خاموش بماند.
 *   وب: هر دو کانال خاموش → نه DOM، نه fetch، نه تغییر رفتار (بایت‌به‌بایت ثابت)
 *   میز: پوسته __DESKTOP_SHELL__ + __DESKTOP_FEATURES__.setup را ست می‌کند
 */

export interface SetupFeatureFlags {
  enabled: boolean;
}

export const SETUP_FEATURE: SetupFeatureFlags = { enabled: false };

/** خواندن باریک کانال پوستهٔ دسکتاپ — بدون فرض وجود window */
export function desktopShellChannel(): boolean {
  return (globalThis as Record<string, unknown>)['__DESKTOP_SHELL__'] === true;
}

interface ShellFeatures {
  tutorial?: boolean;
  setup?: boolean;
}

/**
 * کانال ویژگی‌های پوسته: فقط وقتی معتبر است که هم __DESKTOP_SHELL__=true باشد
 * و هم __DESKTOP_FEATURES__ کلید مربوطه را صریحاً true کرده باشد — آسیب
 * تصادفی در وب را ناممکن می‌کند و کنترل را در دست پوستهٔ Rust می‌گذارد.
 */
export function shellFeatureEnabled(key: 'tutorial' | 'setup'): boolean {
  if (!desktopShellChannel()) return false;
  const features = (globalThis as Record<string, unknown>)['__DESKTOP_FEATURES__'] as
    | ShellFeatures
    | undefined;
  return features?.[key] === true;
}

/** گات نهایی ویزار: فلگ استاتیک (برای بیلد اختصاصی آینده) «یا» کانال پوسته */
export function setupFlagEnabled(): boolean {
  return SETUP_FEATURE.enabled === true || shellFeatureEnabled('setup');
}
