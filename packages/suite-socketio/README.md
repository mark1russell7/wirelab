# @wirelab/suite-socketio

This package holds the conformance suite of the Socket.IO client `socket.io-client`, for the transport HTTP long-polling. A scripted server gives a fixed list of replies, and the suite examines each packet of the client. Each test names the rules of the Socket.IO protocol, version 5, that it examines.

## What the suite tests

The suite tests the client. The server is the scripted Engine.IO server of `@wirelab/suite-engineio`, at the path `/socket.io/`. Thus each test controls each byte that the client gets, and the suite needs no Socket.IO server.

| File | What it has |
| --- | --- |
| `src/protocol.test.ts` | The conformance checks: the connection to a namespace, events, acknowledgements, binary packets and the disconnection. |
| `src/findings.test.ts` | The checks that show known faults of `socket.io-client` 4.8.4. Each check is `it.fails`. |
| `src/index.test.ts` | A check with no server: each check of `src/index.ts` has a test, and each test names its rules. |
| `src/codec.test.ts` | A check of the codec against the examples of the protocol document. |
| `src/codec.ts` | The Socket.IO packets, from the protocol document. The tests do not use `socket.io-parser`. |
| `src/harness.ts` | The helpers of the tests: the scripted session, the manager, its sockets and the records of the packets and the events. |
| `src/index.ts` | The rules and the checks as data. |

- Each check examines the two transports of HTTP long-polling for Node.js: `NodeXHR` and `Fetch`.
- A rule has the form `[SIO5-<group>-<number>]`. The title of the test names it.
- The parts of a binary packet can go in different POST bodies. Thus the harness joins the attachments over all POST bodies, in order.
- A test that shows a fault of `socket.io-client` is `it.fails`, with a comment `// client bug:` and the identifier of the finding. The test passes while the fault stays. When a release removes the fault, the test fails. Then change it to `it`.
- A test of a fault writes a line `client bug evidence:` to the log. The log of the CI job keeps the measured values.
- Each test removes its manager and its server.

## Start the suite on your computer

Start the suite from the root of wirelab:

```sh
SUITE_SOCKETIO=1 pnpm --filter @wirelab/suite-socketio test
```

- When `SUITE_SOCKETIO` is not `1`, Vitest skips the checks of the client. Then only the checks of the data and the codec go. Thus the shared CI is not a test of the client.
- The suite needs no server and no network. It listens on a free port of `127.0.0.1`.
- Some tests use the delays of the scripted server. Thus the test files go one after the other. The full suite goes in CI, in the workflow `.github/workflows/suite-socketio.yml`.

## CI

The workflow `.github/workflows/suite-socketio.yml` starts the suite at these times:

- on each pull request that changes this package, the Engine.IO suite or the workflow,
- each Monday, so that a new release of `socket.io-client` in the range of `package.json` gets a test,
- when a person starts it: `gh workflow run suite-socketio.yml`.

Each job uploads the artifact `suite-socketio`, with the JSON report of Vitest.

## The rules

The rules come from the protocol document `docs/socket.io-protocol/v5-current.md` of `socketio/socket.io`, for version 5. The column "Level" has the word of the document. `meaning` is the effect that the document gives to a packet.

| Rule | Section | Level | Rule in plain words |
| --- | --- | --- | --- |
| `SIO5-CN-1` | Connection to a namespace | `MUST` | The client sends a `CONNECT` packet for a namespace before the other packets of that namespace. |
| `SIO5-CN-2` | Connection to a namespace | `meaning` | A `CONNECT` packet of the server with a session ID connects the namespace. |
| `SIO5-CN-3` | Connection to a namespace | `meaning` | A `CONNECT_ERROR` packet of the server refuses the connection to the namespace. |
| `SIO5-CN-4` | Connection to a namespace | `meaning` | The payload of the `CONNECT` packet of the client has more data, for example a token. |
| `SIO5-CN-5` | Connection to a namespace | `meaning` | The client connects to two or more namespaces on one connection. |
| `SIO5-EV-1` | Sending and receiving data | `MUST` | The payload of an `EVENT` packet is a non-empty array. |
| `SIO5-EV-2` | Sending and receiving data | `MUST` | The receiver of an `EVENT` packet with a payload that is not a non-empty array closes the connection. |
| `SIO5-AK-1` | Acknowledgement | `meaning` | An event ID in an `EVENT` packet asks the receiver for an acknowledgement. |
| `SIO5-AK-2` | Acknowledgement | `MUST` | The receiver responds with an `ACK` packet with the same event ID. |
| `SIO5-AK-3` | Acknowledgement | `MUST` | The payload of an `ACK` packet is an array, and the array can be empty. |
| `SIO5-DC-1` | Disconnection from a namespace | `meaning` | A `DISCONNECT` packet ends the connection to one namespace, and it gets no response. |
| `SIO5-PE-1` | Format | `meaning` | A packet is its type, the number of attachments, the namespace, the event ID and the payload, in that order. |
| `SIO5-PE-2` | Format | `meaning` | A packet of the main namespace `/` has no namespace part. |
| `SIO5-PE-3` | Format | `meaning` | A binary packet has a placeholder for each attachment, and the attachments follow the packet in order. |
| `SIO5-PE-4` | Packet encoding | `meaning` | Each Socket.IO packet is one Engine.IO `message` packet. |

## The known faults of socket.io-client 4.8.4

| Finding | Check | Fault |
| --- | --- | --- |
| F0055 | `volatile-before-connect` | A volatile event before the connection of a namespace goes out after the connection. The client examines only the transport. |
| F0057 | `second-connect` | `connect()` during the handshake of a namespace sends a second `CONNECT` packet. |
| F0058 | `disconnect-during-connect` | `disconnect()` during the handshake of a namespace sends no `DISCONNECT` packet. The server keeps an orphan socket. |
| F0059 | `reconnection-attempts-zero` | The option `reconnectionAttempts: 0` becomes `Infinity`, thus the client reconnects. |
| F0060 | `recovered-false` | `socket.recovered` is `undefined`, not `false`, when the server does not use the recovery of the connection state. |
| F0066 | `offset-event-name` | With the recovery of the connection state, an event with only its name becomes the offset of the next `CONNECT` packet. |
| F0066 | `offset-string-argument` | With the recovery of the connection state, an event with a string as its last argument and no offset changes the offset of the next `CONNECT` packet. |
| F0064 | `retries-without-ack-timeout` | With `retries` and no `ackTimeout`, a positive acknowledgement goes to the callback as the error, and the client sends the event again. |
| F0067 | `eleven-attachments` | The decoder of the client accepts no more than 10 attachments, but the server sends more. An event with 11 buffers gives a parse error. |

The WebSocket transport is not in this suite. It comes in a later part of the roadmap item W9.
