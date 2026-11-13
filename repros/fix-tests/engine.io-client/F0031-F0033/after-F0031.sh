# The new test of F0031 with fetch and the debug output of engine.io-client, then the repro against the build of the branch.
cd "$ROOT_DIR/socket.io/packages/engine.io-client" || exit 1
USE_FETCH=1 DEBUG='engine.io-client:*' timeout 60 npx --no-install mocha --exit --require test/support/hooks.js --grep long-polling test/node.js > "$OUT/F0031-after-fetch-debug.txt" 2>&1
echo "exit=$?" >> "$OUT/F0031-after-fetch-debug.txt"
cd "$ROOT_DIR/socket.io" || exit 1
cp "$ROOT_DIR/repro-F0031.mjs" repro-F0031.mjs
DEBUG='engine.io-client:*' timeout 60 node repro-F0031.mjs > "$OUT/F0031-repro-after.txt" 2>&1
echo "exit=$?" >> "$OUT/F0031-repro-after.txt"
echo "  F0031 repro (branch build):"
grep -v "engine.io-client:" "$OUT/F0031-repro-after.txt" | sed 's/^/    /'
