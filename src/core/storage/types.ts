/**
 * ذخیره‌سازی فایل — D1/R2/تکه‌تکه — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// رابط ObjectStore: ذخیرهٔ فایل تمرین‌ها بدون وابستگی به سرویس خاص
// دو آداپتر: d1-store (پیش‌فرض — الگوی assessments داخل D1) و r2-store (binding اختیاری)
// تعویض سرویس ابری آینده (Drive/…) = آداپتر جدید، بدون دست‌زدن به دامنه

export interface StoredObject {
  bytes: Uint8Array;
  mime: string;
  size: number;
}

export interface ObjectStore {
  /** نام آداپتر — برای meta endpoint و لاگ */
  readonly name: 'd1' | 'r2';
  /** — سقف حجم هر آبجکت (بایت)؛ سرویس بانک تمرین اعتبارسنجی را بر همین مبنا می‌کند */
  readonly maxObjectBytes: number;
  /** نوشتن/بازنویسی کامل یک کلید */
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  /**
   * — نوشتن از قطعات باینری بدون concat کامل — آداپترهایی که پخش‌جریانی
   * می‌نویسند پیاده‌سازی می‌کنند؛ نبودِ آن یعنی concat در سرویس
   */
  putSegments?(key: string, segments: Uint8Array[]): Promise<void>;
  /** خواندن — کلید موجود نیست → null */
  get(key: string): Promise<StoredObject | null>;
  /** حذف — کلید موجود نبود خطا نمی‌دهد */
  delete(key: string): Promise<void>;
}

/** حداقل سطح موردنیاز از binding واقعی R2 — بدون وابستگی به @cloudflare/workers-types */
export interface R2LikeBucket {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<unknown>;
}
