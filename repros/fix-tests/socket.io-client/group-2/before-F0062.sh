# The type check of F0062 against the current build: "before" (upstream main) or "after" (the branch).
# It runs tsc on check-F0062.ts with a tsconfig of its own. TypeScript 6 refuses a file on the command line
# when a tsconfig.json is in the folder (TS5112). The script test:types of the package is "exit 0", and tsd
# fails on upstream main for other reasons, so the check does not use them.
LABEL=${1:-before}
cd "$PKG" || exit 1
cp "$ROOT_DIR/check-F0062.ts" test/check-F0062.ts
cat > test/tsconfig.check-F0062.json <<'JSON'
{
  "compilerOptions": {
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2022"
  },
  "files": ["check-F0062.ts"]
}
JSON
(npx --no-install tsc --version && npx --no-install tsc -p test/tsconfig.check-F0062.json) > "$OUT/F0062-tsc-$LABEL.txt" 2>&1
echo "exit=$?" >> "$OUT/F0062-tsc-$LABEL.txt"
# The files must not stay: format:check of npm test examines test/**/*.ts.
rm -f test/check-F0062.ts test/tsconfig.check-F0062.json
echo "  F0062 tsc ($LABEL):"
sed 's/^/    /' "$OUT/F0062-tsc-$LABEL.txt"
