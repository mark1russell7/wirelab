# The repro of F0031 against the build of upstream main, and against engine.io-client 6.6.8 from npm.
cd "$ROOT_DIR/socket.io" || exit 1
cp "$ROOT_DIR/repro-F0031.mjs" repro-F0031.mjs
timeout 60 node repro-F0031.mjs > "$OUT/F0031-repro-main.txt" 2>&1
echo "exit=$?" >> "$OUT/F0031-repro-main.txt"
echo "  F0031 repro (upstream main build):"
sed 's/^/    /' "$OUT/F0031-repro-main.txt"
mkdir -p "$ROOT_DIR/npm-6.6.8" && cd "$ROOT_DIR/npm-6.6.8" || exit 1
echo '{ "private": true, "type": "module" }' > package.json
npm install --ignore-scripts --no-audit --no-fund engine.io-client@6.6.8 > "$OUT/npm-6.6.8.txt" 2>&1
cp "$ROOT_DIR/repro-F0031.mjs" repro.mjs
timeout 60 node repro.mjs > "$OUT/F0031-repro-6.6.8.txt" 2>&1
echo "exit=$?" >> "$OUT/F0031-repro-6.6.8.txt"
echo "  F0031 repro (6.6.8 from npm):"
sed 's/^/    /' "$OUT/F0031-repro-6.6.8.txt"
