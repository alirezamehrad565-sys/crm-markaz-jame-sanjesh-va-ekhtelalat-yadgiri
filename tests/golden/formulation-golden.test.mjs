// GOLDEN TEST — case-formulation engine extraction (task 39-d2).
//
// Proves that src/domain/case-formulation/engine.js (the extracted engine) and
// the production bundle worker/bundle.js (via tests/golden/bundle-formulation-ref.cjs,
// a machine-generated verbatim slice — see generate-bundle-ref.mjs) produce
// EXACTLY identical formulation JSON for identical evidence, across ≥8 clinical
// scenarios.
//
// Run:  node --test tests/golden/formulation-golden.test.mjs
//
// The reference module is derived from the real bundle by string anchors and
// therefore cannot drift from it; guards below additionally re-derive the
// extraction in-memory and fail if the bundle or engine.js changed without
// regenerating.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRefSource, extractEngineRegion, extractDependencies } from "./generate-bundle-ref.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const BUNDLE_PATH = path.join(ROOT, "worker", "bundle.js");
const REF_PATH = path.join(HERE, "bundle-formulation-ref.cjs");
const ENGINE_PATH = path.join(ROOT, "src", "domain", "case-formulation", "engine.js");

const require = createRequire(import.meta.url);
const ref = require(REF_PATH); // golden reference extracted from the production bundle

const engine = await import(ENGINE_PATH); // extraction under test (plain JS, ESM)

const FIXED_NOW = () => new Date("2026-02-01T08:30:00.000Z");
const T = ref.__tables;

// ─────────────────────────── helpers ───────────────────────────

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",");
  return `{${body}}`;
}

function ev(toolKey, opts = {}) {
  return {
    eventId: opts.eventId ?? `ev-${toolKey}-${Math.random().toString(36).slice(2, 8)}`,
    toolKey,
    typeTitle: opts.typeTitle ?? toolKey,
    status: opts.status ?? "completed",
    occurredAt: opts.occurredAt ?? "2026-01-20T09:00:00Z",
    payload: opts.payload ?? null,
    analysis: opts.analysis ?? null,
    bands: opts.bands ?? null,
    subscales: opts.subscales ?? null,
  };
}

const ss = (id, score, opts = {}) => ({ id, score, max: opts.max ?? 3, band: opts.band ?? null, color: opts.color ?? null });

function gates(...entries) {
  // entries: [key, done] pairs; labels are arbitrary (only echoed into caps texts)
  const labels = {
    anamnesis: "شرح‌حال و گفت‌وگوی اول",
    behavioral: "ارزیابی رفتاری",
    wechsler: "هوش‌بهر وکسلر",
    skills: "پروفایل مهارتی",
    needs: "نیازسنجی",
  };
  return { gates: entries.map(([key, done]) => ({ key, label: labels[key] ?? key, done, detail: done ? "ثبت‌شده" : "هنوز ثبت نشده" })) };
}

const ALL_GATES_DONE = gates(
  ["anamnesis", true],
  ["behavioral", true],
  ["wechsler", true],
  ["skills", true],
  ["needs", true]
);

const baseChild = { id: "student-001", ageYears: 8, grade: "دوم" };

function run(evidence) {
  return {
    ref: ref.formulateCase(evidence, { now: FIXED_NOW }),
    ext: engine.formulateCase(evidence, { now: FIXED_NOW }),
  };
}

function assertEquivalent(name, evidence) {
  const { ref: want, ext: got } = run(evidence);
  // 1) deep structural equality (node's deepStrictEqual)
  assert.deepStrictEqual(got, want, `${name}: deepStrictEqual mismatch`);
  // 2) stable-stringified byte equality (catches key-order / undefined quirks)
  assert.equal(stableStringify(got), stableStringify(want), `${name}: stable stringify mismatch`);
  // 3) sanity: the formulation itself is well-formed
  assert.equal(got.schemaVersion, "m93.2");
  assert.equal(got.constructs.length, 8);
  assert.equal(got.patterns.length, 12);
  assert.ok(got.confidence >= T.CONFIDENCE_MIN && got.confidence <= T.CONFIDENCE_MAX);
  assert.ok(got.disclaimer.length > 10);
  return got;
}

// ───────────────────── drift guards (extraction integrity) ─────────────────────

