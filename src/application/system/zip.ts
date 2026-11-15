// src/application/system/zip.ts — سازندهٔ ZIP سبک بدون هیچ وابستگی تازه (۴-۲ — بستهٔ خطا)
//
// روش STORE (صفر فشرده‌سازی): هر ورودی با local file header + central directory + EOCD
// دست‌نویس ساخته می‌شود — خروجی با unzip -t و python zipfile باز می‌شود (آزمون‌شده در گیت).
// دلیل دست‌ساز بودن: Adding zip.js/fflate وابستگی npm تازه می‌خواست و خط «بدون dep جدید»
// محدودیت سخت است؛ دادهٔ بستهٔ خطا متن/JSON است و فشرده‌سازی ضروری نیست.
// CRC-32 استاندارد (چندجمله‌ای 0xEDB88320) همین‌جا با جدول از پیش ساخته محاسبه می‌شود.

/** جدول CRC-32 — یک‌بار در سطح ماژول ساخته می‌شود */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** تاریخ/ساعت DOS برای سربرگ‌های ZIP — از UTC */
function dosDateTime(d: Date): { date: number; time: number } {
  const date = ((Math.max(0, d.getUTCFullYear() - 1980) & 0x7f) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  return { date, time };
}

export interface ZipEntry {
  /** نام فایل داخل بسته — ASCII (محتوای فارسی در خود داده است، نه نام) */
  name: string;
  data: Uint8Array;
}

/** بایت‌های متن UTF-8 */
export function zipText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const U16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
const U32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/**
 * ساخت ZIP با روش STORE — برگشت بایت‌های بسته. هیچ ورودی فشرده نمی‌شود؛
 * همهٔ فیلدها little-endian مطابق ساختار رسمی PKZIP (APPNOTE.TXT) نوشته می‌شوند.
 */
export function buildStoreZip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const { date: dosDate, time: dosTime } = dosDateTime(now);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = zipText(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // — local file header (30 بایت) + نام + داده —
    const lfh: number[] = [
      0x50, 0x4b, 0x03, 0x04, // امضای PK\x03\x04
      ...U16(20), // نسخهٔ لازم برای استخراج
      ...U16(0x0800), // پرچم: نام UTF-8
      ...U16(0), // روش ذخیره = STORE
      ...U16(dosTime),
      ...U16(dosDate),
      ...U32(crc),
      ...U32(size), // حجم فشرده‌شده (= خودش در STORE)
      ...U32(size), // حجم اصلی
      ...U16(nameBytes.length),
      ...U16(0) // طول فیلد اضافی
    ];
    const lfhBytes = new Uint8Array(lfh);
    chunks.push(lfhBytes, nameBytes, entry.data);

    // — central directory entry (46 بایت) + نام —
    const cd: number[] = [
      0x50, 0x4b, 0x01, 0x02, // امضای PK\x01\x02
      ...U16(20), ...U16(20), // نسخهٔ ساخت / نسخهٔ لازم
      ...U16(0x0800),
      ...U16(0),
      ...U16(dosTime),
      ...U16(dosDate),
      ...U32(crc),
      ...U32(size),
      ...U32(size),
      ...U16(nameBytes.length),
      ...U16(0), ...U16(0), // فیلد اضافی / توضیح
      ...U16(0), ...U16(0), // شماره دیسک / ویژگی‌های درونی
      ...U32(0), // ویژگی‌های بیرونی
      ...U32(offset) // آفست local header
    ];
    central.push(new Uint8Array(cd), nameBytes);

    offset += lfhBytes.length + nameBytes.length + size;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;

  // — EOCD (22 بایت) —
  const eocd: number[] = [
    0x50, 0x4b, 0x05, 0x06, // امضای PK\x05\x06
    ...U16(0), ...U16(0), // شماره دیسک
    ...U16(entries.length), ...U16(entries.length),
    ...U32(centralSize),
    ...U32(centralStart),
    ...U16(0) // طول توضیح
  ];

  const total = centralStart + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of [...chunks, ...central, new Uint8Array(eocd)]) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
