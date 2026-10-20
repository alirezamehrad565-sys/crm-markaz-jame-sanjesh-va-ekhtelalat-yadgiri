// index.js — compatibility shim for the golden test directory.
//
// Why this exists: `node --test tests/golden/` (the canonical invocation for
// this suite) passes the DIRECTORY as an explicit positional argument. On
// Node.js >= 23 (verified on v24.21.0) the test runner spawns an explicit
// positional path as a single test file instead of globbing the directory,
// and executing a directory resolves to its `index.js`. Without this shim the
// runner fails with MODULE_NOT_FOUND on the directory itself.
//
// Importing the real suite here registers the very same tests with the runner
// (node:test collects tests registered at import time), so:
//   node --test tests/golden/                      → works via this shim
//   node --test tests/golden/wechsler-golden.test.mjs → works directly
//   node --test "tests/golden/*.test.mjs"          → works via glob
// and the suite never runs twice: `index.js` does not match the default
// test-file glob, and the directory-arg mode spawns only this file.
//
// This file contains no tests of its own.
import "./wechsler-golden.test.mjs";
