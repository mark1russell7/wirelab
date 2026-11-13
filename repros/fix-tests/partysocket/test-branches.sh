# This script tests fix branches of partysocket on the fork mark1russell7/partykit, before and after each fix.
# Each argument pair is "<finding> <branch>". For each pair:
# - the test files of the branch run with the source of the fix put back to upstream main (before), then with the fix (after);
# - the full partysocket suite, tsc, oxlint and oxfmt --check run with the fix.
# The logs go to $OUT/<finding>-*.txt. The summary goes to the standard output.
set -u
ROOT=$PWD/partykit
git clone --quiet https://github.com/mark1russell7/partykit "$ROOT" || exit 1
cd "$ROOT" || exit 1
git remote add upstream https://github.com/cloudflare/partykit
git fetch --quiet upstream main
echo "upstream main: $(git rev-parse upstream/main)"
npm ci --no-audit --no-fund > "$OUT/npm-ci.txt" 2>&1 || { echo "npm ci failed"; tail -30 "$OUT/npm-ci.txt"; exit 1; }
BIN=$ROOT/node_modules/.bin
# Some suites of partykit skip on GitHub Actions. This run needs all of them.
unset GITHUB_ACTIONS
vt() {
  local log=$1; shift
  ( cd packages/partysocket && "$BIN/vitest" --no-watch --maxWorkers=2 "$@" ) > "$log" 2>&1
  echo "exit=$?" >> "$log"
}
summary() { grep -E "^ +(Test Files|Tests) " "$1" | sed 's/\x1b\[[0-9;]*m//g' | tr -s ' ' | tr '\n' ';'; }
while [ $# -ge 2 ]; do
  id=$1; br=$2; shift 2
  git checkout --quiet -B "$br" "origin/$br" || { echo "$id: checkout of $br failed"; continue; }
  echo "$id branch $br at $(git rev-parse --short HEAD), base $(git merge-base --is-ancestor upstream/main HEAD && echo current || echo behind)"
  src=$(git diff --name-only upstream/main HEAD -- packages/partysocket/src | grep -v '/tests/')
  tests=$(git diff --name-only upstream/main HEAD -- packages/partysocket/src/tests | sed 's#^packages/partysocket/##')
  git checkout --quiet upstream/main -- $src
  vt "$OUT/$id-before.txt" $tests
  "$BIN/tsc" -p packages/partysocket/src/tsconfig.json > "$OUT/$id-tsc-before.txt" 2>&1; echo "exit=$?" >> "$OUT/$id-tsc-before.txt"
  git checkout --quiet HEAD -- $src
  vt "$OUT/$id-after.txt" $tests
  vt "$OUT/$id-after-full.txt"
  "$BIN/tsc" -p packages/partysocket/src/tsconfig.json > "$OUT/$id-tsc.txt" 2>&1; echo "exit=$?" >> "$OUT/$id-tsc.txt"
  "$BIN/oxlint" packages/partysocket > "$OUT/$id-lint.txt" 2>&1; echo "exit=$?" >> "$OUT/$id-lint.txt"
  "$BIN/oxfmt" --check packages/partysocket .changeset > "$OUT/$id-fmt.txt" 2>&1; echo "exit=$?" >> "$OUT/$id-fmt.txt"
  echo "$id files: $tests"
  echo "$id before: $(summary "$OUT/$id-before.txt") $(tail -1 "$OUT/$id-before.txt")"
  echo "$id after: $(summary "$OUT/$id-after.txt") $(tail -1 "$OUT/$id-after.txt")"
  echo "$id after (full): $(summary "$OUT/$id-after-full.txt") $(tail -1 "$OUT/$id-after-full.txt")"
  echo "$id tsc before: $(grep -c 'error TS' "$OUT/$id-tsc-before.txt") errors, $(tail -1 "$OUT/$id-tsc-before.txt")"
  echo "$id tsc after $(tail -1 "$OUT/$id-tsc.txt"), lint $(tail -1 "$OUT/$id-lint.txt"), fmt $(tail -1 "$OUT/$id-fmt.txt")"
  echo
done
