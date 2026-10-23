/**
 * t3-verify.mjs — راستی‌آزمایی باندل زندهٔ تولید برای T3 (m147 — پیشنهادگر چک‌لیست + جابه‌جایی وکسلر)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * الگوی scripts/t4-verify.mjs و tests/golden/generate-bundle-ref.mjs: ناحیه‌های مرتبط
 * با لنگر متنی از خود bundle.js بریده و در vm اجرا می‌شود — یعنی کدی که تست می‌شود
 * بایت‌به‌بایت کد تولید است (نه کپی دستی).
 *
 * پوشش:
 *   ۱) جابه‌جایی وکسلر: STANDARD_PATHWAY_ORDER جدید + رندر خودکار گیت‌ها (ordOf) + دست‌نخوردگی منطق تکمیل گیت
 *   ۲) بلوک پیشنهادگر باندل در vm — همان سناریوهای تست واحد (۱۴ قاعده + دیرآموز §۳.۱ + خط قرمز ID + جامع/تکی)
 *   ۳) سیم‌کشی: سرویس (getChecklistPlan) + رجیستر مسیر GET /api/students/:id/checklist-plan
 *   ۴) UI: کارت پلن در تب شناسایی (تأیید یک‌کلیکی با جریان موجود + ویرایش دستی + پانویس) + CSS توکن‌محور
 *   ۵) دست‌نخوردگی ناحیهٔ وکسلر T1 (لنگرهای سیگنال)
 *
 * اجرا:  node scripts/t3-verify.mjs   (exit 0 فقط با صفر شکست)
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const bundleSrc = fs.readFileSync(path.join(ROOT, 'worker', 'bundle.js'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function cutBetween(src, startMarker, endMarker, label) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start === -1 || end === -1) throw new Error(`لنگر ناحیهٔ ${label} در باندل پیدا نشد`);
  return src.slice(start, end + endMarker.length);
}

// ───────────── ۱) جابه‌جایی وکسلر — یک خانه عقب در مسیر استاندارد ─────────────

console.log('T3 bundle verify — ترتیب مسیر استاندارد:');
check('STANDARD_PATHWAY_ORDER = [anamnesis, wechsler, behavioral, skills, needs]',
  bundleSrc.includes('var STANDARD_PATHWAY_ORDER = ["anamnesis", "wechsler", "behavioral", "skills", "needs"];'));
check('ترتیب قدیمی در باندل باقی نمانده', !bundleSrc.includes('["anamnesis", "behavioral", "wechsler", "skills", "needs"]'));
const gatesRegion = cutBetween(bundleSrc, 'const ordOf = /* @__PURE__ */ __name2((key) => activeOrder.indexOf(key) + 1, "ordOf");', '__name2(computeGates, "computeGates");', 'gates');
check('رندر گیت‌ها از آرایهٔ فعال مسیر می‌خواند (بدون عدد سخت‌گیرانهٔ ترتیب)',
  gatesRegion.includes('activeOrder.map((key) => {') && !(/ordinal|\bord:\s*\d/.test(gatesRegion)));
check('m161 — ترتیب گیت‌های توانبخشی: سه گیت [anamnesis, skills, needs] با فیلتر مسیرآگاه',
  bundleSrc.includes('const REHAB_PATHWAY_ORDER = ["anamnesis", "skills", "needs"];')
  && bundleSrc.includes('const activeOrder = isRehab ? REHAB_PATHWAY_ORDER : STANDARD_PATHWAY_ORDER;'));
check('منطق تکمیل گیت‌ها کلیدمحور است (nWisc/nBehav/nAnam — بدون وابستگی ترتیبی)',
  ['const nAnam = freshCount(ANAMNESIS_KEYS);', 'const nBehav = freshCount(BEHAVIORAL_KEYS);', 'const nWisc = freshCount(WECHSLER_KEYS);']
    .every((s) => bundleSrc.includes(s)));
