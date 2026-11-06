// دادهٔ آزمونی محلی برای راستی‌آزمایی مرورگری M2 — بستهٔ گونوگو، تجویز، مأموریت، لینک
const BASE = 'http://localhost:8787';

// هر اجرای گشت QA یک کودک تازه می‌سازد تا سقف دوز روزانه مانع نشود (کد ملی ۱۰رقمی معتبر mod11)
function makeNationalId() {
  for (;;) {
    let s = String(Math.floor(100000000 + Math.random() * 899999999)); // ۹ رقم بدون صفرِ پیشرو
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

// idempotent: اگر دانش‌آموز آزمونی از اجرای قبل مانده، همان را بگیر (اجرای دوبارهٔ گشت QA)
let student = null;
try {
  student = await api('/api/students', {
    method: 'POST',
    body: JSON.stringify({ first_name: 'آرش', last_name: 'آزمونی', national_id: makeNationalId(), birth_date: '2019-03-21', gender: 'male' })
  }, token);
} catch (err) {
  if (!String(err).includes('409')) throw err;
  const list = await api('/api/students?search=' + encodeURIComponent('آزمونی'), {}, token);
  const rows = Array.isArray(list) ? list : (list.items ?? []);
  student = null;
  if (!student) throw err;
}
console.log('STUDENT', student.id);

try { await api('/api/games/packages', {
  method: 'POST',
  body: JSON.stringify({
    package_id: 'attention2', version: '1.0.0', title_fa: 'توجه و بازداری پاسخ', evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 5 },
    body: {
      package_id: 'attention2', goals: ['inhibition'], mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'gonogo_m2', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
        metrics: ['accuracy_gonogo', 'median_rt_gonogo', 'commission_gonogo', 'omission_gonogo'],
        title: 'ستاره‌چین', probe: { items: 4, feedback: false, position: 'end' },
        mastery: { threshold: 85, sessions: 2 },
        items: [
          { id: 'tr-go1', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
          { id: 'tr-go2', phase: 'train', type: 'touch_report', stim: { shape: 'circle', color: 'yellow' }, correct_touch: true },
          { id: 'tr-nogo1', phase: 'train', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false },
          { id: 'tr-go3', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
          { id: 'pr-go1', phase: 'probe', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
          { id: 'pr-nogo1', phase: 'probe', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false },
          { id: 'pr-go2', phase: 'probe', type: 'touch_report', stim: { shape: 'circle', color: 'yellow' }, correct_touch: true },
          { id: 'pr-nogo2', phase: 'probe', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false }
        ]
      }],
      parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
    }
  })
}, token); } catch (err) { if (!String(err).includes('409')) throw err; console.log('PACKAGE exists'); }
console.log('PACKAGE ready');

try { await api('/api/games/packages/attention2/1.0.0/publish', { method: 'POST', body: '{}' }, token); } catch (err) { if (!String(err).includes('409')) throw err; }
await api('/api/games/goals', {
  method: 'POST',
  body: JSON.stringify({ id: 'inhibition_m2', title_fa: 'بازداری پاسخ', package_id: 'attention2', metric_id: 'accuracy_gonogo' })
}, token);
const rx = await api('/api/games/prescriptions', {
  method: 'POST',
  body: JSON.stringify({ child_id: student.id, package_id: 'attention2', package_version: '1.0.0', goal_id: 'inhibition_m2' })
}, token);
console.log('RX', rx.id);

const today = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);
const mission = await api('/api/games/missions', {
  method: 'POST',
  body: JSON.stringify({ prescription_id: rx.id, mission_ref: 'gonogo_m2', scheduled_for: today })
}, token);
console.log('MISSION', mission.id);

const link = await api(`/api/games/missions/${mission.id}/link`, { method: 'POST', body: '{}' }, token);
console.log('LINK_URL:', link.url);
console.log('TOKEN:' + link.token);
