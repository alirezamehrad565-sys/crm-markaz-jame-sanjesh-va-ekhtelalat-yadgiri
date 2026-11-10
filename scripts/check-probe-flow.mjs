// چک زنده: مجموع آیتم‌های جریان مرحلهٔ ۱ هر نوع — پروب‌ها باید در جریان باشند (۱.۲۵.۴۷)
const BASE = 'http://localhost:8787';
async function api(path, opts = {}, token = null) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ' → ' + res.status + ' ' + JSON.stringify(body).slice(0, 120));
  return body.data ?? body;
}
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
const KINDS = [
  { kind: 'scan', pkg: 'swarm1', goal: 'scan_attention', mission: 'scan_v1' },
  { kind: 'stroop', pkg: 'stroop1', goal: 'stroop_attention', mission: 'stroop_v1' },
  { kind: 'flanker', pkg: 'flanker1', goal: 'flanker_attention', mission: 'flanker_v1' }
];
const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'manager', password: '1234' }) });
const token = login.token;
for (const k of KINDS) {
  try {
    const student = await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'چک', last_name: k.kind, national_id: makeNationalId(), birth_date: '2018-03-21', gender: 'male' })
    }, token);
    const rx = await api('/api/games/prescriptions', {
      method: 'POST', body: JSON.stringify({ child_id: student.id, package_id: k.pkg, package_version: '1.0.0', goal_id: k.goal })
    }, token);
    const mission = await api('/api/games/missions', {
      method: 'POST', body: JSON.stringify({ prescription_id: rx.id, mission_ref: k.mission, scheduled_for: '2026-11-09' })
    }, token);
    const link = await api(`/api/games/missions/${mission.id}/link`, { method: 'POST', body: '{}' }, token);
    const t = link.url.split('/m/')[1];
    await api(`/api/m/${t}/start`, { method: 'POST', body: '{}' });
    const next = await api(`/api/m/${t}/next-item`);
    console.log(k.kind.padEnd(8), 'total =', next.progress.total, '(train+probe)');
  } catch (e) { console.log(k.kind, 'FAIL:', e.message.slice(0, 120)); }
}
