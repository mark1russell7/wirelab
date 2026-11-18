# @wirelab/suite-sockjs

This package holds the conformance suite of the SockJS client `sockjs-client`, for the transports WebSocket, `xhr-streaming`, `xhr-polling` and `eventsource`. A scripted server gives a fixed list of replies and frames. The suite examines each request and each event of the client. Each test names the rules of the SockJS protocol, version 0.3.3, that it examines.

## What the suite tests

The suite tests the client. The server is a list of replies and WebSocket steps from `startScriptedServer` of `@mark1russell7/rigor-testkit/http`. Thus each test controls each byte that the client gets, and the suite needs no SockJS server.

| File | What it has |
| --- | --- |
| `src/session.test.ts` | The conformance checks of the request of `/info` and of the top session URL: `server_id` and `session_id`. |
| `src/frames.test.ts` | The conformance checks of the frames `o`, `h`, `a` and `c`, and of the JSON Unicode encoding. Each check examines the four transports. |
| `src/transports.test.ts` | The conformance checks of one transport: `xhr_send`, the preludes, the response limit of the streaming transports and the WebSocket messages. |
| `src/findings.test.ts` | The checks that show known faults of `sockjs-client` 1.6.1. Each check is `it.fails`. |
| `src/index.test.ts` | A check with no server: each check of `src/index.ts` has a test, and each test names its rules. |
| `src/codec.test.ts` | A check of the codec against the examples and the lists of the protocol document. |
| `src/codec.ts` | The frames, the preludes and the escape lists of the protocol, from the protocol document. The tests do not use the code of a SockJS server. |
| `src/harness.ts` | The helpers of the tests: one script of frames for the four transports, the client and the records of the requests and the events. |
| `src/index.ts` | The rules and the checks as data. The entry also gives the codec and the scripted SockJS server `startSockServer` to the suites of protocols on SockJS. |

- One script of frames goes to each transport. The server sends each frame as `<frame>\n` on `xhr` and `xhr_streaming`, as `data: <frame>\r\n\r\n` on `eventsource`, and as one text message on WebSocket.
- The client gets the options `server: "000"` and a function `sessionId` that gives `wirelab-session`. Thus the routes of the server know each URL. The check `default-ids` examines the defaults of the client.
- A rule has the form `[SJ-<group>-<number>]`. The title of the test names it.
- A test that shows a fault of `sockjs-client` is `it.fails`, with a comment `// client bug:` and the identifier of the finding. The test passes while the fault stays. When a release removes the fault, the test fails. Then change it to `it`.
- A test of a fault writes a line `client bug evidence:` to the log. The log of the CI job keeps the measured values.
- Each test removes its client and its server.

## Start the suite on your computer

Start the suite from the root of wirelab:

```sh
SUITE_SOCKJS=1 pnpm --filter @wirelab/suite-sockjs test
```

- When `SUITE_SOCKJS` is not `1`, Vitest skips the checks of the client. Then only the checks of the data and the codec go. Thus the shared CI is not a test of the client.
- The suite needs no server and no network. It listens on a free port of `127.0.0.1`.
- Some tests measure time: the open frame and the time limit of a transport. Thus the test files go one after the other. The full suite goes in CI, in the workflow `.github/workflows/suite-sockjs.yml`.

## CI

The workflow `.github/workflows/suite-sockjs.yml` starts the suite at these times:

- on each pull request that changes this package or the workflow,
- each Monday, so that a new release of `sockjs-client` in the range of `package.json` gets a test,
- when a person starts it: `gh workflow run suite-sockjs.yml`.

Each job uploads the artifact `suite-sockjs`, with the JSON report of Vitest.

## The rules

The rules come from the protocol document `sockjs-protocol.py` of `sockjs/sockjs-protocol`, for version 0.3.3. The column "Level" has the word of the document. `meaning` is the effect that the document gives to a frame, a field or a request.

