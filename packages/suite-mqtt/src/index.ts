/**
 * The scenarios of the MQTT suite, as data. Each scenario names the source of the scenario and the normative
 * statements that its test examines.
 *
 * @packageDocumentation
 */

/** The file of the Eclipse Paho test suite that has the scenario, or `extra` for a check that this suite adds. */
export type ScenarioSource = "client_test5.py" | "client_test.py" | "extra";

/** One scenario of the suite. */
export interface Scenario {
  /** The name of the scenario. For a Paho scenario, this is the name of the Paho test. */
  readonly id: string;
  /** The file of the scenario. */
  readonly source: ScenarioSource;
  /** The version of the MQTT protocol: 4 is MQTT 3.1.1 and 5 is MQTT 5.0. */
  readonly protocolVersion: 4 | 5;
  /** The normative statements of the client that the test examines. */
  readonly client: readonly string[];
  /** The normative statements that only the broker can break. The test examines the client side of them. */
  readonly broker: readonly string[];
}

/** The scenarios of `client_test5.py`, ported to the client. */
export const pahoV5: readonly Scenario[] = [
  { id: "basic", client: ["MQTT-3.1.0-1", "MQTT-2.2.1-3", "MQTT-2.2.1-5", "MQTT-3.3.4-1", "MQTT-4.3.3-11"], broker: ["MQTT-2.2.1-6"] },
  { id: "retained_message", client: [], broker: ["MQTT-3.3.1-5", "MQTT-3.3.1-6", "MQTT-3.3.2-17", "MQTT-3.3.2-18"] },
  { id: "will_message", client: ["MQTT-3.1.2-9"], broker: ["MQTT-3.1.2-7", "MQTT-3.1.3-10"] },
  { id: "zero_length_clientid", client: [], broker: ["MQTT-3.1.3-6", "MQTT-3.1.3-7"] },
  { id: "offline_message_queueing", client: ["MQTT-3.1.2-23", "MQTT-3.3.4-1"], broker: ["MQTT-3.1.2-5"] },
  { id: "overlapping_subscriptions", client: ["MQTT-3.3.4-1"], broker: ["MQTT-3.8.4-6", "MQTT-3.3.4-2"] },
  { id: "keepalive", client: ["MQTT-3.1.2-20"], broker: ["MQTT-3.1.2-22"] },
  { id: "redelivery_on_reconnect", client: ["MQTT-4.3.2-4", "MQTT-4.3.3-8"], broker: ["MQTT-4.4.0-1", "MQTT-3.3.1-1"] },
  { id: "subscribe_failure", client: [], broker: ["MQTT-3.8.4-7", "MQTT-3.9.3-1"] },
  { id: "dollar_topics", client: [], broker: ["MQTT-4.7.2-1"] },
  { id: "unsubscribe", client: [], broker: ["MQTT-2.2.1-6", "MQTT-3.10.4-1", "MQTT-3.10.4-2", "MQTT-3.10.4-4"] },
  { id: "session_expiry", client: ["MQTT-3.1.2-23"], broker: ["MQTT-4.1.0-2"] },
  { id: "user_properties", client: [], broker: ["MQTT-3.3.2-17", "MQTT-3.3.2-18"] },
  { id: "payload_format", client: [], broker: ["MQTT-3.3.2-4", "MQTT-3.3.2-20"] },
  { id: "publication_expiry", client: [], broker: ["MQTT-3.3.2-5", "MQTT-3.3.2-6"] },
  { id: "subscribe_options", client: [], broker: ["MQTT-3.8.3-3", "MQTT-3.3.1-9", "MQTT-3.3.1-10", "MQTT-3.3.1-11", "MQTT-3.3.1-12", "MQTT-3.3.1-13"] },
  { id: "assigned_clientid", client: [], broker: ["MQTT-3.1.3-7", "MQTT-3.2.2-16"] },
  { id: "subscribe_identifiers", client: [], broker: ["MQTT-3.3.4-3", "MQTT-3.3.4-4"] },
  { id: "request_response", client: [], broker: ["MQTT-3.3.2-15", "MQTT-3.3.2-16"] },
  { id: "client_topic_alias", client: ["MQTT-3.3.2-8", "MQTT-3.3.2-9", "MQTT-3.2.2-17"], broker: ["MQTT-3.3.2-7"] },
  { id: "server_topic_alias", client: ["MQTT-3.3.2-10"], broker: ["MQTT-3.1.2-26", "MQTT-3.1.2-27"] },
  { id: "maximum_packet_size", client: ["MQTT-3.2.2-15"], broker: ["MQTT-3.1.2-24", "MQTT-3.1.2-25"] },
  { id: "server_keep_alive", client: ["MQTT-3.1.2-21", "MQTT-3.2.2-21"], broker: [] },
  { id: "flow_control1", client: [], broker: ["MQTT-3.3.4-9"] },
  { id: "flow_control2", client: ["MQTT-3.3.4-7", "MQTT-4.9.0-2"], broker: [] },
  { id: "will_delay", client: ["MQTT-3.1.2-9"], broker: ["MQTT-3.1.3-9"] },
  { id: "shared_subscriptions", client: [], broker: ["MQTT-4.8.2-1", "MQTT-4.8.2-2"] },
].map((item) => ({ ...item, source: "client_test5.py" as const, protocolVersion: 5 as const }));

