/**
 * آیکون‌های رویدادها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// case-event-icons.js — وکتور جایگزین ایموجی برای انواع رویداد/رویدادساز
// قبلاً دسته‌ها و قالب‌ها با ایموجی (🧩📝🗒📋) نمایش داده می‌شدند — اکنون آیکون خطی SVG
// مهاجرت نرم: قالب‌های قدیمی که «icon» ایموجی دارند در دیتابیس، به وکتورِ دسته برمی‌گردند؛
// قالب‌های جدید نام آیکون وکتوری ذخیره می‌کنند (مثل clipboard/puzzle).

import { icon, isKnownIcon } from './ui.js';

/** آیکون وکتور هر دستهٔ رویداد (جایگزین CATEGORY_ICONS ایموجی) */
export const CATEGORY_ICONS = { session: 'puzzle', checklist: 'clipboard', note: 'note' };

/** آیکون‌های پیشنهادی انتخابگر فرم‌ساز (همه باید در PATHS آمادهٔ ui.js باشند) */
export const TYPE_ICON_CHOICES = [
  'clipboard', 'puzzle', 'note', 'book', 'edit', 'calculator', 'zap', 'speech',
  'heart', 'activity', 'shield', 'brain', 'star', 'target', 'users', 'calendar',
  'trophy', 'medal', 'sparkles', 'compass', 'board', 'gamepad'
];

/** گرهٔ وکتور امن برای یک نوع رویداد — ایموجی قدیمی → آیکون دسته */
export function typeIconNode(category, iconName, size = 20) {
  if (isKnownIcon(iconName)) return icon(iconName, size);
  return icon(CATEGORY_ICONS[category] ?? 'clipboard', size);
}
