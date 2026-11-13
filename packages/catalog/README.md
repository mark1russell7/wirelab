# @wirelab/catalog

This package holds the catalog of wirelab: the browser clients of the wire protocols, as tables. A formula over the tables gives the order of the test campaign.

## The tables

Each table is one JSON file in `src/data`. A row names a row of another table by its key, as a foreign key does in SQL.

| Table | File | Key | What a row is |
| --- | --- | --- | --- |
| `families` | `families.json` | `order` | A group of protocols, as the catalog shows them. |
| `transports` | `transports.json` | `id` | A browser API that carries bytes, for example WebSocket or `fetch`. |
| `protocols` | `protocols.json` | `id` | A protocol or a codec, with its family, its spec and how a page speaks it. |
| `packages` | `packages.json` | `name` | An npm package of a client. |
| `packageProtocols` | `package-protocols.json` | `package`, `protocol` | A package speaks a protocol. |
| `packageLinks` | `package-links.json` | `from`, `relation`, `to` | A fork, a new name or a replacement. |
| `sources` | `sources.json` | `at`, `id` | One read of outside data at one time. |
| `registry` | `registry.json` | `package`, `source` | What the npm registry said about a package. |
| `usage` | `usage.json` | `package`, `source`, `metric` | One measure of the use of a package. |
| `repositories` | `repositories.json` | `id` | A source repository. The id is `owner/name` on GitHub. |
| `packageRepositories` | `package-repositories.json` | `package` | The repository of a package, and the folder of the package in it. |
| `policies` | `policies.json` | `repository`, `topic`, `checked` | One rule of a repository on one topic, with the day of the check and the page that shows it. |

- The field `client` of a protocol is `library`, `native` or `none`. A protocol with `none` often has a gateway, which the field `gateway` names.
- `packumentModified` is the day of the last change of the registry document. A deprecation also changes it, so it is not the day of the last release.
- The policy topics are `ai`, `cla` and `security`. Each topic has its own set of values, in `POLICY_VALUES`.
- The topic `ai` gives the rule for contributions that an AI made: `none-stated`, `allowed`, `disclosure` or `refused`.
- The topic `cla` gives the agreement of a contributor: `none`, `dco` or `cla`.
- The topic `security` gives the private channel for a security fault: `github-advisory`, `email`, `platform` or `none-stated`.
- The topic `contributions` tells if the repository takes pull requests: `open` or `archived`.
- A new check of a policy adds a row. The latest row of a topic gives the current rule.
- An observed row names its source. A new read adds a source and new rows, and the old rows stay. Thus the tables keep the history.

## The ledger

The ledger records the tests of the campaign, the faults that they find, and the state of each fix upstream.

| Table | File | Key | What a row is |
| --- | --- | --- | --- |
| `suites` | `suites.json` | `id` | A suite of tests, with what it tests: the clients, the servers or both. |
| `suiteProtocols` | `suite-protocols.json` | `suite`, `protocol` | A suite tests a protocol. |
| `runs` | `runs.json` | `at`, `id` | One run of a suite on one version of a package, in CI, with its counts. |
| `findings` | `findings.json` | `id` | One fault of one version of a package, with its kind and how the campaign found it. |
| `upstream` | `upstream.json` | `finding`, `at`, `state` | One change of the state of a finding upstream. The latest row is the current state. |

- A run tests a package that speaks a protocol of its suite.
- A finding of a suite names its run. The run tested the same package.
- An issue, a pull request, a merge and a release each need their URL. A held fix and a private report have no URL.
- A security finding goes only through the private channel of the project. It does not go into a public issue.
- A security finding is in these public tables only after its advisory is public. Before that, it is only in the private repository `wirelab-held`.

## The check

`catalogProblems` gives one text for each problem, and `parseCatalog` throws an error that lists them. The import of the package checks the tables.

- Each field has a kind: a text, an https URL, a day, a UTC time, a count, or a value of a set.
- A row with an unknown field is a problem. So is a duplicate key or a key that names a missing row.
- Each package speaks a protocol. Each protocol with the client kind `library` has a package, and the other protocols have none.
- `tableText` gives the canonical text of a file: the rows in the order of the key. A test holds each file in that form.

## The priority order

`priorityOrder` gives the packages in the order of the campaign, with the parts of each score.

1. For each measure, the latest value of a package comes from its newest source.
2. The share of a package on a measure is `(rank - 0.5) / n` among the packages with that measure. Equal values get the mean rank. A share does not depend on the unit of the measure.
3. The reach of a package is the mean of its shares. A package with no measure goes last.
4. The chance that a fix lands multiplies the reach. Each factor of `LANDING` that applies multiplies the chance:
   - A deprecated package has the factor `LANDING.deprecated`, which is 0.1.
   - A package in an archived repository has the factor `LANDING.archived`, which is 0.1. A deprecated package does not get this factor too.
   - A repository that refuses contributions that an AI made has the factor `LANDING.aiRefused`, which is 0.2. The fix stays held until the rule changes.
   - A repository with a CLA has the factor `LANDING.cla`, which is 0.5. The fix stays held until Mark decides about the CLA.

The ranks come from `ranks` of `@mark1russell7/rigor-statistics`.
