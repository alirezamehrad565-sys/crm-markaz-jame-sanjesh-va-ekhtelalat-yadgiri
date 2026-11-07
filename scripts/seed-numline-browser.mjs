// دادهٔ آزمونی محلی برای راستی‌آزمایی مرورگری «جادهٔ عددها» — بستهٔ خط عددی، تجویز، مأموریت، لینک
// هم‌الگوی seed-m2-browser.mjs — هر اجرا کودک تازه می‌سازد تا سقف دوز مانع نشود
const BASE = 'http://localhost:8787';

function makeNationalId() {
  for (;;) {
    let s = String(Math.floor(100000000 + Math.random() * 899999999));
    let sum = 0;
    for (let i = 0; i < 9; i++) sum = sum + Number(s[i]) * (10 - i);
    const rem = sum % 11;
    const check = rem < 2 ? rem : 11 - rem;
    if (check !== 10) return s + String(check);
  }
}

async function api(path, opts = {}, token = null) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ' → ' + res.status + ' ' + JSON.stringify(body));
  return body.data ?? body;
}

const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'manager', password: '1234' }) });
const token = login.token;
console.log('LOGIN ok');

// دانش‌آموز آزمونی تازه
const student = await api('/api/students', {
  method: 'POST',
  body: JSON.stringify({ first_name: 'سارا', last_name: 'عددی', national_id: makeNationalId(), birth_date: '2018-03-21', gender: 'female' })
}, token);
console.log('STUDENT', student.id);

// سنجه‌های خط عددی — میانگین خطا از مایگریشن ۰۰۸۷ حاضر است؛ دقت و RT این‌جا ثبت می‌شوند
for (const metric of [
  { id: 'accuracy_numline', title_fa: 'دقت جای عدد', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'accuracy' },
  { id: 'median_rt_numline', title_fa: 'میانهٔ زمان واکنش جای عدد', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'median_rt' }
]) {
  try { await api('/api/games/metrics', { method: 'POST', body: JSON.stringify(metric) }, token); }
  catch (err) { if (!String(err).includes('409')) throw err; console.log('METRIC exists', metric.id); }
}

// بانک authored «جادهٔ عددها» — چهار جاده + پروب پایان؛ آستانهٔ سن‌محور روی هر آیتم
function train(id, band, num) {
  const span = { a: 10, b: 20, c: 50, d: 100 }[band];
  const tol = { a: 0.5, b: 1, c: 2, d: 4 }[band];
  return { id, phase: 'train', type: 'numline', prompt: 'این عدد کجای جاده است؟', stim: { number: num }, range: [0, span], correct: num, tolerance: tol };
}
function probe(id, band, num) { return { ...train(id, band, num), phase: 'probe' }; }

const items = [
  train('ta1', 'a', 3), train('ta2', 'a', 7), train('ta3', 'a', 1), train('ta4', 'a', 9),
  train('ta5', 'a', 5), train('ta6', 'a', 2), train('ta7', 'a', 8), train('ta8', 'a', 6),
  train('tb1', 'b', 12), train('tb2', 'b', 16), train('tb3', 'b', 9),
  train('tb4', 'b', 18), train('tb5', 'b', 13), train('tb6', 'b', 15),
  train('tc1', 'c', 23), train('tc2', 'c', 37), train('tc3', 'c', 45),
  train('tc4', 'c', 12), train('tc5', 'c', 41), train('tc6', 'c', 29),
  train('td1', 'd', 63), train('td2', 'd', 81), train('td3', 'd', 34),
  train('td4', 'd', 92), train('td5', 'd', 47), train('td6', 'd', 75),
  probe('pa1', 'a', 4), probe('pa2', 'a', 8),
  probe('pb1', 'b', 14), probe('pb2', 'b', 11),
  probe('pc1', 'c', 33), probe('pc2', 'c', 48),
  probe('pd1', 'd', 56), probe('pd2', 'd', 88)
];

try {
  await api('/api/games/packages', {
    method: 'POST',
    body: JSON.stringify({
      package_id: 'numline1', version: '1.0.0', title_fa: 'حس عدد — جادهٔ عددها', evidence_level: 'B',
      dose: { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 },
      body: {
        package_id: 'numline1', goals: ['numline'], mastery: { threshold: 30, sessions: 2 },
        tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
        missions: [{
          id: 'numline_v1', game: 'numline', goal: 'numline', metric: 'pct_error_numline',
          metrics: ['pct_error_numline', 'accuracy_numline', 'median_rt_numline'],
          title: 'جادهٔ عددها',
          mastery: { threshold: 30, sessions: 2 },
          items
        }],
        parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
      }
    })
  }, token);
} catch (err) { if (!String(err).includes('409')) throw err; console.log('PACKAGE exists'); }
console.log('PACKAGE ready');

try { await api('/api/games/packages/numline1/1.0.0/publish', { method: 'POST', body: '{}' }, token); }
catch (err) { if (!String(err).includes('409')) throw err; }

await api('/api/games/goals', {
  method: 'POST',
  body: JSON.stringify({ id: 'numline_road', title_fa: 'حس عدد و جای عدد', package_id: 'numline1', metric_id: 'pct_error_numline' })
}, token);

const rx = await api('/api/games/prescriptions', {
  method: 'POST',
  body: JSON.stringify({ child_id: student.id, package_id: 'numline1', package_version: '1.0.0', goal_id: 'numline_road' })
}, token);
console.log('RX', rx.id);

const today = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);
const mission = await api('/api/games/missions', {
  method: 'POST',
  body: JSON.stringify({ prescription_id: rx.id, mission_ref: 'numline_v1', scheduled_for: today })
}, token);
console.log('MISSION', mission.id);

const link = await api(`/api/games/missions/${mission.id}/link`, { method: 'POST', body: '{}' }, token);
console.log('LINK_URL:', link.url);
console.log('TOKEN:' + link.token);
