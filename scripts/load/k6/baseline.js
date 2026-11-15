// سناریوهای baseline بار — k6 — ف۵ طرح ارتقا (P1-9)
//
// هدف: ثبت اعداد مرجع (p50/p95/p99 + rps + نرخ خطا) روی ورکر محلی (wrangler dev، پورت ۸۷۸۷)
// برای مقایسهٔ رگرسیونی نسخه‌های بعدی — نه اندازه‌گیری تأخیر لبه (ورکر محلی ≠ لبه؛ هشدار در docs/load-baseline.md).
//
// نرخ‌ها «معقول و واقع‌گرایانه»اند (مجموع ~۴۲ درخواست/ثانیه در اوج، هم‌پوشان ≤۲۰ VU) —
// مسیر ورود آگاهانه کم‌نرخ (۲/ثانیه) تا throttle دوگانهٔ login_throttle (۵ تلاش ناموفق/۱۵دقیقه بر
// شناسه + ۲۰ بر IP) بیدار نشود؛ همهٔ ورودهای این سناریو موفق‌اند و تنها ردیف audit می‌نویسند.
//
// اجرا: از scripts/load/baseline.mjs (npm run load:baseline) یا مستقیم:
//   k6 run -e BASE_URL=http://127.0.0.1:8787 scripts/load/k6/baseline.js
//
// زیرمتریک‌های تفکیک‌شده با tag «scenario» منتشر می‌شوند — runner آن‌ها را به جدول تبدیل می‌کند.

import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8787';
const USERNAME = __ENV.LOAD_USER || 'manager';
const PASSWORD = __ENV.LOAD_PASS || '1234';

// پنجره‌های خوانش سنگین — تاریخ تهران (UTC+03:30) به‌صورت Y-M-D، هم‌فرمت TehranYmdSchema
function tehranYmd(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400_000 + 3.5 * 3600_000);
  return d.toISOString().slice(0, 10);
}

const TODAY = tehranYmd(0);

// ① پنجرهٔ کارا برای عدد عملکردی: ۲روزه (~۸۰ نوبت در دادهٔ حجمی محلی).
//    چرا نه ۳۰روزه؟ یافتهٔ همین baseline (۱.۲۵.۷۰): مسیر خلاصهٔ دوره → appointments.list →
//    selectStudentsOfAppointments با IN-list یک‌جای همهٔ نوبت‌ها؛ سقف ۱۰۰ پارامتر بایند D1
//    (سختِ سرویس) با پنجرهٔ ≥۳روزهٔ ۴۰نوبت/روز منفجر می‌شود و ۵۰۰ می‌دهد — scenario
//    «dashboard_summary_30d» همین باگ را به‌عنوان قناری ثبت می‌کند تا رفع آینده (چانک‌کردن IN)
//    در همین گاه‌شمار دیده شود. اعداد عملکردیِ خلاصهٔ دوره روی پنجرهٔ کارای ۲روزه معتبرند.
const SUMMARY_FROM = tehranYmd(-1);
const SUMMARY_TO = tehranYmd(0);
const SUMMARY_30D_FROM = tehranYmd(-29);
const SUMMARY_30D_TO = tehranYmd(0);