check('src — آرایهٔ گیت‌های ot-engine هم همان ترتیب را دارد',
  (() => {
    const s = fs.readFileSync(path.join(ROOT, 'src/domain/ot-engine/service.ts'), 'utf8');
    const iW = s.indexOf("'wechsler'");
    const iB = s.indexOf("'behavioral'");
    // m161 — ترتیب استاندارد در activeOrder + سه‌گیت توانبخشی
    return iW !== -1 && iB !== -1 && iW < iB
      && s.includes("const REHAB_PATHWAY_ORDER = ['anamnesis', 'skills', 'needs'] as const;")
      && s.includes("isRehab ? REHAB_PATHWAY_ORDER : ['anamnesis', 'wechsler', 'behavioral', 'skills', 'needs']");
  })());
check('UI — فال‌بک گیت‌ها در clinical-insights هم‌تراز سرور',
  fs.readFileSync(path.join(ROOT, 'public/assets/js/clinical-insights.js'), 'utf8')
    .includes("['anamnesis', 'wechsler', 'behavioral', 'skills', 'needs'].map"));
const contentSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/clinical-content.js'), 'utf8');
check('UI — شمارهٔ مراحل همگام (behavioral=۳، wechsler=۲)', /behavioral:\s*\{\s*num:\s*3,/.test(contentSrc) && /wechsler:\s*\{\s*num:\s*2,/.test(contentSrc));

// ───────────── ۲) بلوک پیشنهادگر باندل — اجرای vm با ناحیه‌های وابسته ─────────────

function cut(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i);
  if (i === -1 || j === -1) throw new Error(`لنگر پیدا نشد: ${a}`);
  return src.slice(i, j + b.length);
}
const region = [
  cut(bundleSrc, 'function num2(value) {', '__name2(num2, "num");'),
  cut(bundleSrc, 'function num(x) {', '__name2(num, "num");'),
  cut(bundleSrc, 'var FSIQ_BANDS = [', '__name2(fsiqBandOf, "fsiqBandOf");'),
  cut(bundleSrc, 'var ANAMNESIS_TEXT_FIELDS', '__name2(anamnesisSignalsOf, "anamnesisSignalsOf");'),
  cut(bundleSrc, 'function wechslerEngineOutputOf(event) {', '__name2(wechslerEngineOutputOf, "wechslerEngineOutputOf");'),
  cut(bundleSrc, 'var WISC4_EVENT_KEY =', ';'),
  cut(bundleSrc, '// ─── T3 (m147) — پیشنهادگر چک‌لیست', '__name2(checklistPlanContextOf, "checklistPlanContextOf");')
].join('\n');

const ctx = vm.createContext({
  __name: (t, v) => { try { Object.defineProperty(t, 'name', { value: v, configurable: true }); } catch { /* noop */ } return t; },
  __name2: (t, _v) => t
});
vm.runInContext(region, ctx, { filename: 'bundle-recommender-region.js' });
const { recommendChecklistPlan, checklistPlanContextOf } = ctx;

// ── سازنده‌های فیکسچر (آینهٔ recommender.test.ts) ──
const TOOL = {
  snapP: 'ce-snap-iv-p-v1', snapT: 'ce-snap-iv-t-v1', sdqP: 'ce-sdq-p-v1', sdqT: 'ce-sdq-t-v1',
  scared: 'ce-scared-p-v1', dcdq: 'ce-dcdq-v1', sldRead: 'ce-sld-read-v1', sldWri: 'ce-sld-wri-v1',
  sldCalc: 'ce-sld-calc-v1', asd: 'ce-asd-criteria-v1', speech: 'ce-speech-criteria-v1',
  probeRead: 'ce-probe-read-v1', probeWrite: 'ce-probe-write-v1', probeCalc: 'ce-probe-calc-v1',
  compFamily: 'ce-comp-family-v2', idAdapt: 'ce-id-adapt-v1', anamV3: 'ce-anamnesis-v3'
};
const weEv = (engine, manual) => {
  const payload = {};
  if (engine) payload.engine_output = { value: JSON.stringify(engine), label: 'x' };
  for (const [k, v] of Object.entries(manual ?? {})) payload[k] = { value: String(v), label: k };
  return { eventId: 'w1', toolKey: 'ce-wechsler-w4-v1', typeTitle: 'w', status: 'completed', occurredAt: '2026-10-05T08:00:00.000Z', payload, analysis: null, bands: null, subscales: null };
};
const uni = (f) => ({
  ok: true,
  snapshot: { fsiq: f, indexScatter: 2, indices: {}, subtests: [] },
  profile: {
    fsiq: f, fsiqBand: f <= 69 ? 'ID' : f <= 84 ? 'BIF' : f <= 89 ? 'LOW_BORDER' : 'AVERAGE',
    vci: { scaled: f }, pri: { scaled: f }, wmi: { scaled: f }, psi: { scaled: f },
    indexScatter: 2, acid: null, cad: null, step5: { strengths: [], weaknesses: [] }, substitutes: [], flags: []
  },
  hypotheses: [], signals: []
});
const engine = (o) => {
  const idx = (v) => (v == null ? null : { scaled: v });
  const sub = (c) => (o.subs?.[c] !== undefined ? o.subs[c] : null);
  const pattern = (codes) => {
    const scaled = {};
    for (const c of codes) { const v = sub(c); if (v === null || v > 7) return null; scaled[c] = v; }
    return { codes, scaled };
  };
  return {
    ok: true,
    snapshot: {
      fsiq: o.fsiq, indexScatter: o.scatter ?? 0,
      indices: { VCI: idx(o.vci), PRI: idx(o.pri), WMI: idx(o.wmi), PSI: idx(o.psi) },
      subtests: Object.entries(o.subs ?? {}).map(([code, scaled]) => ({ code, scaled }))
    },
    profile: {
      vci: idx(o.vci), pri: idx(o.pri), wmi: idx(o.wmi), psi: idx(o.psi),
      fsiq: o.fsiq, gai: null, gaiValidity: null, indexScatter: o.scatter ?? 0,
      fsiqBand: o.fsiq <= 69 ? 'ID' : o.fsiq <= 84 ? 'BIF' : o.fsiq <= 89 ? 'LOW_BORDER' : 'AVERAGE',
      acid: pattern(['AR', 'CD', 'IN', 'DS']), cad: pattern(['AR', 'CD', 'DS']),
      step5: { strengths: [], weaknesses: (o.step5Weak ?? []).map((key) => ({ key, diff: -12, cut: 8, valid: true })) },
      substitutes: [], flags: []
    },
    hypotheses: [], signals: []
  };
};
const anamV3 = (fields) => ({
  eventId: 'a1', toolKey: 'ce-anamnesis-v3', typeTitle: 'a', status: 'completed', occurredAt: '2026-10-05T08:00:00.000Z',
  payload: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, label: k }])),
  analysis: null, bands: null, subscales: null
});
const anamV2 = (fields) => ({
  eventId: 'a0', toolKey: 'ce-anamnesis-v2', typeTitle: 'a', status: 'completed', occurredAt: '2026-10-05T08:00:00.000Z',
  payload: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, label: k }])),
  analysis: null, bands: null, subscales: null
});
const idAdaptEv = (score) => ({
  eventId: 'id1', toolKey: 'ce-id-adapt-v1', typeTitle: 'x', status: 'completed', occurredAt: '2026-10-05T08:00:00.000Z',
  payload: null,
  analysis: {
    score, band: null, answered: 12, total: 12, maxScore: 24,
    subscaleScores: [{ id: 'id_adapt', name: 'x', score, max: 24, band: score <= 12 ? 'پایین — نیاز به بررسی' : score <= 17 ? 'مرزی' : 'نرمال', color: score <= 12 ? 'danger' : score <= 17 ? 'warn' : 'ok' }]
  },
  bands: null, subscales: null
});
const toolEv = (toolKey) => ({ eventId: `t-${toolKey}`, toolKey, typeTitle: toolKey, status: 'completed', occurredAt: '2026-10-05T08:00:00.000Z', payload: null, analysis: null, bands: null, subscales: null });
const keysOf = (plan) => plan.items.map((i) => i.toolKey);

