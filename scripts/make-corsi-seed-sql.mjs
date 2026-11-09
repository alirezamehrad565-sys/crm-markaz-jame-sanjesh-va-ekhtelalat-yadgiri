// مولد SQL نشاندن بستهٔ «صدف‌های جادویی» (نوع corsi — کرسی بلوک-تپینگ) روی D1 — INSERT امن (idempotent) — G8/۱.۲۵.۴۸
// بانک authored قطعی: seed ثابت → همان جریان در هر بازتولید.
// پارادایم مرجع — Corsi Block-Tapping (Corsi 1972؛ Kessels و همکاران ۲۰۰۰) — پیاده‌سازی اصیل
// بر قرارداد دنباله‌ای این سامانه (پاسخ {order}، مقایسهٔ کامل سمت سرور).
// اهرم سختی = طول دنبالهٔ صدف‌ها (۲→۵) + پنجرهٔ پاسخ (stim.window_ms).
//
// گیت صحت بانک: هر دنباله صدف تکراری ندارد (هر صدف یک‌بار در دنباله) و طول‌ها
// با نردبان مرحله‌ها (CORSI_STAGE_MAX_SPAN) هم‌خوان‌اند — هر ناهم‌خوانی = توقف با پیام روشن.
import { writeFileSync } from 'node:fs';

const FLASH_MS = 620;   /* مدت روشن‌ماندن هر صدف */
const GAP_MS = 240;     /* فاصلهٔ خاموشی میان صدف‌ها */

const PROMPT = 'صدف‌ها یکی‌یکی روشن می‌شوند؛ همان ترتیب را لمس کن.';
const PROMPT_LONG = 'دنباله بلندتر شد؛ حواست در خلیج بماند و همان ترتیب را لمس کن.';

const WINDOW_SHORT = 16000; /* دنباله‌های ۲و۳ */
const WINDOW_LONG = 20000;  /* دنباله‌های ۴و۵ */

/** یک آیتم کرسی — دنبالهٔ صدف‌ها (محرک عمومی) + کلید همان دنباله (فقط سرور) */
function item(id, phase, band, seq, window) {
  return {
    id, phase, type: 'corsi',
    prompt: seq.length >= 4 ? PROMPT_LONG : PROMPT,
    correct: [...seq], // کلید نمره‌دهی — stripAnswerKeys هرگز به کلاینت نمی‌فرستد
    stim: {
      cols: 3, rows: 3,
      seq: [...seq], // دنبالهٔ نمایش — محرک عمومی خود بازی (کودک می‌بیند)
      flash_ms: FLASH_MS, gap_ms: GAP_MS,
      window_ms: window, band
    }
  };
}

/* بانک صدف‌ها — اندیس‌های شبکهٔ ۳×۳ (۰..۸)؛ هر دنباله بی‌تکرار */
const BANK = {
  train: [
    [1, 4], [6, 3], [2, 7]
  ],
  len2: [
    [0, 8], [5, 2], [7, 3]
  ],
  len3: [
    [0, 4, 8], [5, 1, 6], [7, 3, 2]
  ],
  len4: [
    [2, 5, 1, 7], [8, 3, 6, 0], [4, 0, 7, 5]
  ],
  len5: [
    [1, 6, 3, 8, 4], [7, 2, 0, 5, 3], [5, 8, 1, 4, 6]
  ]
};

/* جریان authored — ترتیب قطعی؛ پیشوند تمرین (t) + پسوند پروب به ترتیب سختی */
const items = [];
items.push(item('cs_t1', 'train', 't', BANK.train[0], WINDOW_SHORT));
items.push(item('cs_t2', 'train', 't', BANK.train[1], WINDOW_SHORT));
items.push(item('cs_t3', 'train', 't', BANK.train[2], WINDOW_SHORT));

let n = 0;
const pushBand = (seqs, window) => {
  for (const seq of seqs) {
    n += 1;
    items.push(item('cs_p' + n, 'probe', 'p', seq, window));
  }
};
pushBand(BANK.len2, WINDOW_SHORT);
pushBand(BANK.len3, WINDOW_SHORT);
pushBand(BANK.len4, WINDOW_SHORT);
pushBand(BANK.len5, WINDOW_LONG);

/* ─── گیت طلایی بانک — صحت دنباله‌ها و هم‌خوانی با نردبان مرحله‌ها ─── */
const MAX_SPAN = { s1: 2, s2: 3, s3: 4, s4: 5, s5: null };
for (const it of items) {
  const seq = it.stim.seq;
  if (new Set(seq).size !== seq.length) throw new Error(`گیت طلایی: ${it.id} صدف تکراری دارد — ${seq.join(',')}`);
  if (seq.some((v) => !Number.isInteger(v) || v < 0 || v > 8)) throw new Error(`گیت طلایی: ${it.id} اندیس بیرون شبکهٔ ۳×۳ — ${seq.join(',')}`);
  const probeLen = seq.length;
  const bandMaxes = Object.entries(MAX_SPAN).filter(([, m]) => m !== null && probeLen <= m).map(([s]) => s);
  if (bandMaxes.length === 0) throw new Error(`گیت طلایی: ${it.id} طول ${probeLen} در هیچ مرحله‌ای جا نمی‌شود`);
}
const spanCounts = {};
for (const it of items.filter((x) => x.phase === 'probe')) {
  spanCounts[it.stim.seq.length] = (spanCounts[it.stim.seq.length] ?? 0) + 1;
}
for (const len of [2, 3, 4, 5]) {
  if ((spanCounts[len] ?? 0) < 3) throw new Error(`گیت طلایی: دنباله‌های طول ${len} کمتر از ۳ است — ${spanCounts[len] ?? 0}`);
}

const body = {
  package_id: 'corsi1',
  goals: ['corsi_seq_memory'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'corsi_v1', game: 'corsi', goal: 'corsi_seq_memory', metric: 'accuracy_corsi',
    metrics: ['accuracy_corsi', 'median_rt_corsi', 'corsi_span_max'],
    title: 'صدف‌های جادویی',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: {
    before: 'این بازی تمرین حافظهٔ دیداری-فضایی است، نه درمان؛ ترتیب صدف‌ها را با هم شمرده می‌شود.',
    after: 'فردا ۱۰ دقیقه کافی است؛ بی‌عجله.'
  }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed corsi1 ۱.۰.۰ «حافظهٔ کاری دیداری-فضایی — صدف‌های جادویی» (idempotent) — G8/۱.۲۵.۴۸
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_corsi', 'دقت دنبالهٔ کامل صدف‌ها', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_corsi', 'میانهٔ زمان نخستین لمس یادآوری', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('corsi_seq_memory', 'حافظهٔ کاری دیداری-فضایی — صدف‌های جادویی', 'corsi1', 'accuracy_corsi', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('corsi1', '1.0.0', 'حافظهٔ کاری — صدف‌های جادویی', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-corsi.sql', sql, 'utf8');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length,
  '| probe:', items.filter((x) => x.phase === 'probe').length,
  '| span counts:', JSON.stringify(spanCounts), '| windows:', WINDOW_SHORT, WINDOW_LONG);