/** The scenarios of `client_test.py`, ported to the client. */
export const pahoV311: readonly Scenario[] = [
  { id: "basic", client: ["MQTT-3.1.0-1", "MQTT-2.3.1-1", "MQTT-2.3.1-6"], broker: ["MQTT-2.3.1-7"] },
  { id: "retained_messages", client: [], broker: ["MQTT-3.3.1-5", "MQTT-3.3.1-6", "MQTT-3.3.1-9", "MQTT-3.3.1-10", "MQTT-3.3.1-11"] },
  { id: "zero_length_clientid", client: ["MQTT-3.1.3-7"], broker: ["MQTT-3.1.3-8"] },
  { id: "offline_message_queueing", client: ["MQTT-3.1.2-4"], broker: [] },
  { id: "overlapping_subscriptions", client: [], broker: ["MQTT-3.3.5-1"] },
  { id: "keepalive", client: ["MQTT-3.1.2-23"], broker: ["MQTT-3.1.2-24"] },
  { id: "redelivery_on_reconnect", client: ["MQTT-2.3.1-6"], broker: ["MQTT-4.4.0-1"] },
  { id: "subscribe_failure", client: [], broker: ["MQTT-3.9.3-1", "MQTT-3.9.3-2"] },
  { id: "dollar_topics", client: [], broker: ["MQTT-4.7.2-1"] },
  { id: "unsubscribe", client: [], broker: ["MQTT-2.3.1-7", "MQTT-3.10.4-2", "MQTT-3.10.4-4"] },
].map((item) => ({ ...item, source: "client_test.py" as const, protocolVersion: 4 as const }));

/** The checks that this suite adds. Each check examines one limit or one rule of the client. */
export const extras: readonly Scenario[] = [
  { id: "receive_maximum", protocolVersion: 5, client: ["MQTT-3.3.4-7", "MQTT-4.9.0-2"], broker: [] },
  { id: "maximum_packet_size", protocolVersion: 5, client: ["MQTT-3.2.2-15"], broker: [] },
  { id: "topic_alias_maximum", protocolVersion: 5, client: ["MQTT-3.2.2-17", "MQTT-3.3.2-9"], broker: [] },
  { id: "resend_with_dup_v5", protocolVersion: 5, client: ["MQTT-3.3.1-1", "MQTT-4.4.0-1"], broker: [] },
  { id: "resend_with_dup_v311", protocolVersion: 4, client: ["MQTT-3.3.1-1", "MQTT-4.4.0-1"], broker: [] },
  { id: "resend_pubrel", protocolVersion: 5, client: ["MQTT-4.4.0-1", "MQTT-4.3.3-6"], broker: [] },
  { id: "resend_only_with_session", protocolVersion: 5, client: ["MQTT-3.2.2-5", "MQTT-3.1.2-4", "MQTT-4.4.0-1"], broker: [] },
  { id: "unique_packet_identifiers", protocolVersion: 5, client: ["MQTT-2.2.1-3"], broker: [] },
  { id: "server_keep_alive_timing", protocolVersion: 5, client: ["MQTT-3.2.2-21"], broker: [] },
  { id: "assigned_client_identifier", protocolVersion: 5, client: [], broker: ["MQTT-3.2.2-16"] },
  { id: "error_reason_codes", protocolVersion: 5, client: ["MQTT-4.4.0-2"], broker: [] },
  { id: "values_from_the_application", protocolVersion: 5, client: ["MQTT-3.3.1-2", "MQTT-3.3.4-6"], broker: [] },
].map((item) => ({ ...item, source: "extra" as const, protocolVersion: item.protocolVersion as 4 | 5 }));

/** All scenarios of the suite. */
export const scenarios: readonly Scenario[] = [...pahoV5, ...pahoV311, ...extras];