| Rule | Section | Level | Rule in plain words |
| --- | --- | --- | --- |
| `SJ-IN-1` | Info test | `meaning` | The client requests `/info` before it starts the session. |
| `SJ-IN-2` | Info test | `meaning` | With `websocket: false` in the info, the client does not use the WebSocket transport. |
| `SJ-SU-1` | Top session URL | `SHOULD` | The client chooses a `server_id` of three digits, from `000` to `999`. |
| `SJ-SU-2` | Top session URL | `MUST` | The `session_id` is a random string, unique for each session. |
| `SJ-SU-3` | Top session URL | `meaning` | The `session_id` identifies the session. Thus each request of one session has the same `session_id`. |
| `SJ-SU-4` | Top session URL | `MUST` | The API of the client does not give the `session_id` to the application. |
| `SJ-PF-1` | Protocol and framing | `meaning` | The open frame `o` tells the client that the session is open. |
| `SJ-PF-2` | Protocol and framing | `meaning` | A heartbeat frame `h` keeps the connection open. It has no message. |
| `SJ-PF-3` | Protocol and framing | `meaning` | An array frame `a` holds a JSON array of messages. The client gives each message, in order. |
| `SJ-PF-4` | Protocol and framing | `meaning` | A close frame `c` holds a code and a reason. The client closes with that code and that reason. |
| `SJ-PF-5` | Protocol and framing | `meaning` | The server sends the close frame again for each request on a closed session. The client closes one time. |
| `SJ-PF-6` | Protocol and framing | `meaning` | The server answers a second receiving request with the close frame `2010`. Thus the client keeps one receiving request at a time. |
| `SJ-XP-1` | XhrPolling | `meaning` | The client sends its messages in the body of a POST request to `xhr_send`, as a JSON array of strings. |
| `SJ-XS-1` | XhrStreaming | `meaning` | The reply of `xhr_streaming` starts with a prelude of 2048 `h` bytes and a new line. The prelude gives no message. |
| `SJ-XS-2` | XhrStreaming | `meaning` | The server ends a streaming request after a quantity of data. The client then opens a new receiving request. |
| `SJ-ES-1` | EventSource | `meaning` | The reply of `eventsource` starts with the prelude `\r\n`. The prelude gives no message. |
| `SJ-ES-2` | EventSource | `meaning` | The server ends an `eventsource` request after a quantity of data. The client then opens a new receiving request. |
| `SJ-WS-1` | WebSocket | `meaning` | The server reads each WebSocket message of the client as JSON: one message, or an array of messages. |
| `SJ-JU-1` | JSON Unicode Encoding | `SHOULD` | SockJS delivers each valid string from the client to the server and back, with no change. |
| `SJ-JU-2` | JSON Unicode Encoding | `MUST` | The client escapes each character of `escapable_by_client` as `\uXXXX`. |

The section "Handling close" gives no rule for the client. The document tells that its details "don't matter that much to the client side".

## The known faults of sockjs-client 1.6.1

| Finding | Check | Fault |
| --- | --- | --- |
| F0149 | `client-escapes` | The client sends 288 code units of `escapable_by_client` with no escape: U+007F to U+009F, U+00AD, U+FEFF and most of U+2000 to U+20FF. |
| F0069 | `close-in-listener` | After `close()` in a message listener, the rest of the same array frame still gives message events, with `readyState` 2. |
| F0092 | `close-code-zero` | `close(0)` and `close(NaN)` do not throw `InvalidAccessError`. They close the socket with the code 1000. |
| F0094 | `close-connecting-info`, `close-connecting-transport` | `close()` before the open frame gives close 1000 with `wasClean` true. An error event comes only while `/info` is pending. |
| F0099 | `query-question-mark` | The client cuts the base URL at each `?`. Thus a query with a second `?` loses its end on each request. |

The checks of F0069, F0092 and F0094 examine the WebSocket API that the client copies. The check of F0099 examines the use of the base URL. These checks name no rule of the SockJS protocol.

The EventSource receiver of the client gives each data to `decodeURI`. The protocol document shows no frame with `%`. The reference server sockjs-node writes `%`, CR, LF and NUL as `%XX`, and the scripted server of the suite does the same. The Unicode checks send `%` sequences on each transport.
