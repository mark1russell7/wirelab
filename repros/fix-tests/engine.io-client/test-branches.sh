# This script tests fix branches of engine.io-client on the fork mark1russell7/socket.io, before and after each fix.
# It follows the upstream job ci-engine.io-client.yml: npm ci, then compile engine.io-parser, engine.io-client and engine.io.
# Each argument is "<finding>|<branch>|<mocha arguments>". For each one:
# - the mocha arguments run with lib/ of upstream main (before) and with the fix (after), with XHR and with fetch;
# - the hooks before-<finding>.sh and after-<finding>.sh of the group folder run, when they exist;
# - the full suites test:node, test:node-fetch and test:node-builtin-ws and format:check run with the fix.
# The logs go to $OUT. The summary goes to the standard output.
set -u
export ROOT_DIR=$PWD
ROOT=$PWD/socket.io
git clone --quiet --filter=blob:none https://github.com/mark1russell7/socket.io "$ROOT" || exit 1
cd "$ROOT" || exit 1
git remote add upstream https://github.com/socketio/socket.io
git fetch --quiet upstream main
echo "upstream main: $(git rev-parse upstream/main)"
npm ci --no-audit --no-fund > "$OUT/npm-ci.txt" 2>&1 || { echo "npm ci failed"; tail -30 "$OUT/npm-ci.txt"; exit 1; }
npm run compile --workspace=engine.io-parser > "$OUT/compile-parser.txt" 2>&1 || { echo "compile of engine.io-parser failed"; exit 1; }
PKG=$ROOT/packages/engine.io-client
compile_client() {
  npm run compile --workspace=engine.io-client > "$OUT/compile-client.txt" 2>&1 && return 0
  echo "compile of engine.io-client failed"
  tail -20 "$OUT/compile-client.txt"
  return 1
}
compile_client || exit 1
npm run compile --workspace=engine.io > "$OUT/compile-engine.txt" 2>&1 || { echo "compile of engine.io failed"; exit 1; }
counts() {
  grep -E '^ +[0-9]+ (passing|failing|pending)' "$1" | tr -s ' ' | tr '\n' ' '
  grep -E '^ +[0-9]+\) ' "$1" | head -5 | tr -s ' ' | tr '\n' ';'
}
mocha_run() {
  local log=$1
  shift
  (cd "$PKG" && timeout 600 npx --no-install mocha --exit --require test/support/hooks.js "$@") > "$log" 2>&1
  echo "exit=$?" >> "$log"
}
both() {
  local name=$1
  shift
  mocha_run "$OUT/$name-xhr.txt" "$@"
  USE_FETCH=1 mocha_run "$OUT/$name-fetch.txt" "$@"
  echo "  $name xhr: $(counts "$OUT/$name-xhr.txt") $(tail -1 "$OUT/$name-xhr.txt")"
  echo "  $name fetch: $(counts "$OUT/$name-fetch.txt") $(tail -1 "$OUT/$name-fetch.txt")"
}
suite() {
  local id=$1 name=$2 script=$3
  (cd "$PKG" && timeout 900 npm run "$script") > "$OUT/$id-full-$name.txt" 2>&1
  echo "exit=$?" >> "$OUT/$id-full-$name.txt"
  echo "  full $name: $(counts "$OUT/$id-full-$name.txt") $(tail -1 "$OUT/$id-full-$name.txt")"
}
for item in "$@"; do
  IFS='|' read -r id br args <<< "$item"
  echo "== $id ($br)"
  git checkout --quiet -B "$br" "origin/$br" || { echo "checkout failed"; continue; }
  echo "  commit $(git rev-parse --short HEAD), base $(git merge-base --is-ancestor upstream/main HEAD && echo current || echo behind)"
  git checkout --quiet upstream/main -- packages/engine.io-client/lib
  compile_client || continue
  # shellcheck disable=SC2086
  both "$id-before" $args
  [ -f "$ROOT_DIR/before-$id.sh" ] && bash "$ROOT_DIR/before-$id.sh"
  git checkout --quiet HEAD -- packages/engine.io-client/lib
  compile_client || continue
  # shellcheck disable=SC2086
  both "$id-after" $args
  [ -f "$ROOT_DIR/after-$id.sh" ] && bash "$ROOT_DIR/after-$id.sh"
  suite "$id" xhr test:node
  suite "$id" fetch test:node-fetch
  suite "$id" builtin-ws test:node-builtin-ws
  (cd "$PKG" && npm run format:check) > "$OUT/$id-format.txt" 2>&1
  echo "exit=$?" >> "$OUT/$id-format.txt"
  echo "  format:check $(tail -1 "$OUT/$id-format.txt")"
done