test("guard: reference .cjs is byte-identical to a fresh extraction of worker/bundle.js", () => {
  if (!existsSync(BUNDLE_PATH)) {
    test.skip("worker/bundle.js not present in this checkout");
    return;
  }
  const committed = readFileSync(REF_PATH, "utf8");
  const fresh = buildRefSource(readFileSync(BUNDLE_PATH, "utf8"));
  assert.equal(committed, fresh, "bundle-formulation-ref.cjs is stale — run: node tests/golden/generate-bundle-ref.mjs");
});

test("guard: engine.js still contains the verbatim bundle slices (region + shared tables)", () => {
  if (!existsSync(BUNDLE_PATH)) {
    test.skip("worker/bundle.js not present in this checkout");
    return;
  }
  const bundle = readFileSync(BUNDLE_PATH, "utf8");
  const engineSrc = readFileSync(ENGINE_PATH, "utf8");
  const region = extractEngineRegion(bundle);
  const deps = extractDependencies(bundle);
  assert.ok(engineSrc.includes(region), "engine region slice diverged from worker/bundle.js");
  for (const [name, chunk] of Object.entries(deps)) {
    assert.ok(engineSrc.includes(chunk), `shared dependency slice "${name}" diverged from worker/bundle.js`);
  }
});

test("guard: exported entry points match", () => {
  assert.equal(typeof engine.formulateCase, "function");
  assert.equal(typeof engine.buildCaseFormulation, "function");
  assert.equal(typeof engine.wechslerFromEvent, "function");
  assert.equal(typeof engine.ageYearsFromBirthDate, "function");
  assert.equal(typeof ref.wechslerFromEvent, "function");
});

// ───────────────────── helper equivalence (pure inputs) ─────────────────────

test("wechslerFromEvent: identical on manual-index payload and engine_output payload", () => {
  const manual = { fsiq: { value: "۱۰۵" }, vci: { value: "105" }, pri: { value: "102" }, wmi: { value: "108" }, psi: { value: "98" } };
  assert.deepStrictEqual(engine.wechslerFromEvent(manual), ref.wechslerFromEvent(manual));

  const engineOutput = {
    engine_output: {
      value: JSON.stringify({
        ok: true,
        snapshot: { indices: { VCI: { scaled: 100 }, PRI: { scaled: 97 } }, fsiq: 92, gai: 99, indexScatter: 7, substitutes: ["PRI"] },
        main: { id: "ADHD", status: "active", level: "بالا" },
        monitoringInterval: "۶ ماه",
      }),
    },
  };
  assert.deepStrictEqual(engine.wechslerFromEvent(engineOutput), ref.wechslerFromEvent(engineOutput));

  assert.deepStrictEqual(engine.wechslerFromEvent(null), ref.wechslerFromEvent(null));
  assert.deepStrictEqual(engine.wechslerFromEvent({}), ref.wechslerFromEvent({}));
  assert.deepStrictEqual(engine.wechslerFromEvent({ fsiq: { value: "xxx" } }), ref.wechslerFromEvent({ fsiq: { value: "xxx" } }));
});

// ───────────────────── clinical scenarios ─────────────────────

test("scenario 1: pure ADHD — SNAP-IV parent+teacher, consensus pair bonus", () => {
  const got = assertEquivalent("pure-adhd", {
    events: [
      ev("ce-snap-iv-p-v1", { analysis: { subscaleScores: [ss("ia", 18), ss("hi", 15), ss("odd", 9)] } }),
      ev("ce-snap-iv-t-v1", { analysis: { subscaleScores: [ss("ia", 17), ss("hi", 10), ss("odd", 5)] } }),
    ],
    wechsler: null,
    ot: null,
    gates: gates(["anamnesis", true], ["behavioral", true], ["wechsler", false], ["skills", true], ["needs", true]),
    child: baseChild,
  });
  const attention = got.constructs.find((c) => c.key === "attention_exec");
  assert.ok(attention.rawScore > 0, "attention must receive evidence");
  assert.ok(attention.evidenceFa.some((e) => e.signal === "snap_ia_pair"), "parent+teacher agreement pair row");
  assert.ok(got.nextActions.some((a) => a.toolId === "ce-anamnesis-v3"), "anamnesis missing from evidence stream → base action (T4: فرم فعال نسخهٔ ۳)");
});