export const options = {
  // صدک‌های موردنیاز سند baseline — پیش‌فرض k6 فقط p90/p95 می‌دهد؛ p50/p99 هم می‌خواهیم
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],

  scenarios: {
    // ① سلامت بدون احراز — GET /health (یک SELECT 1 روی D1 هم می‌زند)
    health: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 20,
      exec: 'healthScenario',
    },

    // ② ورود — POST /api/auth/login (نرخ آگاهانهٔ کم — توضیح بالای فایل)
    login: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '30s',
      startTime: '5s',
      preAllocatedVUs: 4,
      maxVUs: 8,
      exec: 'loginScenario',
    },

    // ③ خوانش‌های احرازشده — تابلو/گزارش؛ هم‌زمان از ۱۰ثانیه به بعد، ۴۰ثانیه
    dashboard_summary: {
      executor: 'constant-arrival-rate',
      rate: 8,
      timeUnit: '1s',
      duration: '40s',
      startTime: '10s',
      preAllocatedVUs: 8,
      maxVUs: 24,
      exec: 'summaryScenario',
    },
    dashboard_today: {
      executor: 'constant-arrival-rate',
      rate: 8,
      timeUnit: '1s',
      duration: '40s',
      startTime: '10s',
      preAllocatedVUs: 8,
      maxVUs: 24,
      exec: 'todayScenario',
    },
    reports: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '40s',
      startTime: '10s',
      preAllocatedVUs: 4,
      maxVUs: 12,
      exec: 'reportsScenario',
    },

    // ④ قناری باگ سقف ۱۰۰پارامتر D1 (توضیح بالای فایل) — انتظار: ۵۰۰ برای همه؛
    //    اگر روزی ۲۰۰ شد یعنی باگ رفع شده و چکِ پایین قرمز می‌شود تا سند به‌روز شود
    dashboard_summary_30d: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: '20s',
      startTime: '10s',
      preAllocatedVUs: 2,
      maxVUs: 4,
      exec: 'summary30dScenario',
    },
  },

  // آستانه‌ها per-scenario — این اجرا «اندازه‌گیری» است نه گوت؛ سقف‌ها عمداً سخاوتمندانه‌اند.
  // اثر جانبیِ مهم: k6 زیر متریک‌ها (http_req_duration{scenario:X} و http_reqs{scenario:X})
  // فقط وقتی منتشر می‌کند که در thresholds ارجاع شوند — برای جدول تفکیک‌شدهٔ runner لازم است.
  // سناریوی قناری ۳۰روزه آستانهٔ http_req_failed ندارد (خطای ~۱۰۰٪ آن یعنی باگ سقف ۱۰۰پارامتر
  // D1 پابرجاست و نباید اجرا را قرمز کند) — گیتش روی چکِ «انتظارِ ۵۰۰» است؛ رفع باگ = قرمز.
  thresholds: {
    'http_req_failed{scenario:health}': [{ threshold: 'rate<0.02', abortOnFail: false }],
    'http_req_failed{scenario:login}': [{ threshold: 'rate<0.02', abortOnFail: false }],
    'http_req_failed{scenario:dashboard_summary}': [{ threshold: 'rate<0.02', abortOnFail: false }],
    'http_req_failed{scenario:dashboard_today}': [{ threshold: 'rate<0.02', abortOnFail: false }],
    'http_req_failed{scenario:reports}': [{ threshold: 'rate<0.02', abortOnFail: false }],

    'http_req_duration{scenario:health}': [{ threshold: 'p(95)<60000', abortOnFail: false }],
    'http_req_duration{scenario:login}': [{ threshold: 'p(95)<60000', abortOnFail: false }],
    'http_req_duration{scenario:dashboard_summary}': [{ threshold: 'p(95)<60000', abortOnFail: false }],
    'http_req_duration{scenario:dashboard_today}': [{ threshold: 'p(95)<60000', abortOnFail: false }],
    'http_req_duration{scenario:reports}': [{ threshold: 'p(95)<60000', abortOnFail: false }],
    'http_req_duration{scenario:dashboard_summary_30d}': [{ threshold: 'p(95)<60000', abortOnFail: false }],

    'http_reqs{scenario:health}': [{ threshold: 'count>0', abortOnFail: false }],
    'http_reqs{scenario:login}': [{ threshold: 'count>0', abortOnFail: false }],
    'http_reqs{scenario:dashboard_summary}': [{ threshold: 'count>0', abortOnFail: false }],
    'http_reqs{scenario:dashboard_today}': [{ threshold: 'count>0', abortOnFail: false }],
    'http_reqs{scenario:reports}': [{ threshold: 'count>0', abortOnFail: false }],
    'http_reqs{scenario:dashboard_summary_30d}': [{ threshold: 'count>0', abortOnFail: false }],

    // گیت نرم چک‌ها: پنج سناریوی سالم انتظار ۲۰۰ دارند (≥۹۸٪)؛ قناری انتظار ۵۰۰ دارد
    // (تا باگ سقف ۱۰۰پارامتر D1 پابرجاست) — اگر روزی ۲۰۰ بدهد چک‌ها قرمز می‌شوند تا سند به‌روز شود
    'checks{scenario:health}': [{ threshold: 'rate>0.98', abortOnFail: false }],
    'checks{scenario:login}': [{ threshold: 'rate>0.98', abortOnFail: false }],
    'checks{scenario:dashboard_summary}': [{ threshold: 'rate>0.98', abortOnFail: false }],
    'checks{scenario:dashboard_today}': [{ threshold: 'rate>0.98', abortOnFail: false }],
    'checks{scenario:reports}': [{ threshold: 'rate>0.98', abortOnFail: false }],
    'checks{scenario:dashboard_summary_30d}': [{ threshold: 'rate>0.5', abortOnFail: false }],
  },

  discardResponseBodies: false,
};

