# @wirelab/suite-graphql-http

This package holds the GraphQL over HTTP suite of four GraphQL clients. A scripted server gives a fixed list of replies. The suite examines each request of a client and the outcome that the caller gets. Each test names the rules of the spec GraphQL over HTTP that it examines.

## What the suite tests

The suite tests the clients. The server is a list of replies from `startScriptedServer` of `@mark1russell7/rigor-testkit/http`. Thus each test controls each byte that the client gets, and the suite needs no GraphQL server.

| Client | Version | What the suite uses |
| --- | --- | --- |
| `graphql-http` | 1.23.1 | `createClient`, the reference client of the spec |
| `graphql-request` | 7.4.0 | `GraphQLClient` and `rawRequest`, with `errorPolicy: "all"` |
| `@urql/core` | 6.0.3 | `Client` with `fetchExchange` alone |
| `@apollo/client` | 4.3.8 | `ApolloClient` with `HttpLink`, `fetchPolicy: "no-cache"` and `errorPolicy: "all"` |

| File | What it has |
| --- | --- |
| `src/requests.test.ts` | The checks of the requests: the fields `Accept` and `Content-Type`, the JSON body of POST and the URL query of GET. |
| `src/responses.test.ts` | The checks of the replies: the status codes 4xx and 294, the media types and the charset of a result. |
| `src/index.test.ts` | A check with no server: each rule has a check, each check names its rules, and the installed clients have the pinned versions. |
| `src/harness.test-kit.ts` | The helpers of the tests, in a file name of tests because they import Vitest: one adapter for each client, the operations, the scripted server and the function `check`. |
| `src/index.ts` | The rules, the clients, the checks and the verdicts as data. |

- Each check has one test for each client. The title of the test starts with the name of the check and names its rules, in the form `[G<number>]`.
- An adapter gives one outcome for each client: the data, the messages of the GraphQL errors and the failure. Thus one check examines the four clients.
- The table `verdicts` of `src/index.ts` has the verdicts that are not a pass. A known fault is `it.fails`, with a comment `// client bug:` and the identifier of the finding. The test passes while the fault stays. When a release removes the fault, the test fails. Then remove the verdict.
- A rule that does not apply to a client is a skip with its reason. The title of the test shows the reason.
- A test writes a line `evidence:` to the log. The log of the CI job keeps the measured values.
- Each test closes its servers and stops its clients.

## Start the suite on your computer

Start the suite from the root of wirelab:

```sh
SUITE_GRAPHQL_HTTP=1 pnpm --filter @wirelab/suite-graphql-http test
```

- When `SUITE_GRAPHQL_HTTP` is not `1`, Vitest skips the checks of the clients. Then only the checks of the data go. Thus the shared CI is not a test of the clients.
- The suite needs no server and no network. It listens on a free port of `127.0.0.1`.
- The suite uses the global `fetch` of Node 24. The full suite goes in CI, in the workflow `.github/workflows/suite-graphql-http.yml`.

## CI

The workflow `.github/workflows/suite-graphql-http.yml` starts the suite at these times:

- on each pull request that changes this package or the workflow,
- each Monday, so that the record of the pinned clients stays current,
- when a person starts it from the Actions page of the repository.

Each job uploads the artifact `suite-graphql-http`, with the JSON report of Vitest.

## The rules

The rules come from the spec `spec/GraphQLOverHTTP.md` of `graphql/graphql-over-http`, at commit `2fe5c32`. The column "Level" has the word of the spec. `RFC 9110` is a rule of HTTP that the spec quotes, and `note` is a note with no force.

| Rule | Section | Level | Rule in plain words |
| --- | --- | --- | --- |
| `G1` | Accept | `MUST` | Each request has an `Accept` field. |
| `G2` | Accept | `MUST` | The `Accept` field has the media type `application/graphql-response+json`. |
| `G3` | Accept | `SHOULD` | With no config about the server, the `Accept` field is `application/graphql-response+json, application/json;q=0.9`. |
| `G4` | POST | `MUST` | A POST request has a `Content-Type` field. |
| `G5` | POST | `SHOULD` | By default, the body of a POST request is JSON with `Content-Type: application/json`. A `charset` parameter is permitted. |
| `G6` | JSON Encoding | `MUST NOT` | The body is a JSON object with no keys other than `query`, `operationName`, `variables` and `extensions`. |
| `G7` | JSON Encoding | `MUST` | `query` is a string. `operationName` is a string, and `variables` and `extensions` are objects, when they are present and not `null`. |
| `G8` | GET | `MUST` | A GET request has the parameters in the URL query, in the encoding of `URLSearchParams`. `variables` and `extensions` are JSON texts. |
| `G9` | GET | `MUST NOT` | The client does not send a mutation with GET. The server refuses it. |
| `G10` | Status Codes | `should` | A reply 400 or 422 of the type `application/graphql-response+json` with `errors` gives those GraphQL errors to the caller. |
| `G11` | Partial success | `RFC 9110` | A reply 294 with `data` and `errors` is a reply of the success class. RFC 9110 makes it equal to 200. |
| `G12` | Media Types | `MUST` | The type `application/graphql-response+json` with no `charset` is UTF-8. The client decodes non-ASCII text of the result as UTF-8. |
| `G13` | Body | `MUST` | The client reads the type `application/graphql-response+json` also with parameters, for example `charset=utf-8`, and in each letter case. |
| `G14` | Body | `SHOULD` | A reply 200 of the type `application/json` with a result gives that result to the caller. |
| `G15` | Status Codes | `note` | A reply 4xx or 5xx of a type that is not GraphQL, for example `text/html`, gives an error that holds the HTTP status. |

The spec tells that `null` for an optional parameter is equal to no parameter. Thus the check `post-types` accepts `null` for `operationName`, `variables` and `extensions`.

## The verdicts

| Check | `graphql-http` | `graphql-request` | `@urql/core` | `@apollo/client` |
| --- | --- | --- | --- | --- |
| `accept-default` | fails, F0208 | fails, F0211 | fails, F0212 | pass |
| `get-params`, `get-no-mutation` | skip: POST only | pass | pass | pass |
| `get-query-text` | skip: POST only | fails, F0179 | pass | pass |
| `get-no-mutation-options` | skip: POST only | fails, F0176 | skip: no option | skip: no option |
| `errors-4xx` | fails, F0209 | pass | pass | pass |
| `media-type-case` | fails, F0210 | pass | pass | fails, F0213 |

Each other check passes for each client. The catalog of wirelab has each finding, with its evidence.
