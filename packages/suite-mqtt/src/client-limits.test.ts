// Checks that this suite adds to the Paho scenarios. Each check examines one limit or one rule of the client: the
// limits of the server in the CONNACK, the resend of messages, the packet identifiers, the Server Keep Alive, the
// Assigned Client Identifier, the reason codes of the server, and the values that the application gives.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IClientOptions } from "mqtt";
import mqttPacket from "mqtt-packet";
import type { IPublishPacket } from "mqtt-packet";
import {
  broker,
  brokerUrl,
  closeAll,
  cut,
  ofType,
  open,
  peakInFlight,
  reusedIdentifiers,
  sleep,
  stopReadingAt,
  uniqueName,
} from "./harness.ts";
import type { Peer } from "./harness.ts";

const v5 = { protocolVersion: 5, clean: true } as const;
const wait = { timeout: 5_000, interval: 20 } as const;

/** The broker sends no acknowledgement for a PUBLISH to a topic that starts with `cmd/`. */
function silentTopic(): string {
  return `cmd/${uniqueName("u")}`;
}

/** The options of a client that keeps its session and connects again 300 ms after a network failure. */
function resumable(protocolVersion: 4 | 5): IClientOptions {
  const session = protocolVersion === 5 ? { properties: { sessionExpiryInterval: 300 } } : {};
  return { protocolVersion, clientId: uniqueName("c"), clean: false, reconnectPeriod: 300, ...session };
}

/** The length of the payload that makes a PUBLISH of exactly `size` bytes. */
function payloadLength(size: number, topic: string, qos: 0 | 1): number {
  const sizeOf = (length: number): number => {
    const packet: IPublishPacket = {
      cmd: "publish",
      topic,
      payload: Buffer.alloc(length),
      qos,
      dup: false,
      retain: false,
      ...(qos > 0 ? { messageId: 1 } : {}),
    };
    return mqttPacket.generate(packet, { protocolVersion: 5 }).length;
  };
  let length = Math.max(0, size - sizeOf(0));
  while (length > 0 && sizeOf(length) > size) length -= 1;
  while (sizeOf(length + 1) <= size) length += 1;
  return length;
}

/** Sends `count` messages with QoS 1 and QoS 2 in turn, with no wait, and waits for the acknowledgements. */
async function sendMixed(peer: Peer, count: number): Promise<number> {
  const topic = uniqueName("t");
  let completed = 0;
  for (let index = 0; index < count; index += 1) {
    peer.client.publish(topic, `message ${index}`, { qos: index % 2 === 0 ? 1 : 2 }, () => {
      completed += 1;
    });
  }
  await vi
    .waitFor(() => expect(completed === count || peer.disconnects.length > 0).toBe(true), wait)
    .catch(() => undefined);
  return completed;
}

/**
 * Sends one PUBLISH, closes the network connection before the client gets an answer, and waits for the PUBLISH that the
 * client sends on the second network connection.
 */
async function resendAfterFailure(peer: Peer, topic: string, qos: 1 | 2, holdAnswer: boolean): Promise<void> {
  if (holdAnswer) stopReadingAt(peer.client, "publish");
  peer.client.publish(topic, "0", { qos }, () => undefined);
  await vi.waitFor(() => expect(ofType(peer.sent, "publish")).toHaveLength(1), wait);
  await sleep(300);
  peer.client.stream.destroy();
  await vi.waitFor(() => expect(peer.connacks).toHaveLength(2), wait);
  await vi.waitFor(() => expect(ofType(peer.sent, "publish").filter((r) => r.connection === 2)).toHaveLength(1), wait);
}

function evidence(text: string): void {
  console.info(`client bug evidence: ${text}`);
}

