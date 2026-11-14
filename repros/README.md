# Repros

Each folder `repros/<package>/<finding>` holds one repro of a public finding of the ledger (`packages/catalog/src/data/findings.json`).

- `package.json` pins the exact versions of the packages and of their types.
- `repro.ts` is the script. The upstream issue shows the same script.
- `tsconfig.json` makes `tsc` check the types of the script.
- `run.sh` starts the script with `node repro.ts`. Node.js 22.18 and later starts a TypeScript file directly.

The workflow `.github/workflows/repro.yml` installs one folder, checks its types, runs it and keeps the output as an artifact. It also installs and checks the parent folders of the folder that have a `package.json` or a `tsconfig.json`. These commands start a run and download its output:

```sh
gh workflow run repro.yml --ref <branch> -f dir=sockjs-client/F0068
gh run download <run id>
```

A repro of a fault exits with a code that is not 0. The job records the code and passes when `run.sh` stopped.

The workflow `.github/workflows/repro-types.yml` checks the types of each repro folder that a pull request changes.
Add the `tsconfig.json` of each new folder to `conventions.rules["typed-files"].configs` in the root `package.json`.

A repro of a types finding fails `tsc` on purpose. Its folder has these files in place of `tsconfig.json`:

- `tsconfig.repro.json` makes `tsc` check the script. `run.sh` starts `npx --no-install tsc -p tsconfig.repro.json`.
- `expected-errors.txt` holds the errors of `tsc` from a CI run of the repro.

For this folder, the workflow `repro-types.yml` passes when the errors of `tsc` are the same as `expected-errors.txt`. Add `tsconfig.repro.json` to the same `configs`.

## Reviews

A review of a package finds candidates. Each candidate that a repro confirms gets a row in the ledger and its own folder `repros/<package>/<finding>`. The first scripts of a review are not kept: the canonical folder is the one home of a repro.

## Fix tests

A fix test examines the fix branches of a fork in CI before an upstream pull request. The runner `repros/fix-tests/lib/fix-test.ts` does these steps:

1. It clones the fork, adds upstream and installs the packages.
2. It starts the baseline checks on upstream, when the spec has them.
3. It starts the targeted checks of each item with the source of upstream (before) and with the fix (after).
4. It starts the full checks with the fix: the full suite, the linter and the check of the format.

- `repros/fix-tests/<package>/spec.ts` gives the checks of a package as data.
- `repros/fix-tests/<package>/<group>/run.ts` gives the items: each finding, its branch and its own checks. `run.sh` starts `node run.ts`.
- `repros/fix-tests/package.json` holds the packages of all fix tests, and `repros/fix-tests/tsconfig.json` checks all of their scripts. The workflow `repro.yml` installs and checks each parent folder before the folder.
- A types check of a fix test has its own config `tsconfig.check-<finding>.json`. Add it to the same `configs`.

Do not put a repro of a security finding in this repository.
