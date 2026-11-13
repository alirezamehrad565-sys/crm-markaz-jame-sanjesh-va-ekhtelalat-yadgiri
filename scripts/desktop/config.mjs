// scripts/desktop/config.mjs — پیکربگی رانتایم نصاب میز (rust-f13 — گیت فاز ۲ ردیف ۹)
//
// منبع یکتای حقیقت برای: نسخهٔ pinned سایدکار workerd، نگاشت هدف rust → بستهٔ رسمی npm،
// قرارداد نام سایدکار، چیدمان resources داخل نصاب و نام فایل‌ها. مصرف‌کنندگان:
// build-installer-runtime.mjs (CI و محلی)، desktop-check.mjs، گردش‌کار desktop-build.yml.
// هیچ عملیات Cloudflare — دانلود فقط از رجیستری رسمی npm.
import path from 'node:path';

/**
 * نسخهٔ pinned سایدکار — هم‌گام با workerd نصب‌شدهٔ مخزن (node_modules/workerd؛ وابستگی
 * گذری استخر @cloudflare/vitest-pool-workers). ارتقا فقط همراه ارتقای هم‌گام کل مخزن.
 */
export const PINNED_WORKERD_VERSION = '1.20250718.0';

/** نگاشت هدف rustc (rustc -Vv) به بستهٔ باینری رسمی workerd روی npm */
export const TARGET_NPM_PACKAGE = {
  'x86_64-pc-windows-msvc': '@cloudflare/workerd-windows-64',
  'x86_64-unknown-linux-gnu': '@cloudflare/workerd-linux-64',
  'aarch64-apple-darwin': '@cloudflare/workerd-darwin-arm64',
  'x86_64-apple-darwin': '@cloudflare/workerd-darwin-64',
};

/** قرارداد externalBin تائوری: <نام>-<هدف>[.exe] — باندلر پسوند هدف را در نصب حذف می‌کند */
export function sidecarFileName(target) {
  const ext = target.includes('windows') ? '.exe' : '';
  return `workerd-${target}${ext}`;
}

// چیدمان خروجی‌های مونتاژ (نسبت به desktop/src-tauri) — هم‌گام با tauri.conf.json
export const TAURI_DIR = 'desktop/src-tauri';
export const SIDECAR_DIR = 'binaries'; // externalBin: "binaries/workerd"
export const RESOURCES_ENGINE_DIR = 'resources/engine'; // resources: "resources/engine/**/*"
export const CAPNP_TEMPLATE_NAME = 'workerd.capnp.template';
export const D1_SEED_DIR = 'd1-seed'; // دیتابیس مایگریت‌شده + seed نمایشی — بوت نخست کپی می‌کند
export const PUBLIC_DIR_NAME = 'public'; // دیسک assets worker داخل نصاب
export const MANIFEST_NAME = 'engine-runtime-manifest.json'; // ثبت هش‌ها (گیت ردیف ۹)

/** مسیرهای مطلق چیدمان نصاب برای یک ریشهٔ مخزن */
export function installerPaths(repoRoot) {
  const tauri = path.join(repoRoot, TAURI_DIR);
  return {
    tauriDir: tauri,
    sidecarDir: path.join(tauri, SIDECAR_DIR),
    resourcesEngineDir: path.join(tauri, RESOURCES_ENGINE_DIR),
    capnpTemplate: path.join(tauri, RESOURCES_ENGINE_DIR, CAPNP_TEMPLATE_NAME),
    d1SeedDir: path.join(tauri, RESOURCES_ENGINE_DIR, D1_SEED_DIR),
    publicDir: path.join(tauri, RESOURCES_ENGINE_DIR, PUBLIC_DIR_NAME),
    manifest: path.join(tauri, MANIFEST_NAME),
  };
}