console.log('T3 bundle verify — بلوک پیشنهادگر (vm):');
const planEmpty = recommendChecklistPlan(checklistPlanContextOf([]));
check('پروندهٔ خالی → SDQ والد+معلم core و پلن تکی', JSON.stringify(keysOf(planEmpty)) === JSON.stringify([TOOL.sdqP, TOOL.sdqT]) && planEmpty.planType === 'تکی' && planEmpty.referralFa === null);
check('پانویس انکار از خروجی حذف شده (m156)', planEmpty.disclaimer === undefined);

const bif = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(78))]));
check('دیرآموز (FSIQ ۷۸) → سه پروب + فرم جامع خانواده + شرح‌حال v3؛ بدون چک‌لیست ملاکی',
  [TOOL.probeRead, TOOL.probeWrite, TOOL.probeCalc, TOOL.compFamily, TOOL.anamV3, TOOL.sdqT].every((k) => keysOf(bif).includes(k)) &&
  !keysOf(bif).some((k) => k.startsWith('ce-sld-')) && !keysOf(bif).includes(TOOL.sdqP));
check('دیرآموز → پلن جامع + پایهٔ شفاف + بدون خط قرمز', bif.planType === 'جامع' && bif.basis.includes('مرزی/دیرآموزی') && bif.referralFa === null);
check('دیرآموز → همهٔ آیتم‌ها core و دارای reasonFa/کلید قاعده', bif.items.every((i) => i.priority === 'core' && i.reasonFa.length > 10 && i.hypothesisKeys.length >= 1));

