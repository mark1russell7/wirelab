# Roadmap

This file is the plan of wirelab. The Status page of the site reads it, and the tracker of the project mirrors it.

wirelab tests the browser clients of the wire protocols, and it sends a fix for each bug that it finds. The catalog of the clients is a set of tables in `packages/catalog`. A formula over the tables gives the order of the work: the most used client comes first.

## The rules of the work

- Each tool goes to its home package. The map of homes in `conventions map` names the home.
- Each heavy or timing-sensitive test runs in the CI of this public repository, not on a shared computer.
- A fix goes upstream under the account `mark1russell7`. First comes an issue with a failing test, then a pull request. Each pull request has one bug and tells that an AI helped.
- A repository that refuses AI contributions gets a local fix that stays held. A project that needs a CLA gets the same, and Mark gets a hub ask for each case.
- A security fault goes only through the private channel of the project.
- The data comes only from free sources: npm, deps.dev and jsDelivr.

## The items

| ID | Item | Status | Priority | Summary |
| --- | --- | --- | --- | --- |
| W0 | The role of wirelab | waiting | P1 | Mark confirms the role request `wirelab` on the hub with a passkey. |
| W1 | The catalog tables | done | P0 | The tables of families, transports, protocols, packages, links, sources, registry rows and use, with their check and the priority formula. |
| W2 | The use measures in `@procedures/npm` | done | P0 | Request builders and extractors for npm downloads, deps.dev dependents, jsDelivr hits and the full registry document. The fetch is a parameter. |
| W3 | The measure run | blocked | P0 | A run passes the fetch of `polite-crawler` to the measures and adds a source with its rows. A weekly workflow opens a pull request with the new rows. The code is in draft PR #9. It waits for `@procedures/npm` 0.55.2 on npm. |
| W4 | Repositories and their policies | active | P1 | The repository of each package, and its AI policy, CLA and security channel, each with its source and day. The landing factors use them. PR #13 added the tables and the factors. A second PR adds 24 repositories, the topic `contributions` and the factor for an archived repository. |
| W5 | The catalog on the site | later | P1 | The site shows the ranked catalog, with filters and the parts of each score. It replaces the first site of the template. |
| W6 | Fault plans in `rigor-chaos` | done | P1 | A fault plan is seeded data: delays, cuts, resets, split frames, reorders, duplicates and stalls, at planned times. |
| W7 | The package `rigor-proxy` | done | P1 | A proxy applies a fault plan to TCP, WebSocket and HTTP streams, and records each fault. Its tests run in CI. |
| W8 | The transports of each package | later | P1 | `codeatlas` reads each published package and records the browser APIs that it calls, with the file and line as evidence. |
| W9 | Conformance suites in CI | active | P0 | The Autobahn suite, the Engine.IO and Socket.IO suites, `sockjs-protocol`, the `graphql-http` audit and the Connect conformance suite, in browsers. |
| W10 | Findings and the upstream ledger | done | P0 | The tables of suites, runs, findings and upstream states. Held fixes go to the private repository `wirelab-held`. |
| W11 | Protocol state machines | later | P1 | Each protocol as a state machine in `@mark1russell7/algebra`, with trace replay. Engine.IO and Socket.IO come first. |
| W12 | Fuzz and property tests | later | P2 | Generated frames and sequences for each protocol, with `fast-check` and the generators of `rigor`. |
| W13 | The share of a client in a large package | later | P2 | The downloads of a large package, for example `rxjs`, count all its users. Import counts of the client module correct the reach. |
| W14 | The table check moves to its home | blocked | P3 | The check of the tables goes to `@mark1russell7/sqlite` when that home has a table schema. |
| W15 | Chaos, load and cluster layers | later | P2 | Fault plans and load schedules on the servers of the suites, and `kind` clusters where a protocol needs a fleet. All in CI. |
| W16 | Reviews of the top packages | active | P0 | Each package, in the priority order, gets a review of its published code. Each finding has a small failing repro and a check for duplicates upstream. |

## The priority formula

`priorityOrder` of `packages/catalog` gives the order. The package README tells the steps.

1. The share of a package on a measure is its place among the packages with that measure, from 0 to 1.
2. The reach of a package is the mean of its shares.
3. The chance that a fix lands multiplies the reach. A deprecated package has the factor 0.1. A package in an archived repository also has the factor 0.1, but only once. A repository that refuses AI contributions has the factor 0.2, and a repository with a CLA has the factor 0.5.

npm downloads count the installs that come through other packages, and deps.dev counts the transitive dependents. Thus the reach includes transitive use.

### Known limits

- On 2026-11-13, only 43 of 206 packages have a measure. The npm downloads API stopped after 43 requests. Item W3 measures all of them.
- The downloads of a package with many modules overstate the use of its client. An example is `rxjs`, where only `rxjs/webSocket` is a client. Item W13 corrects it.
