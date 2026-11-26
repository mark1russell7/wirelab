/**
 * The rules and the checks of the SockJS suite, as data. A rule is one statement of the SockJS protocol, version 0.3.3,
 * for the client. A check is one test of the suite, and it names the rules that it examines.
 *
 * @packageDocumentation
 */

// The suites of protocols on SockJS, for example STOMP, use the codec and the scripted server of this suite. The rig
// (@wirelab/rig) uses the sessions of this suite for its targets of sockjs-client.
export * from "./codec.ts";
export {
  basePath,
  defaultInfo,
  routesOf,
  sendAccepted,
  serverId,
  sessionId,
  sessionPath,
  startSession,
  startSockServer,
  transports,
  until,
  type ClientOptions,
  type Info,
  type Session,
  type SessionScript,
  type TransportName,
} from "./harness.ts";

/** The force of a rule. `MUST` and `SHOULD` come from the protocol document. `meaning` is the effect that the document gives to a frame, a field or a request. */
export type RuleLevel = "MUST" | "SHOULD" | "meaning";

/** One rule of the protocol for the client. */
export interface Rule {
  /** The identifier of the rule, in the form `SJ-<group>-<number>`. */
  readonly id: string;
  /** The section of the protocol document that has the rule. */
  readonly section: string;
  readonly level: RuleLevel;
  /** The rule in plain words. */
  readonly text: string;
}

/** The test file of a check. */
export type CheckFile = "session.test.ts" | "frames.test.ts" | "transports.test.ts" | "findings.test.ts";

/** One check of the suite. */
export interface Check {
  /** The name of the check. The title of its test starts with this name and a colon. */
  readonly id: string;
  /** The rules that the check examines. A check of a finding has no rules when it examines the WebSocket API of the client. */
  readonly rules: readonly string[];
  readonly file: CheckFile;
  /** The identifier of the finding in the catalog, for a check that shows a known fault of the client. */
  readonly finding?: string;
}

/** The version of the protocol document that the rules come from. */
export const protocolSource: string = "sockjs/sockjs-protocol, sockjs-protocol.py, protocol version 0.3.3";

/** The rules of the protocol that the suite examines. */
export const rules: readonly Rule[] = [
  { id: "SJ-IN-1", section: "Info test", level: "meaning", text: "The client requests `/info` before it starts the session." },
  { id: "SJ-IN-2", section: "Info test", level: "meaning", text: "The field `websocket` of the info tells if the server has WebSocket. With `false`, the client does not use the WebSocket transport." },
  { id: "SJ-SU-1", section: "Top session URL", level: "SHOULD", text: "The client chooses a `server_id` of three digits, from `000` to `999`." },
  { id: "SJ-SU-2", section: "Top session URL", level: "MUST", text: "The `session_id` is a random string, unique for each session." },
  { id: "SJ-SU-3", section: "Top session URL", level: "meaning", text: "The `session_id` identifies the session. Thus each request of one session has the same `session_id`." },
  { id: "SJ-SU-4", section: "Top session URL", level: "MUST", text: "The API of the client does not give the `session_id` to the application." },
  { id: "SJ-PF-1", section: "Protocol and framing", level: "meaning", text: "The open frame `o` tells the client that the session is open." },
  { id: "SJ-PF-2", section: "Protocol and framing", level: "meaning", text: "A heartbeat frame `h` keeps the connection open. It has no message." },
  { id: "SJ-PF-3", section: "Protocol and framing", level: "meaning", text: "An array frame `a` holds a JSON array of messages. The client gives each message, in order." },
  { id: "SJ-PF-4", section: "Protocol and framing", level: "meaning", text: "A close frame `c` holds a code and a reason. The client closes with that code and that reason." },
  { id: "SJ-PF-5", section: "Protocol and framing", level: "meaning", text: "The server sends the close frame again for each request on a closed session. The client closes one time." },
  { id: "SJ-PF-6", section: "Protocol and framing", level: "meaning", text: "The server answers a second receiving request of one session with the close frame `2010`. Thus the client keeps one receiving request at a time." },
  { id: "SJ-XP-1", section: "XhrPolling", level: "meaning", text: "The client sends its messages in the body of a POST request to `xhr_send`, as a JSON array of strings." },
  { id: "SJ-XS-1", section: "XhrStreaming", level: "meaning", text: "The reply of `xhr_streaming` starts with a prelude of 2048 `h` bytes and a new line. The prelude gives no message." },
  { id: "SJ-XS-2", section: "XhrStreaming", level: "meaning", text: "The server ends a streaming request after a quantity of data. The client then opens a new receiving request of the same session." },
  { id: "SJ-ES-1", section: "EventSource", level: "meaning", text: "The reply of `eventsource` starts with the prelude `\\r\\n`. The prelude gives no message." },
  { id: "SJ-ES-2", section: "EventSource", level: "meaning", text: "The server ends an `eventsource` request after a quantity of data. The client then opens a new receiving request of the same session." },
  { id: "SJ-WS-1", section: "WebSocket", level: "meaning", text: "The server reads each WebSocket message of the client as JSON: one message, or an array of messages, for example `[\"a\"]`." },
  { id: "SJ-JU-1", section: "JSON Unicode Encoding", level: "SHOULD", text: "SockJS delivers each valid string from the client to the server and back, with no change." },
  { id: "SJ-JU-2", section: "JSON Unicode Encoding", level: "MUST", text: "The client escapes each character of `escapable_by_client` as `\\uXXXX`." },
];

