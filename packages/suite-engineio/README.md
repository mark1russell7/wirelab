# @wirelab/suite-engineio

This package holds the conformance suite of the Engine.IO client `engine.io-client`, for HTTP long-polling, WebSocket and the upgrade between them. A scripted server gives a fixed list of replies and frames. The suite examines each request and each frame of the client. Each test names the rules of the Engine.IO protocol, version 4, that it examines.

## What the suite tests

The suite tests the client. The server is a list of replies and WebSocket steps from `startScriptedServer` of `@mark1russell7/rigor-testkit/http`. Thus each test controls each byte that the client gets, and the suite needs no Engine.IO server.

| File | What it has |
| --- | --- |
| `src/polling.test.ts` | The conformance checks: the handshake, the requests, the packet encoding, the heartbeat, `maxPayload` and the packet types. |
| `src/websocket.test.ts` | The conformance checks of the transport `NodeWebSocket`: the handshake, the frames, the heartbeat and the packet types. It also has the checks of the upgrade from HTTP long-polling. |
| `src/findings.test.ts` | The checks that show known faults of `engine.io-client` 6.6.8. Each check is `it.fails`. |
| `src/index.test.ts` | A check with no server: each check of `src/index.ts` has a test, and each test names its rules. |
| `src/codec.test.ts` | A check of the codec against the examples of the protocol document. |
| `src/codec.ts` | The packets and the payloads of the protocol, from the protocol document. The tests do not use `engine.io-parser`. |
| `src/harness.ts` | The helpers of the tests: the scripted session, the client and the records of the requests and the events. |
| `src/child.ts` | The client of one check in a separate process. It writes one line of JSON with its events and its uncaught errors. |
| `src/index.ts` | The rules and the checks as data. The entry also gives the codec and the scripted Engine.IO server `startEngineServer` to the suites of protocols on Engine.IO. |

- Each check of `src/polling.test.ts` examines the two transports of HTTP long-polling for Node.js: `NodeXHR` and `Fetch`.
- Each check of `src/websocket.test.ts` examines `NodeWebSocket`, the transport on the package `ws`. Each check of an upgrade examines two cases: the default transports (`NodeXHR` to `NodeWebSocket`) and `Fetch` to `NodeWebSocket`.
- A rule has the form `[EIO4-<group>-<number>]`. The title of the test names it.
- A test that shows a fault of `engine.io-client` is `it.fails`, with a comment `// client bug:` and the identifier of the finding. The test passes while the fault stays. When a release removes the fault, the test fails. Then change it to `it`.
- A test of a fault writes a line `client bug evidence:` to the log. The log of the CI job keeps the measured values.
- Each test removes its client and its server.

## Start the suite on your computer

Start the suite from the root of wirelab:

```sh
SUITE_ENGINEIO=1 pnpm --filter @wirelab/suite-engineio test
```

- When `SUITE_ENGINEIO` is not `1`, Vitest skips the checks of the client. Then only the checks of the data and the codec go. Thus the shared CI is not a test of the client.
- The suite needs no server and no network. It listens on a free port of `127.0.0.1`.
- Some tests measure time: the heartbeat and the time limit of a request. Thus the test files go one after the other. The full suite goes in CI, in the workflow `.github/workflows/suite-engineio.yml`.

## CI

The workflow `.github/workflows/suite-engineio.yml` starts the suite at these times:

- on each pull request that changes this package or the workflow,
- each Monday, so that a new release of `engine.io-client` in the range of `package.json` gets a test,
- when a person starts it: `gh workflow run suite-engineio.yml`.

Each job uploads the artifact `suite-engineio`, with the JSON report of Vitest.

## The rules

The rules come from the protocol document `README.md` of `socketio/engine.io-protocol`, for version 4. The column "Level" has the word of the document. `meaning` is the effect that the document gives to a packet.