const bifSld = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(78)), anamV3({ sld_read_concern: 'زیاد — نگران‌کننده' })]));
check('دیرآموز + نشانهٔ هم‌بودی خواندن → فقط چک‌لیست ملاکی خواندن core',
  bifSld.items.find((i) => i.toolKey === TOOL.sldRead)?.priority === 'core' &&
  !keysOf(bifSld).includes(TOOL.sldWri) && !keysOf(bifSld).includes(TOOL.sldCalc));

const bifAdhd = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 78, vci: 82, pri: 81, wmi: 70, psi: 77, scatter: 8 }))]));
check('دیرآموز + گپ توجه ≥۱۰ → SNAP معلم core و SNAP والدِ پوشش‌شدهٔ پکیج حذف',
  keysOf(bifAdhd).includes(TOOL.snapT) && !keysOf(bifAdhd).includes(TOOL.snapP));

const bifLow = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(78)), idAdaptEv(10)]));
check('FSIQ ۷۰–۸۴ + انطباق پایین → همچنان پلن دیرآموز (نه خط قرمز) با هشدار انطباقی',
  bifLow.referralFa === null && keysOf(bifLow).includes(TOOL.probeRead) && bifLow.basis.includes('پایین'));

const idRed = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(65)), idAdaptEv(10)]));
check('خط قرمز ID (FSIQ ۶۵ + انطباق پایین) → بدون پلن ابزار + پرچم ارجاع شفاف',
  idRed.items.length === 0 && idRed.referralFa.includes('خط قرمز') && idRed.basis.includes('ناتوانی هوشی'));

const idUnknown = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(65))]));
check('FSIQ ۶۵ + انطباق ثبت‌نشده → فقط فرم جامع خانواده برای تفکیک + SDQ معلم',
  JSON.stringify(keysOf(idUnknown)) === JSON.stringify([TOOL.compFamily, TOOL.sdqT]) && idUnknown.items[0].reasonFa.includes('تفکیک'));

const idNormal = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(65)), idAdaptEv(20)]));
check('FSIQ ۶۵ + انطباق نرمال → مسیر ID تأیید نمی‌شود؛ پلن پروب‌محور',
  idNormal.referralFa === null && keysOf(idNormal).includes(TOOL.probeRead) && keysOf(idNormal).includes(TOOL.compFamily));

const manualPreT1 = recommendChecklistPlan(checklistPlanContextOf([weEv(null, { fsiq: 78 })]));
check('رویداد پیش از T1 (فقط فیلد دستی) → فال‌بک fsiqBandOf و همان پلن دیرآموز',
  keysOf(manualPreT1).includes(TOOL.probeRead) && manualPreT1.planType === 'جامع');

const lowBorder = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(87))]));
check('مرز ۸۵–۸۹ یکنواخت → فقط باتری پایه + توصیهٔ پایش؛ بدون ابزار سنگین',
  JSON.stringify(keysOf(lowBorder)) === JSON.stringify([TOOL.sdqP, TOOL.sdqT]) && lowBorder.basis.includes('مرز پایین'));

