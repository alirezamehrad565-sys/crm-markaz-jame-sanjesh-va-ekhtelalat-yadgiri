// محاسبهٔ نشانی‌های LAN برای بایند شبکه‌ای موتور محلی — v1.27.20
// خواست کارفرما: موبایل‌های هم‌شبکه بتوانند از مرورگر وصل شوند؛ منطق خالص و بدون وابستگی
// (آزمون source-pin: src/__tests__/engine-lan-bind.test.ts — دود واقعی: smoke:engine:adapter)
import { networkInterfaces } from 'node:os';

// اولویت بازه‌ها: 192.168 (وای‌فای خانگی/کلینیک) → 10. → 172.16-31
const LAN_PREFIX_RANK = [
  ['192.168.', 0],
  ['10.', 1],
];

function isPrivateLanIPv4(addr) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) return false;
  if (addr.startsWith('127.')) return false; // لوکال
  if (addr.startsWith('169.254.')) return false; // link-local (APIPA)
  if (addr.startsWith('172.')) {
    const second = Number(addr.split('.')[1]);
    return second >= 16 && second <= 31; // فقط بازهٔ خصوصی 172 — نه 172.x عمومی
  }
  return addr.startsWith('192.168.') || addr.startsWith('10.');
}

function prefixRank(addr) {
  for (const [prefix, rank] of LAN_PREFIX_RANK) {
    if (addr.startsWith(prefix)) return rank;
  }
  return 2; // بقیهٔ 172.16-31
}

/** نشانی‌های خصوصی IPv4 کارت‌های شبکه — مرتب‌شده بر ترجیح بازه، بدون تکرار */
export function lanIPv4sOf(getInterfaces = networkInterfaces) {
  const seen = new Set();
  for (const list of Object.values(getInterfaces() ?? {})) {
    for (const ni of list ?? []) {
      if (!ni || (ni.family !== 'IPv4' && ni.family !== 4) || ni.internal) continue;
      if (!isPrivateLanIPv4(ni.address)) continue;
      seen.add(ni.address);
    }
  }
  return [...seen].sort((a, b) => prefixRank(a) - prefixRank(b));
}

/** کارت LAN ترجیحی — اولین بر اساس ترتیب بازه‌ها؛ روی سرور بدون کارت شبکه null */
export function primaryLanIp(getInterfaces = networkInterfaces) {
  return lanIPv4sOf(getInterfaces)[0] ?? null;
}

/** نشانی‌های خوش‌آمد بوت — بایند همه‌کارت‌ها → هر کارت LAN + لوکال؛ بایند خاص → همان هاست */
export function bootUrlsOf(host, port, getInterfaces = networkInterfaces) {
  if (host === '127.0.0.1' || host === 'localhost') return [`http://127.0.0.1:${port}`];
  if (host !== '0.0.0.0' && host !== '::') return [`http://${host}:${port}`];
  const urls = lanIPv4sOf(getInterfaces).map((ip) => `http://${ip}:${port}`);
  urls.push(`http://127.0.0.1:${port}`); // همیشه از همین دستگاه در دسترس است
  return urls;
}

/** مبنای لینک‌های عمومی (چک‌لیست خانواده و…): 0.0.0.0 یعنی همه‌کارت‌ها → کارت LAN اول */
export function defaultPublicBaseOf(host, port, getInterfaces = networkInterfaces) {
  if (host === '127.0.0.1' || host === 'localhost') return `http://127.0.0.1:${port}`;
  if (host === '0.0.0.0' || host === '::') {
    const ip = primaryLanIp(getInterfaces);
    return ip ? `http://${ip}:${port}` : `http://127.0.0.1:${port}`;
  }
  return `http://${host}:${port}`;
}
