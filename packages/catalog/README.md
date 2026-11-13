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

- The field `client` of a protocol is `library`, `native` or `none`. A protocol with `none` often has a gateway, which the field `gateway` names.
- `packumentModified` is the day of the last change of the registry document. A deprecation also changes it, so it is not the day of the last release.
- An observed row names its source. A new read adds a source and new rows, and the old rows stay. Thus the tables keep the history.

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
4. The chance that a fix lands multiplies the reach. A deprecated package has the factor `LANDING.deprecated`, which is 0.1.

The ranks come from `ranks` of `@mark1russell7/rigor-statistics`.
