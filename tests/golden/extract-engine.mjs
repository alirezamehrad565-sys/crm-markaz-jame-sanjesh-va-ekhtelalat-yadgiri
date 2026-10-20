// extract-engine.mjs — Phase 0 (task 39-d1)
// Generates, FROM THE REAL PRODUCTION BUNDLE:
//   1. tests/golden/bundle-wechsler-ref.cjs   (CJS reference implementation for the golden test)
//   2. src/domain/wechsler-engine/engine.js   (ESM extracted module)
//
// Both files embed the engine region of worker/bundle.js VERBATIM (byte-identical),
// so the reference cannot drift from the bundle: it IS the bundle code.
//
// Re-run any time the bundle engine changes:  node tests/golden/extract-engine.mjs
// The script fails loudly if:
//   - the anchor lines are not found exactly once in worker/bundle.js, or
//   - the two regions are not contiguous, or
//   - the region references globals other than the esbuild name-tag helpers
//     (i.e. new external dependencies crept into the engine region).
//
// This script is deliberately located under tests/golden/ (task safety rules:
// no existing file may be modified; only new files under
// src/domain/wechsler-engine/ and tests/golden/ are written).

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import vm from "node:vm";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const BUNDLE = path.join(ROOT, "worker", "bundle.js");

// ---------------------------------------------------------------------------
// 1. Locate the engine region in the bundle (by identifier anchors, not by
//    fragile absolute line numbers).
// ---------------------------------------------------------------------------
const ANCHOR_START = "var SUBTESTS = [";
const ANCHOR_END_A = '__name2(runWechslerAnalysis, "runWechslerAnalysis");';
const ANCHOR_START_B = "var WISC4_EVENT_KEY = ";
const ANCHOR_END_B = '__name2(summarySafePayload, "summarySafePayload");';

function findAnchorLines(lines, anchor) {
  const hits = [];
  lines.forEach((l, i) => {
    if (l.includes(anchor)) hits.push(i);
  });
  if (hits.length !== 1) {
    throw new Error(`anchor not unique (found ${hits.length}x): ${anchor}`);
  }
  return hits[0];
}

const bundleText = fs.readFileSync(BUNDLE, "utf8");
const lines = bundleText.split("\n");
const startIdx = findAnchorLines(lines, ANCHOR_START);
const endAIdx = findAnchorLines(lines, ANCHOR_END_A);
const startBIdx = findAnchorLines(lines, ANCHOR_START_B);
const endBIdx = findAnchorLines(lines, ANCHOR_END_B);

if (startBIdx !== endAIdx + 1) {
  throw new Error(
    `engine core (ends line ${endAIdx + 1}) and glue (starts line ${startBIdx + 1}) are not contiguous — re-map the region`
  );
}

// 0-based inclusive slice [startIdx .. endBIdx]
const region = lines.slice(startIdx, endBIdx + 1).join("\n");
const startLine = startIdx + 1;
const endLine = endBIdx + 1;
console.log(`[extract] engine region: worker/bundle.js lines ${startLine}-${endLine} (${endLine - startLine + 1} lines)`);

// ---------------------------------------------------------------------------
// 2. Probe the region for references to globals OUTSIDE the region.
//    Every unresolvable identifier read/assignment is recorded. Builtins are
//    pre-seeded from the Node host; the esbuild name-tag helpers are expected.
// ---------------------------------------------------------------------------
const EXPECTED_EXTERNALS = new Set(["__name", "__name2"]);
const missing = new Set();
// Names declared at the top level of the region itself (hoisted function/var
// bindings can reach the proxy's set trap before being visible via `in`).
const declared = new Set();
for (const l of lines.slice(startIdx, endBIdx + 1)) {
  let m = l.match(/^(?:async )?function\s+([A-Za-z_$][\w$]*)/);
  if (m) {
    declared.add(m[1]);
    continue;
  }
  m = l.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)/);
  if (m) declared.add(m[1]);
}
const probeTarget = {};
// Seed host builtins so common globals (Object, Math, Map, ...) resolve.
for (const k of Object.getOwnPropertyNames(globalThis)) {
  try {
    probeTarget[k] = globalThis[k];
  } catch {
    /* ignore exotic getters */
  }
}
// The two esbuild decoration helpers are expected externals; stub them.
probeTarget.__name = (t) => t;
probeTarget.__name2 = (t) => t;

const probeSandbox = new Proxy(probeTarget, {
  has() {
    return true;
  },
  get(t, k, r) {
    if (typeof k === "symbol") return Reflect.get(t, k, r);
    if (k in t) return Reflect.get(t, k, r);
    if (declared.has(String(k))) return undefined;
    missing.add(String(k));
    return undefined;
  },
  set(t, k, v, r) {
    if (typeof k !== "symbol" && !(k in t) && !declared.has(String(k))) missing.add(`SET ${String(k)}`);
    return Reflect.set(t, k, v, r);
  }
});

try {
  vm.runInNewContext(region, probeSandbox, { filename: "wechsler-engine-region.js" });
} catch (err) {
  console.error("[extract] probe execution threw:", err?.message ?? err);
}
const unexpected = [...missing].filter((m) => {
  const name = m.startsWith("SET ") ? m.slice(4) : m;
  return !EXPECTED_EXTERNALS.has(name);
});
if (unexpected.length > 0) {
  console.error("[extract] UNEXPECTED external references in engine region:", unexpected);
  process.exit(1);
}
console.log(`[extract] external-reference probe OK (expected-only: ${[...missing].join(", ") || "none"})`);

