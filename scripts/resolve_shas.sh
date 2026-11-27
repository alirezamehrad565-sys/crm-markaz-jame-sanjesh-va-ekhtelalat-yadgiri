#!/bin/bash
# Resolve pinned commit SHAs for third-party actions (and nsis-dev/nsis master).
# Handles both lightweight tags (SHA = commit) and annotated tags (use peeled ^{} line).
# Verifies each chosen SHA resolves as a commit via raw.githubusercontent probe.
set -u
OUT=/home/z/my-project/scripts/shas.txt
: > "$OUT"

resolve_tags() {
  local repo="$1" pattern="$2" label="$3"
  local raw
  raw=$(git ls-remote "https://github.com/${repo}.git" "$pattern" 2>/dev/null)
  # peeled lines for annotated tags: <peeled_sha> refs/tags/vX.Y.Z^{}
  local peeled
  peeled=$(printf '%s\n' "$raw" | grep -E '\^\{\}$' | sed -E 's/^([0-9a-f]+)\s+refs\/tags\/(v[0-9.]+)\^\{\}$/\2 \1/')
  # candidate tags: vX.Y.Z lines
  printf '%s\n' "$raw" | grep -E 'refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sed -E 's/^([0-9a-f]+)\s+refs\/tags\/(v[0-9.]+)$/\2 \1/' \
    | sort -V | tail -1 \
    | while read -r ver sha; do
        local peeled_sha commit
        peeled_sha=$(printf '%s\n' "$peeled" | awk -v v="$ver" '$1==v{print $2}')
        if [ -n "${peeled_sha:-}" ]; then commit="$peeled_sha"; else commit="$sha"; fi
        echo -e "$label\t$repo\ttag\t$commit\t$ver" >> "$OUT"
      done
}

resolve_branch() {
  local repo="$1" branch="$2" label="$3"
  local sha
  sha=$(git ls-remote "https://github.com/${repo}.git" "refs/heads/${branch}" | awk '{print $1}')
  echo -e "$label\t$repo\tbranch\t$sha\t@$branch" >> "$OUT"
}

resolve_tags actions/checkout           'refs/tags/v4*' checkout
resolve_tags actions/setup-node         'refs/tags/v4*' setup-node
resolve_tags actions/upload-artifact    'refs/tags/v4*' upload-artifact
resolve_tags Swatinem/rust-cache        'refs/tags/v2*' rust-cache
resolve_tags docker/setup-qemu-action   'refs/tags/v3*' setup-qemu
resolve_tags docker/setup-buildx-action 'refs/tags/v3*' setup-buildx
resolve_tags docker/login-action        'refs/tags/v3*' login
resolve_tags docker/metadata-action     'refs/tags/v5*' metadata
resolve_tags docker/build-push-action   'refs/tags/v6*' build-push
resolve_branch dtolnay/rust-toolchain stable rust-toolchain
resolve_branch nsis-dev/nsis master nsis

echo "=== resolved ==="
cat "$OUT"

echo "=== verify each SHA is a commit (raw probe of a known file) ==="
while IFS=$'\t' read -r label repo _ sha ver; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://raw.githubusercontent.com/$repo/$sha/action.yml")
  echo "$label $ver $sha -> action.yml HTTP $code"
done < "$OUT"