/** The checks of the suite. */
export const checks: readonly Check[] = [
  // The checks of the info request and of the top session URL.
  { id: "info-first", rules: ["SJ-IN-1"], file: "session.test.ts" },
  { id: "info-websocket-off", rules: ["SJ-IN-2"], file: "session.test.ts" },
  { id: "default-ids", rules: ["SJ-SU-1", "SJ-SU-2"], file: "session.test.ts" },
  { id: "session-id", rules: ["SJ-SU-3"], file: "session.test.ts" },
  { id: "session-hidden", rules: ["SJ-SU-4"], file: "session.test.ts" },
  // The checks of the frames. Each check examines each transport of the suite.
  { id: "open", rules: ["SJ-PF-1"], file: "frames.test.ts" },
  { id: "heartbeat", rules: ["SJ-PF-2"], file: "frames.test.ts" },
  { id: "messages", rules: ["SJ-PF-3"], file: "frames.test.ts" },
  { id: "close-frame", rules: ["SJ-PF-4"], file: "frames.test.ts" },
  { id: "close-once", rules: ["SJ-PF-5"], file: "frames.test.ts" },
  { id: "unicode-receive", rules: ["SJ-JU-1"], file: "frames.test.ts" },
  { id: "unicode-send", rules: ["SJ-JU-1"], file: "frames.test.ts" },
  // The checks of one transport or of the transports on HTTP.
  { id: "xhr-send", rules: ["SJ-XP-1"], file: "transports.test.ts" },
  { id: "one-receiver", rules: ["SJ-PF-6"], file: "transports.test.ts" },
  { id: "streaming-prelude", rules: ["SJ-XS-1"], file: "transports.test.ts" },
  { id: "streaming-limit", rules: ["SJ-XS-2"], file: "transports.test.ts" },
  { id: "eventsource-prelude", rules: ["SJ-ES-1"], file: "transports.test.ts" },
  { id: "eventsource-limit", rules: ["SJ-ES-2"], file: "transports.test.ts" },
  { id: "ws-send", rules: ["SJ-WS-1"], file: "transports.test.ts" },
  { id: "client-escapes", rules: ["SJ-JU-2"], file: "findings.test.ts", finding: "F0149" },
  // These checks examine the WebSocket API that the client copies, or its documented use of the URL. They are not
  // tests of a rule of the SockJS protocol.
  { id: "close-in-listener", rules: [], file: "findings.test.ts", finding: "F0069" },
  { id: "close-code-zero", rules: [], file: "findings.test.ts", finding: "F0092" },
  { id: "close-connecting-info", rules: [], file: "findings.test.ts", finding: "F0094" },
  { id: "close-connecting-transport", rules: [], file: "findings.test.ts", finding: "F0094" },
  { id: "query-question-mark", rules: [], file: "findings.test.ts", finding: "F0099" },
];
