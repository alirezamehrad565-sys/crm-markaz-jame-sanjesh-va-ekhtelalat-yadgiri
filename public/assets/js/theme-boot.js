/**
 * بوت تم روشن/تاریک بدون فلش
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// theme-boot.js — از index.html به فایل خارجی منتقل شد تا CSP سخت‌گیرانه
// (script-src 'self') روی پوستهٔ اپ بدون 'unsafe-inline' ممکن باشد.
// باید قبل از رندر اجرا شود تا فلش تم اشتباه نداشته باشیم (اسکریپت سنکرون در head).
(function () {
  try {
    var saved = localStorage.getItem('cs.theme');
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = saved || sys;
  } catch (e) { /* noop */ }
})();