describe.runIf(brokerUrl !== undefined)("MQTT.js: limits and rules of the client", () => {
  afterEach(closeAll);

  describe("receive_maximum", () => {
    it("the server sends Receive Maximum, and accepts and acknowledges 25 messages", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      expect(peer.connack.properties?.receiveMaximum).toBe(broker.receiveMaximum);
      expect(await sendMixed(peer, 25)).toBe(25);
      expect(peer.disconnects).toHaveLength(0);
    });

    // client bug: MQTT.js 5.16.1 has no send quota. It sends each QoS 1 and QoS 2 PUBLISH at once.
    it.fails("[MQTT-3.3.4-7] [MQTT-4.9.0-2] the client has no more QoS 1 and QoS 2 messages in flight than the Receive Maximum", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      const maximum = peer.connack.properties?.receiveMaximum ?? 65_535;
      await sendMixed(peer, 25);
      evidence(`peak in flight ${peakInFlight(peer)}, Receive Maximum ${maximum}`);
      expect(peakInFlight(peer)).toBeLessThanOrEqual(maximum);
    });
  });

  describe("maximum_packet_size", () => {
    it("the client sends a PUBLISH of exactly the Maximum Packet Size, and the server accepts it", async () => {
      const topic = uniqueName("t");
      const subscriber = await open({ ...v5, clientId: uniqueName("c") });
      await subscriber.client.subscribeAsync(topic, { qos: 1 });
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      const maximum = peer.connack.properties?.maximumPacketSize ?? 0;
      expect(maximum).toBe(broker.maximumPacketSize);
      await peer.client.publishAsync(topic, Buffer.alloc(payloadLength(maximum, topic, 1), 0x61), { qos: 1 });
      expect(ofType(peer.sent, "publish").map((r) => r.size)).toEqual([maximum]);
      await vi.waitFor(() => expect(subscriber.messages).toHaveLength(1), wait);
      expect(peer.disconnects).toHaveLength(0);
    });

    // client bug: MQTT.js 5.16.1 does not compare an outgoing PUBLISH with the Maximum Packet Size in the CONNACK.
    it.fails("[MQTT-3.2.2-15] the client does not send a PUBLISH one byte larger than the Maximum Packet Size", async () => {
      const topic = uniqueName("t");
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      const maximum = peer.connack.properties?.maximumPacketSize ?? 0;
      const payload = Buffer.alloc(payloadLength(maximum, topic, 0) + 1, 0x61);
      await peer.client.publishAsync(topic, payload, { qos: 0 }).catch(() => undefined);
      await sleep(500);
      const sizes = ofType(peer.sent, "publish").map((r) => r.size);
      evidence(`PUBLISH sizes ${JSON.stringify(sizes)}, maximum ${maximum}, DISCONNECT ${JSON.stringify(peer.disconnects.map((d) => d.reasonCode))}`);
      expect(sizes.filter((size) => size > maximum)).toEqual([]);
    });

    // client bug: MQTT.js 5.16.1 does not compare an outgoing SUBSCRIBE with the Maximum Packet Size in the CONNACK.
    it.fails("[MQTT-3.2.2-15] the client does not send a SUBSCRIBE larger than the Maximum Packet Size", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      const maximum = peer.connack.properties?.maximumPacketSize ?? 0;
      peer.client.subscribe(`${uniqueName("t")}/${"f".repeat(maximum)}`, { qos: 1 }, () => undefined);
      await sleep(500);
      const sizes = ofType(peer.sent, "subscribe").map((r) => r.size);
      evidence(`SUBSCRIBE sizes ${JSON.stringify(sizes)}, maximum ${maximum}, DISCONNECT ${JSON.stringify(peer.disconnects.map((d) => d.reasonCode))}`);
      expect(sizes.filter((size) => size > maximum)).toEqual([]);
    });
  });

  describe("topic_alias_maximum", () => {
    it("[MQTT-3.2.2-17] [MQTT-3.3.2-9] the client refuses a Topic Alias above the Topic Alias Maximum of the server", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      const maximum = peer.connack.properties?.topicAliasMaximum ?? 0;
      expect(maximum).toBe(broker.topicAliasMaximum);
      for (const qos of [0, 1] as const) {
        const error = await peer.client
          .publishAsync(uniqueName("t"), "alias", { qos, properties: { topicAlias: maximum + 1 } })
          .then(
            () => undefined,
            (failure: unknown) => failure,
          );
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/Topic Alias out of range/);
      }
      expect(ofType(peer.sent, "publish")).toHaveLength(0);
      expect(peer.client.connected).toBe(true);
    });

    it("[MQTT-3.2.2-17] with autoAssignTopicAlias, the client uses only the aliases from 1 to the maximum", async () => {
      const base = uniqueName("t");
      const subscriber = await open({ ...v5, clientId: uniqueName("c") });
      await subscriber.client.subscribeAsync(`${base}/+`, { qos: 1 });
      const peer = await open({ ...v5, clientId: uniqueName("c"), autoAssignTopicAlias: true });
      const maximum = peer.connack.properties?.topicAliasMaximum ?? 0;
      const topics = ["a", "b", "c", "d", "e"].map((name) => `${base}/${name}`);
      for (const round of [1, 2]) {
        for (const topic of topics) await peer.client.publishAsync(topic, `${round}`, { qos: 1 });
      }
      await vi.waitFor(() => expect(subscriber.messages).toHaveLength(10), wait);
      expect(subscriber.messages.map((message) => message.topic)).toEqual([...topics, ...topics]);
      const aliases = ofType(peer.sent, "publish").flatMap((r) => (r.topicAlias === undefined ? [] : [r.topicAlias]));
      expect(aliases.length).toBeGreaterThan(0);
      for (const alias of aliases) {
        expect(alias).toBeGreaterThanOrEqual(1);
        expect(alias).toBeLessThanOrEqual(maximum);
      }
      expect(peer.disconnects).toHaveLength(0);
    });
  });

  describe("resend_with_dup_v5", () => {
    it("MQTT 5.0, QoS 1: [MQTT-4.4.0-1] the client sends the PUBLISH again with the same Packet Identifier after a network failure", async () => {
      const peer = await open({ ...resumable(5) });
      await resendAfterFailure(peer, silentTopic(), 1, false);
      const [first, again] = ofType(peer.sent, "publish");
      expect(peer.connacks[1]?.sessionPresent).toBe(true);
      expect(again?.messageId).toBe(first?.messageId);
      expect(again?.topic).toBe(first?.topic);
    });

    // client bug: MQTT.js 5.16.1 resends the unacknowledged PUBLISH with DUP 0. _onConnect does not set the DUP flag.
    it.fails("MQTT 5.0, QoS 1: [MQTT-3.3.1-1] the client sets DUP 1 when it sends the PUBLISH again", async () => {
      const peer = await open({ ...resumable(5) });
      await resendAfterFailure(peer, silentTopic(), 1, false);
      const again = ofType(peer.sent, "publish").filter((r) => r.connection === 2);
      evidence(`resent PUBLISH id ${again[0]?.messageId} on connection 2 with DUP ${again[0]?.dup}`);
      expect(again.map((r) => r.dup)).toEqual([true]);
    });

    it("MQTT 5.0, QoS 2: [MQTT-4.4.0-1] the server gets the PUBLISH, and the client sends it again after a network failure", async () => {
      const topic = uniqueName("t");
      const subscriber = await open({ ...v5, clientId: uniqueName("c") });
      await subscriber.client.subscribeAsync(topic, { qos: 2 });
      const peer = await open({ ...resumable(5) });
      await resendAfterFailure(peer, topic, 2, true);
      expect(subscriber.messages.length).toBeGreaterThanOrEqual(1);
      const [first, again] = ofType(peer.sent, "publish");
      expect(again?.messageId).toBe(first?.messageId);
    });

    // client bug: MQTT.js 5.16.1 resends the unacknowledged PUBLISH with DUP 0. The Paho broker log then has the line
    // "duplicate QoS 2 message id found with DUP 0".
    it.fails("MQTT 5.0, QoS 2: [MQTT-3.3.1-1] the client sets DUP 1 when it sends the PUBLISH again", async () => {
      const topic = uniqueName("t");
      const peer = await open({ ...resumable(5) });
      await resendAfterFailure(peer, topic, 2, true);
      const again = ofType(peer.sent, "publish").filter((r) => r.connection === 2);
      evidence(`resent QoS 2 PUBLISH id ${again[0]?.messageId} on topic ${topic} with DUP ${again[0]?.dup}`);
      expect(again.map((r) => r.dup)).toEqual([true]);
    });
  });

  describe("resend_with_dup_v311", () => {
    it("MQTT 3.1.1, QoS 1: [MQTT-4.4.0-1] the client sends the PUBLISH again with the same Packet Identifier after a network failure", async () => {
      const peer = await open({ ...resumable(4) });
      await resendAfterFailure(peer, uniqueName("t"), 1, true);
      const [first, again] = ofType(peer.sent, "publish");
      expect(peer.connacks[1]?.sessionPresent).toBe(true);
      expect(again?.messageId).toBe(first?.messageId);
    });

    // client bug: MQTT.js 5.16.1 resends the unacknowledged PUBLISH with DUP 0 also for MQTT 3.1.1.
    it.fails("MQTT 3.1.1, QoS 1: [MQTT-3.3.1-1] the client sets DUP 1 when it sends the PUBLISH again", async () => {
      const peer = await open({ ...resumable(4) });
      await resendAfterFailure(peer, uniqueName("t"), 1, true);
      const again = ofType(peer.sent, "publish").filter((r) => r.connection === 2);
      evidence(`resent MQTT 3.1.1 PUBLISH id ${again[0]?.messageId} with DUP ${again[0]?.dup}`);
      expect(again.map((r) => r.dup)).toEqual([true]);
    });
  });

  describe("resend_pubrel", () => {
    it("[MQTT-4.4.0-1] [MQTT-4.3.3-6] the client sends the PUBREL again, and not the PUBLISH", async () => {
      const peer = await open({ ...resumable(5) });
      stopReadingAt(peer.client, "pubrel");
      peer.client.publish(uniqueName("t"), "qos 2", { qos: 2 }, () => undefined);
      await vi.waitFor(() => expect(ofType(peer.sent, "pubrel")).toHaveLength(1), wait);
      await sleep(300);
      peer.client.stream.destroy();
      await vi.waitFor(() => expect(peer.connacks).toHaveLength(2), wait);
      await vi.waitFor(() => expect(ofType(peer.sent, "pubrel").filter((r) => r.connection === 2)).toHaveLength(1), wait);
      await sleep(300);
      expect(peer.connacks[1]?.sessionPresent).toBe(true);
      const id = ofType(peer.sent, "publish")[0]?.messageId;
      expect(ofType(peer.sent, "pubrel").map((r) => r.messageId)).toEqual([id, id]);
      expect(ofType(peer.sent, "publish").filter((r) => r.connection === 2)).toHaveLength(0);
    });
  });

  describe("resend_only_with_session", () => {
    it("with Session Expiry Interval 0, the server has no session after a network failure", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c"), clean: false, reconnectPeriod: 300 });
      peer.client.publish(silentTopic(), "0", { qos: 1 }, () => undefined);
      await vi.waitFor(() => expect(ofType(peer.sent, "publish")).toHaveLength(1), wait);
      await sleep(300);
      peer.client.stream.destroy();
      await vi.waitFor(() => expect(peer.connacks).toHaveLength(2), wait);
      expect(peer.connacks.map((connack) => connack.sessionPresent)).toEqual([false, false]);
      expect(ofType(peer.sent, "connect").map((r) => (r.packet as { clean?: boolean }).clean)).toEqual([false, false]);
    });

    // client bug: MQTT.js 5.16.1 sends the old messages again also when the CONNACK has Session Present 0.
    it.fails("[MQTT-3.2.2-5] [MQTT-4.4.0-1] after Session Present 0, the client does not send the old PUBLISH again", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c"), clean: false, reconnectPeriod: 300 });
      peer.client.publish(silentTopic(), "0", { qos: 1 }, () => undefined);
      await vi.waitFor(() => expect(ofType(peer.sent, "publish")).toHaveLength(1), wait);
      await sleep(300);
      peer.client.stream.destroy();
      await vi.waitFor(() => expect(peer.connacks).toHaveLength(2), wait);
      await sleep(500);
      const again = ofType(peer.sent, "publish").filter((r) => r.connection === 2);
      evidence(`Session Present ${peer.connacks[1]?.sessionPresent}, PUBLISH packets sent again ${JSON.stringify(again.map((r) => r.messageId))}`);
      expect(again).toHaveLength(0);
    });

    // client bug: MQTT.js 5.16.1 sends the old messages again also on a connection with Clean Start 1.
    it.fails("[MQTT-3.1.2-4] [MQTT-4.4.0-1] after a CONNECT with Clean Start 1, the client does not send the old PUBLISH again", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c"), reconnectPeriod: 300 });
      peer.client.publish(silentTopic(), "0", { qos: 1 }, () => undefined);
      await vi.waitFor(() => expect(ofType(peer.sent, "publish")).toHaveLength(1), wait);
      await sleep(300);
      peer.client.stream.destroy();
      await vi.waitFor(() => expect(peer.connacks).toHaveLength(2), wait);
      await sleep(500);
      const again = ofType(peer.sent, "publish").filter((r) => r.connection === 2);
      evidence(`Clean Start 1, PUBLISH packets sent again ${JSON.stringify(again.map((r) => r.messageId))}`);
      expect(again).toHaveLength(0);
    });
  });

  describe("unique_packet_identifiers", () => {
    it("the server sends no PUBACK for a QoS 1 PUBLISH to a cmd/ topic, so the identifier stays in use", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      peer.client.publish(silentTopic(), "0", { qos: 1 }, () => undefined);
      await vi.waitFor(() => expect(ofType(peer.sent, "publish")).toHaveLength(1), wait);
      await sleep(500);
      const held = ofType(peer.sent, "publish")[0]?.messageId ?? 0;
      expect(ofType(peer.received, "puback")).toHaveLength(0);
      expect(Object.keys(peer.client.outgoing)).toEqual([String(held)]);
    });

    // client bug: the default message id provider of MQTT.js 5.16.1 counts up and wraps. It does not skip an
    // identifier that is in use.
    it.fails("[MQTT-2.2.1-3] the client does not give a new PUBLISH an identifier that is in use", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      peer.client.publish(silentTopic(), "0", { qos: 1 }, () => undefined);
      await vi.waitFor(() => expect(ofType(peer.sent, "publish")).toHaveLength(1), wait);
      // The default provider gives the identifiers in a cycle of 65535. These calls make the same state as 65534
      // completed QoS 1 exchanges while the first PUBLISH stays unacknowledged.
      for (let index = 0; index < 65_534; index += 1) peer.client.messageIdProvider.allocate();
      await peer.client.publishAsync(uniqueName("t"), "second", { qos: 1 }).catch(() => undefined);
      const ids = ofType(peer.sent, "publish").map((r) => r.messageId);
      evidence(`PUBLISH identifiers ${JSON.stringify(ids)}, identifiers used twice ${JSON.stringify(reusedIdentifiers(peer))}`);
      expect(reusedIdentifiers(peer)).toEqual([]);
    });
  });

  describe("server_keep_alive_timing", () => {
    it("[MQTT-3.2.2-21] an idle client sends PINGREQ within the Server Keep Alive", { timeout: 90_000 }, async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c"), keepalive: 120 });
      expect(peer.connack.properties?.serverKeepAlive).toBe(broker.serverKeepAlive);
      const start = ofType(peer.sent, "connect")[0]?.at ?? 0;
      await vi.waitFor(() => expect(ofType(peer.sent, "pingreq").length).toBeGreaterThan(0), {
        timeout: 80_000,
        interval: 250,
      });
      const first = ofType(peer.sent, "pingreq")[0]?.at ?? 0;
      console.info(`first PINGREQ ${first - start} ms after the CONNECT, Server Keep Alive ${broker.serverKeepAlive} s`);
      expect(first - start).toBeLessThanOrEqual(broker.serverKeepAlive * 1_000 + 2_000);
      await vi.waitFor(() => expect(ofType(peer.received, "pingresp").length).toBeGreaterThan(0), wait);
      expect(peer.client.connected).toBe(true);
    });
  });

  describe("assigned_client_identifier", () => {
    it("[MQTT-3.2.2-16] the session resumes when the application gives the Assigned Client Identifier", async () => {
      const topic = uniqueName("t");
      const first = await open({ ...v5, clientId: "", properties: { sessionExpiryInterval: 60 } });
      const assigned = first.connack.properties?.assignedClientIdentifier ?? "";
      expect(assigned).not.toBe("");
      await first.client.subscribeAsync(topic, { qos: 1 });
      await first.client.endAsync();
      const publisher = await open({ ...v5, clientId: uniqueName("c") });
      await publisher.client.publishAsync(topic, "kept", { qos: 1 });
      const second = await open({ ...v5, clientId: assigned, clean: false });
      expect(second.connack.sessionPresent).toBe(true);
      await vi.waitFor(() => expect(second.messages.map((message) => message.topic)).toEqual([topic]), wait);
    });
  });

  describe("error_reason_codes", () => {
    it("a PUBACK with reason code 0x87 rejects the publish with code 0x87", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      const error = await peer.client.publishAsync("test_qos_1_2_errors", "denied", { qos: 1 }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(error).toMatchObject({ code: 0x87 });
      expect(Object.keys(peer.client.outgoing)).toEqual([]);
    });

    it("[MQTT-4.4.0-2] after a PUBREC with reason code 0x87, the client sends no PUBREL and does not send the PUBLISH again", async () => {
      const peer = await open({ ...resumable(5) });
      const error = await peer.client.publishAsync("test_qos_1_2_errors", "denied", { qos: 2 }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(error).toMatchObject({ code: 0x87 });
      expect(ofType(peer.sent, "pubrel")).toHaveLength(0);
      cut(peer.client);
      await vi.waitFor(() => expect(peer.connacks).toHaveLength(2), wait);
      await sleep(500);
      expect(ofType(peer.sent, "publish")).toHaveLength(1);
    });

    it("a PUBCOMP with reason code 0x92 rejects the publish with code 0x92", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      const error = await peer.client.publishAsync("test_qos_1_2_errors_pubcomp", "lost", { qos: 2 }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(error).toMatchObject({ code: 0x92 });
    });

    it("a PUBACK with reason code 0x10 (No matching subscribers) is not an error", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      await peer.client.publishAsync(uniqueName("t"), "nobody", { qos: 1 });
      expect(ofType(peer.received, "puback")[0]?.reasonCode).toBe(0x10);
    });

    it("a DISCONNECT with reason code 135 gives the reason code and the properties to the application", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      await peer.client.publishAsync("cmd/disconnectWithRC", "135", { qos: 0 });
      await vi.waitFor(() => expect(peer.disconnects).toHaveLength(1), wait);
      const packet = peer.disconnects[0];
      expect(packet?.reasonCode).toBe(135);
      expect(packet?.properties?.reasonString).toBe("This is a custom Reason String");
      expect(packet?.properties?.userProperties).toEqual({ key: "value" });
    });
  });

  describe("values_from_the_application", () => {
    // client bug: MQTT.js 5.16.1 copies the `dup` option of the application into a QoS 0 PUBLISH.
    it.fails("[MQTT-3.3.1-2] the client does not send a QoS 0 PUBLISH with DUP 1", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      await peer.client.publishAsync(uniqueName("t"), "dup", { qos: 0, dup: true }).catch(() => undefined);
      await sleep(300);
      const flagged = ofType(peer.sent, "publish").filter((r) => r.qos === 0 && r.dup);
      evidence(`${flagged.length} QoS 0 PUBLISH with DUP 1, DISCONNECT ${JSON.stringify(peer.disconnects.map((d) => d.reasonCode))}`);
      expect(flagged).toHaveLength(0);
    });

    // client bug: MQTT.js 5.16.1 sends a Subscription Identifier that the application puts in a PUBLISH.
    it.fails("[MQTT-3.3.4-6] the client does not send a PUBLISH with a Subscription Identifier", async () => {
      const peer = await open({ ...v5, clientId: uniqueName("c") });
      await peer.client
        .publishAsync(uniqueName("t"), "id", { qos: 0, properties: { subscriptionIdentifier: 5 } })
        .catch(() => undefined);
      await sleep(300);
      const marked = ofType(peer.sent, "publish").filter(
        (r) => (r.packet as IPublishPacket).properties?.subscriptionIdentifier !== undefined,
      );
      evidence(`${marked.length} PUBLISH with a Subscription Identifier, DISCONNECT ${JSON.stringify(peer.disconnects.map((d) => d.reasonCode))}`);
      expect(marked).toHaveLength(0);
    });
  });
});
