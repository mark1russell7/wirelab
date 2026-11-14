# Repros

Each folder `repros/<package>/<finding>` holds one repro of a public finding of the ledger (`packages/catalog/src/data/findings.json`).

- `package.json` pins the exact versions of the packages and of their types.
- `repro.ts` is the script. The upstream issue shows the same script.
- `tsconfig.json` makes `tsc` check the types of the script.
- `run.sh` starts the script with `node repro.ts`. Node.js 22.18 and later starts a TypeScript file directly.

The workflow `.github/workflows/repro.yml` installs one folder, checks its types, runs it and keeps the output as an artifact:

```sh
gh workflow run repro.yml --ref <branch> -f dir=sockjs-client/F0068
gh run download <run id>
```

A repro of a fault exits with a code that is not 0. The job records the code and passes when `run.sh` ran.

The workflow `.github/workflows/repro-types.yml` checks the types of each repro folder that a pull request changes.
Add the `tsconfig.json` of each new folder to `conventions.rules["typed-files"].configs` in the root `package.json`.

A repro of a types finding fails `tsc` on purpose. Its folder has these files in place of `tsconfig.json`:

- `tsconfig.repro.json` makes `tsc` check the script. `run.sh` starts `npx --no-install tsc -p tsconfig.repro.json`.
- `expected-errors.txt` holds the errors of `tsc` from a CI run of the repro.

For this folder, the workflow `repro-types.yml` passes when the errors of `tsc` are the same as `expected-errors.txt`. Add `tsconfig.repro.json` to the same `configs`.

## Reviews and fix tests

- `repros/review/<package>` holds the first repros of the review of a package. A finding of the ledger gets its own folder `repros/<package>/<finding>`.
- `repros/fix-tests/<package>/<findings>` tests the fix branches of a fork. Each fix test runs the new tests before and after the fix, and then the full suite and the linter of the package.
- A fix test that checks types has a config `tsconfig.check-<finding>.json`. Add it to the same `configs`.

A repro of a security finding never goes in this repository.