const r1 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 100, vci: 110, pri: 108, wmi: 97, psi: 102, subs: { DS: 6 }, scatter: 11 }))]));
check('قاعدهٔ ۱ (دو شاخص جدا) → SNAP والد+معلم core + SDQ معلم',
  r1.items.find((i) => i.toolKey === TOOL.snapP)?.priority === 'core' && r1.items.find((i) => i.toolKey === TOOL.snapT)?.priority === 'core' && r1.items.find((i) => i.toolKey === TOOL.sdqT)?.priority === 'core');
const r1b = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 100, vci: 108, pri: 106, wmi: 94, psi: 104, scatter: 10 }))]));
check('قاعدهٔ ۱ — گپ تک‌شاخصی کافی نیست', !keysOf(r1b).includes(TOOL.snapP));
const r2 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 90, vci: 100, pri: 100, wmi: 88, psi: 88, subs: { AR: 6, CD: 6, IN: 6, DS: 6 }, scatter: 12 }))]));
check('قاعدهٔ ۲ (ACID بدون شکایت) → خواندن+پروب core و دو حوزهٔ دیگر optional',
  r2.items.find((i) => i.toolKey === TOOL.sldRead)?.priority === 'core' && r2.items.find((i) => i.toolKey === TOOL.probeRead)?.priority === 'core' && r2.items.find((i) => i.toolKey === TOOL.sldWri)?.priority === 'optional');
const r2b = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 90, vci: 108, pri: 104, wmi: 94, psi: 96, subs: { CD: 6 }, scatter: 10 })), anamV3({ sld_write_concern: 'متوسط' })]));
check('قاعدهٔ ۲ — حوزهٔ شکایت از سیگنال v3 (نوشتن) → چک‌لیست+پروب نوشتن',
  r2b.items.find((i) => i.toolKey === TOOL.sldWri)?.priority === 'core' && r2b.items.find((i) => i.toolKey === TOOL.probeWrite)?.priority === 'core' && !keysOf(r2b).includes(TOOL.probeRead));
const r3 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 88, vci: 82, pri: 96, wmi: 94, psi: 96, subs: { VO: 6 }, scatter: 14 }))]));
check('قاعدهٔ ۳ (DLD) → زبان core + پروب خواندن recommended',
  r3.items.find((i) => i.toolKey === TOOL.speech)?.priority === 'core' && r3.items.find((i) => i.toolKey === TOOL.probeRead)?.priority === 'recommended');
const r4 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 90, vci: 96, pri: 94, wmi: 82, psi: 92, subs: { DS: 6, LN: 5 }, scatter: 12 }))]));
check('قاعدهٔ ۴ (APD) → زبان core + یادآوری ارجاع شنوایی‌شناسی',
  r4.items.find((i) => i.toolKey === TOOL.speech)?.priority === 'core' && r4.basis.includes('شنوایی‌شناسی'));
const r7 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 100, vci: 110, pri: 95, wmi: 98, psi: 95, subs: { CD: 9, SS: 11 }, scatter: 15 }))]));
check('قاعدهٔ ۷ (NVLD) → حساب core + DCDQ core + اتیسم optional',
  r7.items.find((i) => i.toolKey === TOOL.sldCalc)?.priority === 'core' && r7.items.find((i) => i.toolKey === TOOL.dcdq)?.priority === 'core' && r7.items.find((i) => i.toolKey === TOOL.asd)?.priority === 'optional');
const r8e = engine({ fsiq: 88, vci: 88, pri: 86, wmi: 84, psi: 92, subs: { CD: 6, SS: 9 }, scatter: 8 });
const r8a = recommendChecklistPlan(checklistPlanContextOf([weEv(r8e), anamV3({ chief_complaint: 'در بازی با همسالان مشارکت نمی‌کند' })]));
const r8b = recommendChecklistPlan(checklistPlanContextOf([weEv(r8e)]));
check('قاعدهٔ ۸ (ASD) — با نشانهٔ اجتماعی core، بدون آن optional',
  r8a.items.find((i) => i.toolKey === TOOL.asd)?.priority === 'core' && r8b.items.find((i) => i.toolKey === TOOL.asd)?.priority === 'optional');
