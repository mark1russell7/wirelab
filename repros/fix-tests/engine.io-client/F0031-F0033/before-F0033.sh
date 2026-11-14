# The type check of F0033 against the current build: "before" (upstream main) or "after" (the branch).
# It checks the repro of the ledger, repros/engine.io-client/F0033, with its own tsconfig.repro.json.
LABEL=${1:-before}
REPRO="$ROOT_DIR/../../../engine.io-client/F0033"
cd "$ROOT_DIR/socket.io" || exit 1
mkdir -p types-F0033 && cp "$REPRO/repro.ts" "$REPRO/tsconfig.repro.json" types-F0033/
(cd types-F0033 && ../node_modules/.bin/tsc --version && ../node_modules/.bin/tsc -p tsconfig.repro.json) > "$OUT/F0033-types-$LABEL.txt" 2>&1
echo "exit=$?" >> "$OUT/F0033-types-$LABEL.txt"
echo "  F0033 tsc ($LABEL):"
sed 's/^/    /' "$OUT/F0033-types-$LABEL.txt"
