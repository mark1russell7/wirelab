# This script tests fix branches of socket.io-client on the fork mark1russell7/socket.io, before and after each fix.
# It follows the upstream job ci-socket.io-client.yml: npm ci, then compile the dependencies, the client and the server.
# Each argument is "<finding>|<branch>|<test file>|<mocha grep>". For each one:
# - the test file runs with lib/ of upstream main (before) and with the fix (after), with the tests of the branch;
# - a test file "-" runs no mocha test;
# - the hooks before-<finding>.sh and after-<finding>.sh of the group folder run, when they exist;
# - npm test of the package (format:check, compile and test:node) runs with the fix.
# The logs go to $OUT. The summary goes to the standard output.
set -u
export ROOT_DIR=$PWD
ROOT=$PWD/socket.io
export PKG=$ROOT/packages/socket.io-client
git clone --quiet --filter=blob:none https://github.com/mark1russell7/socket.io "$ROOT" || exit 1
cd "$ROOT" || exit 1
git remote add upstream https://github.com/socketio/socket.io
git fetch --quiet upstream main
echo "upstream main: $(git rev-parse upstream/main)"
npm ci --no-audit --no-fund > "$OUT/npm-ci.txt" 2>&1 || { echo "npm ci failed"; tail -30 "$OUT/npm-ci.txt"; exit 1; }
npm run compile --workspace=engine.io-parser --workspace=engine.io-client --workspace=socket.io-parser \
  > "$OUT/compile-deps.txt" 2>&1 || { echo "compile of the dependencies failed"; tail -20 "$OUT/compile-deps.txt"; exit 1; }
compile_client() {
  npm run compile --workspace=socket.io-client > "$OUT/compile-client.txt" 2>&1 && return 0
  echo "compile of socket.io-client failed"
  tail -20 "$OUT/compile-client.txt"
  return 1
}
compile_client || exit 1
npm run compile --workspace=engine.io --workspace=socket.io-adapter --workspace=socket.io \
  > "$OUT/compile-dev-deps.txt" 2>&1 || { echo "compile of the dev dependencies failed"; tail -20 "$OUT/compile-dev-deps.txt"; exit 1; }
counts() {
  grep -E '^ +[0-9]+ (passing|failing|pending)' "$1" | tr -s ' ' | tr '\n' ' '
  grep -E '^ +[0-9]+\) ' "$1" | head -5 | tr -s ' ' | tr '\n' ';'
}
mocha_run() {
  local log=$1 file=$2 grep=$3
  (cd "$PKG" && timeout 600 npx --no-install mocha --import=tsx --require test/support/hooks.ts --exit "$file" --grep "$grep") \
    > "$log" 2>&1
  echo "exit=$?" >> "$log"
  echo "  $(basename "$log" .txt): $(counts "$log") $(tail -1 "$log")"
}
for item in "$@"; do
  IFS='|' read -r id br file grep <<< "$item"
  echo "== $id ($br)"
  git checkout --quiet -B "$br" "origin/$br" || { echo "checkout failed"; continue; }
  echo "  commit $(git rev-parse --short HEAD), base $(git merge-base --is-ancestor upstream/main HEAD && echo current || echo behind)"
  git checkout --quiet upstream/main -- packages/socket.io-client/lib
  compile_client || continue
  [ "$file" != "-" ] && mocha_run "$OUT/$id-before.txt" "$file" "$grep"
  [ -f "$ROOT_DIR/before-$id.sh" ] && bash "$ROOT_DIR/before-$id.sh"
  git checkout --quiet HEAD -- packages/socket.io-client/lib
  compile_client || continue
  [ "$file" != "-" ] && mocha_run "$OUT/$id-after.txt" "$file" "$grep"
  [ -f "$ROOT_DIR/after-$id.sh" ] && bash "$ROOT_DIR/after-$id.sh"
  (cd "$PKG" && timeout 900 npm test) > "$OUT/$id-npm-test.txt" 2>&1
  echo "exit=$?" >> "$OUT/$id-npm-test.txt"
  echo "  npm test: $(counts "$OUT/$id-npm-test.txt") $(tail -1 "$OUT/$id-npm-test.txt")"
done