const r9 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 92, vci: 100, pri: 98, wmi: 94, psi: 84, scatter: 16 })), anamV3({ crisis_event: 'بله — برای خود کودک' })]));
check('قاعدهٔ ۹ (MOOD) → SCARED core؛ بدون خط قرمز', r9.items.find((i) => i.toolKey === TOOL.scared)?.priority === 'core' && r9.referralFa === null);
const r10 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 95, vci: 105, pri: 100, wmi: 95, psi: 78, scatter: 27 })), anamV2({ medical: 'سابقهٔ تصادف و بستری در سال گذشته' })]));
check('قاعدهٔ ۱۰ (TBI) → خط قرمز ارجاع پزشکی + SDQ معلم', r10.referralFa.includes('پزشکی') && Boolean(r10.items.find((i) => i.toolKey === TOOL.sdqT)));
const r11 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 110, vci: 125, pri: 122, wmi: 88, psi: 95, scatter: 33 }))]));
check('قاعدهٔ ۱۱ (TWO_E) → بستهٔ SLD حوزهٔ ضعف core با تگ استعداد',
  r11.items.find((i) => i.toolKey === TOOL.sldRead)?.priority === 'core' && r11.items.find((i) => i.toolKey === TOOL.sldRead)?.reasonFa.includes('استعداد'));
const r12 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 100, vci: 100, pri: 102, wmi: 95, psi: 100, scatter: 7, step5Weak: ['WMI'] }))]));
check('قاعدهٔ ۱۲ (DOMAIN_WEAK) → چک‌لیست توجه recommended از گام ۵',
  r12.items.find((i) => i.toolKey === TOOL.snapP)?.priority === 'recommended');
const r13 = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(100))]));
check('قاعدهٔ ۱۳ (NORMAL) → فقط باتری پایهٔ سبک + پایان زودهنگام', JSON.stringify(keysOf(r13)) === JSON.stringify([TOOL.sdqP, TOOL.sdqT]) && r13.basis.includes('هم‌نواز'));
const r14 = recommendChecklistPlan(checklistPlanContextOf([weEv(engine({ fsiq: 97, vci: 100, pri: 86, wmi: 95, psi: 100, scatter: 25 }))]));
check('قاعدهٔ ۱۴ (validity) → پرچم اعتبار اجرا، نه چک‌لیست', JSON.stringify(keysOf(r14)) === JSON.stringify([TOOL.sdqP, TOOL.sdqT]) && r14.basis.includes('اعتبار'));
const det = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(78)), anamV3({ sld_read_concern: 'کم', attention_concern: 'متوسط' }), idAdaptEv(15)]));
check('قطعیت — دو فراخوانی با ورودی یکسان → خروجی یکسان',
  JSON.stringify(det) === JSON.stringify(recommendChecklistPlan(checklistPlanContextOf([weEv(uni(78)), anamV3({ sld_read_concern: 'کم', attention_concern: 'متوسط' }), idAdaptEv(15)]))));
const dedup = recommendChecklistPlan(checklistPlanContextOf([weEv(uni(78)), toolEv(TOOL.probeRead)]));
check('ابزار موجود پرونده → از پلن حذف (بقیه می‌ماند)', !keysOf(dedup).includes(TOOL.probeRead) && keysOf(dedup).includes(TOOL.probeWrite));
const rank = { core: 0, recommended: 1, optional: 2 };
const ranks = r2.items.map((i) => rank[i.priority]);
check('ترتیب آیتم‌ها — اولویت صعودی سپس کلید', JSON.stringify(ranks) === JSON.stringify([...ranks].sort((a, b) => a - b)));

// ───────────── ۳) سیم‌کشی سرویس و مسیر در باندل ─────────────

