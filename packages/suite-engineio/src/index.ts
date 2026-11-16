/**
 * The rules and the checks of the Engine.IO suite, as data. A rule is one statement of the Engine.IO protocol, version
 * 4, for the client. A check is one test of the suite, and it names the rules that it examines.
 *
 * @packageDocumentation
 */

// The suites of protocols on Engine.IO, for example Socket.IO, use the codec and the scripted server of this suite.
export * from "./codec.ts";
export {
  accepted,
  active,
  bytesOf,
  defaultHandshake,
  enginePath,
  largest,
  message,
  normalData,
  pause,
  payload,
  queryOf,
  startEngineServer,
  until,
  type EngineServer,
  type SessionScript,
} from "./harness.ts";

/** The force of a rule. `MUST` and `SHOULD` come from the protocol document. `meaning` is the effect that the document gives to a packet. */
export type RuleLevel = "MUST" | "SHOULD" | "meaning";

/** One rule of the protocol for the client. */
export interface Rule {
  /** The identifier of the rule, in the form `EIO4-<group>-<number>`. */
  readonly id: string;
  /** The section of the protocol document that has the rule. */
  readonly section: string;
  readonly level: RuleLevel;
  /** The rule in plain words. */
  readonly text: string;
}

/** The test file of a check. */
export type CheckFile = "polling.test.ts" | "findings.test.ts";

/** One check of the suite. */
export interface Check {
  /** The name of the check. The title of its test starts with this name and a colon. */
  readonly id: string;
  /** The rules that the check examines. A check of a finding has no rules when it examines an option of the client. */
  readonly rules: readonly string[];
  readonly file: CheckFile;
  /** The identifier of the finding in the catalog, for a check that shows a known fault of the client. */
  readonly finding?: string;
}

/** The version of the protocol document that the rules come from. */
export const protocolSource: string = "socketio/engine.io-protocol, README.md, protocol version 4";

/** The rules of the protocol that the suite examines. */
export const rules: readonly Rule[] = [
  { id: "EIO4-HS-1", section: "Handshake", level: "MUST", text: "The first request has the query fields `EIO=4` and `transport`, and it has no `sid`." },
  { id: "EIO4-HS-2", section: "Handshake", level: "MUST", text: "Each request after the handshake has the `sid` of the open packet." },
  { id: "EIO4-LP-1", section: "HTTP long-polling", level: "MUST", text: "The client has no more than one active GET request." },
  { id: "EIO4-LP-2", section: "HTTP long-polling", level: "MUST", text: "The client has no more than one active POST request." },
  { id: "EIO4-LP-3", section: "HTTP long-polling", level: "meaning", text: "The client sends its packets in the body of a POST request." },
  { id: "EIO4-PE-1", section: "Packet encoding", level: "meaning", text: "The packets of one payload have the record separator `\\x1e` between them." },
  { id: "EIO4-PE-2", section: "Packet encoding", level: "MUST", text: "A binary packet is the character `b` and the base64 form of its bytes." },
  { id: "EIO4-PE-3", section: "Packet encoding", level: "meaning", text: "A text packet is UTF-8 text." },
  { id: "EIO4-HB-1", section: "Heartbeat", level: "meaning", text: "The client answers each `ping` packet with a `pong` packet." },
  { id: "EIO4-HB-2", section: "Heartbeat", level: "SHOULD", text: "With no `ping` in `pingInterval` plus `pingTimeout`, the client closes the connection." },
  { id: "EIO4-MP-1", section: "Handshake", level: "SHOULD", text: "A payload of two or more packets of the client has no more than `maxPayload` bytes." },
  { id: "EIO4-PT-1", section: "Packet types", level: "meaning", text: "A `close` packet of the server closes the connection." },
  { id: "EIO4-PT-2", section: "Packet types", level: "meaning", text: "A `noop` packet gives no message to the application." },
  { id: "EIO4-PT-3", section: "Packet types", level: "meaning", text: "The client gives the data of each `message` packet to the application, in order." },
];

/** The checks of the suite. */
export const checks: readonly Check[] = [
  { id: "handshake", rules: ["EIO4-HS-1"], file: "polling.test.ts" },
  { id: "sid", rules: ["EIO4-HS-2"], file: "polling.test.ts" },
  { id: "receive", rules: ["EIO4-PE-1", "EIO4-PT-3"], file: "polling.test.ts" },
  { id: "receive-binary", rules: ["EIO4-PE-2"], file: "polling.test.ts" },
  { id: "receive-utf8", rules: ["EIO4-PE-3"], file: "polling.test.ts" },
  { id: "send", rules: ["EIO4-LP-3"], file: "polling.test.ts" },
  { id: "send-batch", rules: ["EIO4-LP-2", "EIO4-PE-1"], file: "polling.test.ts" },
  { id: "send-binary", rules: ["EIO4-PE-2"], file: "polling.test.ts" },
  { id: "send-utf8", rules: ["EIO4-PE-3"], file: "polling.test.ts" },
  { id: "one-get", rules: ["EIO4-LP-1"], file: "polling.test.ts" },
  { id: "ping", rules: ["EIO4-HB-1"], file: "polling.test.ts" },
  { id: "ping-timeout", rules: ["EIO4-HB-2"], file: "polling.test.ts" },
  { id: "ping-reset", rules: ["EIO4-HB-2"], file: "polling.test.ts" },
  { id: "max-payload", rules: ["EIO4-MP-1"], file: "polling.test.ts" },
  { id: "close-packet", rules: ["EIO4-PT-1"], file: "polling.test.ts" },
  { id: "noop", rules: ["EIO4-PT-2"], file: "polling.test.ts" },
  { id: "client-close", rules: ["EIO4-PT-1"], file: "polling.test.ts" },
  { id: "max-payload-binary", rules: ["EIO4-MP-1"], file: "findings.test.ts", finding: "F0024" },
  { id: "long-ping-interval", rules: ["EIO4-HB-2"], file: "findings.test.ts", finding: "F0028" },
  // These checks examine the documented behavior of the client, or its answer to a server that does not obey the
  // protocol. They are not tests of a rule of the protocol.
  { id: "request-timeout", rules: [], file: "findings.test.ts", finding: "F0030" },
  { id: "close-aborts-poll", rules: [], file: "findings.test.ts", finding: "F0031" },
  // A client in a separate process: an uncaught error stops only that process.
  { id: "malformed-open", rules: [], file: "findings.test.ts", finding: "F0029" },
  { id: "open-no-fields", rules: [], file: "findings.test.ts", finding: "F0029" },
  { id: "fetch-body-cut", rules: [], file: "findings.test.ts", finding: "F0026" },
];
