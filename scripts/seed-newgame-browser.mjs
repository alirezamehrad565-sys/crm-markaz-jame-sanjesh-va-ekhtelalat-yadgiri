// دادهٔ آزمونی مرورگری برای بازی‌های تازهٔ ۱.۲۵.۳۲ — تجویز/مأموریت/لینک روی بستهٔ نشستهٔ D1
// KIND=stroop|trail|flanker  SEED_BASE=https://center-system.sanjeshm.workers.dev node scripts/seed-newgame-browser.mjs
const BASE = process.env.SEED_BASE || 'http://localhost:8787';
const KIND = process.env.KIND || 'stroop';
const PKG = { stroop: 'stroop1', trail: 'trail1', flanker: 'flanker1' }[KIND];
const GOAL = { stroop: 'stroop_attention', trail: 'trail_attention', flanker: 'flanker_attention' }[KIND];
if (!PKG) throw new Error('KIND نامعتبر');

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
    headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ' → ' + res.status + ' ' + JSON.stringify(body));
  return body.data ?? body;
}

const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'manager', password: '1234' }) });
const token = login.token;

const student = await api('/api/students', {
  method: 'POST',
  body: JSON.stringify({
    first_name: 'آزمون', last_name: KIND === 'stroop' ? 'رنگ‌گیر' : KIND === 'trail' ? 'ردیاب' : 'گرگ‌بان',
    national_id: makeNationalId(), birth_date: '2018-05-10', gender: 'male'
  })
}, token);
console.log('STUDENT', student.id);

const rx = await api('/api/games/prescriptions', {
  method: 'POST',
  body: JSON.stringify({ child_id: student.id, package_id: PKG, package_version: '1.0.0', goal_id: GOAL })
}, token);
console.log('RX', rx.id);

const today = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);
const mission = await api('/api/games/missions', {
  method: 'POST',
  body: JSON.stringify({ prescription_id: rx.id, mission_ref: KIND + '_v1', scheduled_for: today })
}, token);
console.log('MISSION', mission.id);

const link = await api(`/api/games/missions/${mission.id}/link`, { method: 'POST', body: '{}' }, token);
console.log('LINK_URL:', link.url);
console.log('TOKEN:' + link.token);
console.log('MISSION_ID:' + mission.id);
