# The type check of F0033 against the current build: "before" (upstream main) or "after" (the branch).
LABEL=${1:-before}
cd "$ROOT_DIR/socket.io" || exit 1
mkdir -p types-F0033 && cp "$ROOT_DIR/check-F0033.ts" types-F0033/check.ts
echo '{ "compilerOptions": { "strict": true, "noEmit": true, "module": "nodenext", "moduleResolution": "nodenext", "target": "es2022", "skipLibCheck": true, "types": [] }, "files": ["check.ts"] }' > types-F0033/tsconfig.json
(cd types-F0033 && ../node_modules/.bin/tsc --version && ../node_modules/.bin/tsc -p .) > "$OUT/F0033-types-$LABEL.txt" 2>&1
echo "exit=$?" >> "$OUT/F0033-types-$LABEL.txt"
echo "  F0033 tsc ($LABEL):"
sed 's/^/    /' "$OUT/F0033-types-$LABEL.txt"
