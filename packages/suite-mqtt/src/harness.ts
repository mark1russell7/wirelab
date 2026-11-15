import { setTimeout as sleep } from "node:timers/promises";
import mqtt from "mqtt";
import type { IClientOptions, IConnackPacket, IDisconnectPacket, IPublishPacket, MqttClient, Packet } from "mqtt";
import mqttPacket from "mqtt-packet";

/**
 * The URL of the broker under test. The suite runs only when the environment variable `MQTT_BROKER_URL` has a value.
 */
export const brokerUrl: string | undefined = process.env["MQTT_BROKER_URL"] || undefined;

/** The limits that `broker.conf` sets. The tests compare the packets of the client with these limits. */
export const broker: {
  readonly receiveMaximum: number;
  readonly topicAliasMaximum: number;
  readonly maximumPacketSize: number;
  readonly serverKeepAlive: number;
} = {
  receiveMaximum: 20,
  topicAliasMaximum: 2,
  maximumPacketSize: 1024,
  serverKeepAlive: 60,
};

const run = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let names = 0;

/**
 * This function gives a name for a client identifier or a topic. Each name is unique in the run. A name has 23
 * characters or fewer when the prefix has 4 characters or fewer, so a broker for MQTT 3.1.1 accepts it.
 */
export function uniqueName(prefix: string): string {
  names += 1;
  return `${prefix}${run}${names.toString(36)}`;
}

/** One packet that the client wrote or read. */
export interface PacketRecord {
  /** The direction of the packet. */
  readonly direction: "sent" | "received";
  /** The order of the packet among all packets of the client. */
  readonly seq: number;
  /** The time of the record, in milliseconds since the epoch. */
  readonly at: number;
  /** The packet object. The client can change this object after the record is made. */
  readonly packet: Packet;
  /** The type of the packet, for example `publish`. */
  readonly cmd: string;
  /** The number of the network connection. The first connection is 1. */
  readonly connection: number;
  /** The size of the packet in bytes, with the fixed header. The value is -1 when the encoder refuses the packet. */
  readonly size: number;
  /** The value of the DUP flag when the record is made. */
  readonly dup: boolean;
  /** The QoS of a `PUBLISH` packet when the record is made, or 0. */
  readonly qos: number;
  /** The packet identifier, or `undefined` when the packet has none. */
  readonly messageId: number | undefined;
  /** The reason code of the packet, or `undefined` when the packet has none. */
  readonly reasonCode: number | undefined;
  /** The Topic Alias of a `PUBLISH` packet, or `undefined`. */
  readonly topicAlias: number | undefined;
  /** The topic name of a `PUBLISH` packet when the record is made, or an empty string. */
  readonly topic: string;
}

/** One application message that the client gave to the application. */
export interface Message {
  readonly topic: string;
  readonly payload: Buffer;
  readonly packet: IPublishPacket;
}

/** A connected client and the records of its packets. */
export interface Peer {
  readonly client: MqttClient;
  /** The `CONNACK` packet of the first network connection. */
  readonly connack: IConnackPacket;
  /** Each `CONNACK` packet, one for each network connection. */
  readonly connacks: IConnackPacket[];
  /** Each packet that the client wrote, in order. */
  readonly sent: PacketRecord[];
  /** Each packet that the client read, in order. */
  readonly received: PacketRecord[];
  /** Each application message, in order. */
  readonly messages: Message[];
  /** Each `DISCONNECT` packet from the server. */
  readonly disconnects: IDisconnectPacket[];
  /**
   * Each packet that arrived on the network connection, in order. A second packet reader makes these records, so a
   * packet is in this list also when the client has not read it yet.
   */
  readonly wire: Packet[];
  /** Each error that the client gave to the application. */
  readonly errors: Error[];
}

const live = new Set<MqttClient>();

function sizeOf(packet: Packet, protocolVersion: 3 | 4 | 5): number {
  try {
    return mqttPacket.generate(packet, { protocolVersion }).length;
  } catch {
    return -1;
  }
}

/**
 * This function makes a client, starts its connection and waits for the first `CONNACK`. It records each packet from
 * the `CONNECT` packet. The promise rejects when the client gives an error before the `CONNACK`. The function
 * `closeAll` closes the client.
 */
export async function open(options: IClientOptions): Promise<Peer> {
  if (brokerUrl === undefined) throw new Error("MQTT_BROKER_URL has no value");
  const client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 0,
    connectTimeout: 10_000,
    ...options,
    manualConnect: true,
  });
  live.add(client);
  const protocolVersion = options.protocolVersion ?? 4;
  let connection = 0;
  let seq = 0;
  const sent: PacketRecord[] = [];
  const received: PacketRecord[] = [];
  const messages: Message[] = [];
  const disconnects: IDisconnectPacket[] = [];
  const errors: Error[] = [];
  const connacks: IConnackPacket[] = [];
  const wire: Packet[] = [];
  const record = (direction: "sent" | "received", packet: Packet): PacketRecord => {
    seq += 1;
    const fields = packet as {
      dup?: boolean;
      qos?: number;
      messageId?: number;
      reasonCode?: number;
      topic?: string | Buffer;
      properties?: { topicAlias?: number };
    };
    return {
      direction,
      seq,
      at: Date.now(),
      packet,
      cmd: packet.cmd,
      connection,
      size: sizeOf(packet, protocolVersion),
      dup: fields.dup === true,
      qos: packet.cmd === "publish" ? (fields.qos ?? 0) : 0,
      messageId: fields.messageId,
      reasonCode: fields.reasonCode,
      topicAlias: packet.cmd === "publish" ? fields.properties?.topicAlias : undefined,
      topic: packet.cmd === "publish" ? String(fields.topic ?? "") : "",
    };
  };
  client.on("packetsend", (packet) => {
    if (packet.cmd === "connect") {
      connection += 1;
      const reader = mqttPacket.parser({ protocolVersion });
      reader.on("packet", (item) => wire.push(item));
      reader.on("error", () => undefined);
      client.stream.on("data", (chunk: Buffer) => reader.parse(chunk));
    }
    sent.push(record("sent", packet));
  });
  client.on("packetreceive", (packet) => {
    received.push(record("received", packet));
    if (packet.cmd === "connack") connacks.push(packet);
  });
  client.on("message", (topic, payload, packet) => {
    messages.push({ topic, payload, packet });
  });
  client.on("disconnect", (packet) => {
    disconnects.push(packet);
  });
  client.on("error", (error) => {
    errors.push(error);
  });
  const connected = new Promise<Peer>((resolve, reject) => {
    const fail = (error: Error): void => {
      client.removeListener("connect", ok);
      client.removeListener("close", closed);
      reject(error);
    };
    const closed = (): void => fail(new Error("the connection closed before the CONNACK"));
    const ok = (connack: IConnackPacket): void => {
      client.removeListener("error", fail);
      client.removeListener("close", closed);
      resolve({ client, connack, connacks, sent, received, messages, disconnects, wire, errors });
    };
    client.once("connect", ok);
    client.once("error", fail);
    client.once("close", closed);
  });
  client.connect();
  return connected;
}

