// نسخهٔ «فقط-پروب» بسته‌ها برای اسکرین‌شات حسابرسی دو نما (۱.۲۵.۴۵)
// هر بسته را با پسوند qa کلون می‌کند و همهٔ آیتم‌ها را probe می‌کند — موتور مستقیم به اجرای اصلی می‌رود
// (تمرین «قدم‌نما»/تا-موفقیت حذف می‌شود تا محرک واقعیِ جریان اصلی در عمودی و افقی شات بخورد)
// مصرف: node scripts/seed-probeonly-audit.mjs  →  /tmp/links-qa.txt (kind|url)
import { execSync } from 'node:child_process';

const BASE = 'http://localhost:8787';

/* ۱) بدنهٔ بسته‌ها و اهداف از D1 محلی */
const dump = execSync('npx wrangler d1 execute center-system-db --local --json --command ' +
  '"SELECT id, version, title_fa, evidence_level, dose_json, body_json FROM game_packages WHERE status=\'published\'"',
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const rows = JSON.parse(dump)[0].results;

const goalsDump = execSync('npx wrangler d1 execute center-system-db --local --json --command "SELECT id, title_fa, package_id, metric_id, age_min, age_max FROM game_goals"',
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const goals = JSON.parse(goalsDump)[0].results;

const esc = (s) => s.replace(/'/g, "''");
const now = new Date().toISOString();
const sqlLines = [];
const qaMap = []; // { kind, pkg, goal, mission }

for (const r of rows) {
  if (!['attention2', 'numline1', 'swarm1', 'stroop1', 'flanker1', 'nback1'].includes(r.id)) continue;
  const pkg = r.id + 'qa';
  const body = JSON.parse(r.body_json);
  body.package_id = pkg;
  for (const m of body.missions) {
    m.id = m.id + '_qa';
    if (Array.isArray(m.items)) for (const it of m.items) it.phase = 'probe';
  }
  sqlLines.push(`INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES\n  ('${pkg}', '${r.version}', '${esc(r.title_fa)} (QA)', '${r.evidence_level}', '${esc(r.dose_json)}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');`);
  for (const g of goals.filter((g) => g.package_id === r.id)) {
    const gid = g.id + 'qa';
    sqlLines.push(`INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES ('${gid}', '${esc(g.title_fa)} QA', '${pkg}', '${g.metric_id}', ${g.age_min ?? 'NULL'}, ${g.age_max ?? 'NULL'});`);
    qaMap.push({ pkg, goal: gid, mission: body.missions[0].id });
  }
}

const sql = '-- seed فقط-پروب برای حسابرسی دو نما (idempotent)\n' + sqlLines.join('\n') + '\n';
await import('node:fs').then((fs) => fs.writeFileSync('/tmp/seed-qa.sql', sql, 'utf8'));
execSync('npx wrangler d1 execute center-system-db --local --file=/tmp/seed-qa.sql', { stdio: ['ignore', 'ignore', 'pipe'] });
console.log('QA packages seeded:', qaMap.length);

/* ۲) لینک برای هر نوع — همان مسیر seed-skins-audit */
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
    headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ' → ' + res.status + ' ' + JSON.stringify(body).slice(0, 200));
  return body.data ?? body;
}
const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'manager', password: '1234' }) });
const token = login.token;
const today = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);

const KIND_OF = { attention2: 'gonogo', numline1: 'numline', swarm1: 'scan', stroop1: 'stroop', flanker1: 'flanker', nback1: 'nback' };
const lines = [];
for (const q of qaMap) {
  const kind = KIND_OF[q.pkg.replace('qa', '')];
  if (!kind) continue;
  try {
    const student = await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'دونما', last_name: kind, national_id: makeNationalId(), birth_date: '2018-03-21', gender: 'male' })
    }, token);
    const rx = await api('/api/games/prescriptions', {
      method: 'POST',
      body: JSON.stringify({ child_id: student.id, package_id: q.pkg, package_version: '1.0.0', goal_id: q.goal })
    }, token);
    const mission = await api('/api/games/missions', {
      method: 'POST', body: JSON.stringify({ prescription_id: rx.id, mission_ref: q.mission, scheduled_for: today })
    }, token);
    const link = await api(`/api/games/missions/${mission.id}/link`, { method: 'POST', body: '{}' }, token);
    lines.push(kind + '|' + link.url);
  } catch (err) {
    console.error(kind + ' FAILED: ' + err.message);
  }
}
await import('node:fs').then((fs) => fs.writeFileSync('/tmp/links-qa.txt', lines.join('\n') + '\n', 'utf8'));
console.log('links → /tmp/links-qa.txt (' + lines.length + ')');
