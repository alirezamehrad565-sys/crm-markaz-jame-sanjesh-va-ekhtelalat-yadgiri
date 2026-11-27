#!/usr/bin/env bash
# گیت‌های انتشار پروژهٔ center-system روی درخت اصلاح‌شده (ممیزی صفحهٔ تقویم — ۱.۲۷.۸۸)
# خروجی هر گیت در refs/logs/gate-<name>.log و جمع‌بندی کد خروج در refs/logs/gates-summary.txt
cd /home/z/my-project/gh-work || exit 1
LOG=/home/z/my-project/refs/logs
SUM=$LOG/gates-summary.txt
: > "$SUM"

run() {
  local name="$1"; shift
  "$@" > "$LOG/gate-$name.log" 2>&1
  local code=$?
  echo "$name EXIT=$code" >> "$SUM"
}

run tsc npx tsc --noEmit
run vitest npx vitest run
run build-client npm run build:client
run worker-bundle node scripts/build-worker-bundle.mjs
run worker-check node --check worker/bundle.js
# گیت‌های اختیاریِ موجود در package.json — فقط اگر تعریف شده باشند اجرا می‌شوند
for s in check:route-registry audit:sec check:d1 check:migrations-manifest; do
  run "npm-$s" npm run --silent --if-present "$s"
done
[ -f scripts/bundle-smoke.mjs ] && run bundle-smoke node scripts/bundle-smoke.mjs
run perf node scripts/perf-budget.mjs
run ui-voice node scripts/ui-voice-check.mjs
run contrast npm run --silent contrast-check

echo "===== SUMMARY ====="
cat "$SUM"
echo "===== VITEST TAIL ====="
tail -12 "$LOG/gate-vitest.log"
echo "===== FAILED FILES (if any) ====="
grep -E "^ (FAIL|❯|×) " "$LOG/gate-vitest.log" | sort -u | head -40
echo "===== OTHER GATES (last lines) ====="
for f in build-client worker-bundle worker-check perf ui-voice contrast; do
  echo "--- $f"; tail -5 "$LOG/gate-$f.log"
done
for f in "$LOG"/gate-npm-*.log; do echo "--- $f"; tail -6 "$f"; done
echo "===== GIT STATUS AFTER GATES ====="
git status --short
