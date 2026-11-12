/**
 * rust-f7 — قراردادهای مشترک ویزار (جدا از DOM تا آزمون سبک بماند)
 */

export interface VerifyResultLike {
  ok: boolean;
  message: string;
}

export interface WizardHandlers {
  /** آزمون اتصال نود — نتیجهٔ ساختاریافته، هیچ throwی نیست */
  onTestNode(workerUrl: string, nodeCode: string, nodeKey: string): Promise<VerifyResultLike>;
  /** آزمون توکن Cloudflare (اختیاری) */
  onTestToken(token: string): Promise<VerifyResultLike>;
  /** پایان ویزار — ذخیرهٔ رازها/فراداده در این لایه انجام می‌شود */
  onFinish(input: WizardInput): Promise<void>;
  /** رد کردن ویزار — اتصال ابر اختیاری است */
  onSkip(): void;
}

export interface WizardInput {
  worker_url: string;
  node_code: string;
  node_key: string;
  cf_token: string;
}
