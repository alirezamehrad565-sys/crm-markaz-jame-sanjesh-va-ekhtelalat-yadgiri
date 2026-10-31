#!/usr/bin/env node

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def = undefined) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const YES = flag('--yes');
const DRY = flag('--dry-run');
const ONLY = opt('--code');
const BASE = (opt('--base', '') || '').replace(/\/+$/, '');
const USER = opt('--user', process.env.SEED_STAFF_ID || '');
const PASS = opt('--pass', process.env.SEED_PASSWORD || '');
if (!USER || !PASS) {
  console.error('شناسهٔ کاربری/رمز لازم است — با --user/--pass یا SEED_STAFF_ID/SEED_PASSWORD بدهید (بدون مقدار پیش‌فرض).');
  process.exit(1);
}

const GRADES = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'];

const FEMALE_FIRST = ['مریم', 'زهرا', 'فاطمه', 'لیلا', 'نرگس', 'سارا', 'الهام', 'شیرین', 'پریسا', 'نازنین', 'مینا', 'سمانه', 'رقیه', 'فرشته', 'سمیرا', 'مهناز', 'ژاله', 'شیما', 'فرزانه', 'اعظم', 'خدیجه', 'بتول', 'ثریا', 'پروین', 'شهناز', 'طاهره', 'عذرا', 'فرحناز', 'گلناز', 'مهری', 'نیلوفر', 'هانیه', 'یاسمن', 'آتنا', 'درسا', 'رویا', 'صدف', 'غزاله', 'بهاره', 'نسرین'];
const MALE_FIRST = ['علی', 'محمد', 'حسین', 'رضا', 'مهدی', 'امیر', 'سعید', 'حمید', 'کوروش', 'آرش', 'بابک', 'سامان', 'فرهاد', 'مسعود', 'جواد', 'احمد', 'محمود', 'یاسر', 'میلاد', 'بهروز', 'سیاوش', 'کاوه', 'هومن', 'پویا', 'رامین', 'سینا', 'شاهین', 'وحید', 'غلام', 'عبدالله', 'جمال', 'رسول', 'اکبر', 'ناصر', 'داود', 'هادی', 'مصطفی', 'یوسف', 'مهرداد', 'امید'];
const LAST = ['صادری', 'دهنوی', 'کوهنجانی', 'مهارلویی', 'تزنگی', 'زارعی', 'لطفی', 'مومنی', 'اکبری', 'فلاحی', 'باهنری', 'شفیعی', 'منتظری', 'کمالی', 'کریمی', 'حسینی', 'رجبی', 'صالحی', 'عسکری', 'مدنی', 'مظلومی', 'مفتاحی', 'حیدری', 'نیکبخت', 'نصیری', 'جاوید', 'نادری', 'حیدرپوری', 'جلالی‌فر', 'جهادی', 'محمودی', 'شهبازی', 'پناهی', 'نوروزی', 'رضایی', 'سلیمی', 'خرده‌پا', 'ابراهیم‌زاده', 'ثابت', 'روحانی', 'صادقی', 'هاشمی', 'جلوداری', 'خانی', 'امینی'];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function lcg(seed) {
  let st = seed >>> 0;
  return () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
}

const usedNames = new Set();
const usedPhones = new Set();
function pickTeacher(gender, rnd, seq) {
  const firsts = gender === 'female' ? FEMALE_FIRST : MALE_FIRST;
  const fi = Math.floor(rnd() * firsts.length);
  const li = (seq * 7 + Math.floor(rnd() * LAST.length)) % LAST.length;
  let name = `${firsts[fi]} ${LAST[li]}`;
  if (usedNames.has(name)) {
    for (let k = 1; k < 40 && usedNames.has(name); k++) {
      const l2 = (li + k) % LAST.length;
      name = `${firsts[(fi + k) % firsts.length]} ${LAST[l2]}`;
    }
  }
  usedNames.add(name);
  return name;
}
const PHONE_PREFIX = ['0917', '0917', '0917', '0930', '0902', '0903', '0936', '0939'];
function pickPhone(rnd) {
  for (let t = 0; t < 50; t++) {
    const p = PHONE_PREFIX[Math.floor(rnd() * PHONE_PREFIX.length)] + String(1000000 + Math.floor(rnd() * 9000000));
    if (!usedPhones.has(p)) { usedPhones.add(p); return p; }
  }
  return undefined;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* پاسخ غیر JSON */ }
  return { status: res.status, json, text };
}

