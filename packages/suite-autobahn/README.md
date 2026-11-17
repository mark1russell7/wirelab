# @wirelab/suite-autobahn

This package holds the Autobahn WebSocket test suite of four WebSocket clients. The suite connects each client to the fuzzing server of `crossbario/autobahn-testsuite`. The server sends the frames of each case, and the client sends each message back. Then the server gives a result for each case.

## The clients

| Name | Package | Options |
| --- | --- | --- |
| `ws` | `ws` | The default options. The client offers `permessage-deflate`. |
| `websocket` | `websocket` | The default options of `WebSocketClient`. |
| `faye-websocket` | `faye-websocket` | The default options of `Client`. |
| `node` | The `WebSocket` of Node.js, from its copy of `undici` | `binaryType` is `arraybuffer`. |

- The name of the client in the reports of the server is the agent: the name and the version, for example `ws-8.23.0`.
- The agent of `node` has the version of Node.js and the version of `undici`.
- `faye-websocket` stays at 0.11.4. The release 0.12.0 is newer than the minimum release age of the workspace.

## What the suite tests

The server is a fixed reference: the image `crossbario/autobahn-testsuite` 25.10.1 at the digest in the workflow.

| File | What it has |
| --- | --- |
| `src/autobahn.test.ts` | One test for each case and each client. Each client also has a test of the close behaviors. |
| `src/clients.ts` | The four clients. Each client sends back each message with its type. |
| `src/clients.test.ts` | A check with no fuzzing server: each client sends back a text and a binary message, and stops at the time limit. |
| `src/fuzzingserver.ts` | The API of the fuzzing server: the cases, the result of a case, the reports. |
| `src/known.ts` | The known failures of each client, with the identifier of each finding. |
| `config/fuzzingserver.json` | The configuration of the fuzzing server. |

- The results `OK`, `NON-STRICT`, `INFORMATIONAL` and `UNIMPLEMENTED` pass. `UNIMPLEMENTED` is an optional feature that the client does not offer.
- The cases `9.*` measure the speed with large messages. They take a long time and find no conformance fault, so the configuration excludes them.
- A case in `src/known.ts` is `it.fails`, with the identifier of its finding in the name of the test. The test passes while the fault stays. When a release removes the fault, the test fails. Then remove the case from `src/known.ts`.
- The close test compares the cases with a failed close behavior to the close list of `src/known.ts`.
- The server has a time limit for the cases `12.*` and `13.*`, from 60 to 480 seconds. The client waits that limit and 10 seconds more. Then the result of a slow case comes from the server.
- Each other case has a time limit of 20 seconds.
- A test of each client compares the time limits of `src/fuzzingserver.ts` to the expectations in the reports of the server.

## Start the suite on your computer

The suite needs Docker for the fuzzing server.

1. Start the fuzzing server from the root of wirelab:

   ```sh
   mkdir -p reports
   docker run --rm --name fuzzingserver \
     --volume "$PWD/packages/suite-autobahn/config:/config:ro" \
     --volume "$PWD/reports:/reports" \
     --publish 127.0.0.1:9001:9001 \
     crossbario/autobahn-testsuite:25.10.1 \
     wstest --mode fuzzingserver --spec /config/fuzzingserver.json
   ```

2. In a second terminal, start the suite from the root of wirelab:

   ```sh
   AUTOBAHN_URL=ws://127.0.0.1:9001 AUTOBAHN_REPORTS=$PWD/reports pnpm --filter @wirelab/suite-autobahn test
   ```

3. To start only the cases of one client, add its agent as a filter:

   ```sh
   AUTOBAHN_URL=ws://127.0.0.1:9001 pnpm --filter @wirelab/suite-autobahn exec vitest run -t "ws-8"
   ```

- When `AUTOBAHN_URL` has no value, Vitest skips the tests that need the fuzzing server. Thus `pnpm test` passes on a computer with no Docker.
- When `AUTOBAHN_REPORTS` has no value, Vitest skips the close tests.
- The full suite takes some minutes. CI starts it in the workflow `.github/workflows/suite-autobahn.yml`.

## CI

The workflow `.github/workflows/suite-autobahn.yml` starts the suite at these times:

- on each pull request that changes this package or the workflow,
- each Monday, so that a new release of a client gets a run,
- when a person starts it: `gh workflow run suite-autobahn.yml`.

Each run uploads the artifact `suite-autobahn`, with the reports of the fuzzing server, its log and the JSON report of Vitest.
