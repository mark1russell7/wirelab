# Repros

Each folder `repros/<package>/<finding>` holds one repro of a public finding of the ledger (`packages/catalog/src/data/findings.json`).

- `package.json` pins the exact versions of the packages.
- `repro.js` is the script. The upstream issue shows the same script.
- `run.sh` starts the script.

The workflow `.github/workflows/repro.yml` runs one folder and keeps the output as an artifact:

```sh
gh workflow run repro.yml --ref <branch> -f dir=sockjs-client/F0068
gh run download <run id>
```

A repro of a fault exits with a code that is not 0. The job records the code and passes when `run.sh` ran.

A repro of a security finding never goes in this repository.
