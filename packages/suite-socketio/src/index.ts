/**
 * The rules and the checks of the Socket.IO suite, as data. A rule is one statement of the Socket.IO protocol, version
 * 5, for the client. A check is one test of the suite, and it names the rules that it examines.
 *
 * @packageDocumentation
 */

export * from "./codec.ts";

/** The force of a rule. `MUST` comes from the protocol document. `meaning` is the effect that the document gives to a packet. */
export type RuleLevel = "MUST" | "meaning";

/** One rule of the protocol for the client. */
export interface Rule {
  /** The identifier of the rule, in the form `SIO5-<group>-<number>`. */
  readonly id: string;
  /** The section of the protocol document that has the rule. */
  readonly section: string;
  readonly level: RuleLevel;
  /** The rule in plain words. */
  readonly text: string;
}

/** The test file of a check. */
export type CheckFile = "protocol.test.ts" | "findings.test.ts";

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
export const protocolSource: string = "socketio/socket.io, docs/socket.io-protocol/v5-current.md, protocol version 5";

/** The rules of the protocol that the suite examines. */
export const rules: readonly Rule[] = [
  {
    id: "SIO5-CN-1",
    section: "Connection to a namespace",
    level: "MUST",
    text: "The client sends a `CONNECT` packet for a namespace before the other packets of that namespace.",
  },
  {
    id: "SIO5-CN-2",
    section: "Connection to a namespace",
    level: "meaning",
    text: "A `CONNECT` packet of the server with a session ID in its payload connects the namespace.",
  },
  { id: "SIO5-CN-3", section: "Connection to a namespace", level: "meaning", text: "A `CONNECT_ERROR` packet of the server refuses the connection to the namespace." },
  { id: "SIO5-CN-4", section: "Connection to a namespace", level: "meaning", text: "The payload of the `CONNECT` packet of the client has more data, for example a token." },
  { id: "SIO5-CN-5", section: "Connection to a namespace", level: "meaning", text: "The client connects to two or more namespaces on one connection." },
  { id: "SIO5-EV-1", section: "Sending and receiving data", level: "MUST", text: "The payload of an `EVENT` packet is a non-empty array." },
  {
    id: "SIO5-EV-2",
    section: "Sending and receiving data",
    level: "MUST",
    text: "The receiver of an `EVENT` packet with a payload that is not a non-empty array closes the connection.",
  },
  { id: "SIO5-AK-1", section: "Acknowledgement", level: "meaning", text: "An event ID in an `EVENT` packet asks the receiver for an acknowledgement." },
  { id: "SIO5-AK-2", section: "Acknowledgement", level: "MUST", text: "The receiver responds with an `ACK` packet with the same event ID." },
  { id: "SIO5-AK-3", section: "Acknowledgement", level: "MUST", text: "The payload of an `ACK` packet is an array, and the array can be empty." },
  { id: "SIO5-DC-1", section: "Disconnection from a namespace", level: "meaning", text: "A `DISCONNECT` packet ends the connection to one namespace, and it gets no response." },
  {
    id: "SIO5-PE-1",
    section: "Format",
    level: "meaning",
    text: "A packet is its type, the number of attachments, the namespace, the event ID and the payload, in that order.",
  },
  { id: "SIO5-PE-2", section: "Format", level: "meaning", text: "A packet of the main namespace `/` has no namespace part." },
  {
    id: "SIO5-PE-3",
    section: "Format",
    level: "meaning",
    text: "The payload of a binary packet has a placeholder for each attachment, and the attachments follow the packet in order.",
  },
  { id: "SIO5-PE-4", section: "Packet encoding", level: "meaning", text: "Each Socket.IO packet is one Engine.IO `message` packet." },
];

/** The checks of the suite. */
export const checks: readonly Check[] = [
  { id: "connect-main", rules: ["SIO5-CN-1", "SIO5-PE-2", "SIO5-PE-4"], file: "protocol.test.ts" },
  { id: "connect-namespace", rules: ["SIO5-CN-1", "SIO5-PE-1"], file: "protocol.test.ts" },
  { id: "connect-auth", rules: ["SIO5-CN-4"], file: "protocol.test.ts" },
  { id: "connect-reply", rules: ["SIO5-CN-2"], file: "protocol.test.ts" },
  { id: "connect-error", rules: ["SIO5-CN-3"], file: "protocol.test.ts" },
  { id: "connect-first", rules: ["SIO5-CN-1"], file: "protocol.test.ts" },
  { id: "multiplex", rules: ["SIO5-CN-5", "SIO5-PE-4"], file: "protocol.test.ts" },
  { id: "receive-event", rules: ["SIO5-PE-1", "SIO5-PE-4"], file: "protocol.test.ts" },
  { id: "receive-namespace", rules: ["SIO5-CN-5", "SIO5-PE-1"], file: "protocol.test.ts" },
  { id: "send-event", rules: ["SIO5-EV-1", "SIO5-PE-2"], file: "protocol.test.ts" },
  { id: "send-ack", rules: ["SIO5-AK-1"], file: "protocol.test.ts" },
  { id: "receive-ack", rules: ["SIO5-AK-2", "SIO5-AK-3"], file: "protocol.test.ts" },
  { id: "receive-ack-empty", rules: ["SIO5-AK-2", "SIO5-AK-3"], file: "protocol.test.ts" },
  { id: "send-binary", rules: ["SIO5-PE-3"], file: "protocol.test.ts" },
  { id: "receive-binary", rules: ["SIO5-PE-3"], file: "protocol.test.ts" },
  { id: "receive-binary-namespace", rules: ["SIO5-PE-1", "SIO5-PE-3"], file: "protocol.test.ts" },
  { id: "binary-ack", rules: ["SIO5-AK-2", "SIO5-PE-3"], file: "protocol.test.ts" },
  { id: "send-disconnect", rules: ["SIO5-DC-1"], file: "protocol.test.ts" },
  { id: "receive-disconnect", rules: ["SIO5-DC-1"], file: "protocol.test.ts" },
  { id: "invalid-event-payload", rules: ["SIO5-EV-2"], file: "protocol.test.ts" },
  { id: "disconnect-during-connect", rules: ["SIO5-DC-1"], file: "findings.test.ts", finding: "F0058" },
  { id: "retries-without-ack-timeout", rules: ["SIO5-AK-1"], file: "findings.test.ts", finding: "F0064" },
  { id: "eleven-attachments", rules: ["SIO5-PE-3"], file: "findings.test.ts", finding: "F0067" },
  // These six checks examine the documented behavior of the client, not a rule of the protocol.
  { id: "volatile-before-connect", rules: [], file: "findings.test.ts", finding: "F0055" },
  { id: "second-connect", rules: [], file: "findings.test.ts", finding: "F0057" },
  { id: "reconnection-attempts-zero", rules: [], file: "findings.test.ts", finding: "F0059" },
  { id: "recovered-false", rules: [], file: "findings.test.ts", finding: "F0060" },
  { id: "offset-event-name", rules: [], file: "findings.test.ts", finding: "F0066" },
  { id: "offset-string-argument", rules: [], file: "findings.test.ts", finding: "F0066" },
];
