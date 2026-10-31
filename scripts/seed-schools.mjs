#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def = undefined) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const YES = flag('--yes');
const DRY = flag('--dry-run');
const BASE = (opt('--base', '') || '').replace(/\/+$/, '');
const USER = opt('--user', process.env.SEED_STAFF_ID || '');
const PASS = opt('--pass', process.env.SEED_PASSWORD || '');
if (!USER || !PASS) {
  console.error('شناسهٔ کاربری/رمز لازم است — با --user/--pass یا SEED_STAFF_ID/SEED_PASSWORD بدهید (بدون مقدار پیش‌فرض).');
  process.exit(1);
}
const csvPath = args.find((a) => !a.startsWith('--'));

if (!csvPath) {
  console.error('استفاده: node scripts/seed-schools.mjs <schools.csv> [--yes] [--dry-run] [--base …] [--user …] [--pass …]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const GENDER = { 'مختلط': 'mixed', 'دخترانه': 'female', 'پسرانه': 'male' };

function mapRow(r) {
  const notes = [];
  if ((r.school_type || '').trim() === 'غیردولتی') notes.push('غیردولتی');
  if ((r.notes || '').trim()) notes.push(r.notes.trim());
  const g = GENDER[(r.gender || '').trim()];
  return {
    name: (r.school_name || '').trim(),
    code: (r.school_code || '').trim() || undefined,
    kind: 'school', // همهٔ ردیف‌های فایل مدارس‌اند (دبستان)؛ مهدکودک دستی اضافه می‌شود
    gender_type: g,
    principal_name: (r.director_name || '').trim() || undefined,
    principal_phone: (r.director_phone || '').trim() || undefined,
    address: (r.address || '').trim() || undefined,
    notes: notes.length ? notes.join(' — ') : undefined
  };
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* پاسخ غیر JSON */ }
  return { status: res.status, json, text };
}

const line = '─'.repeat(64);
console.log(line);
console.log('🌱 seed-schools — درج مدارس CSV روی', BASE);
console.log(line);

const raw = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const rows = parseCsv(raw);
const header = rows[0].map((h) => h.trim());
const items = rows.slice(1).map((r) => Object.fromEntries(r.map((v, i) => [header[i] ?? `c${i}`, v]))).map(mapRow);

const bad = items.filter((x) => (x.name || '').length < 2 || !x.code);
if (bad.length) {
  console.error('✘ ردیف‌های نامعتبر (نام < ۲ نویسه یا بدون کد):', bad.map((b) => b.code || b.name).join('، '));
  process.exit(1);
}
const dupCodes = items.map((x) => x.code).filter((c, i, a) => a.indexOf(c) !== i);
if (dupCodes.length) {
  console.error('✘ کد تکراری در خود CSV:', [...new Set(dupCodes)].join('، '));
  process.exit(1);
}
console.log(`   ردیف‌های CSV: ${items.length} — همهٔ نام/کد معتبر ✓`);
console.log(`   جنسیت: ${items.filter((x) => x.gender_type === 'mixed').length} مختلط / ${items.filter((x) => x.gender_type === 'female').length} دخترانه / ${items.filter((x) => x.gender_type === 'male').length} پسرانه`);

if (DRY) {
  console.log('\n— dry-run: نمونهٔ سه ردیف اول (هیچ درخواستی زده نشد) —');
  for (const x of items.slice(0, 3)) console.log('  •', JSON.stringify(x));
  console.log('\nبرای اجرای واقعی: بدون --dry-run و با --yes (یا به‌صورت تعاملی)');
  process.exit(0);
}

const login = await api('/api/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
if (login.status !== 200 || !login.json?.data?.token) {
  console.error('✘ ورود ناموفق:', login.status, (login.json?.error?.message) || login.text.slice(0, 200));
  process.exit(1);
}
const token = login.json.data.token;
console.log(`   ورود: ✓ (${login.json.data.staff.fullName} — ${login.json.data.staff.role})`);

const existing = await api('/api/schools', { token });
if (existing.status !== 200) {
  console.error('✘ خواندن مدارس موجود ناموفق:', existing.status);
  process.exit(1);
}
const have = existing.json.data;
const haveCodes = new Set(have.map((s) => s.code).filter(Boolean));
const normName = (n) => String(n || '')
  .replace(/[\u200c\u200f\u200e]/g, '')
  .replace(/[\s]+/g, '')
  .replace(/[（(][۲2][)）]?\s*$/, '')
  .replace(/[۲2]$/, '')
  .replace(/^شهید/, '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک');
const haveNormNames = new Set(have.map((s) => normName(s.name)));
console.log(`   مدارس موجود روی سایت (فعال + غیرفعال): ${have.length}`);

let created = 0, skipped = 0;
const failures = [];
for (const x of items) {
  if (haveCodes.has(x.code) || haveNormNames.has(normName(x.name))) { skipped++; continue; }
  const res = await api('/api/schools', { method: 'POST', token, body: x });
  if (res.status === 201) {
    created++;
    console.log(`   + [${x.code}] ${x.name}`);
  } else {
    failures.push({ code: x.code, name: x.name, status: res.status, msg: res.json?.error?.message ?? res.text.slice(0, 120) });
    console.error(`   ✘ [${x.code}] ${x.name} → ${res.status} ${failures.at(-1).msg}`);
  }
}

console.log(line);
console.log(`   ساخته‌شده: ${created} | از قبل موجود (رد شده): ${skipped} | خطا: ${failures.length}`);
if (failures.length) {
  console.log('\n   خطاها:');
  for (const f of failures) console.log(`   ✘ [${f.code}] ${f.name} → ${f.status} ${f.msg}`);
}
console.log(line);
console.log(failures.length ? '⚠ با خطا تمام شد — ردیف‌های خطادار را بررسی کنید.' : '✓ seed کامل شد.');
process.exit(failures.length ? 2 : 0);