const line = '─'.repeat(64);
console.log(line);
console.log('🌱 seed-classes-teachers — کلاس‌های زیرمجموعهٔ مدارس + معلم روی', BASE);
console.log(line);

const login = await api('/api/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
if (login.status !== 200 || !login.json?.data?.token) {
  console.error('✘ ورود ناموفق:', login.status, login.json?.error?.message || login.text.slice(0, 200));
  process.exit(1);
}
const token = login.json.data.token;
console.log(`   ورود: ✓ (${login.json.data.staff.fullName} — ${login.json.data.staff.role})`);

const schoolsRes = await api('/api/schools', { token });
if (schoolsRes.status !== 200) { console.error('✘ گرفتن مدارس ناموفق:', schoolsRes.status); process.exit(1); }
const schools = schoolsRes.json.data.filter((s) => s.active && (!ONLY || s.code === ONLY));
if (!schools.length) { console.error('✘ مدرسه‌ای یافت نشد' + (ONLY ? ` با کد ${ONLY}` : '')); process.exit(1); }
console.log(`   مدارس فعال: ${schools.length}` + (ONLY ? ` (فقط کد ${ONLY})` : ''));

let seq = 0;
const plan = [];
for (let si = 0; si < schools.length; si++) {
  const s = schools[si];
  const rnd = lcg(hashStr(s.code || s.id));
  const rows = GRADES.map((g, gi) => ({ name: `${g} الف`, gi }));
  if (si % 5 === 2) for (let gi = 0; gi < 3; gi++) rows.push({ name: `${GRADES[gi]} ب`, gi });
  for (const r of rows) {
    seq++;
    const noTeacher = seq % 19 === 0;
    const gt = s.genderType ?? s.gender_type; // API camelCase می‌دهد
    const gender = gt === 'female' ? 'female' : gt === 'male' ? 'male' : (r.gi + si) % 2 ? 'female' : 'male';
    plan.push({
      school: { id: s.id, name: s.name, code: s.code || '—', genderType: gt },
      payload: {
        school_id: s.id,
        name: r.name,
        teacher_name: noTeacher ? undefined : pickTeacher(gender, rnd, seq),
        teacher_phone: noTeacher ? undefined : (seq % 11 === 0 ? undefined : pickPhone(rnd))
      }
    });
  }
}

const withTeacher = plan.filter((p) => p.payload.teacher_name).length;
const withPhone = plan.filter((p) => p.payload.teacher_phone).length;
console.log(`   نقشه: ${plan.length} کلاس — معلم‌دار: ${withTeacher} — تلفن‌دار: ${withPhone} (بقیه عمداً خالی برای تست)`);
const nameDup = plan.filter((p, i, a) => p.payload.teacher_name && a.findIndex((q) => q.payload.teacher_name === p.payload.teacher_name) !== i);
console.log(`   نام تکراری معلم: ${nameDup.length} ${nameDup.length ? '✘ ' + nameDup.slice(0, 3).map((n) => n.payload.teacher_name).join('، ') : '✓'}`);

if (DRY) {
  console.log('\n— dry-run: سه نمونه (هیچ درخواستی زده نشد) —');
  for (const p of plan.slice(0, 3)) console.log('  •', p.school.name, '→', JSON.stringify(p.payload));
  console.log('\nبرای اجرای واقعی: بدون --dry-run و با --yes');
  process.exit(0);
}

let created = 0, skipped = 0, failed = 0;
const errors = [];
const perSchool = new Map();
for (const p of plan) {
  if (!perSchool.has(p.school.id)) {
    const ex = await api(`/api/classes?school_id=${p.school.id}`, { token });
    perSchool.set(p.school.id, new Set((ex.json?.data || []).map((c) => c.name)));
  }
  if (perSchool.get(p.school.id).has(p.payload.name)) { skipped++; continue; }

  const res = await api('/api/classes', { method: 'POST', token, body: p.payload });
  if (res.status === 201) { created++; perSchool.get(p.school.id).add(p.payload.name); }
  else if (res.status === 409) { skipped++; }
  else { failed++; errors.push(`${p.school.name}/${p.payload.name}: ${res.status} ${res.json?.error?.message || ''}`); }
}

console.log('\n' + line);
console.log(`✓ ساخته شد: ${created}   ⤼ از قبل بود: ${skipped}   ✘ خطا: ${failed}`);
if (errors.length) { console.log('خطاها:'); for (const e of errors.slice(0, 10)) console.log('  •', e); }
console.log(line);