// یک‌بار ورود در setup — توکن به همهٔ سناریوهای احرازشده همان‌طور که اپ انتظار دارد
// می‌رسد: هدر Authorization: Bearer <token> (بدون کوکی — سشن JWT بی‌حالت است)
export function setup() {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { scenario: 'setup' } }
  );
  check(res, {
    'setup login 200': (r) => r.status === 200,
    'setup token exists': (r) => typeof r.json('data.token') === 'string' && r.json('data.token').length > 20,
  });
  if (res.status !== 200) {
    throw new Error(`setup login failed: ${res.status} ${res.body}`);
  }
  return { token: res.json('data.token') };
}

function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

export function healthScenario() {
  const res = http.get(`${BASE}/health`, { tags: { scenario: 'health' } });
  check(res, {
    'health 200': (r) => r.status === 200,
    'health ok:true': (r) => r.json('ok') === true,
  });
}

export function loginScenario() {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { scenario: 'login' } }
  );
  check(res, {
    'login 200': (r) => r.status === 200,
    'login token exists': (r) => typeof r.json('data.token') === 'string',
  });
}

export function summaryScenario(data) {
  const res = http.get(
    `${BASE}/api/dashboard/summary?from=${SUMMARY_FROM}&to=${SUMMARY_TO}`,
    authHeaders(data.token)
  );
  check(res, { 'summary(2d) 200': (r) => r.status === 200 }, { scenario: 'dashboard_summary' });
}

export function summary30dScenario(data) {
  const res = http.get(
    `${BASE}/api/dashboard/summary?from=${SUMMARY_30D_FROM}&to=${SUMMARY_30D_TO}`,
    authHeaders(data.token)
  );
  // قناری ۱.۲۵.۷۲ — باگ سقف ۱۰۰پارامتر D1 در ۱.۲۵.۷۰ با تکه‌بندی ۹۰تایی رفع شد (ف۵) و
  // پویش کامل سازنده‌های IN در ۱.۲۵.۷۲ با دروازهٔ @core/db/in-chunks بسته شد؛
  // انتظار قناری از «۵۰۰ (ثبت باگ)» به «۲۰۰ + بدنهٔ معتبر» چرخید — قرمزیِ این چک از این پس یعنی رگرسیون باگ.
  check(res, {
    'summary(30d) 200 — پس از رفع تکه‌بندی IN': (r) => r.status === 200,
    'summary(30d) بدنهٔ JSON معتبر': (r) => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    },
  }, {
    scenario: 'dashboard_summary_30d',
  });
}

export function todayScenario(data) {
  const res = http.get(
    `${BASE}/api/dashboard/today?date=${TODAY}`,
    authHeaders(data.token)
  );
  check(res, { 'today 200': (r) => r.status === 200 }, { scenario: 'dashboard_today' });
}

export function reportsScenario(data) {
  const res = http.get(
    `${BASE}/api/reports?from=${SUMMARY_30D_FROM}&to=${SUMMARY_30D_TO}`,
    authHeaders(data.token)
  );
  check(res, { 'reports 200': (r) => r.status === 200 }, { scenario: 'reports' });
}

export default function () {
  // بدون استفاده — همهٔ ورودی‌ها با executorهای arrival-rate هدایت می‌شوند
}
