// Ports of the 27 scenarios of client_test5.py (Eclipse Paho interoperability suite) to MQTT.js, as tests of the client.
// Each test names the normative statements of MQTT 5.0 that it examines. Where Paho examines only the broker, a
// comment says so, and the test examines the client side of the scenario.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IConnectPacket, IDisconnectPacket, IPublishPacket, ISubackPacket, ISubscribePacket } from "mqtt-packet";
import { brokerUrl, closeAll, cut, ofType, open, peakInFlight, sleep, topicsOf, uniqueName } from "./harness.ts";

const v5 = { protocolVersion: 5, clean: true } as const;
const wait = { timeout: 5_000, interval: 20 } as const;

function connectOf(records: { readonly packet: unknown }[]): IConnectPacket {
  return records[0]?.packet as IConnectPacket;
}

describe.runIf(brokerUrl !== undefined)("Paho client_test5.py, ported to MQTT.js (MQTT 5.0)", () => {
  afterEach(closeAll);

  it("basic: [MQTT-3.1.0-1] [MQTT-2.2.1-3] [MQTT-2.2.1-5] [MQTT-3.3.4-1] [MQTT-4.3.3-11] the client connects, subscribes and publishes", async () => {
    const topic = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    const granted = await peer.client.subscribeAsync(topic, { qos: 2 });
    expect(granted.map((grant) => grant.qos)).toEqual([2]);
    await peer.client.publishAsync(topic, "qos 0", { qos: 0 });
    await peer.client.publishAsync(topic, "qos 1", { qos: 1 });
    await peer.client.publishAsync(topic, "qos 2", { qos: 2 });
    await vi.waitFor(() => expect(ofType(peer.sent, "pubcomp")).toHaveLength(1), wait);
    expect(peer.messages.map((message) => message.payload.toString())).toEqual(["qos 0", "qos 1", "qos 2"]);

    // [MQTT-3.1.0-1] The first packet sent from the Client to the Server MUST be a CONNECT packet.
    expect(peer.sent[0]?.cmd).toBe("connect");
    expect(ofType(peer.sent, "connect")).toHaveLength(1);
    // [MQTT-2.2.1-3] A non-zero Packet Identifier that is currently unused.
    const outgoing = [...ofType(peer.sent, "subscribe"), ...ofType(peer.sent, "publish").filter((r) => r.qos > 0)];
    for (const item of outgoing) expect(item.messageId).toBeGreaterThan(0);
    // broker: [MQTT-2.2.1-6] The SUBACK has the Packet Identifier of the SUBSCRIBE. The client matches the two packets.
    expect(ofType(peer.received, "suback")[0]?.messageId).toBe(ofType(peer.sent, "subscribe")[0]?.messageId);
    // [MQTT-2.2.1-5] The PUBREL of the client has the Packet Identifier of its QoS 2 PUBLISH.
    const ownQos2 = ofType(peer.sent, "publish").find((r) => r.qos === 2);
    expect(ofType(peer.sent, "pubrel")[0]?.messageId).toBe(ownQos2?.messageId);
    // [MQTT-3.3.4-1] The client answers each incoming PUBLISH as its QoS requires, with the same Packet Identifier.
    const incoming1 = ofType(peer.received, "publish").find((r) => r.qos === 1);
    const incoming2 = ofType(peer.received, "publish").find((r) => r.qos === 2);
    expect(ofType(peer.sent, "puback").map((r) => r.messageId)).toEqual([incoming1?.messageId]);
    expect(ofType(peer.sent, "pubrec").map((r) => r.messageId)).toEqual([incoming2?.messageId]);
    // [MQTT-4.3.3-11] The PUBCOMP of the client has the Packet Identifier of the PUBREL.
    expect(ofType(peer.sent, "pubcomp")[0]?.messageId).toBe(ofType(peer.received, "pubrel")[0]?.messageId);
  });

  it("retained_message: the client sends retained messages and gives their User Properties in order", async () => {
    // broker: [MQTT-3.3.1-5] and [MQTT-3.3.1-6] (store and send the retained message), [MQTT-3.3.2-17] and
    // [MQTT-3.3.2-18] (send the User Properties unaltered and in order).
    const base = uniqueName("t");
    const userProperties = { a: "2", c: "3" };
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/A`, "qos 0", { qos: 0, retain: true, properties: { userProperties } });
    await publisher.client.publishAsync(`${base}/B`, "qos 1", { qos: 1, retain: true, properties: { userProperties } });
    await publisher.client.publishAsync(`${base}/C`, "qos 2", { qos: 2, retain: true, properties: { userProperties } });
    for (const item of ofType(publisher.sent, "publish")) {
      expect(item.packet).toMatchObject({ retain: true });
      expect(Object.keys((item.packet as IPublishPacket).properties?.userProperties ?? {})).toEqual(["a", "c"]);
    }

    const subscriber = await open({ ...v5, clientId: uniqueName("c") });
    await subscriber.client.subscribeAsync(`${base}/+`, { qos: 2 });
    await vi.waitFor(() => expect(subscriber.messages).toHaveLength(3), wait);
    for (const message of subscriber.messages) {
      expect(message.packet.retain).toBe(true);
      expect(message.packet.properties?.userProperties).toEqual(userProperties);
      expect(Object.keys(message.packet.properties?.userProperties ?? {})).toEqual(["a", "c"]);
    }

    // A zero-byte retained message removes the retained message.
    for (const [name, qos] of [["A", 0], ["B", 1], ["C", 2]] as const) {
      await publisher.client.publishAsync(`${base}/${name}`, "", { qos, retain: true });
    }
    const late = await open({ ...v5, clientId: uniqueName("c") });
    await late.client.subscribeAsync(`${base}/+`, { qos: 2 });
    await sleep(500);
    expect(late.messages).toHaveLength(0);
  });

  it("will_message: [MQTT-3.1.2-9] the CONNECT has the Will Properties, Will Topic and Will Payload", async () => {
    // broker: [MQTT-3.1.2-7] (store the Will Message) and [MQTT-3.1.3-10] (keep the order of its User Properties).
    const willTopic = uniqueName("w");
    const observer = await open({ ...v5, clientId: uniqueName("c") });
    await observer.client.subscribeAsync(willTopic, { qos: 2 });
    const userProperties = { a: "2", c: "3" };
    const dying = await open({
      ...v5,
      clientId: uniqueName("c"),
      keepalive: 2,
      will: { topic: willTopic, payload: Buffer.from("will message"), qos: 0, retain: false, properties: { userProperties } },
    });
    const will = connectOf(dying.sent).will;
    expect(will?.topic).toBe(willTopic);
    expect(will?.payload.toString()).toBe("will message");
    expect(will?.properties?.userProperties).toEqual(userProperties);

    cut(dying.client);
    await vi.waitFor(() => expect(observer.messages).toHaveLength(1), wait);
    expect(observer.messages[0]?.payload.toString()).toBe("will message");
    expect(Object.keys(observer.messages[0]?.packet.properties?.userProperties ?? {})).toEqual(["a", "c"]);
  });

  it("zero_length_clientid: the client connects with an empty Client Identifier", async () => {
    // broker: [MQTT-3.1.3-6] and [MQTT-3.1.3-7] (accept the empty identifier, assign one and send it in the CONNACK).
    const clean = await open({ ...v5, clientId: "", clean: true });
    expect(clean.connack.reasonCode).toBe(0);
    expect(clean.connack.properties?.assignedClientIdentifier).toMatch(/.+/);
    expect(connectOf(clean.sent).clientId).toBe("");

    // With Clean Start 0, MQTT 5.0 lets the server accept an empty identifier. MQTT.js 5.16.1 refuses the options before
    // it opens a connection. This is a choice of the client and not a fault: no statement makes a client send it.
    const resumed = await open({ ...v5, clientId: "", clean: false }).then(
      (peer) => peer,
      (error: unknown) => error,
    );
    if (resumed instanceof Error) expect(resumed.message).toMatch(/clientId/);
    else expect(resumed).toMatchObject({ connack: { reasonCode: 0 } });
  });

  it("offline_message_queueing: [MQTT-3.1.2-23] [MQTT-3.3.4-1] the client gets the queued messages", async () => {
    // broker: [MQTT-3.1.2-5] (resume the session and send the queued messages).
    const base = uniqueName("t");
    const clientId = uniqueName("c");
    const first = await open({ ...v5, clientId, properties: { sessionExpiryInterval: 99_999 } });
    expect(connectOf(first.sent).properties?.sessionExpiryInterval).toBe(99_999);
    await first.client.subscribeAsync(`${base}/+`, { qos: 2 });
    await first.client.endAsync();

    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/0`, "qos 0", { qos: 0 });
    await publisher.client.publishAsync(`${base}/1`, "qos 1", { qos: 1 });
    await publisher.client.publishAsync(`${base}/2`, "qos 2", { qos: 2 });

    const second = await open({ ...v5, clientId, clean: false, properties: { sessionExpiryInterval: 99_999 } });
    expect(second.connack.sessionPresent).toBe(true);
    await vi.waitFor(() => expect(second.messages.length).toBeGreaterThanOrEqual(2), wait);
    await sleep(500);
    // The broker can drop QoS 0 messages for a client that is not connected.
    expect([2, 3]).toContain(second.messages.length);
    await vi.waitFor(() => expect(ofType(second.sent, "pubcomp")).toHaveLength(1), wait);
    const incoming1 = ofType(second.received, "publish").find((r) => r.qos === 1);
    expect(ofType(second.sent, "puback").map((r) => r.messageId)).toEqual([incoming1?.messageId]);
  });

  it("overlapping_subscriptions: [MQTT-3.3.4-1] the client acknowledges each copy as its QoS requires", async () => {
    // broker: [MQTT-3.8.4-6] (a reason code for each filter) and [MQTT-3.3.4-2] (one copy with the maximum QoS, or one
    // copy for each subscription).
    const base = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    const granted = await peer.client.subscribeAsync({ [`${base}/A/#`]: { qos: 2 }, [`${base}/A/+`]: { qos: 1 } });
    expect(granted.map((grant) => grant.qos)).toEqual([2, 1]);
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/A/C`, "overlapping topic filters", { qos: 2 });
    await vi.waitFor(() => expect(peer.messages.length).toBeGreaterThanOrEqual(1), wait);
    await sleep(500);
    const qoss = peer.messages.map((message) => message.packet.qos).sort();
    expect([[2], [1, 2]]).toContainEqual(qoss);
    for (const item of ofType(peer.received, "publish")) {
      const answer = item.qos === 1 ? "puback" : "pubrec";
      expect(ofType(peer.sent, answer).map((r) => r.messageId)).toContain(item.messageId);
    }
  });

  it("keepalive: [MQTT-3.1.2-20] the client sends PINGREQ when it sends no other packet", { timeout: 15_000 }, async () => {
    // broker: [MQTT-3.1.2-22] (close the connection after one and a half times the Keep Alive). Paho stops its client
    // and waits for the Will Message. Here the client stays idle, so the connection stays open.
    const willTopic = uniqueName("w");
    const observer = await open({ ...v5, clientId: uniqueName("c") });
    await observer.client.subscribeAsync(willTopic, { qos: 2 });
    const idle = await open({
      ...v5,
      clientId: uniqueName("c"),
      keepalive: 2,
      will: { topic: willTopic, payload: Buffer.from("keepalive expiry"), qos: 0, retain: false },
    });
    await sleep(5_000);
    expect(ofType(idle.sent, "pingreq").length).toBeGreaterThanOrEqual(1);
    expect(ofType(idle.received, "pingresp").length).toBeGreaterThanOrEqual(1);
    expect(idle.client.connected).toBe(true);
    expect(observer.messages).toHaveLength(0);
  });

  it("redelivery_on_reconnect: [MQTT-4.3.2-4] [MQTT-4.3.3-8] the client acknowledges the messages that the server sends again", async () => {
    // broker: [MQTT-4.4.0-1] and [MQTT-3.3.1-1] (send the unacknowledged messages again, with DUP 1).
    const base = uniqueName("t");
    const clientId = uniqueName("c");
    const options = { ...v5, clientId, properties: { sessionExpiryInterval: 300 } };
    // An acknowledgement handler that never calls back holds the PUBACK and the PUBREC.
    const held = await open({ ...options, customHandleAcks: () => undefined });
    await held.client.subscribeAsync(`${base}/+`, { qos: 2 });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/1`, "qos 1", { qos: 1 });
    await publisher.client.publishAsync(`${base}/2`, "qos 2", { qos: 2 });
    await vi.waitFor(() => expect(held.wire.filter((p) => p.cmd === "publish")).toHaveLength(2), wait);
    expect(ofType(held.sent, "puback")).toHaveLength(0);
    held.client.end(true);
    await sleep(300);

    const resumed = await open({ ...options, clean: false });
    expect(resumed.connack.sessionPresent).toBe(true);
    await vi.waitFor(() => expect(resumed.messages).toHaveLength(2), wait);
    const again = ofType(resumed.received, "publish");
    expect(again.map((r) => r.dup)).toEqual([true, true]);
    const qos1 = again.find((r) => r.qos === 1);
    const qos2 = again.find((r) => r.qos === 2);
    expect(ofType(resumed.sent, "puback").map((r) => r.messageId)).toEqual([qos1?.messageId]);
    expect(ofType(resumed.sent, "pubrec").map((r) => r.messageId)).toEqual([qos2?.messageId]);
  });

  it("subscribe_failure: the client gives the failure code of the SUBACK to the application", async () => {
    // broker: [MQTT-3.8.4-7] (a reason code for the failure) and [MQTT-3.9.3-1] (the order of the reason codes). Paho
    // refuses the filter test/nosubscribe.
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    const error = await peer.client.subscribeAsync("test/nosubscribe", { qos: 2 }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: 0x80 });
    expect((ofType(peer.received, "suback")[0]?.packet as ISubackPacket).granted).toEqual([0x80]);
    expect(peer.client.connected).toBe(true);
  });

  it("dollar_topics: the client gets no message from a topic that starts with $", async () => {
    // broker: [MQTT-4.7.2-1] (a filter that starts with a wildcard does not match a topic that starts with $). The
    // client side is only that the client sends the PUBLISH and gives no message for it.
    const name = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    await peer.client.subscribeAsync(`+/${name}`, { qos: 2 });
    await peer.client.publishAsync(`$x/${name}`, "dollar", { qos: 1 });
    await peer.client.publishAsync(`x/${name}`, "plain", { qos: 1 });
    await vi.waitFor(() => expect(peer.messages).toHaveLength(1), wait);
    await sleep(300);
    expect(topicsOf(peer)).toEqual([`x/${name}`]);
  });

  it("unsubscribe: the client stops the messages of one filter and keeps the others", async () => {
    // broker: [MQTT-2.2.1-6] (the UNSUBACK has the Packet Identifier of the UNSUBSCRIBE), [MQTT-3.10.4-1], [MQTT-3.10.4-2]
    // and [MQTT-3.10.4-4] (delete the subscription, stop the messages, send the UNSUBACK).
    const base = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    await peer.client.subscribeAsync({ [`${base}/A`]: { qos: 2 }, [`${base}/B`]: { qos: 2 }, [`${base}/C`]: { qos: 2 } });
    await peer.client.unsubscribeAsync(`${base}/B`);
    expect(ofType(peer.received, "unsuback")[0]?.messageId).toBe(ofType(peer.sent, "unsubscribe")[0]?.messageId);
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    for (const name of ["A", "B", "C"]) await publisher.client.publishAsync(`${base}/${name}`, name, { qos: 1 });
    await vi.waitFor(() => expect(peer.messages).toHaveLength(2), wait);
    await sleep(300);
    expect(topicsOf(peer)).toEqual([`${base}/A`, `${base}/C`]);
  });

  it("session_expiry: [MQTT-3.1.2-23] the client sends the Session Expiry Interval in CONNECT and DISCONNECT", { timeout: 20_000 }, async () => {
    // broker: [MQTT-4.1.0-2] (discard the session when the interval ends).
    const clientId = uniqueName("c");
    const zero = await open({ ...v5, clientId, properties: { sessionExpiryInterval: 0 } });
    await zero.client.endAsync();
    const short = await open({ ...v5, clientId, clean: false, properties: { sessionExpiryInterval: 1 } });
    expect(short.connack.sessionPresent).toBe(false);
    // The DISCONNECT changes the interval from 1 second to 3 seconds.
    await short.client.endAsync({ properties: { sessionExpiryInterval: 3 } });
    expect((ofType(short.sent, "disconnect")[0]?.packet as IDisconnectPacket).properties?.sessionExpiryInterval).toBe(3);
    await sleep(1_500);
    const kept = await open({ ...v5, clientId, clean: false, properties: { sessionExpiryInterval: 1 } });
    expect(kept.connack.sessionPresent).toBe(true);
    await kept.client.endAsync();
    await sleep(3_000);
    const gone = await open({ ...v5, clientId, clean: false, properties: { sessionExpiryInterval: 0 } });
    expect(gone.connack.sessionPresent).toBe(false);
  });

  it("user_properties: the client keeps the User Properties and their order", async () => {
    // broker: [MQTT-3.3.2-17] and [MQTT-3.3.2-18] (send the User Properties unaltered and in order).
    const topic = uniqueName("t");
    const subscriber = await open({ ...v5, clientId: uniqueName("c") });
    await subscriber.client.subscribeAsync(topic, { qos: 2 });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    const userProperties = { a: "2", c: "3", b: ["1", "4"] };
    for (const qos of [0, 1, 2] as const) {
      await publisher.client.publishAsync(topic, `qos ${qos}`, { qos, properties: { userProperties } });
    }
    await vi.waitFor(() => expect(subscriber.messages).toHaveLength(3), wait);
    for (const message of subscriber.messages) {
      expect(message.packet.properties?.userProperties).toEqual(userProperties);
      expect(Object.keys(message.packet.properties?.userProperties ?? {})).toEqual(["a", "c", "b"]);
    }
  });

  it("payload_format: the client keeps the Payload Format Indicator and the Content Type", async () => {
    // broker: [MQTT-3.3.2-4] and [MQTT-3.3.2-20] (send the Payload Format Indicator and the Content Type unaltered).
    const topic = uniqueName("t");
    const subscriber = await open({ ...v5, clientId: uniqueName("c") });
    await subscriber.client.subscribeAsync(topic, { qos: 2 });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    const properties = { payloadFormatIndicator: true, contentType: "My name" };
    for (const qos of [0, 1, 2] as const) await publisher.client.publishAsync(topic, `qos ${qos}`, { qos, properties });
    await vi.waitFor(() => expect(subscriber.messages).toHaveLength(3), wait);
    for (const message of subscriber.messages) expect(message.packet.properties).toMatchObject(properties);
  });

  it("publication_expiry: the client gives the remaining Message Expiry Interval to the application", { timeout: 15_000 }, async () => {
    // broker: [MQTT-3.3.2-5] and [MQTT-3.3.2-6] (delete an expired message, send the remaining interval).
    const base = uniqueName("t");
    const clientId = uniqueName("c");
    const options = { ...v5, clientId, properties: { sessionExpiryInterval: 99_999 } };
    const first = await open(options);
    await first.client.subscribeAsync(`${base}/+`, { qos: 2 });
    await first.client.endAsync();
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/1`, "expires", { qos: 1, properties: { messageExpiryInterval: 1 } });
    await publisher.client.publishAsync(`${base}/2`, "expires", { qos: 2, properties: { messageExpiryInterval: 1 } });
    await publisher.client.publishAsync(`${base}/3`, "stays", { qos: 1, properties: { messageExpiryInterval: 6 } });
    await publisher.client.publishAsync(`${base}/4`, "stays", { qos: 2, properties: { messageExpiryInterval: 6 } });
    await sleep(3_000);
    const second = await open({ ...options, clean: false });
    await vi.waitFor(() => expect(second.messages).toHaveLength(2), wait);
    await sleep(300);
    expect(topicsOf(second).sort()).toEqual([`${base}/3`, `${base}/4`]);
    for (const message of second.messages) {
      expect(message.packet.properties?.messageExpiryInterval).toBeLessThan(6);
    }
  });

  it("subscribe_options: the client sends No Local, Retain As Published and Retain Handling", { timeout: 15_000 }, async () => {
    // broker: [MQTT-3.8.3-3] (No Local), [MQTT-3.3.1-12] and [MQTT-3.3.1-13] (Retain As Published), [MQTT-3.3.1-9],
    // [MQTT-3.3.1-10] and [MQTT-3.3.1-11] (Retain Handling). The test examines the options in the SUBSCRIBE and the
    // flags that the client gives to the application.
    const base = uniqueName("t");
    const a = await open({ ...v5, clientId: uniqueName("c") });
    const b = await open({ ...v5, clientId: uniqueName("c") });

    // No Local
    await a.client.subscribeAsync(`${base}/local`, { qos: 2, nl: true });
    await b.client.subscribeAsync(`${base}/local`, { qos: 2 });
    await a.client.publishAsync(`${base}/local`, "no local", { qos: 2 });
    await vi.waitFor(() => expect(b.messages).toHaveLength(1), wait);
    await sleep(300);
    expect(a.messages).toHaveLength(0);
    expect((ofType(a.sent, "subscribe")[0]?.packet as ISubscribePacket).subscriptions[0]).toMatchObject({ nl: true });

    // Retain As Published, on established subscriptions
    await a.client.subscribeAsync({ [`${base}/rap1`]: { qos: 2, rap: true }, [`${base}/rap0`]: { qos: 2, rap: false } });
    await b.client.publishAsync(`${base}/rap1`, "retained", { qos: 1, retain: true });
    await b.client.publishAsync(`${base}/rap0`, "retained", { qos: 1, retain: true });
    await vi.waitFor(() => expect(a.messages).toHaveLength(2), wait);
    const rap = Object.fromEntries(a.messages.map((message) => [message.topic, message.packet.retain]));
    expect(rap).toEqual({ [`${base}/rap1`]: true, [`${base}/rap0`]: false });

    // Retain Handling
    a.messages.length = 0;
    await b.client.publishAsync(`${base}/rh/R`, "retained", { qos: 1, retain: true });
    await a.client.subscribeAsync(`${base}/rh/R`, { qos: 2, rh: 0 });
    await vi.waitFor(() => expect(a.messages).toHaveLength(1), wait);
    // MQTT.js sends no SUBSCRIBE for a filter that it has with the same QoS, unless the map has `resubscribe: true`.
    await a.client.subscribeAsync({ [`${base}/rh/R`]: { qos: 2, rh: 1 }, resubscribe: true });
    await a.client.subscribeAsync(`${base}/rh/+`, { qos: 2, rh: 2 });
    await sleep(300);
    expect(a.messages).toHaveLength(1);
    await a.client.subscribeAsync(`${base}/rh/#`, { qos: 2, rh: 1 });
    await vi.waitFor(() => expect(a.messages).toHaveLength(2), wait);
    const handling = ofType(a.sent, "subscribe").slice(-4).map((r) => (r.packet as ISubscribePacket).subscriptions[0]?.rh);
    expect(handling).toEqual([0, 1, 2, 1]);

    for (const topic of [`${base}/rap1`, `${base}/rap0`, `${base}/rh/R`]) {
      await b.client.publishAsync(topic, "", { qos: 1, retain: true });
    }
  });

  it("assigned_clientid: the client gives the Assigned Client Identifier to the application", async () => {
    // broker: [MQTT-3.1.3-7] and [MQTT-3.2.2-16] (assign a new identifier and send it in the CONNACK).
    const first = await open({ ...v5, clientId: "" });
    const second = await open({ ...v5, clientId: "" });
    const one = first.connack.properties?.assignedClientIdentifier;
    const two = second.connack.properties?.assignedClientIdentifier;
    expect(one).toMatch(/.+/);
    expect(two).toMatch(/.+/);
    expect(one).not.toBe(two);
  });

  it("subscribe_identifiers: the client sends the Subscription Identifier and gives it to the application", async () => {
    // broker: [MQTT-3.3.4-3] and [MQTT-3.3.4-4] (send the identifiers of each matching subscription).
    const base = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    await peer.client.subscribeAsync(`${base}/A`, { qos: 2, properties: { subscriptionIdentifier: 456_789 } });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/A`, "one", { qos: 1 });
    await vi.waitFor(() => expect(peer.messages).toHaveLength(1), wait);
    expect([peer.messages[0]?.packet.properties?.subscriptionIdentifier].flat()).toEqual([456_789]);

    peer.messages.length = 0;
    await peer.client.subscribeAsync(`${base}/B/+`, { qos: 2, properties: { subscriptionIdentifier: 2 } });
    await peer.client.subscribeAsync(`${base}/B/#`, { qos: 2, properties: { subscriptionIdentifier: 3 } });
    await publisher.client.publishAsync(`${base}/B/C`, "two", { qos: 1 });
    await vi.waitFor(() => expect(peer.messages.length).toBeGreaterThanOrEqual(1), wait);
    await sleep(300);
    const ids = peer.messages.flatMap((message) => [message.packet.properties?.subscriptionIdentifier ?? []].flat());
    expect([...new Set(ids)].sort()).toEqual([2, 3]);
  });

  it("request_response: the client keeps the Response Topic and the Correlation Data", async () => {
    // broker: [MQTT-3.3.2-15] and [MQTT-3.3.2-16] (send both properties unaltered).
    const requestTopic = uniqueName("q");
    const responseTopic = uniqueName("r");
    const responder = await open({ ...v5, clientId: uniqueName("c") });
    await responder.client.subscribeAsync(requestTopic, { qos: 2 });
    const requester = await open({ ...v5, clientId: uniqueName("c") });
    await requester.client.subscribeAsync(responseTopic, { qos: 2 });
    await requester.client.publishAsync(requestTopic, "request", {
      qos: 1,
      properties: { responseTopic, correlationData: Buffer.from("334") },
    });
    await vi.waitFor(() => expect(responder.messages).toHaveLength(1), wait);
    const request = responder.messages[0]?.packet.properties;
    expect(request?.responseTopic).toBe(responseTopic);
    expect(request?.correlationData?.toString()).toBe("334");
    await responder.client.publishAsync(request?.responseTopic ?? "", "response", {
      qos: 1,
      properties: { correlationData: request?.correlationData ?? Buffer.alloc(0) },
    });
    await vi.waitFor(() => expect(requester.messages).toHaveLength(1), wait);
    expect(requester.messages[0]?.packet.properties?.correlationData?.toString()).toBe("334");
  });

  // client bug: MQTT.js 5.16.1 sends a PUBLISH with Topic Alias 0, because _applyTopicAlias tests the alias with `if (alias)`.
  it.fails("client_topic_alias: [MQTT-3.3.2-8] the client does not send a Topic Alias of 0", async () => {
    const topic = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    await peer.client.publishAsync(topic, "alias 0", { qos: 0, properties: { topicAlias: 0 } }).catch(() => undefined);
    await sleep(500);
    const zero = ofType(peer.sent, "publish").filter((r) => r.topicAlias === 0);
    console.info(`evidence: ${zero.length} PUBLISH with Topic Alias 0, server DISCONNECT ${JSON.stringify(peer.disconnects.map((d) => d.reasonCode))}`);
    expect(zero).toHaveLength(0);
  });

  it("client_topic_alias: [MQTT-3.3.2-9] [MQTT-3.2.2-17] the client sets an alias and then uses it with no topic", async () => {
    const topic = uniqueName("t");
    const subscriber = await open({ ...v5, clientId: uniqueName("c") });
    await subscriber.client.subscribeAsync(topic, { qos: 2 });
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    const maximum = peer.connack.properties?.topicAliasMaximum ?? 0;
    expect(maximum).toBeGreaterThanOrEqual(1);
    await peer.client.publishAsync(topic, "alias set", { qos: 1, properties: { topicAlias: 1 } });
    await peer.client.publishAsync("", "alias used", { qos: 1, properties: { topicAlias: 1 } });
    await vi.waitFor(() => expect(subscriber.messages).toHaveLength(2), wait);
    expect(topicsOf(subscriber)).toEqual([topic, topic]);
    const sent = ofType(peer.sent, "publish");
    expect(sent.map((r) => [r.topic, r.topicAlias])).toEqual([[topic, 1], ["", 1]]);
    expect(peer.disconnects).toHaveLength(0);
  });

  it("client_topic_alias: after a new connection, the client refuses a QoS 1 alias that it did not set", async () => {
    // broker: [MQTT-3.3.2-7] (the receiver keeps no alias from an old connection). Paho closes the connection.
    const topic = uniqueName("t");
    const first = await open({ ...v5, clientId: uniqueName("c") });
    await first.client.publishAsync(topic, "alias set", { qos: 1, properties: { topicAlias: 1 } });
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    const error = await peer.client.publishAsync("", "alias used", { qos: 1, properties: { topicAlias: 1 } }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(Error);
    expect(ofType(peer.sent, "publish")).toHaveLength(0);
  });

  it("server_topic_alias: [MQTT-3.3.2-10] the client accepts the aliases of the server up to its Topic Alias Maximum", async () => {
    // broker: [MQTT-3.1.2-26] and [MQTT-3.1.2-27] (no alias above the maximum of the client, no alias when it is 0).
    const topic = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c"), properties: { topicAliasMaximum: 1 } });
    await peer.client.subscribeAsync(topic, { qos: 1 });
    const none = await open({ ...v5, clientId: uniqueName("c") });
    await none.client.subscribeAsync(topic, { qos: 1 });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    for (const index of [1, 2, 3]) await publisher.client.publishAsync(topic, `message ${index}`, { qos: 1 });
    await vi.waitFor(() => expect(peer.messages).toHaveLength(3), wait);
    await vi.waitFor(() => expect(none.messages).toHaveLength(3), wait);
    expect(topicsOf(peer)).toEqual([topic, topic, topic]);
    const aliases = ofType(peer.received, "publish").map((r) => r.topicAlias);
    for (const alias of aliases) if (alias !== undefined) expect(alias).toBe(1);
    expect(ofType(none.received, "publish").map((r) => r.topicAlias)).toEqual([undefined, undefined, undefined]);
    expect(peer.errors).toHaveLength(0);
  });

  // client bug: MQTT.js 5.16.1 does not compare an outgoing packet with the Maximum Packet Size in the CONNACK.
  it.fails("maximum_packet_size: [MQTT-3.2.2-15] the client does not send a packet larger than the Maximum Packet Size of the server", async () => {
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    const maximum = peer.connack.properties?.maximumPacketSize ?? 0;
    expect(maximum).toBeGreaterThan(0);
    await peer.client.publishAsync(uniqueName("t"), Buffer.alloc(maximum, 0x61), { qos: 0 }).catch(() => undefined);
    await sleep(500);
    const large = ofType(peer.sent, "publish").filter((r) => r.size > maximum);
    console.info(`evidence: PUBLISH sizes ${JSON.stringify(ofType(peer.sent, "publish").map((r) => r.size))}, maximum ${maximum}, server DISCONNECT ${JSON.stringify(peer.disconnects.map((d) => d.reasonCode))}`);
    expect(large).toHaveLength(0);
  });

  it("maximum_packet_size: the client sends its Maximum Packet Size and gets the small message", async () => {
    // broker: [MQTT-3.1.2-24] and [MQTT-3.1.2-25] (do not send a larger packet, discard it).
    const topic = uniqueName("t");
    const peer = await open({ ...v5, clientId: uniqueName("c"), properties: { maximumPacketSize: 64 } });
    expect(connectOf(peer.sent).properties?.maximumPacketSize).toBe(64);
    await peer.client.subscribeAsync(topic, { qos: 1 });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    await publisher.client.publishAsync(topic, Buffer.alloc(100, 0x62), { qos: 1 });
    await publisher.client.publishAsync(topic, Buffer.alloc(10, 0x61), { qos: 1 });
    await vi.waitFor(() => expect(peer.messages).toHaveLength(1), wait);
    await sleep(300);
    expect(peer.messages.map((message) => message.payload.length)).toEqual([10]);
    expect(peer.errors).toHaveLength(0);
  });

  it("server_keep_alive: [MQTT-3.1.2-21] [MQTT-3.2.2-21] the client uses the Server Keep Alive", async () => {
    const peer = await open({ ...v5, clientId: uniqueName("c"), keepalive: 120 });
    expect(connectOf(peer.sent).keepalive).toBe(120);
    expect(peer.connack.properties?.serverKeepAlive).toBe(60);
    // The keep alive manager of the client counts in milliseconds. The suite measures the PINGREQ time in
    // client-limits.test.ts.
    expect(peer.client.keepaliveManager?.keepalive).toBe(60_000);
  });

  it("flow_control1: the client sends Receive Maximum 2 and acknowledges each message", async () => {
    // broker: [MQTT-3.3.4-9] (the server sends no more than Receive Maximum unacknowledged messages). The second packet
    // reader of the harness sees the messages that arrive while the client holds its acknowledgements.
    const topic = uniqueName("t");
    const held: (() => void)[] = [];
    let release = false;
    const peer = await open({
      ...v5,
      clientId: uniqueName("c"),
      properties: { receiveMaximum: 2 },
      customHandleAcks: (_topic, _message, _packet, done) => {
        if (release) done(0);
        else held.push(() => done(0));
      },
    });
    expect(connectOf(peer.sent).properties?.receiveMaximum).toBe(2);
    await peer.client.subscribeAsync(topic, { qos: 2 });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    for (const index of [1, 2, 3]) await publisher.client.publishAsync(topic, `message ${index}`, { qos: 1 });
    await vi.waitFor(() => expect(peer.wire.filter((p) => p.cmd === "publish").length).toBeGreaterThanOrEqual(2), wait);
    await sleep(500);
    expect(peer.wire.filter((p) => p.cmd === "publish")).toHaveLength(2);
    release = true;
    for (const done of held.splice(0)) done();
    await vi.waitFor(() => expect(ofType(peer.sent, "puback")).toHaveLength(3), wait);
    expect(peer.messages).toHaveLength(3);
  });

  // client bug: MQTT.js 5.16.1 has no send quota. It sends each QoS 1 and QoS 2 PUBLISH at once.
  it.fails("flow_control2: [MQTT-3.3.4-7] [MQTT-4.9.0-2] the client keeps to the Receive Maximum of the server", async () => {
    const peer = await open({ ...v5, clientId: uniqueName("c") });
    const maximum = peer.connack.properties?.receiveMaximum ?? 65_535;
    const topic = uniqueName("t");
    let completed = 0;
    for (let index = 0; index <= maximum; index += 1) {
      peer.client.publish(topic, `message ${index}`, { qos: 2 }, () => {
        completed += 1;
      });
    }
    await vi
      .waitFor(() => expect(completed === maximum + 1 || peer.disconnects.length > 0).toBe(true), wait)
      .catch(() => undefined);
    console.info(`evidence: peak in flight ${peakInFlight(peer)}, Receive Maximum ${maximum}, server DISCONNECT ${JSON.stringify(peer.disconnects.map((d) => d.reasonCode))}`);
    expect(peakInFlight(peer)).toBeLessThanOrEqual(maximum);
    expect(peer.disconnects).toHaveLength(0);
  });

  it("will_delay: [MQTT-3.1.2-9] the client sends the Will Delay Interval", { timeout: 20_000 }, async () => {
    // broker: [MQTT-3.1.3-9] (no Will Message when the client connects again before the delay ends), and the delay.
    const willTopic = uniqueName("w");
    const observer = await open({ ...v5, clientId: uniqueName("c") });
    await observer.client.subscribeAsync(willTopic, { qos: 2 });
    const will = { topic: willTopic, payload: Buffer.from("delayed will"), qos: 0, retain: false } as const;

    const late = await open({
      ...v5,
      clientId: uniqueName("c"),
      properties: { sessionExpiryInterval: 10 },
      will: { ...will, properties: { willDelayInterval: 2 } },
    });
    expect(connectOf(late.sent).will?.properties?.willDelayInterval).toBe(2);
    const start = Date.now();
    cut(late.client);
    await vi.waitFor(() => expect(observer.messages).toHaveLength(1), { timeout: 8_000, interval: 50 });
    expect(Date.now() - start).toBeGreaterThanOrEqual(1_500);

    const clientId = uniqueName("c");
    const options = { ...v5, clientId, properties: { sessionExpiryInterval: 10 }, will: { ...will, properties: { willDelayInterval: 3 } } };
    const back = await open(options);
    cut(back.client);
    await sleep(500);
    await open({ ...options, clean: false });
    await sleep(4_500);
    expect(observer.messages).toHaveLength(1);
  });

  it("shared_subscriptions: the client subscribes to a shared filter and gets messages with the real topic", async () => {
    // broker: [MQTT-4.8.2-1] and [MQTT-4.8.2-2] (the form of a shared filter), and one copy for each message.
    const topic = uniqueName("t");
    const filter = `$share/${uniqueName("s")}/${topic}`;
    const a = await open({ ...v5, clientId: uniqueName("c") });
    const b = await open({ ...v5, clientId: uniqueName("c") });
    await a.client.subscribeAsync(filter, { qos: 2 });
    await b.client.subscribeAsync(filter, { qos: 2 });
    const publisher = await open({ ...v5, clientId: uniqueName("c") });
    for (let index = 0; index < 10; index += 1) await publisher.client.publishAsync(topic, `${index}`, { qos: 1 });
    await vi.waitFor(() => expect(a.messages.length + b.messages.length).toBe(10), wait);
    await sleep(300);
    const all = [...a.messages, ...b.messages];
    expect(all).toHaveLength(10);
    expect(new Set(all.map((message) => message.topic))).toEqual(new Set([topic]));
    expect(all.map((message) => Number(message.payload.toString())).sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