| Rule | Section | Level | Rule in plain words |
| --- | --- | --- | --- |
| `EIO4-HS-1` | Handshake | `MUST` | The first request has `EIO=4` and `transport`, and it has no `sid`. |
| `EIO4-HS-2` | Handshake | `MUST` | Each request after the handshake has the `sid` of the open packet. |
| `EIO4-LP-1` | HTTP long-polling | `MUST` | The client has no more than one active GET request. |
| `EIO4-LP-2` | HTTP long-polling | `MUST` | The client has no more than one active POST request. |
| `EIO4-LP-3` | HTTP long-polling | `meaning` | The client sends its packets in the body of a POST request. |
| `EIO4-PE-1` | Packet encoding | `meaning` | The packets of one payload have the record separator `\x1e` between them. |
| `EIO4-PE-2` | Packet encoding | `MUST` | A binary packet is the character `b` and the base64 form of its bytes. |
| `EIO4-PE-3` | Packet encoding | `meaning` | A text packet is UTF-8 text. |
| `EIO4-HB-1` | Heartbeat | `meaning` | The client answers each `ping` packet with a `pong` packet. |
| `EIO4-HB-2` | Heartbeat | `SHOULD` | With no `ping` in `pingInterval` plus `pingTimeout`, the client closes the connection. |
| `EIO4-MP-1` | Handshake | `SHOULD` | A payload of two or more packets has no more than `maxPayload` bytes. |
| `EIO4-PT-1` | Packet types | `meaning` | A `close` packet of the server closes the connection. |
| `EIO4-PT-2` | Packet types | `meaning` | A `noop` packet gives no message to the application. |
| `EIO4-PT-3` | Packet types | `meaning` | The client gives the data of each `message` packet to the application, in order. |
| `EIO4-WS-1` | WebSocket | `meaning` | Each packet is in its own WebSocket frame, in the two directions. |
| `EIO4-WS-2` | Packet encoding | `meaning` | A binary packet is a binary frame with its bytes as they are. |
| `EIO4-WS-3` | WebSocket | `MUST` | The client opens no more than one WebSocket connection for each session. |
| `EIO4-UP-1` | Upgrade | `MUST` | The WebSocket connection of an upgrade has `EIO=4`, `transport=websocket` and the `sid` of the session. |
| `EIO4-UP-2` | Upgrade | `MUST` | The first packet of the client on that connection is a `ping` packet with the data `probe`. |
| `EIO4-UP-3` | Upgrade | `MUST` | After a `pong` packet with the data `probe`, the client sends an `upgrade` packet. |
| `EIO4-UP-4` | Upgrade | `MUST` | The client pauses HTTP long-polling: it sends no HTTP request after the `upgrade` packet. |
| `EIO4-UP-5` | Upgrade | `meaning` | The server gets each packet of the client one time, in order, across the upgrade. |
| `EIO4-UP-6` | Upgrade | `SHOULD` | With its default options, the client starts on HTTP long-polling and then changes to WebSocket. |

## The known faults of engine.io-client 6.6.8

| Finding | Check | Fault |
| --- | --- | --- |
| F0024 | `max-payload-binary` | The client counts 1.33 bytes for each byte of binary data. Base64 gives 4 bytes for each 3, so a payload is larger than `maxPayload`. |
| F0028 | `long-ping-interval` | Node.js changes a timer delay larger than 2^31-1 ms to 1 ms. Thus a long `pingInterval` closes the client at once. |
| F0030 | `request-timeout` | The transports `NodeXHR` and `Fetch` do not use the option `requestTimeout`. |
| F0031 | `close-aborts-poll` | `close()` does not stop the active GET request. |
| F0029 | `malformed-open`, `open-no-fields` | The client does not examine the open packet. A packet that is not JSON, or that has no fields, gives an uncaught error. |
| F0035 | `ws-close-packet` | Only the polling transport reads a `close` packet. Over WebSocket, the client ignores it and stays open. |
| F0032 | `probe-error-closes` | A wrong answer to the probe gives an `upgradeError`, but the client does not close the probe WebSocket. |
| F0026 | `fetch-body-cut` | The transport `Fetch` does not catch an error of the read of a body. A cut in the body gives an unhandled rejection, and the polling stops. |

The checks of F0029 and F0026 start the client in a separate process, with the script `src/child.ts`. An uncaught error stops the worker of a test, but in a separate process it stops only that process. The process writes a report of the events and the uncaught errors of the client.

The Socket.IO protocol has its own suite, `@wirelab/suite-socketio`. The WebSocket transport is not in this suite. It comes in a later part of the roadmap item W9.
