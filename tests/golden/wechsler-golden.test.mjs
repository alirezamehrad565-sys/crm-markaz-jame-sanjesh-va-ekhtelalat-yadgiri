// wechsler-golden.test.mjs — GOLDEN equivalence test (phase 0 / task 39-d1)
//
// Proves that the extracted engine (src/domain/wechsler-engine/engine.js) produces
// EXACTLY the same output as the production bundle engine for every case.
//
// Reference implementation: tests/golden/bundle-wechsler-ref.cjs — GENERATED from
// worker/bundle.js lines 21120-24656 (commit 365d103, m130 / 1.00.9, engineVersion
// "m98") by tests/golden/extract-engine.mjs. The reference is the real bundle code,
// so it cannot drift from production.
//
// Run:  node --test tests/golden/
// Regenerate reference after bundle changes:  node tests/golden/extract-engine.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

import * as extracted from "../../src/domain/wechsler-engine/engine.js";
// T1 (m146) — قرارداد لایهٔ سیگنال برای تست هم‌خوانی دو جدول بازهٔ FSIQ (Node 24: strip-types)
import { FSIQ_BAND_RANGES, fsiqBandOf as fsiqBandOfContract } from "../../src/domain/clinical-engine/signals.ts";

const require = createRequire(import.meta.url);
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ref = require(path.join(HERE, "bundle-wechsler-ref.cjs"));

