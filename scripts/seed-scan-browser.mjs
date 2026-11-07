// دادهٔ آزمونی محلی برای راستی‌آزمایی مرورگری «حملهٔ جاسوس‌ها» — بستهٔ scan، تجویز، مأموریت، لینک
// هم‌الگوی seed-numline-browser.mjs — هر اجرا کودک تازه می‌سازد تا سقف دوز مانع نشود
// BASE با متغیر محیطی SEED_BASE قابل‌بازنویسی است (تولید: SEED_BASE=https://... seed...)
const BASE = process.env.SEED_BASE || 'http://localhost:8787';

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
  body: JSON.stringify({ first_name: 'آرش', last_name: 'نگهبان', national_id: makeNationalId(), birth_date: '2018-05-10', gender: 'male' })
}, token);
console.log('STUDENT', student.id);

// سنجه‌های DB اسکن — دو سنجهٔ موتوری scan_fa_pct/scan_miss_pct در کد ENGINE_METRICS حاضرند
for (const metric of [
  { id: 'accuracy_scan', title_fa: 'دقت گرفتن جاسوس‌ها', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'accuracy' },
  { id: 'median_rt_scan', title_fa: 'میانهٔ زمان نخستین لمس موج', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'median_rt' }
]) {
  try { await api('/api/games/metrics', { method: 'POST', body: JSON.stringify(metric) }, token); }
  catch (err) { if (!String(err).includes('409')) throw err; console.log('METRIC exists', metric.id); }
}

// بانک authored «حملهٔ جاسوس‌ها» — چهار موج تمرینی + پروب پایان؛ امضای هدف = ۲ آنتن؛ کلید روی آیتم
function mulberry32(seedNum) {
  let a = seedNum >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PROMPT = 'جاسوس‌ها ربات‌هایی با ۲ آنتن‌اند — همه را بگیر، هم‌نوع‌ها را دست نزن.';
const WAVES = {
  a: { cols: 3, rows: 2, spies: 2, dis: [1, 4], wave: 20000 },
  b: { cols: 3, rows: 3, spies: 2, dis: [1, 3, 4], wave: 18000 },
  c: { cols: 4, rows: 3, spies: 3, dis: [1, 3, 4], wave: 16000 },
  d: { cols: 5, rows: 3, spies: 4, dis: [1, 3, 4], wave: 15000 },
  p: { cols: 4, rows: 3, spies: 3, dis: [1, 3, 4], wave: 16000 }
};
function wave(id, phase, band, salt) {
  const w = WAVES[band];
  const rand = mulberry32(0x53C4A1 ^ (salt * 2654435761));
  const tiles = w.cols * w.rows;
  const idxs = Array.from({ length: tiles }, (_, i) => i);
  for (let i = tiles - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const spyIdx = idxs.slice(0, w.spies).sort((x, y) => x - y);
  const t = [];
  for (let i = 0; i < tiles; i++) t.push(w.dis[Math.floor(rand() * w.dis.length)]);
  for (const i of spyIdx) t[i] = 2;
  return { id, phase, type: 'scan', prompt: PROMPT, correct: spyIdx, stim: { cols: w.cols, rows: w.rows, wave_ms: w.wave, signature: 2, tiles: t } };
}

const items = [
  wave('wa1', 'train', 'a', 1), wave('wa2', 'train', 'a', 2), wave('wa3', 'train', 'a', 3), wave('wa4', 'train', 'a', 4),
  wave('wa5', 'train', 'a', 5), wave('wa6', 'train', 'a', 6), wave('wa7', 'train', 'a', 7), wave('wa8', 'train', 'a', 8),
  wave('wb1', 'train', 'b', 11), wave('wb2', 'train', 'b', 12), wave('wb3', 'train', 'b', 13),
  wave('wb4', 'train', 'b', 14), wave('wb5', 'train', 'b', 15), wave('wb6', 'train', 'b', 16),
  wave('wc1', 'train', 'c', 21), wave('wc2', 'train', 'c', 22), wave('wc3', 'train', 'c', 23),
  wave('wc4', 'train', 'c', 24), wave('wc5', 'train', 'c', 25), wave('wc6', 'train', 'c', 26),
  wave('wd1', 'train', 'd', 31), wave('wd2', 'train', 'd', 32), wave('wd3', 'train', 'd', 33),
  wave('wd4', 'train', 'd', 34), wave('wd5', 'train', 'd', 35), wave('wd6', 'train', 'd', 36),
  wave('wp1', 'probe', 'p', 41), wave('wp2', 'probe', 'p', 42), wave('wp3', 'probe', 'p', 43), wave('wp4', 'probe', 'p', 44),
  wave('wp5', 'probe', 'p', 45), wave('wp6', 'probe', 'p', 46), wave('wp7', 'probe', 'p', 47), wave('wp8', 'probe', 'p', 48)
];

// هدف پیش از انتشار — گیت انتشار goal ثبت‌شده در DB می‌خواهد
await api('/api/games/goals', {
  method: 'POST',
  body: JSON.stringify({ id: 'scan_attention', title_fa: 'توجه و تمرکز — کشف جاسوس‌ها', package_id: 'swarm1', metric_id: 'accuracy_scan' })
}, token);
console.log('GOAL ready');

try {
  await api('/api/games/packages', {
    method: 'POST',
    body: JSON.stringify({
      package_id: 'swarm1', version: '1.0.0', title_fa: 'توجه و تمرکز — حملهٔ جاسوس‌ها', evidence_level: 'B',
      dose: { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 },
      body: {
        package_id: 'swarm1', goals: ['scan_attention'], mastery: { threshold: 78, sessions: 2 },
        tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
        missions: [{
          id: 'scan_v1', game: 'scan', goal: 'scan_attention', metric: 'accuracy_scan',
          metrics: ['accuracy_scan', 'scan_fa_pct', 'scan_miss_pct', 'median_rt_scan'],
          title: 'حملهٔ جاسوس‌ها',
          mastery: { threshold: 78, sessions: 2 },
          items
        }],
        parent_copy: { before: 'این بازی تمرین دقت و تمرکز است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
      }
    })
  }, token);
} catch (err) { if (!String(err).includes('409')) throw err; console.log('PACKAGE exists'); }
console.log('PACKAGE ready');

try { await api('/api/games/packages/swarm1/1.0.0/publish', { method: 'POST', body: '{}' }, token); }
catch (err) { if (!String(err).includes('409')) throw err; }

const rx = await api('/api/games/prescriptions', {
  method: 'POST',
  body: JSON.stringify({ child_id: student.id, package_id: 'swarm1', package_version: '1.0.0', goal_id: 'scan_attention' })
}, token);
console.log('RX', rx.id);

const today = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);
const mission = await api('/api/games/missions', {
  method: 'POST',
  body: JSON.stringify({ prescription_id: rx.id, mission_ref: 'scan_v1', scheduled_for: today })
}, token);
console.log('MISSION', mission.id);

const link = await api(`/api/games/missions/${mission.id}/link`, { method: 'POST', body: '{}' }, token);
console.log('LINK_URL:', link.url);
console.log('TOKEN:' + link.token);
