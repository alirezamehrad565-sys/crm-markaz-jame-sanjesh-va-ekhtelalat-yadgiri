/**
 * ذخیره‌سازی فایل — D1/R2/تکه‌تکه — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
//: ذخیرهٔ فایل تمرین‌ها با رابط یکسان (D1 پیش‌فرض / R2 اختیاری)
// chunked-d1-store: فایل‌های تا ۵۰ مگابایت داخل D1 (تکه‌تکه) بدون نیاز به R2

export type { ObjectStore, R2LikeBucket, StoredObject } from './types';
export { createD1ObjectStore } from './d1-store';
export { createR2ObjectStore } from './r2-store';
export { createChunkedD1ObjectStore } from './chunked-d1-store';