/** This function closes each client that `open` made. A client with no packet in flight sends `DISCONNECT` first. */
export async function closeAll(): Promise<void> {
  const clients = [...live];
  live.clear();
  await Promise.all(clients.map(async (client) => close(client)));
}

async function close(client: MqttClient): Promise<void> {
  if (client.connected && !client.disconnecting && Object.keys(client.outgoing).length === 0) {
    const ended = new Promise<boolean>((resolve) => {
      client.end(false, {}, () => resolve(true));
    });
    if (await Promise.race([ended, sleep(2_000, false)])) return;
  }
  client.end(true);
  client.stream?.destroy();
}

/**
 * This function closes the network connection of the client at the next tick, with no `DISCONNECT` packet. The client
 * then operates as after a network failure.
 */
export function cut(client: MqttClient): void {
  process.nextTick(() => client.stream.destroy());
}

/**
 * This function stops the reading of the network connection when the client writes its next packet of the type. The
 * packet goes to the server, but the client gets no answer to it. A new network connection reads again.
 */
export function stopReadingAt(client: MqttClient, cmd: string): void {
  const hold = (packet: Packet): void => {
    if (packet.cmd !== cmd) return;
    client.removeListener("packetsend", hold);
    client.stream.pause();
  };
  client.on("packetsend", hold);
}

/** This function gives the records of one packet type. */
export function ofType(records: readonly PacketRecord[], cmd: string): PacketRecord[] {
  return records.filter((item) => item.cmd === cmd);
}

/** This function gives the topics of the application messages, in the order of arrival. */
export function topicsOf(peer: Peer): string[] {
  return peer.messages.map((message) => message.topic);
}

/**
 * This function gives the largest number of QoS 1 and QoS 2 `PUBLISH` packets that the client had in flight on one
 * network connection. A packet stays in flight until a `PUBACK`, a `PUBCOMP`, or a `PUBREC` with a reason code of
 * 0x80 or more. This rule is the rule of the MQTT 5.0 statement [MQTT-3.3.4-7].
 */
export function peakInFlight(peer: Peer): number {
  const events = [...peer.sent, ...peer.received].sort((a, b) => a.seq - b.seq);
  const open = new Set<number>();
  let connection = 0;
  let peak = 0;
  for (const event of events) {
    if (event.connection !== connection) {
      connection = event.connection;
      open.clear();
    }
    if (event.direction === "sent" && event.cmd === "publish" && event.qos > 0 && event.messageId !== undefined) {
      open.add(event.messageId);
      peak = Math.max(peak, open.size);
    }
    if (event.direction === "received" && event.messageId !== undefined) {
      const done =
        event.cmd === "puback" || event.cmd === "pubcomp" || (event.cmd === "pubrec" && (event.reasonCode ?? 0) >= 0x80);
      if (done) open.delete(event.messageId);
    }
  }
  return peak;
}

/**
 * This function gives each packet identifier that the client used for two packets in flight at the same time. The
 * packets are QoS 1 and QoS 2 `PUBLISH`, `SUBSCRIBE` and `UNSUBSCRIBE` packets. A resend on a new network connection
 * keeps its identifier, so this function examines one network connection at a time.
 */
export function reusedIdentifiers(peer: Peer): number[] {
  const events = [...peer.sent, ...peer.received].sort((a, b) => a.seq - b.seq);
  const open = new Map<number, string>();
  const reused: number[] = [];
  let connection = 0;
  for (const event of events) {
    if (event.connection !== connection) {
      connection = event.connection;
      open.clear();
    }
    const id = event.messageId;
    if (id === undefined) continue;
    if (event.direction === "sent") {
      const starts =
        (event.cmd === "publish" && event.qos > 0) || event.cmd === "subscribe" || event.cmd === "unsubscribe";
      if (!starts) continue;
      if (open.has(id) && !event.dup) reused.push(id);
      open.set(id, event.cmd);
    } else {
      const ends =
        event.cmd === "puback" ||
        event.cmd === "pubcomp" ||
        event.cmd === "suback" ||
        event.cmd === "unsuback" ||
        (event.cmd === "pubrec" && (event.reasonCode ?? 0) >= 0x80);
      if (ends) open.delete(id);
    }
  }
  return reused;
}

export { sleep };
