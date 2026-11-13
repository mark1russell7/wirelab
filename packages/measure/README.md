# @wirelab/measure

This package measures the use of each package of the catalog. It adds the values to the tables of `@wirelab/catalog`, with a new source.

## The sources

| Source | Request | Metrics or table |
| --- | --- | --- |
| npm downloads | The downloads of the last week. One request has at most 128 packages with no scope. A package with a scope has its own request. | `npm-downloads-week` |
| deps.dev | The default version of a package, then the dependents of that version. | `deps-dev-dependents-direct`, `deps-dev-dependents-indirect` |
| jsDelivr | The hits of the last month. | `jsdelivr-hits-month` |
| npm registry | The abbreviated document of a package. | `registry` |

- The requests and the extractors come from `@procedures/npm/measures`. This package does not parse a body itself.
- `polite-crawler` sends each request. It obeys the pace of each source: one request each 2 seconds to npm downloads, and one each second to the other sources.
- The crawler sends its own `User-Agent` and no contact data.
- These sources are free. The run uses no other source.

## A failed request

- An answer 404 tells that the source does not know the package. That is not a failure.
- An answer 429 or 503 tells that the source is busy. The run waits, then sends the request again, at most `ATTEMPTS` times.
- Each other answer is a failure. A body that the extractor refuses is also a failure.
- The note of the source counts the failures. The report lists them.

## The rows

- `runRows` gives one source, its usage rows and its registry rows. The id of the source is `measure-YYYY-MM-DD-HHMM`, from the start time of the run in UTC.
- A registry row needs the version of `latest` and the day of the last change of the document.
- `addRun` adds the rows to the tables, and then checks the tables with `catalogProblems`. It throws an error when the check finds a problem.
- `reportText` gives the report in Markdown: the counts, the failed requests and the packages with no value.

## The command

Start the run from the root of the repository:

```sh
pnpm exec tsx packages/measure/src/main.ts --report report.md
```

- `--data` is the folder of the tables. The default is the folder `data` of `@wirelab/catalog`.
- `--store` is the store of the crawler. The default is `.cache/measure`. A second run within 12 hours reads the stored answers.
- `--report` is the file of the report. The command also writes the report to the standard output.

## The weekly run

The workflow `measure-weekly.yml` starts the run each Monday in CI. It commits the new tables to the branch `measure/<day>` and opens a pull request into `main`. The checks of CI on that pull request examine the tables.

Start a run by hand:

```sh
gh workflow run measure-weekly.yml -R mark1russell7/wirelab
```