test("scenario 2: ADHD + ODD — SNAP odd danger + ODD criteria checklist rule-active", () => {
  const oddPayload = Object.fromEntries(
    ["oA1", "oA2", "oA3", "oA4", "oA5", "oA6", "oA7", "oA8", "oB1", "oC1", "oD1"].map((k) => [k, { value: 2 }])
  );
  const got = assertEquivalent("adhd-odd", {
    events: [
      ev("ce-snap-iv-p-v1", { analysis: { subscaleScores: [ss("ia", 8), ss("hi", 5), ss("odd", 15)] } }),
      ev("ce-snap-iv-t-v1", { analysis: { subscaleScores: [ss("ia", 6), ss("hi", 4), ss("odd", 6)] } }),
      ev("ce-odd-criteria-v1", { payload: oddPayload, analysis: { score: 12 } }),
    ],
    wechsler: ref.wechslerFromEvent({ fsiq: { value: "105" }, vci: { value: "۱۰۵" }, pri: { value: "102" }, wmi: { value: "108" }, psi: { value: "98" } }),
    ot: null,
    gates: ALL_GATES_DONE,
    child: baseChild,
  });
  const externalizing = got.constructs.find((c) => c.key === "externalizing");
  assert.ok(externalizing.rawScore > 0, "externalizing must receive evidence");
  assert.ok(externalizing.evidenceFa.some((e) => e.toolId === "ce-odd-criteria-v1" && e.signal === "odd_danger"), "rule-active ODD checklist row (criteriaMetFor → rulesOf)");
  assert.ok(got.patterns.some((p) => p.key === "P3_ASD_x_ADHD" && p.status === "candidate"));
});

test("scenario 3: SLD-only — checklist danger + probe danger (reading), writing warn", () => {
  const got = assertEquivalent("sld-only", {
    events: [
      ev("ce-sld-read-v1", { analysis: { score: 15 } }),
      ev("ce-sld-wri-v1", { analysis: { score: 11 } }),
      ev("ce-probe-read-v1", { payload: { wcpm: { value: 40 }, text_grade: { value: "دوم" } } }),
    ],
    wechsler: null,
    ot: null,
    gates: gates(["anamnesis", false], ["behavioral", true], ["wechsler", false], ["skills", false], ["needs", false]),
    child: baseChild,
  });
  const academic = got.constructs.find((c) => c.key === "academic_learning");
  assert.ok(academic.rawScore > 0);
  assert.ok(academic.subtypeFa?.includes("reading") || academic.subtypeFa?.includes("writing"));
  assert.ok(got.nextActions.some((a) => a.toolId === "ce-anamnesis-v3")); // — T4: پیشنهاد ورودی جدید = نسخهٔ ۳
});

test("scenario 4: autism red flags — ASD criteria rule-active + anamnesis regression/TBI + speech critical item", () => {
  const asdPayload = Object.fromEntries(
    ["aA1", "aA2", "aA3", "aA4", "aA5", "aA6", "aB1", "aB2", "aB3", "aB4", "aB5", "aB6", "aB7"].map((k) => [k, { value: 2 }])
  );
  const regressionKw = T.REDFLAG_KEYWORDS.regression[0];
  const tbiKw = T.REDFLAG_KEYWORDS.tbi[0];
  const internalKw = T.ANAMNESIS_KEYWORDS.internalizing[0];
  const got = assertEquivalent("autism-redflags", {
    events: [
      ev("ce-asd-criteria-v1", { payload: asdPayload, analysis: { score: 24 } }),
      ev("ce-anamnesis-v2", {
        payload: {
          development: { value: `کودک ${regressionKw} و کلمات را فراموش کرد` },
          medical: { value: `${tbiKw} در سال گذشته` },
          chief_complaint: { value: `${internalKw} شدید در جمع` },
        },
      }),
      ev("ce-speech-criteria-v1", { analysis: { score: 18, flags: [{ label: "آیتم بحرانی شنوایی" }] } }),
    ],
    wechsler: null,
    ot: null,
    gates: gates(["anamnesis", true], ["behavioral", false], ["wechsler", false], ["skills", false], ["needs", false]),
    child: { ...baseChild, ageYears: 5 },
  });
  assert.ok(got.redFlags.some((f) => f.key === "hearing_loss" && f.urgent));
  assert.ok(got.redFlags.some((f) => f.key === "regression" && f.urgent));
  assert.ok(got.redFlags.some((f) => f.key === "tbi_referral" && f.urgent));
  const social = got.constructs.find((c) => c.key === "social_adl");
  assert.ok(social.rawScore > 0);
  assert.ok(social.evidenceFa.some((e) => e.toolId === "ce-asd-criteria-v1" && e.signal === "asd_danger"), "rule-active ASD checklist row");
});

