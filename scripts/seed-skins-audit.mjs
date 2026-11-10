// دادهٔ آزمونی برای اسکرین‌شات حسابرسی پوستهٔ همهٔ نوع‌بازی‌ها (محلی 8787)
// خروجی: برای هر نوع یک کودک تازه + تجویز + مأموریت + لینک → «kind|url»
const BASE = process.env.SEED_BASE || 'http://localhost:8787';
const KINDS = [
  { kind: 'gonogo',  pkg: 'attention2', goal: 'inhibition_m2',        mission: 'gonogo_m2' },
  { kind: 'numline', pkg: 'numline1',   goal: 'numline_road',         mission: 'numline_v1' },
  { kind: 'scan',    pkg: 'swarm1',     goal: 'scan_attention',       mission: 'scan_v1' },
  { kind: 'stroop',  pkg: 'stroop1',    goal: 'stroop_attention',     mission: 'stroop_v1', ver: '1.1.0' },
  { kind: 'flanker', pkg: 'flanker1',   goal: 'flanker_attention',    mission: 'flanker_v1' },
  { kind: 'nback',   pkg: 'nback1',     goal: 'nback_working_memory', mission: 'nback_v1' }
];

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
const today = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);

for (const m of KINDS) {
  const { kind, pkg, goal, ver } = m;
  try {
    const student = await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'پوسته', last_name: kind, national_id: makeNationalId(), birth_date: '2018-03-21', gender: 'male' })
    }, token);
    const rx = await api('/api/games/prescriptions', {
      method: 'POST',
      body: JSON.stringify({ child_id: student.id, package_id: pkg, package_version: ver || '1.0.0', goal_id: goal })
    }, token);
    const mission = await api('/api/games/missions', {
      method: 'POST',
      body: JSON.stringify({ prescription_id: rx.id, mission_ref: m.mission, scheduled_for: today })
    }, token);
    const link = await api(`/api/games/missions/${mission.id}/link`, { method: 'POST', body: '{}' }, token);
    console.log(kind + '|' + link.url);
  } catch (err) {
    console.error(kind + ' FAILED: ' + err.message);
  }
}
