# The type check of F0062 against the current build: "before" (upstream main) or "after" (the branch).
# It runs tsc on check-F0062.ts, and tsd on the type tests of the package (the script test:types is "exit 0").
LABEL=${1:-before}
cd "$PKG" || exit 1
cp "$ROOT_DIR/check-F0062.ts" test/check-F0062.ts
(npx --no-install tsc --version && npx --no-install tsc --noEmit --strict --skipLibCheck --module nodenext \
  --moduleResolution nodenext --target es2022 test/check-F0062.ts) > "$OUT/F0062-tsc-$LABEL.txt" 2>&1
echo "exit=$?" >> "$OUT/F0062-tsc-$LABEL.txt"
# The file must not stay: format:check of npm test examines test/**/*.ts.
rm -f test/check-F0062.ts
(timeout 300 npx --no-install tsd) > "$OUT/F0062-tsd-$LABEL.txt" 2>&1
echo "exit=$?" >> "$OUT/F0062-tsd-$LABEL.txt"
echo "  F0062 tsc ($LABEL):"
sed 's/^/    /' "$OUT/F0062-tsc-$LABEL.txt"
echo "  F0062 tsd ($LABEL), the first 40 lines:"
head -40 "$OUT/F0062-tsd-$LABEL.txt" | sed 's/^/    /'
tail -1 "$OUT/F0062-tsd-$LABEL.txt" | sed 's/^/    /'
