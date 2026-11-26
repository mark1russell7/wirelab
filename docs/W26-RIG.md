# W26: the bug-class rig

## The goal

Each bug that wirelab finds becomes a bug class. A bug class is data. A probe uses the data to find the same bug again, and every permutation of it, in each package that uses the same wire format. The rig is the product of the campaign. The issues and the pull requests upstream come from it.

## Why the rig is necessary

Before W26, each review wrote its own fake server and its own candidate scripts for one package. A repro proved one bug in one package. It did not find the bug anywhere else. The same classes came back in each review: a stream cut inside a length prefix that reads as a clean end, a frame boundary that moves on a bad field, a lookup that matches the keys of `Object.prototype`, a decode that throws and replaces the real error, a timer that runs after `close()`. Each time, a person wrote the check again by hand.

## The parts

| Part | What it is | Home |
| --- | --- | --- |
| Class | The rule that must hold, its oracle, its wire formats and its dimensions, as a row of the catalog | `packages/catalog` (table `classes`) |
| Dimensions | Named axes and their values: the field, the bad value, the phase of the connection, the size | `packages/catalog`. The draws and the seeds come from `@mark1russell7/rigor-generators` |
| Matrix | All the combinations of the dimensions of a class, or a covering array (pairwise or 3-way) when the full matrix is too large | covering arrays: `mark1russell7/rigor` (planned there, W26 adds them) |
| Adapter | One adapter for each wire format: it turns one combination into the bytes or frames that a hostile peer sends, and reads the result back | `packages/rig` (new, in wirelab) |
| Peer | A scripted server that sends the bytes of the adapter and records what the client sends | the scripted HTTP server of `@mark1russell7/rigor-testkit` (entry `/http`), widened for WebSocket and raw TCP where necessary. Faults on the path come from the fault plans of `rigor-chaos` through `rigor-proxy` |
| Target | One binding for each package: how to make a client, point it at the peer, and observe it (frames delivered, errors and their codes, memory, timers and handles after close, listener counts) | `packages/rig/targets` |
| Oracle | The check of the rule for one run: a fixed rule (for example "no handle after close resolves") or a differential (the same bytes give the same result in a reference implementation) | `packages/rig` |
| Gate | The catalog check: each finding has a class, each class has a probe, and each probe finds its known instances again on the bad versions | `packages/catalog` (`catalogProblems`) and CI |

Each general part goes to its home in the same step that needs it, not later. A wirelab PR that uses a new general part links the PR of its home.

## The formats

1. Length-prefixed envelopes: gRPC-web, Connect, MQTT remaining length, Avro, BSON, msgpack, CBOR.
2. Text frames with headers: STOMP, SockJS, Engine.IO, Socket.IO, SSE.
3. JSON over HTTP and WebSocket: GraphQL over HTTP and WebSocket, JSON-RPC, tRPC, oRPC.
4. URLs and headers: the URLs, the query strings and the headers that a client writes from the values of the app.

The first adapter is format 1.

## The steps

1. Classify the 225 public findings and the private findings into classes. The private findings map only in `wirelab-held`.
2. Add the table `classes`, the field `class` of each finding, and the gate.
3. Write the first adapter (format 1), the peer and the oracles, with the first classes.
4. Prove each class: it finds its known instances again on the bad versions, and it passes on the fixed versions. connect-web 2.3.0 is the first package to find again before its issues go out.
5. Write the adapters of formats 2, 3 and 4.
6. Run each class across each package of its formats, in public CI. A gate holds the hit rate of each class.

## Security classes

Some classes are in the security set: injection, desync and smuggling, prototype pollution, cleartext, parser differentials, out-of-bounds reads and denial of service. A probe of such a class can find a fault that is not public yet. Its results go only to `wirelab-held`, and its runs on packages with an open report happen only in private. A result becomes public after the disclosure.