console.log('T3 bundle verify — سیم‌کشی تولید:');
check('سرویس — getChecklistPlan با RBAC تفسیر و موتور خالص',
  bundleSrc.includes('const plan = recommendChecklistPlan(checklistPlanContextOf(events));') &&
  /async function getChecklistPlan\(studentId, actor\) \{\s*\n\s*const student = await loadStudent\(studentId\);\s*\n\s*assertCanView\(student, actor\);/.test(bundleSrc));
check('خروجی سرویس — کلید getChecklistPlan در return',
  /return \{\s*\n\s*getInsights,\s*\n\s*getChecklistPlan,/.test(bundleSrc));
check('رجیستر مسیر — GET /api/students/:id/checklist-plan با نقش‌های خواندن',
  bundleSrc.includes('app.get("/api/students/:id/checklist-plan", requireRole("manager", "secretary", "therapist"), async (c) => {'));
check('src — سرویس و مسیر هم‌سنگ باندل',
  (() => {
    const s = fs.readFileSync(path.join(ROOT, 'src/domain/clinical-engine/service.ts'), 'utf8');
    const r = fs.readFileSync(path.join(ROOT, 'src/domain/clinical-engine/routes.ts'), 'utf8');
    return s.includes('getChecklistPlan') && r.includes("'/api/students/:id/checklist-plan'");
  })());
check('src — صادرات recommender در barrel ماژول',
  fs.readFileSync(path.join(ROOT, 'src/domain/clinical-engine/index.ts'), 'utf8').includes("export * from './recommender';"));

// ───────────── ۴) UI — کارت پلن در تب شناسایی ─────────────

console.log('T3 bundle verify — کارت پلن (clinical-insights):');
const ui = fs.readFileSync(path.join(ROOT, 'public/assets/js/clinical-insights.js'), 'utf8');
check('واکشی پلن در دستهٔ موازی اول (بدون GET تازه در هر رفرش دوباره‌سازی‌نشده)',
  ui.includes("api.get(`/api/students/${student.id}/checklist-plan`).catch(() => null)"));
check('کارت فقط در بدنهٔ مرحلهٔ وکسلر (بعد از نیم‌رخ) سوار می‌شود',
  ui.includes('const planCard = checklistPlanCard({ student, plan, typesById, canDecide, refresh });') &&
  ui.indexOf('const planCard = checklistPlanCard(') > ui.indexOf('wechsler: () => {'));
check('تأیید یک‌کلیکی = جریان موجود ارسال فرم با پیش‌انتخاب ابزارهای پلن (onlyKeys)',
  ui.includes('onclick: () => openCaseEventForm({ student, onlyKeys: planKeys, pickerTitle: M.confirmPickerTitle, onSaved: refresh })'));
check('ویرایش/انتخاب دستی = کتابخانهٔ کامل (بدون onlyKeys) و همیشه در دسترس',
  ui.includes("el('button', {\n          class: 'btn btn--soft btn--sm',\n          onclick: () => openCaseEventForm({ student, onSaved: refresh })\n        }, icon('edit', 14), M.editLabel)"));
check('پانویس انکار روی کارت حذف شده (m156)', !ui.includes("plan.disclaimer"));
check('پرچم ارجاع خط قرمز روی کارت رندر می‌شود', ui.includes('plan.referralFa'));
const css = fs.readFileSync(path.join(ROOT, 'public/assets/css/views.css'), 'utf8');
const cssBlock = css.slice(css.indexOf('کارت «ابزارهای پیشنهادی گام بعد»'));
check('CSS — فقط توکن موجود؛ بدون رنگ/فونت تازه در بلوک T3',
  !/#[0-9a-fA-F]{3,8}\b|font-family|rgb\(/.test(cssBlock.slice(0, cssBlock.indexOf('}', cssBlock.indexOf('.clx-plan__disclaimer') + 1))));

// ───────────── ۵) دست‌نخوردگی ناحیهٔ وکسلر (T1) ─────────────

console.log('T3 bundle verify — ناحیهٔ وکسلر T1:');
check('لنگرهای سیگنال T1 سرجایش‌اند (profileSignals/buildWechslerProfile)',
  bundleSrc.includes('__name2(profileSignals, "profileSignals");') && bundleSrc.includes('__name2(buildWechslerProfile, "buildWechslerProfile");'));
check('ترتیب ناحیه‌ها — بلوک T3 بعد از anamnesisFlagFor و قبل از criterionStatus',
  bundleSrc.indexOf('__name2(anamnesisFlagFor, "anamnesisFlagFor");') < bundleSrc.indexOf('// ─── T3 (m147) — پیشنهادگر چک‌لیست') &&
  bundleSrc.indexOf('__name2(checklistPlanContextOf, "checklistPlanContextOf");') < bundleSrc.indexOf('function criterionStatus(criterionId, ruleSet, perTool) {'));

console.log(`\nنتیجه: ${pass} گذر / ${fail} شکست`);
process.exit(fail === 0 ? 0 : 1);