// ---------------------------------------------------------------------------
// 3. Public export surface of the extracted engine module.
// ---------------------------------------------------------------------------
const EXPORTS = [
  // main entry points
  "runWechslerAnalysis",
  "analyzeWisc",
  "applyWechslerEngineToPayload",
  // payload / date glue (pure)
  "extractRawScores",
  "compactWechslerOutput",
  "parseJalaliLoose",
  "parseBirthDateLoose",
  "gregorianIsoToJalali",
  "normalizeDigits",
  "summarySafePayload",
  // validation + helpers (handy for tests & callers)
  "validateWechslerInput",
  "bandForAge",
  "ageFromJalali",
  // data tables
  "WISC4_EVENT_KEY",
  "RAW_FIELD_MAP",
  "SUBTESTS",
  "SUBTEST_CODES",
  "SUBTEST_FA",
  "SUBTEST_FA_OK",
  "NORMS",
  "NORM_MIN_AGE",
  "NORM_MAX_BAND",
  "INDEX_MEMBERS",
  "GAI_MEMBERS",
  "HYPOTHESES",
  "TREATMENTS",
  "MIN_AGE",
  "MAX_AGE"
];

// ---------------------------------------------------------------------------
// 4. Emit tests/golden/bundle-wechsler-ref.cjs (CJS reference).
// ---------------------------------------------------------------------------
const refHeader = `// bundle-wechsler-ref.cjs — GENERATED FILE, DO NOT EDIT BY HAND.
// Golden-test REFERENCE implementation of the WISC-IV Wechsler analysis engine.
// Region copied VERBATIM from worker/bundle.js lines ${startLine}-${endLine}
// at commit 365d103 (m130 / 1.00.9), engineVersion "m98".
// Regenerate with: node tests/golden/extract-engine.mjs
//
// The two esbuild name-tag helpers (bundle.js lines 7 and 1262) are reproduced
// here (cosmetic Object.defineProperty name tagging only). Everything else is
// untouched bundle code, executed in CommonJS sloppy mode like the worker.

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __defProp2 = Object.defineProperty;
var __name2 = (target, value) => __defProp2(target, "name", { value, configurable: true });

`;

const refFooter = `\nmodule.exports = { ${EXPORTS.join(", ")} };\n`;
fs.writeFileSync(path.join(HERE, "bundle-wechsler-ref.cjs"), refHeader + region + refFooter);
console.log("[extract] wrote tests/golden/bundle-wechsler-ref.cjs");

// ---------------------------------------------------------------------------
// 5. Emit src/domain/wechsler-engine/engine.js (ESM extracted module).
// ---------------------------------------------------------------------------
const engineHeader = `// engine.js — WISC-IV Wechsler analysis engine (EXTRACTED, phase 0 / task 39-d1)
//
// Source: extracted verbatim from worker/bundle.js lines ${startLine}-${endLine}
// at commit 365d103 ("m130 (1.00.9)"), engineVersion "m98". Extraction date: 2026-10-20.
//
// Region layout (bundle lines):
//   ${startLine}-${endAIdx + 1}   pure computation core: subtest definitions, norms (NORMS = norms_default,
//         a 71 KB data line), index/cluster/GAI/step5 math, HYPOTHESES (13 entries),
//         validation, flags, hypothesis activation/scoring, treatments,
//         runWechslerAnalysis (engine entry point).
//   ${startBIdx + 1}-${endLine}   pure payload glue: WISC4_EVENT_KEY, RAW_FIELD_MAP (raw_si..raw_ca + legacy
//         raw_sim/raw_voc/raw_com/raw_pc), extractRawScores, Jalali/Gregorian date
//         parsing, compactWechslerOutput, applyWechslerEngineToPayload (the
//         form-payload I/O contract), summarySafePayload.
//
// NOT extracted (route/DB glue, stays in the bundle): studentBirthDate (bundle
// lines 24657-24665, D1 access) and applyWechslerHook (bundle lines 24666-24680,
// wraps applyWechslerEngineToPayload + ValidationError) — see index.ts for the
// clean typed API and wechslerHookError() to reproduce the hook's error text.
//
// Function bodies below are byte-identical to the bundle. The only deviations:
//   * the esbuild helpers __name/__name2 (bundle.js lines 7 and 1262 — cosmetic
//     function-name tagging) are reduced to no-op stubs;
//   * an ESM export statement is appended.
// Golden test: tests/golden/wechsler-golden.test.mjs proves exact output
// equivalence against the bundle-generated reference (tests/golden/bundle-wechsler-ref.cjs).
// This module is NOT yet wired into the worker build (equivalence proof only).

var __name = (target, value) => target; // stub of bundle.js:7 (cosmetic)
var __name2 = (target, value) => target; // stub of bundle.js:1262 (cosmetic)

`;

const engineFooter = `\nexport {\n  ${EXPORTS.join(",\n  ")}\n};\n`;
fs.writeFileSync(path.join(ROOT, "src", "domain", "wechsler-engine", "engine.js"), engineHeader + region + engineFooter);
console.log("[extract] wrote src/domain/wechsler-engine/engine.js");

// ---------------------------------------------------------------------------
// 6. Self-check: the shared region must be byte-identical in both outputs.
// ---------------------------------------------------------------------------
const refOut = fs.readFileSync(path.join(HERE, "bundle-wechsler-ref.cjs"), "utf8");
const engOut = fs.readFileSync(path.join(ROOT, "src", "domain", "wechsler-engine", "engine.js"), "utf8");
for (const out of [refOut, engOut]) {
  if (!out.includes(region)) {
    console.error("[extract] FATAL: emitted file does not contain the verbatim region");
    process.exit(1);
  }
}
console.log("[extract] verbatim-region self-check OK for both files");
