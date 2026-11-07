// دادهٔ آزمونی برای راستی‌آزمایی UI میز بازی‌ها (۱.۲۵.۲۶) — چند دانش‌آموز با نام‌های متمایز
const BASE = 'http://localhost:8787';

function makeNationalId() {
  for (;;) {
    let s = String(Math.floor(100000000 + Math.random() * 899999999));
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i);
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

const students = [
  ['سارا', 'محمدی'],
  ['آرش', 'آزمونی'],
  ['نیما', 'رضایی'],
  ['نگار', 'کریمی']
];
for (const [fn, ln] of students) {
  try {
    const s = await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({ first_name: fn, last_name: ln, national_id: makeNationalId(), birth_date: '2018-06-01', gender: Math.random() > 0.5 ? 'male' : 'female' })
    }, token);
    console.log('STUDENT', fn, ln, s.id);
  } catch (err) {
    console.log('STUDENT EXISTS?', fn, ln, String(err).slice(0, 80));
  }
}

// بستهٔ منتشرشدهٔ attention2 v1.2.0 + هدف — اگر از قبل هست خطا می‌خوریم و ادامه می‌دهیم
try {
  await api('/api/games/packages', {
    method: 'POST',
    body: JSON.stringify({
      package_id: 'attention2', version: '1.2.0', title_fa: 'توجه و بازداری پاسخ — گو/نوگو (۹–۱۰ سال، شش مرحله)', evidence_level: 'B',
      dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 5 },
      body: {
        package_id: 'attention2', goals: ['inhibition'], mastery: { threshold: 85, sessions: 2 },
        missions: [{
          id: 'gonogo_m2', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
          metrics: ['accuracy_gonogo'], title: 'ستاره‌چین',
          items: [{ kind: 'gonogo', stim: { type: 'go', shape: 'fish', color: 'orange' }, window_ms: 6000 }]
        }]
      }
    })
  }, token);
  console.log('PACKAGE created');
} catch (err) { console.log('PACKAGE exists?', String(err).slice(0, 90)); }
try { await api('/api/games/packages/attention2/1.2.0/publish', { method: 'POST', body: '{}' }, token); console.log('PUBLISH ok'); }
catch (err) { console.log('PUBLISH skip', String(err).slice(0, 60)); }
try {
  await api('/api/games/goals', {
    method: 'POST',
    body: JSON.stringify({ id: 'inhibition_m2', title_fa: 'بازداری پاسخ', package_id: 'attention2', metric_id: 'accuracy_gonogo' })
  }, token);
  console.log('GOAL created');
} catch (err) { console.log('GOAL exists?', String(err).slice(0, 60)); }
console.log('SEED DONE');
