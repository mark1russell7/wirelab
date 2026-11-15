// Ports of the 10 scenarios of client_test.py (Eclipse Paho interoperability suite) to MQTT.js, as tests of the client.
// Each test names the normative statements of MQTT 3.1.1 that it examines. Where Paho examines only the broker, a
// comment says so, and the test examines the client side of the scenario.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IConnectPacket, ISubackPacket } from "mqtt-packet";
import { brokerUrl, closeAll, ofType, open, sleep, topicsOf, uniqueName } from "./harness.ts";

const v311 = { protocolVersion: 4, clean: true } as const;
const wait = { timeout: 5_000, interval: 20 } as const;

describe.runIf(brokerUrl !== undefined)("Paho client_test.py, ported to MQTT.js (MQTT 3.1.1)", () => {
  afterEach(closeAll);

  it("basic: [MQTT-3.1.0-1] [MQTT-2.3.1-1] [MQTT-2.3.1-6] the client connects, subscribes and publishes", async () => {
    const topic = uniqueName("t");
    const peer = await open({ ...v311, clientId: uniqueName("c") });
    expect(peer.connack.returnCode).toBe(0);
    await peer.client.subscribeAsync(topic, { qos: 2 });
    await peer.client.publishAsync(topic, "qos 0", { qos: 0 });
    await peer.client.publishAsync(topic, "qos 1", { qos: 1 });
    await peer.client.publishAsync(topic, "qos 2", { qos: 2 });
    await vi.waitFor(() => expect(ofType(peer.sent, "pubcomp")).toHaveLength(1), wait);
    expect(peer.messages.map((message) => message.payload.toString())).toEqual(["qos 0", "qos 1", "qos 2"]);

    // [MQTT-3.1.0-1] After a Network Connection is established by a Client to a Server, the first Packet sent from the
    // Client to the Server MUST be a CONNECT Packet.
    expect(peer.sent[0]?.cmd).toBe("connect");
    expect(ofType(peer.sent, "connect")).toHaveLength(1);
    // [MQTT-2.3.1-1] A non-zero 16-bit Packet Identifier.
    const outgoing = [...ofType(peer.sent, "subscribe"), ...ofType(peer.sent, "publish").filter((r) => r.qos > 0)];
    for (const item of outgoing) expect(item.messageId).toBeGreaterThan(0);
    // broker: [MQTT-2.3.1-7] The SUBACK has the Packet Identifier of the SUBSCRIBE. The client matches the two packets.
    expect(ofType(peer.received, "suback")[0]?.messageId).toBe(ofType(peer.sent, "subscribe")[0]?.messageId);
    // [MQTT-2.3.1-6] PUBACK, PUBREC and PUBREL have the Packet Identifier of the PUBLISH.
    const incoming1 = ofType(peer.received, "publish").find((r) => r.qos === 1);
    const incoming2 = ofType(peer.received, "publish").find((r) => r.qos === 2);
    expect(ofType(peer.sent, "puback").map((r) => r.messageId)).toEqual([incoming1?.messageId]);
    expect(ofType(peer.sent, "pubrec").map((r) => r.messageId)).toEqual([incoming2?.messageId]);
    const ownQos2 = ofType(peer.sent, "publish").find((r) => r.qos === 2);
    expect(ofType(peer.sent, "pubrel")[0]?.messageId).toBe(ownQos2?.messageId);
  });

  it("retained_messages: the client sets RETAIN and gives the retained flag to the application", async () => {
    // broker: [MQTT-3.3.1-5], [MQTT-3.3.1-6], [MQTT-3.3.1-10] and [MQTT-3.3.1-11] (store, send, replace and remove
    // the retained messages).
    const base = uniqueName("t");
    const publisher = await open({ ...v311, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/A`, "qos 0", { qos: 0, retain: true });
    await publisher.client.publishAsync(`${base}/B`, "qos 1", { qos: 1, retain: true });
    await publisher.client.publishAsync(`${base}/C`, "qos 2", { qos: 2, retain: true });
    for (const item of ofType(publisher.sent, "publish")) expect(item.packet).toMatchObject({ retain: true });

    const subscriber = await open({ ...v311, clientId: uniqueName("c") });
    await subscriber.client.subscribeAsync(`${base}/+`, { qos: 2 });
    await vi.waitFor(() => expect(subscriber.messages).toHaveLength(3), wait);
    for (const message of subscriber.messages) expect(message.packet.retain).toBe(true);

    // broker: [MQTT-3.3.1-9] A message on an established subscription has RETAIN 0.
    await publisher.client.publishAsync(`${base}/A`, "live", { qos: 1, retain: true });
    await vi.waitFor(() => expect(subscriber.messages).toHaveLength(4), wait);
    expect(subscriber.messages[3]?.packet.retain).toBe(false);

    for (const [name, qos] of [["A", 0], ["B", 1], ["C", 2]] as const) {
      await publisher.client.publishAsync(`${base}/${name}`, "", { qos, retain: true });
    }
    const late = await open({ ...v311, clientId: uniqueName("c") });
    await late.client.subscribeAsync(`${base}/+`, { qos: 2 });
    await sleep(500);
    expect(late.messages).toHaveLength(0);
  });

  it("zero_length_clientid: [MQTT-3.1.3-7] with a zero-byte ClientId, the client sets CleanSession 1", async () => {
    // broker: [MQTT-3.1.3-8] (refuse a zero-byte ClientId with CleanSession 0, with return code 0x02).
    const clean = await open({ ...v311, clientId: "", clean: true });
    expect(clean.connack.returnCode).toBe(0);
    expect((clean.sent[0]?.packet as IConnectPacket).clean).toBe(true);

    // [MQTT-3.1.3-7] If the Client supplies a zero-byte ClientId, the Client MUST also set CleanSession to 1. MQTT.js
    // refuses these options before it opens a connection.
    await expect(open({ ...v311, clientId: "", clean: false })).rejects.toThrow(/clientId/);
  });

  it("offline_message_queueing: [MQTT-3.1.2-4] the client gets the messages that the server kept", async () => {
    const base = uniqueName("t");
    const clientId = uniqueName("c");
    const first = await open({ ...v311, clientId, clean: false });
    await first.client.subscribeAsync(`${base}/+`, { qos: 2 });
    await first.client.endAsync();

    const publisher = await open({ ...v311, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/0`, "qos 0", { qos: 0 });
    await publisher.client.publishAsync(`${base}/1`, "qos 1", { qos: 1 });
    await publisher.client.publishAsync(`${base}/2`, "qos 2", { qos: 2 });

    const second = await open({ ...v311, clientId, clean: false });
    expect(second.connack.sessionPresent).toBe(true);
    await vi.waitFor(() => expect(second.messages.length).toBeGreaterThanOrEqual(2), wait);
    await sleep(500);
    // The broker can drop QoS 0 messages for a client that is not connected.
    expect([2, 3]).toContain(second.messages.length);
    // The test removes the session of the client.
    await second.client.endAsync();
    await open({ ...v311, clientId, clean: true });
  });

  it("overlapping_subscriptions: the client acknowledges each copy as its QoS requires", async () => {
    // broker: [MQTT-3.3.5-1] (deliver with the maximum QoS of the matching subscriptions).
    const base = uniqueName("t");
    const peer = await open({ ...v311, clientId: uniqueName("c") });
    const granted = await peer.client.subscribeAsync({ [`${base}/A/#`]: { qos: 2 }, [`${base}/A/+`]: { qos: 1 } });
    expect(granted.map((grant) => grant.qos)).toEqual([2, 1]);
    const publisher = await open({ ...v311, clientId: uniqueName("c") });
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

  it("keepalive: [MQTT-3.1.2-23] the client sends PINGREQ when it sends no other packet", { timeout: 15_000 }, async () => {
    // broker: [MQTT-3.1.2-24] (close the connection after one and a half times the Keep Alive).
    const willTopic = uniqueName("w");
    const observer = await open({ ...v311, clientId: uniqueName("c") });
    await observer.client.subscribeAsync(willTopic, { qos: 2 });
    const idle = await open({
      ...v311,
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

  it("redelivery_on_reconnect: [MQTT-2.3.1-6] the client acknowledges the messages that the server sends again", async () => {
    // broker: [MQTT-4.4.0-1] (send the unacknowledged PUBLISH packets again).
    const base = uniqueName("t");
    const clientId = uniqueName("c");
    const held = await open({ ...v311, clientId, clean: false, customHandleAcks: () => undefined });
    await held.client.subscribeAsync(`${base}/+`, { qos: 2 });
    const publisher = await open({ ...v311, clientId: uniqueName("c") });
    await publisher.client.publishAsync(`${base}/1`, "qos 1", { qos: 1 });
    await publisher.client.publishAsync(`${base}/2`, "qos 2", { qos: 2 });
    await vi.waitFor(() => expect(held.wire.filter((p) => p.cmd === "publish")).toHaveLength(2), wait);
    held.client.end(true);
    await sleep(300);

    const resumed = await open({ ...v311, clientId, clean: false });
    expect(resumed.connack.sessionPresent).toBe(true);
    await vi.waitFor(() => expect(resumed.messages).toHaveLength(2), wait);
    const again = ofType(resumed.received, "publish");
    const qos1 = again.find((r) => r.qos === 1);
    const qos2 = again.find((r) => r.qos === 2);
    expect(ofType(resumed.sent, "puback").map((r) => r.messageId)).toEqual([qos1?.messageId]);
    expect(ofType(resumed.sent, "pubrec").map((r) => r.messageId)).toEqual([qos2?.messageId]);
    await resumed.client.endAsync();
    await open({ ...v311, clientId, clean: true });
  });

  it("subscribe_failure: the client gives the return code 0x80 of the SUBACK to the application", async () => {
    // broker: [MQTT-3.9.3-1] and [MQTT-3.9.3-2] (one return code for each filter, 0x80 is Failure).
    const peer = await open({ ...v311, clientId: uniqueName("c") });
    const error = await peer.client.subscribeAsync("test/nosubscribe", { qos: 2 }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toMatchObject({ code: 0x80 });
    expect((ofType(peer.received, "suback")[0]?.packet as ISubackPacket).granted).toEqual([0x80]);
    expect(peer.client.connected).toBe(true);
  });

  it("dollar_topics: the client gets no message from a topic that starts with $", async () => {
    // broker: [MQTT-4.7.2-1] (a filter that starts with a wildcard does not match a topic that starts with $).
    const name = uniqueName("t");
    const peer = await open({ ...v311, clientId: uniqueName("c") });
    await peer.client.subscribeAsync(`+/${name}`, { qos: 2 });
    await peer.client.publishAsync(`$x/${name}`, "dollar", { qos: 1 });
    await peer.client.publishAsync(`x/${name}`, "plain", { qos: 1 });
    await vi.waitFor(() => expect(peer.messages).toHaveLength(1), wait);
    await sleep(300);
    expect(topicsOf(peer)).toEqual([`x/${name}`]);
  });

  it("unsubscribe: the client stops the messages of one filter and keeps the others", async () => {
    // broker: [MQTT-2.3.1-7] (the UNSUBACK has the Packet Identifier of the UNSUBSCRIBE), [MQTT-3.10.4-2] and
    // [MQTT-3.10.4-4] (stop the messages, send the UNSUBACK).
    const base = uniqueName("t");
    const peer = await open({ ...v311, clientId: uniqueName("c") });
    await peer.client.subscribeAsync({ [`${base}/A`]: { qos: 2 }, [`${base}/B`]: { qos: 2 }, [`${base}/C`]: { qos: 2 } });
    await peer.client.unsubscribeAsync(`${base}/B`);
    expect(ofType(peer.received, "unsuback")[0]?.messageId).toBe(ofType(peer.sent, "unsubscribe")[0]?.messageId);
    const publisher = await open({ ...v311, clientId: uniqueName("c") });
    for (const name of ["A", "B", "C"]) await publisher.client.publishAsync(`${base}/${name}`, name, { qos: 1 });
    await vi.waitFor(() => expect(peer.messages).toHaveLength(2), wait);
    await sleep(300);
    expect(topicsOf(peer)).toEqual([`${base}/A`, `${base}/C`]);
  });
});