test("scenario 5: anxiety — SCARED strong total + school avoidance + SNAP parent warn/danger", () => {
  const got = assertEquivalent("anxiety", {
    events: [
      ev("ce-scared-p-v1", {
        analysis: {
          score: 31,
          subscaleScores: [ss("sch", 2), ss("panic", 3, { color: "danger" }), ss("soc", 3, { color: "danger" })],
        },
      }),
      ev("ce-snap-iv-p-v1", { analysis: { subscaleScores: [ss("ia", 17), ss("hi", 6), ss("odd", 4)] } }),
    ],
    wechsler: null,
    ot: null,
    gates: gates(["anamnesis", true], ["behavioral", false], ["wechsler", false], ["skills", true], ["needs", false]),
    child: baseChild,
  });
  assert.ok(got.redFlags.some((f) => f.key === "school_avoidance"));
  const internalizing = got.constructs.find((c) => c.key === "internalizing");
  assert.ok(internalizing.rawScore >= 2);
  assert.ok(got.nextActions.some((a) => a.toolId === "ce-snap-iv-t-v1"), "parent attention present → teacher SNAP requested");
});

test("scenario 6: sparse low-confidence data — anamnesis only, all gates open", () => {
  const academicKw = T.ANAMNESIS_KEYWORDS.academic_learning[0];
  const motorKw = T.ANAMNESIS_KEYWORDS.motor_coord[0];
  const got = assertEquivalent("sparse", {
    events: [
      ev("ce-anamnesis-v2", {
        payload: {
          chief_complaint: { value: `مشکل ${academicKw} و دیکته` },
          development: { value: `${motorKw} بود` },
        },
      }),
    ],
    wechsler: null,
    ot: null,
    gates: gates(["anamnesis", true], ["behavioral", false], ["wechsler", false], ["skills", false], ["needs", false]),
    child: baseChild,
  });
  assert.equal(got.dataCoverage.percent, 60, "sparse anamnesis-only data → gates 1/5 + no elevated constructs (single-keyword rows score 1 → پایین)");
  assert.ok(got.constructs.every((c) => c.level === "پایین"), "single keyword rows stay below the مرزی threshold (score 1 < LEVEL_THRESHOLDS.border)");
  assert.equal(got.primaryProfile.key, "academic_learning", "dominant-construct fallback picks the FIRST CONSTRUCT_KEY with rawScore>0 even at پایین level (bestLevel starts at -1)");
  assert.ok(got.confidence <= 0.25, `confidence must be minimal, got ${got.confidence}`);
  assert.ok(got.capsFa.length > 0, "global caps must be recorded");
});