// ---------------------------------------------------------------------------
// Stable deep serializer: deterministic, key-sorted, undefined-safe, NaN-safe.
// Two engine outputs are "exactly equal" iff their stable serializations match.
// ---------------------------------------------------------------------------
function stable(v) {
  if (v === undefined) return "\u0000undefined";
  if (v === null) return "null";
  const t = typeof v;
  if (t === "boolean") return v ? "true" : "false";
  if (t === "number") {
    if (Number.isNaN(v)) return "NaN";
    if (!Number.isFinite(v)) return v > 0 ? "Infinity" : "-Infinity";
    return JSON.stringify(v);
  }
  if (t === "string") return JSON.stringify(v);
  if (t === "function") return `fn:${v.name || "anon"}`;
  if (t === "symbol") return String(v);
  if (t === "bigint") return `${v}n`;
  if (Array.isArray(v)) return `[${v.map((x) => stable(x)).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}

/** Assert two engine outputs are exactly equal, with a readable diff on failure. */
function assertSame(name, a, b) {
  const sa = stable(a);
  const sb = stable(b);
  if (sa === sb) return;
  let i = 0;
  while (i < sa.length && sa[i] === sb[i]) i++;
  const ctx = 160;
  const msg =
    `[${name}] extracted vs reference outputs differ\n` +
    `  first divergence at char ${i}\n` +
    `  extracted : …${sa.slice(Math.max(0, i - ctx / 2), i + ctx)}…\n` +
    `  reference : …${sb.slice(Math.max(0, i - ctx / 2), i + ctx)}…`;
  assert.fail(msg);
}

// ---------------------------------------------------------------------------
// Helpers to build realistic raw-score profiles from the actual norms tables.
// rawForScaled returns the raw score whose scaled score is closest to `target`
// in the given age band, so profiles are always inside the band's valid range.
// ---------------------------------------------------------------------------
const CODES = extracted.SUBTEST_CODES;
const INVALID = "\u0646\u0627\u0645\u0639\u062A\u0628\u0631"; // "نامعتبر" — engine's invalid marker

function rawForScaled(years, code, target) {
  const band = extracted.bandForAge(years);
  const pairs = extracted.NORMS.bands[band]?.[code] ?? [];
  if (!pairs.length) return 0;
  let best = pairs[0];
  for (const p of pairs) {
    if (Math.abs(p[1] - target) < Math.abs(best[1] - target)) best = p;
  }
  return best[0];
}

function profile(years, targets = {}, drop = []) {
  const out = {};
  for (const c of CODES) out[c] = rawForScaled(years, c, targets[c] ?? 10);
  for (const c of drop) delete out[c];
  return out;
}

const CORES = ["SI", "VC", "CO", "BD", "PCn", "MR", "DS", "LN", "CD", "SS"];
const SUBSTITUTES = ["IN", "WR", "PCm", "CA", "AR"];

// ---------------------------------------------------------------------------
// Golden cases — direct engine API (runWechslerAnalysis)
// ---------------------------------------------------------------------------
const directCases = [
  {
    name: "age 6 — balanced profile (sq-6, first native band)",
    birth: [1400, 3, 15],
    test: [1406, 4, 20],
    raw: profile(6),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 6);
      assert.equal(r.validation.band, "sq-6");
      assert.equal(typeof r.snapshot.fsiq, "number");
      // m156 — خوانش مستقل روان‌سنجی: نیم‌رخ همگن، بدون هیچ فرضیه‌ای
      assert.ok(r.psychometrics, "psychometrics reading expected");
      assert.equal(r.psychometrics.scatter.homogeneous, true, "balanced profile is homogeneous");
      assert.ok(r.psychometrics.summaryFa.includes("هوش‌بهر کل"), "summaryFa names FSIQ");
      assert.equal(r.psychometrics.patterns.length, 0, "no score-pattern on a balanced profile");
      assert.equal(r.hypotheses, undefined, "hypotheses are gone from the engine output (m156)");
      // m159 — بلوک پردازش: چهار مرحله، همهٔ «متوسط» در نیم‌رخ متوازن؛ بدون جهت‌گیری توان/کارایی
      assert.equal(r.psychometrics.processing.length, 4, "processing block covers four stages");
      for (const p of r.psychometrics.processing) {
        assert.equal(p.level, "متوسط", "balanced profile — every stage average");
        assert.ok(p.implicationFa.length > 10, "each stage carries an educational implication");
      }
      assert.equal(r.psychometrics.abilityProficiency, null, "no ability/proficiency split on a balanced profile");
      assert.equal(r.psychometrics.scatterWithin.length, 0, "no intraindex scatter on a balanced profile");
    }
  },
  {
    name: "m159 — ability above proficiency split (strong VCI/PRI vs weak WMI/PSI)",
    birth: [1396, 3, 15],
    test: [1406, 4, 20],
    raw: profile(10, { SI: 14, VC: 13, CO: 13, IN: 13, BD: 13, PCn: 12, MR: 13, DS: 6, LN: 6, AR: 6, CD: 6, SS: 6 }),
    expect(r) {
      assert.equal(r.ok, true);
      const ps = r.psychometrics;
      // بلوک پردازش — سطح هنجاری: توان قوت، کارایی ضعف
      assert.equal(ps.processing.length, 4, "processing block covers four stages");
      const wmi = ps.processing.find((p) => p.key === "WMI");
      const psi = ps.processing.find((p) => p.key === "PSI");
      const vci = ps.processing.find((p) => p.key === "VCI");
      assert.equal(wmi.level, "ضعف");
      assert.equal(psi.level, "ضعف");
      assert.equal(vci.level, "قوت");
      // جهت‌گیری توان/کارایی — گپ ≥۱۰ → کارایی ضعیف‌تر
      assert.ok(ps.abilityProficiency, "ability/proficiency split expected");
      assert.equal(ps.abilityProficiency.direction, "proficiency_weaker");
      assert.ok(ps.abilityProficiency.gap >= 10, "gap crosses the 10-point threshold");
      assert.ok(ps.summaryFa.includes("توان بالاتر از کارایی"), "summary carries the split sentence");
      // الگوی CAD هم‌زمان فعال (AR/CD/DS ضعیف؛ IN جزو توان کلامی بالا) — بلوک اختصاصی خودش
      assert.deepEqual(ps.patterns.map((p) => p.key), ["CAD"]);
    }
  },
  {
    name: "age 7 — day-level boundary (7y0m6d, sq-7)",
    birth: [1399, 12, 29],
    test: [1407, 1, 5],
    raw: profile(7),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 7);
      assert.equal(r.validation.band, "sq-7");
      assert.match(r.ageLine, /۷/); // ageLine is Persian-digit "۷ سال و …"
    }
  },
  {
    name: "age 10 — typical slightly uneven profile (sq-10)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, { DS: 11, CD: 9 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 10);
      assert.equal(r.validation.band, "sq-10");
      assert.equal(typeof r.snapshot.fsiq, "number");
    }
  },
  {
    name: "age 14 — last native norms band (sq-14)",
    birth: [1392, 2, 10],
    test: [1406, 5, 1],
    raw: profile(14, { SI: 13, VC: 12, MR: 11 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 14);
      assert.equal(r.validation.band, "sq-14");
    }
  },
  {
    name: "age 15 — clamped down to sq-14 norms (band 15 does not exist)",
    birth: [1391, 2, 10],
    test: [1406, 3, 1],
    raw: profile(15, { SI: 12, VC: 13, MR: 10 }),
    expect(r) {
      assert.equal(r.ok, true, "age 15 is within MAX_AGE=16");
      assert.equal(r.validation.years, 15);
      assert.equal(r.validation.band, "sq-14", "ages 15-16 must clamp to the sq-14 table");
    }
  },
  {
    name: "age 16 — clamped to sq-14 norms (top of the supported range)",
    birth: [1390, 6, 20],
    test: [1406, 7, 10],
    raw: profile(16, { SI: 12, VC: 13, MR: 10 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 16);
      assert.equal(r.validation.band, "sq-14");
    }
  },
  {
    name: "age 17 — above MAX_AGE: age error, no analysis",
    birth: [1389, 6, 20],
    test: [1406, 7, 10],
    raw: profile(16),
    expect(r) {
      assert.equal(r.ok, false);
      assert.equal(r.snapshot, null);
      assert.equal(r.analysis, null);
      assert.equal(r.validation.errors[0].kind, "age");
      assert.equal(r.validation.errors[0].value, "17");
    }
  },
  {
    name: "VCI ≫ PRI — index scatter ≥ 23, GAI invalid under strict mode",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, { SI: 16, VC: 16, CO: 15, IN: 14, WR: 15, BD: 4, PCn: 5, MR: 5, PCm: 4 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.analysis.gai.validity, INVALID, "VCI/PRI gap > 23 invalidates GAI");
      assert.equal(r.analysis.gai.scaled, INVALID, "strict mode reports INVALID instead of a number");
      assert.equal(r.snapshot.gai, null);
      assert.ok(r.flags.some((f) => f.id === "scatter"), "between-index scatter flag must fire");
      assert.ok(r.snapshot.indexScatter >= 23);
    }
  },
  {
    name: "strict:false — same gap, GAI computed from the norms table anyway",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, { SI: 16, VC: 16, CO: 15, IN: 14, WR: 15, BD: 4, PCn: 5, MR: 5, PCm: 4 }),
    opts: { strict: false },
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.analysis.gai.validity, INVALID);
      assert.equal(typeof r.analysis.gai.scaled, "number", "non-strict mode still computes GAI");
      assert.equal(typeof r.snapshot.gai, "number");
      assert.notEqual(r.snapshot.gaiMeta, null);
      assert.equal(r.analysis.strict, false);
    }
  },
  {
    name: "ACID profile — AR/CD/IN/DS all ≤ 7 (score-pattern reading, m156: بدون سناریو)",
    birth: [1394, 5, 2],
    test: [1406, 7, 1],
    raw: profile(12, { AR: 5, CD: 5, IN: 5, DS: 5 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.ok(r.psychometrics, "psychometrics reading expected");
      assert.deepEqual(r.psychometrics.patterns.map((p) => p.key), ["ACID"], "ACID score-pattern detected");
      assert.equal(r.hypotheses, undefined, "no hypothesis scenarios (m156)");
    }
  },
  {
    name: "missing subtests — only the 10 core subtests administered",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, {}, SUBSTITUTES),
    expect(r) {
      assert.equal(r.ok, true);
      assert.deepEqual([...r.validation.missing].sort(), [...SUBSTITUTES].sort());
      for (const k of ["VCI", "PRI", "WMI", "PSI", "FSIQ"]) {
        assert.equal(r.validation.computable[k], true, `${k} computable from cores only`);
      }
      assert.deepEqual(r.snapshot.substitutes, []);
    }
  },
  {
    name: "missing cores — substitutes administered instead (index built on substitutes)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, {}, CORES),
    expect(r) {
      assert.equal(r.ok, true);
      assert.deepEqual([...r.validation.missing].sort(), [...CORES].sort());
      assert.ok(r.snapshot.substitutes.length >= 1, "substitute-built indices must be flagged");
      assert.ok(r.flags.some((f) => f.id.startsWith("missing_") || f.id.startsWith("substitute_")));
    }
  },
  {
    name: "zero raw scores everywhere (floors of the norms tables)",
    birth: [1397, 4, 4],
    test: [1406, 6, 30],
    raw: Object.fromEntries(CODES.map((c) => [c, 0])),
    expect(r) {
      assert.equal(r.ok, true, "raw 0 is the table minimum, not an error");
      assert.equal(r.validation.years, 9);
      assert.equal(r.snapshot.subtests.length, 15);
    }
  },
  {
    name: "out-of-range raw scores — huge (999) and negative (-3)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: { ...profile(10), SI: 999, BD: -3 },
    expect(r) {
      assert.equal(r.ok, false);
      const kinds = r.validation.errors.map((e) => e.kind);
      assert.ok(kinds.every((k) => k === "raw_range"));
      const badCodes = r.validation.errors.map((e) => e.code).sort();
      assert.deepEqual(badCodes, ["BD", "SI"]);
      assert.ok(r.validation.missing.includes("SI"));
      assert.ok(r.validation.missing.includes("BD"));
    }
  },
  {
    name: "non-integer raw score (direct API bypass of form normalization)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: { ...profile(10), SI: 3.7 },
    expect(r) {
      assert.equal(r.ok, false);
      assert.equal(r.validation.errors[0].kind, "raw_range");
      assert.match(r.validation.errors[0].message, /عدد صحیح/);
    }
  },
  {
    name: "birth date after test date — date error",
    birth: [1400, 1, 1],
    test: [1399, 12, 1],
    raw: profile(10),
    expect(r) {
      assert.equal(r.ok, false);
      assert.equal(r.validation.errors[0].kind, "date");
    }
  },
  {
    name: "baseAnswers + skippedHypotheses — m156: قرارداد ورودی پذیرفته و نادیده گرفته می‌شود؛ خروجی فقط روان‌سنجی",
    birth: [1394, 5, 2],
    test: [1406, 7, 1],
    raw: profile(12, { AR: 5, CD: 5, IN: 5, DS: 5 }),
    opts: {
      baseAnswers: { BQ4: "yes" },
      skippedHypotheses: ["MOOD"]
    },
    expect(r) {
      assert.equal(r.ok, true);
      assert.ok(r.psychometrics, "psychometrics reading expected");
      assert.deepEqual(r.psychometrics.patterns.map((p) => p.key), ["ACID"], "ACID pattern intact");
      // لایهٔ فرضیه/تفسیر موازی حذف شده — هیچ‌کدام از این کلیدها دیگر تولید نمی‌شوند
      for (const k of ["hypotheses", "queue", "answers", "autoNotes", "outcomes", "main", "comorbid", "binaryScenarios", "treatments"]) {
        assert.ok(!(k in r), `result must NOT carry the removed key ${k}`);
      }
    }
  }
];

// ---------------------------------------------------------------------------
// Golden cases — form payload API (applyWechslerEngineToPayload)
// ---------------------------------------------------------------------------
const OCCURRED_AT = "2026-02-14T09:30:00.000Z"; // → Jalali 1404-11-25

const payloadCases = [
  {
    name: "canonical payload — latin + Persian digits, spaces, full 15 subtests",
    payload: {
      test_date: { value: "1405/08/12", label: "تاریخ اجرا" },
      raw_si: { value: "12" },
      raw_vc: { value: "۱۴" },
      raw_co: { value: " 9 " },
      raw_in: { value: "10" },
      raw_wr: { value: "11" },
      raw_bd: { value: "13" },
      raw_pcn: { value: "8" },
      raw_mr: { value: "10" },
      raw_pcm: { value: "9" },
      raw_ds: { value: "7" },
      raw_ln: { value: "6" },
      raw_ar: { value: "5" },
      raw_cd: { value: "12" },
      raw_ss: { value: "10" },
      raw_ca: { value: "9" }
    },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, true);
      assert.deepEqual(h.result.validation.testDate, [1405, 8, 12]);
      assert.equal(typeof h.computed.fsiq, "number");
      const out = JSON.parse(h.payload.engine_output.value);
      assert.equal(out.engineVersion, "m98");
      assert.equal(out.compact, true);
      assert.equal(h.payload.age_at_test.value, h.result.ageLine);
      assert.equal(h.payload.fsiq.value, String(h.computed.fsiq));
    }
  },
  {
    name: "legacy field names only (raw_sim/raw_voc/raw_com/raw_pc)",
    payload: {
      test_date: { value: "1405/08/12" },
      raw_sim: { value: "12" },
      raw_voc: { value: "14" },
      raw_com: { value: "9" },
      raw_pc: { value: "13" }
    },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      const raw = h.result.validation.raw;
      assert.deepEqual(Object.keys(raw).sort(), ["CO", "PCn", "SI", "VC"]);
      assert.equal(raw.SI, 12);
      assert.equal(raw.PCn, 13);
    }
  },
  {
    name: "QUIRK LOCK: legacy raw_sim silently overwrites canonical raw_si on collision",
    payload: {
      test_date: { value: "1405/08/12" },
      raw_si: { value: "8" },
      raw_sim: { value: "5" }
    },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.validation.raw.SI, 5, "RAW_FIELD_MAP iteration order means the LEGACY value wins");
    }
  },
  {
    name: "missing test_date → test date falls back to occurred_at (2026-02-14 → 1404-11-25)",
    payload: { raw_si: { value: "12" }, raw_vc: { value: "14" }, raw_bd: { value: "13" } },
    birth: "1398/03/25",
    occurredAt: OCCURRED_AT,
    expect(h) {
      assert.equal(h.ran, true);
      assert.deepEqual(h.result.validation.testDate, [1404, 11, 25]);
    }
  },
  {
    name: "invalid test_date (month 13, day 40) → occurred_at fallback",
    payload: { test_date: { value: "1406/13/40" }, raw_si: { value: "12" }, raw_bd: { value: "13" } },
    birth: "1398/03/25",
    occurredAt: OCCURRED_AT,
    expect(h) {
      assert.equal(h.ran, true);
      assert.deepEqual(h.result.validation.testDate, [1404, 11, 25]);
    }
  },
  {
    name: "no test_date and garbage occurred_at → Jalali shape error",
    payload: { raw_si: { value: "12" }, raw_bd: { value: "13" } },
    birth: "1398/03/25",
    occurredAt: "not-a-date",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, false);
      assert.equal(h.result.validation.errors[0].kind, "shape");
    }
  },
  {
    name: "unparsable birth date → engine error branch (hook would throw)",
    payload: { test_date: { value: "1405/08/12" }, raw_si: { value: "12" }, raw_vc: { value: "14" } },
    birth: "نامشخص",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, false);
      assert.equal(h.result.snapshot, null);
      assert.equal(h.result.validation.errors[0].kind, "shape");
      assert.match(h.result.validation.errors[0].message, /تاریخ تولد/);
      assert.equal(typeof h.payload.engine_output.value, "string");
      assert.equal(JSON.parse(h.payload.engine_output.value).ok, false);
    }
  },
  {
    name: "gregorian ISO birth date → converted to Jalali (2019-08-03 → 1398-05-12)",
    payload: { test_date: { value: "1405/08/12" }, raw_si: { value: "12" }, raw_vc: { value: "14" } },
    birth: "2019-08-03",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, true);
      assert.deepEqual(h.result.validation.birthDate, [1398, 5, 12]);
      assert.match(h.result.ageLine, /^۷ سال/);
    }
  },
  {
    name: "empty payload → ran:false, payload passed through untouched (same reference)",
    payload: { interpretation: { value: "توضیح WITHOUT raw scores" } },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, false);
      assert.equal(h.result, null);
      assert.deepEqual(h.computed, { fsiq: null, vci: null, pri: null, wmi: null, psi: null, gai: null, ageLine: "" });
    },
    sameReference: true
  },
  {
    name: "non-numeric field values silently dropped; numeric ones kept",
    payload: { test_date: { value: "1405/08/12" }, raw_si: { value: "abc" }, raw_bd: { value: "7" } },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      assert.deepEqual(Object.keys(h.result.validation.raw), ["BD"]);
      assert.ok("engine_output" in h.payload);
      assert.equal(
        h.payload.raw_si.value,
        "abc",
        "QUIRK: non-numeric raw fields are silently ignored by the engine but remain in the payload untouched"
      );
    }
  }
];

// ---------------------------------------------------------------------------
// Run the golden comparisons
// ---------------------------------------------------------------------------
for (const c of directCases) {
  test(`direct | ${c.name}`, () => {
    const input = {
      rawScores: c.raw,
      testDate: c.test,
      birthDate: c.birth,
      ...(c.opts ?? {})
    };
    const a = extracted.runWechslerAnalysis(input);
    const b = ref.runWechslerAnalysis(input);
    assertSame(c.name, a, b);
    c.expect(b); // sanity assertions against the REFERENCE (bundle) output
  });
}

for (const c of payloadCases) {
  test(`payload | ${c.name}`, () => {
    const occurredAt = c.occurredAt ?? OCCURRED_AT;
    const a = extracted.applyWechslerEngineToPayload(c.payload, c.birth, occurredAt);
    const b = ref.applyWechslerEngineToPayload(c.payload, c.birth, occurredAt);
    assertSame(c.name, a, b);
    if (c.sameReference) assert.equal(a.payload, c.payload, "passthrough must return the same payload object");
    c.expect(b);
  });
}

// ---------------------------------------------------------------------------
// Meta: data tables themselves must be identical between bundle and extraction
// ---------------------------------------------------------------------------
test("meta | data tables identical (NORMS, maps) — T8 (m149): جدول‌های تفسیر موازی حذف شدند", () => {
  for (const table of [
    "NORMS",
    "RAW_FIELD_MAP",
    "SUBTESTS",
    "SUBTEST_FA",
    "SUBTEST_FA_OK",
    "INDEX_MEMBERS",
    "GAI_MEMBERS",
    "WISC4_EVENT_KEY"
  ]) {
    assertSame(table, extracted[table], ref[table]);
  }
  // T8 (m149) — این دو دیگر در سطح موتور وجود ندارند
  assert.equal("HYPOTHESES" in extracted, false, "HYPOTHESES removed from the engine module");
  assert.equal("TREATMENTS" in extracted, false, "TREATMENTS removed from the engine module");
});

test("meta | both modules agree on constants and engineVersion", () => {
  assert.equal(extracted.WISC4_EVENT_KEY, "ce-wechsler-w4-v1");
  assert.equal(extracted.MIN_AGE, 6);
  assert.equal(extracted.MAX_AGE, 16);
  assert.equal(extracted.NORM_MIN_AGE, 6);
  assert.equal(extracted.NORM_MAX_BAND, 14);
  const probe = { raw_si: { value: "10" } };
  const compact = extracted.compactWechslerOutput(
    extracted.applyWechslerEngineToPayload(probe, "1398/03/25", OCCURRED_AT).result
  );
  assert.equal(compact.engineVersion, "m98");
  assert.equal(Object.keys(extracted).length > 0, true);
});

// ---------------------------------------------------------------------------
// T1 (m146) — لایهٔ سیگنال بالینی (افزودنی) — بدون دست‌زدن به کیس‌های بالا
// ---------------------------------------------------------------------------

const T1_PROFILES = {
  balanced: profile(10),
  acid: profile(12, { AR: 5, CD: 5, IN: 5, DS: 5 }),
  scattered: profile(10, { SI: 16, VC: 16, CO: 15, IN: 14, WR: 15, BD: 4, PCn: 5, MR: 5, PCm: 4 }),
  vciWeak: profile(10, { SI: 4, VC: 4, CO: 4, IN: 4, WR: 4 })
};

function t1Run(raw, opts = {}) {
  return extracted.runWechslerAnalysis({
    rawScores: raw,
    testDate: [1406, 9, 15],
    birthDate: [1396, 8, 10],
    ...opts
  });
}

test("signals | قطعیت: دو اجرای پیاپی سیگنال و پروفایل یکسان می‌دهد (باندل هم همین است)", () => {
  const input = { rawScores: T1_PROFILES.acid, testDate: [1406, 7, 1], birthDate: [1394, 5, 2] };
  const a = extracted.runWechslerAnalysis(input);
  const b = extracted.runWechslerAnalysis(input);
  const c = ref.runWechslerAnalysis(input);
  assertSame("signals determinism (extracted)", a.signals, b.signals);
  assertSame("profile determinism (extracted)", a.profile, b.profile);
  assertSame("signals parity (extracted vs bundle)", a.signals, c.signals);
  assertSame("profile parity (extracted vs bundle)", a.profile, c.profile);
  assert.ok(a.signals.length > 0, "ACID profile must emit signals");
});

test("signals | فقط از دادهٔ snapshot/analysis ساخته می‌شوند — فراخوانی مستقلِ تابع خالص همان خروجی است", () => {
  for (const raw of Object.values(T1_PROFILES)) {
    const r = t1Run(raw);
    const slice = { ok: r.ok, snapshot: r.snapshot, analysis: r.analysis, flags: r.flags };
    assertSame("profileSignals pure", extracted.profileSignals(slice), r.signals);
    assertSame("buildWechslerProfile pure", extracted.buildWechslerProfile(slice), r.profile);
  }
});

test("signals | snapshot نامعتبر (ok:false یا خالی) → آرایهٔ خالی و profile:null", () => {
  const r = extracted.runWechslerAnalysis({
    rawScores: profile(16), // سن ۱۷ — خطای سنی → ok:false
    testDate: [1406, 7, 10],
    birthDate: [1389, 6, 20]
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.signals, []);
  assert.equal(r.profile, null);
  assert.deepEqual(extracted.profileSignals(null), []);
  assert.deepEqual(extracted.profileSignals({ ok: false, snapshot: null, analysis: null, flags: [] }), []);
  assert.equal(extracted.buildWechslerProfile(null), null);
  assert.equal(extracted.buildWechslerProfile({ ok: false, snapshot: null, analysis: null, flags: [] }), null);
});

test("signals | کیس ACID → سیگنال profile.acid با value>0 (و CAD زیرمجموعه، فعال)", () => {
  const r = extracted.runWechslerAnalysis({
    rawScores: T1_PROFILES.acid,
    testDate: [1406, 7, 1],
    birthDate: [1394, 5, 2]
  });
  const acid = r.signals.find((s) => s.key === "profile.acid");
  assert.ok(acid, "profile.acid signal expected");
  assert.ok(acid.value > 0 && acid.value <= 1, "acid value in (0,1]");
  assert.equal(acid.domain, "academic");
  assert.equal(acid.source, "wechsler");
  assert.ok(acid.fa.includes("ACID"), "fa must name the pattern");
  assert.ok(r.profile.acid, "profile.acid object expected");
  assert.deepEqual(r.profile.acid.codes, ["AR", "CD", "IN", "DS"]);
  assert.ok(r.profile.cad, "CAD (AR/CD/DS ⊂ ACID) must be active too");
});

test("signals | کیس پراکنده → validity.scatter فعال + cog_level.gai_invalid", () => {
  const r = t1Run(T1_PROFILES.scattered);
  assert.ok(r.snapshot.indexScatter >= 23);
  const sc = r.signals.find((s) => s.key === "validity.scatter");
  assert.ok(sc, "validity.scatter expected");
  assert.equal(sc.domain, "validity");
  assert.equal(sc.value, 1);
  const gai = r.signals.find((s) => s.key === "cog_level.gai_invalid");
  assert.ok(gai, "gai_invalid expected when VCI/PRI gap > 23");
  assert.equal(r.profile.gaiValidity, INVALID);
  assert.equal(r.profile.gai, null, "strict mode → GAI number suppressed");
});

test("signals | گام ۵: ضعف/قوت شخصی از خروجی موجود گام ۵ سیگنال می‌شود", () => {
  const weak = t1Run(T1_PROFILES.vciWeak);
  assert.ok(weak.snapshot.step5Weak.length >= 1, "VCI must be a personal weakness here");
  for (const k of weak.snapshot.step5Weak) {
    const s = weak.signals.find((x) => x.key === `cog_level.step5_weak.${k}`);
    assert.ok(s, `step5_weak.${k} signal expected`);
    assert.ok(s.value > 0 && s.value <= 1);
    assert.equal(s.domain, "cognitive_level");
  }
  const acid = extracted.runWechslerAnalysis({ rawScores: T1_PROFILES.acid, testDate: [1406, 7, 1], birthDate: [1394, 5, 2] });
  for (const k of acid.snapshot.step5Strong) {
    const s = acid.signals.find((x) => x.key === `cog_level.step5_strong.${k}`);
    assert.ok(s, `step5_strong.${k} signal expected`);
  }
});

test("signals | ترتیب قطعی (کلیدمرتب) + قید ۰..۱ + fa فارسی در همهٔ پروفایل‌ها", () => {
  for (const [name, raw] of Object.entries(T1_PROFILES)) {
    const r = t1Run(raw);
    const keys = r.signals.map((s) => s.key);
    assert.deepEqual(keys, [...keys].sort(), `${name}: signals must be key-sorted`);
    for (const s of r.signals) {
      assert.ok(Number.isFinite(s.value) && s.value >= 0 && s.value <= 1, `${name}/${s.key}: value in 0..1`);
      assert.equal(s.source, "wechsler", `${name}/${s.key}: source`);
      assert.ok(typeof s.fa === "string" && s.fa.length > 10, `${name}/${s.key}: fa text present`);
    }
  }
});

test("fsiqBand | پروفایل واقعی: BIF~۷۸ / LOW_BORDER~۸۷ / AVERAGE~۱۰۵ + هم‌خوانی با fsiqBandOf", () => {
  const bandCases = [
    { name: "BIF", base: 7, delta: +1, k: 2, wantFsiq: 78, wantBand: "BIF" },
    { name: "LOW_BORDER", base: 9, delta: -1, k: 6, wantFsiq: 87, wantBand: "LOW_BORDER" },
    { name: "AVERAGE", base: 11, delta: -1, k: 3, wantFsiq: 105, wantBand: "AVERAGE" }
  ];
  for (const bc of bandCases) {
    const targets = {};
    for (const code of CODES) targets[code] = bc.base;
    for (let i = 0; i < bc.k; i++) targets[CODES[i]] = bc.base + bc.delta;
    const raw = {};
    for (const code of CODES) raw[code] = rawForScaled(10, code, targets[code]);
    const r = extracted.runWechslerAnalysis({ rawScores: raw, testDate: [1406, 9, 15], birthDate: [1396, 8, 10] });
    assert.equal(r.ok, true);
    assert.equal(r.snapshot.fsiq, bc.wantFsiq, `${bc.name}: pinned fsiq`);
    assert.equal(r.profile.fsiqBand, bc.wantBand, `${bc.name}: profile.fsiqBand`);
    const sig = r.signals.find((s) => s.key === "cog_level.fsiq_band");
    assert.ok(sig, `${bc.name}: fsiq_band signal expected`);
    assert.equal(extracted.fsiqBandOf(r.snapshot.fsiq), bc.wantBand, `${bc.name}: engine fsiqBandOf`);
    assert.equal(fsiqBandOfContract(r.snapshot.fsiq), bc.wantBand, `${bc.name}: contract fsiqBandOf`);
  }
});

test("fsiqBand | هم‌خوانی دو جدول: FSIQ_BANDS موتور ≡ FSIQ_BAND_RANGES قرارداد (ضد واگرایی آینده)", () => {
  assert.equal(extracted.FSIQ_BANDS.length, FSIQ_BAND_RANGES.length, "same row count");
  for (let i = 0; i < FSIQ_BAND_RANGES.length; i++) {
    const a = FSIQ_BAND_RANGES[i];
    const b = extracted.FSIQ_BANDS[i];
    assert.deepEqual(
      { band: b.band, min: b.min, max: b.max, fa: b.fa },
      { band: a.band, min: a.min, max: a.max, fa: a.fa },
      `FSIQ band row ${i} must be identical in engine and signals.ts`
    );
  }
  for (let v = 0; v <= 200; v++) {
    assert.equal(extracted.fsiqBandOf(v), fsiqBandOfContract(v), `fsiqBandOf(${v}) must agree`);
  }
  assert.equal(extracted.fsiqBandOf(-5), "ID", "negative → ID (conservative)");
});

test("fsiqBand | مرزهای بازه‌ها دقیق‌اند (۶۹/۷۰/۸۴/۸۵/۸۹/۹۰/۱۰۹/۱۱۰/۱۱۹/۱۲۰/۱۲۹/۱۳۰)", () => {
  const edges = [
    [69, "ID"], [70, "BIF"], [84, "BIF"], [85, "LOW_BORDER"], [89, "LOW_BORDER"],
    [90, "AVERAGE"], [109, "AVERAGE"], [110, "HIGH_AVERAGE"], [119, "HIGH_AVERAGE"],
    [120, "SUPERIOR"], [129, "SUPERIOR"], [130, "GIFTED"], [200, "GIFTED"]
  ];
  for (const [v, want] of edges) {
    assert.equal(extracted.fsiqBandOf(v), want, `engine fsiqBandOf(${v})`);
    assert.equal(fsiqBandOfContract(v), want, `contract fsiqBandOf(${v})`);
  }
});

test("meta | compact هنوز engineVersion m98 و compact:true است و signals/profile افزودنی دارد", () => {
  const input = { rawScores: T1_PROFILES.balanced, testDate: [1406, 9, 15], birthDate: [1396, 8, 10] };
  const compact = extracted.compactWechslerOutput(extracted.runWechslerAnalysis(input));
  assert.equal(compact.compact, true);
  assert.equal(compact.engineVersion, "m98");
  for (const k of ["ok", "ageLine", "years", "band", "validation", "snapshot", "flags", "weakDomains", "monitoringInterval"]) {
    assert.ok(k in compact, `compact keeps legacy key ${k}`);
  }
  // T8 (m149) + m156 — لایهٔ فرضیه‌ای به‌کلی حذف شد؛ psychometrics خوانش مستقل نیم‌رخ است
  for (const k of ["hypotheses", "outcomes", "main", "comorbid", "binaryScenarios", "treatments", "queue", "answers", "autoNotes"]) {
    assert.ok(!(k in compact), `compact must NOT carry the removed key ${k}`);
  }
  assert.ok(compact.psychometrics && typeof compact.psychometrics.summaryFa === "string", "compact.psychometrics additive");
  assert.ok(Array.isArray(compact.psychometrics.indices), "psychometrics.indices array");
  assert.ok(Array.isArray(compact.signals) && compact.signals.length > 0, "compact.signals additive");
  assert.ok(compact.profile && typeof compact.profile.fsiqBand === "string", "compact.profile additive");
  const refCompact = ref.compactWechslerOutput(ref.runWechslerAnalysis(input));
  assertSame("compact parity (extracted vs bundle)", compact, refCompact);
});

test("payload | engine_output فرم واقعی شامل signals/profile است و کلیدهای قدیمی فرم حفظمانند", () => {
  const payload = {
    test_date: { value: "1405/08/12", label: "تاریخ اجرا" },
    raw_si: { value: "12" },
    raw_vc: { value: "۱۴" },
    raw_co: { value: " 9 " },
    raw_in: { value: "10" },
    raw_wr: { value: "11" },
    raw_bd: { value: "13" },
    raw_pcn: { value: "8" },
    raw_mr: { value: "10" },
    raw_pcm: { value: "9" },
    raw_ds: { value: "7" },
    raw_ln: { value: "6" },
    raw_ar: { value: "5" },
    raw_cd: { value: "12" },
    raw_ss: { value: "10" },
    raw_ca: { value: "9" }
  };
  const h = extracted.applyWechslerEngineToPayload(payload, "1398/03/25", OCCURRED_AT);
  assert.equal(h.ran, true);
  const out = JSON.parse(h.payload.engine_output.value);
  assert.equal(out.engineVersion, "m98");
  assert.equal(out.compact, true);
  assert.ok(Array.isArray(out.signals));
  assert.ok(out.profile && "fsiqBand" in out.profile);
  // کلیدهای قدیمی compact در خروجی فرم هم هستند (T8/m149 + m156: بدون لایهٔ فرضیه‌ای)
  for (const k of ["ok", "ageLine", "years", "band", "validation", "snapshot", "flags", "weakDomains", "monitoringInterval"]) {
    assert.ok(k in out, `engine_output keeps legacy key ${k}`);
  }
  for (const k of ["hypotheses", "outcomes", "main", "comorbid", "binaryScenarios", "treatments", "queue", "answers", "autoNotes"]) {
    assert.ok(!(k in out), `engine_output must NOT carry the removed key ${k}`);
  }
  assert.ok(out.psychometrics && typeof out.psychometrics.summaryFa === "string", "engine_output.psychometrics additive");
  // و همان خروجی با موتور باندل بایت‌به‌بایت یکی است
  const hRef = ref.applyWechslerEngineToPayload(payload, "1398/03/25", OCCURRED_AT);
  assertSame("engine_output parity", JSON.parse(h.payload.engine_output.value), JSON.parse(hRef.payload.engine_output.value));
});
