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

A repro of a security finding never goes in this repository.