test("scenario 7: rich multi-informant — SNAP pair x2, SDQ p+t, SCARED, DCDQ, SLD+probe, wechsler engine output, OT delays", () => {
  const attentionKw = T.ANAMNESIS_KEYWORDS.attention_exec[1];
  const wechslerEngine = {
    ok: true,
    snapshot: {
      indices: {
        VCI: { scaled: 100, percentile: 50 },
        PRI: { scaled: 97, percentile: 42 },
        WMI: { scaled: 85, percentile: 16 },
        PSI: { scaled: 80, percentile: 9 },
      },
      indexScatter: 12,
      substitutes: [],
      computable: { VCI: true, PRI: true, WMI: true, PSI: true, FSIQ: true },
      fsiq: 92,
      gai: null,
      gaiMeta: null,
    },
    main: { id: "ADHD", status: "active", level: "بالا" },
    comorbid: { id: "SLD", status: "active", level: "متوسط" },
    outcomes: [{ id: "MOOD", status: "rejected", level: "بالا", rejectReason: "شواهد هیجانی کافی نیست" }],
    weakDomains: [],
    flags: [],
    monitoringInterval: "",
  };
  const ot = {
    domains: [
      { key: "gross", scored: 6, notYet: 4, withHelp: 1, skills: [{ status: "not_yet", expectedAge: "۶-۸" }] },
      { key: "fine", scored: 5, notYet: 2, withHelp: 1, skills: [] },
      { key: "visual", scored: 4, notYet: 0, withHelp: 1, skills: [] },
      { key: "auditory", scored: 4, notYet: 0, withHelp: 1, skills: [] },
      { key: "cognitive", scored: 4, notYet: 0, withHelp: 1, skills: [] },
      { key: "adl", scored: 0, notYet: 0, withHelp: 0, skills: [] },
      { key: "social", scored: 0, notYet: 0, withHelp: 0, skills: [] },
    ],
  };
  const got = assertEquivalent("rich-multi-informant", {
    events: [
      ev("ce-snap-iv-p-v1", { analysis: { subscaleScores: [ss("ia", 18), ss("hi", 8), ss("odd", 14)] } }),
      ev("ce-snap-iv-t-v1", { analysis: { subscaleScores: [ss("ia", 19), ss("hi", 9), ss("odd", 15)] } }),
      ev("sdq-parent", { analysis: { subscaleScores: [ss("hyper", 6, { color: "danger" }), ss("emo", 5, { color: "danger" }), ss("pros", 3)] } }),
      ev("ce-sdq-t-v1", { analysis: { subscaleScores: [ss("hyper", 6, { color: "danger" })] } }),
      ev("ce-scared-p-v1", { analysis: { score: 27 } }),
      ev("ce-dcdq-v1", { analysis: { score: 55, band: "پرخطر" } }),
      ev("ce-sld-read-v1", { analysis: { score: 14 } }),
      ev("ce-probe-read-v1", { payload: { wcpm: { value: 60 }, text_grade: { value: "دوم" } } }),
      ev("ce-probe-calc-v1", { payload: { digits2min: { value: 20 }, calc_grade: { value: "دوم" } } }),
      ev("ce-anamnesis-v2", {
        payload: {
          chief_complaint: { value: `${attentionKw} و فراموشکاری` },
          family_stress: { value: "جدایی والدین" },
          school_changes: { value: "یک بار مدرسه عوض کرد" },
        },
      }),
    ],
    wechsler: wechslerEngine,
    ot,
    gates: ALL_GATES_DONE,
    child: baseChild,
  });
  assert.ok(got.dataCoverage.percent >= 60);
  const attention = got.constructs.find((c) => c.key === "attention_exec");
  assert.ok(attention.evidenceFa.some((e) => e.signal === "snap_ia_pair"), "parent+teacher agreement pair row");
  assert.ok(got.wechslerLink && got.wechslerLink.iqBasis === "FSIQ");
  assert.ok(got.constructs.find((c) => c.key === "motor_coord").evidenceFa.some((e) => e.toolId === "OtProfile"), "OT delays feed the motor construct evidence");
  // m156 — outcomes/main/comorbid موتور قدیم دیگر خوانده نمی‌شوند: فرضیهٔ ردشدهٔ MOOD به تفریق تشخیصی نمی‌ریزد
  assert.ok(got.differentialsFa.every((d) => !(d.includes("شواهد هیجانی کافی نیست"))), "rejected wechsler outcomes no longer leak into differentials (m156)");
});

test("scenario 8: empty evidence — no events, no wechsler/ot/gates", () => {
  const got = assertEquivalent("empty", {
    events: [],
    wechsler: null,
    ot: null,
    gates: null,
    child: { id: "student-002", ageYears: undefined, grade: null },
  });
  assert.equal(got.primaryProfile.key, "none");
  assert.equal(got.wechslerLink, null);
  assert.equal("otLink" in got, false, "m93.2: dead otLink output removed");
  assert.equal("narrative" in got, false, "m93.2: dead narrative output removed");
  assert.equal(got.dataCoverage.percent, 50, "no gates + no elevated constructs → 0.5*0 + 0.5*1");
});

test("scenario 9: invalid/malformed evidence — unknown tools, pending status, garbage values, duplicate toolKeys, wechsler event in stream", () => {
  const got = assertEquivalent("invalid", {
    events: [
      ev("ce-not-a-tool", { payload: { x: { value: "garbage" } }, analysis: { score: NaN } }),
      ev("ce-snap-iv-p-v1", { status: "pending", analysis: { subscaleScores: [ss("ia", 20)] } }),
      ev("ce-snap-iv-p-v1", { analysis: { subscaleScores: [ss("ia", 13)] } }), // older row of the same tool — engine keeps the FIRST (latest)
      ev("ce-snap-iv-p-v1", { analysis: { subscaleScores: [ss("ia", 17)] } }),
      ev("ce-scared-p-v1", { analysis: null }),
      ev("ce-sld-read-v1", { analysis: { score: "abc" } }), // non-numeric score — deterministic JS coercion path
      ev("ce-wechsler-w4-v1", { payload: {} }), // wechsler also flows through the events stream in production
    ],
    wechsler: ref.wechslerFromEvent({ fsiq: { value: "۸۸" } }),
    ot: null,
    gates: gates(["anamnesis", false], ["behavioral", false], ["wechsler", false], ["skills", false], ["needs", false]),
    child: baseChild,
  });
  // pending event filtered → latest completed SNAP row has ia=13 (warn range 11..15)
  const attention = got.constructs.find((c) => c.key === "attention_exec");
  assert.ok(attention.rawScore > 0);
  assert.ok(attention.evidenceFa.every((e) => !e.textFa.includes("۱۷")), "pending/older SNAP rows must not leak in");
  assert.ok(got.wechslerLink && got.wechslerLink.iqValue === 88, "fsiq ۸۸ → 88 → iq link");
});

test("scenario 10: global cognitive weakness (P12) — low FSIQ + rehab scales + ID outcome + monitoring", () => {
  const cogKw = T.ANAMNESIS_KEYWORDS.general_cog[0];
  const wechslerEngine = {
    ok: true,
    snapshot: {
      indices: {
        VCI: { scaled: 62, percentile: 1 },
        PRI: { scaled: 65, percentile: 1 },
        WMI: { scaled: 61, percentile: 1 },
        PSI: { scaled: 63, percentile: 1 },
      },
      indexScatter: 4,
      substitutes: [],
      computable: { VCI: true, PRI: true, WMI: true, PSI: true, FSIQ: true },
      fsiq: 64,
      gai: null,
      gaiMeta: null,
    },
    main: { id: "ID", status: "active", level: "بالا" },
    comorbid: null,
    outcomes: [],
    weakDomains: [],
    flags: [],
    monitoringInterval: "۶ ماه",
  };
  const got = assertEquivalent("p12-global-weak", {
    events: [
      ev("ce-rehab-cog-v1", {
        analysis: {
          subscaleScores: [
            ss("att", 13, { max: 15 }),
            ss("exec", 12, { max: 15 }),
            ss("ps", 13, { max: 15 }),
            ss("mem", 12, { max: 15 }),
            ss("per", 11, { max: 15 }),
          ],
        },
      }),
      ev("ce-rehab-motor-v1", {
        analysis: {
          subscaleScores: [
            ss("gross", 12, { max: 15 }),
            ss("bal", 12, { max: 15 }),
            ss("fine", 13, { max: 15 }),
            ss("eye", 12, { max: 15 }),
            ss("post", 12, { max: 15 }),
          ],
        },
      }),
      ev("ce-anamnesis-v2", { payload: { development: { value: `${cogKw} و دیر راه رفت` } } }),
    ],
    wechsler: wechslerEngine,
    ot: null,
    gates: ALL_GATES_DONE,
    child: { ...baseChild, ageYears: 6 },
  });
  const p12 = got.patterns.find((p) => p.key === "P12_GLOBAL_WEAK");
  assert.equal(p12.status, "active");
  assert.ok(got.redFlags.some((f) => f.key === "iq_low"));
  assert.equal(got.protocolSuggestion.protocol, "rehab");
  assert.equal(got.monitoring.intervalMonths, 3, "red flag (iq_low, non-urgent) beats the wechsler monitoring interval → 3 months");
  assert.ok(got.constructs.find((c) => c.key === "general_cog").rawScore > 0);
});
