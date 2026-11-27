/**
 * The targets of `mqtt`. A scripted peer on TCP answers the packets of the client. The cause targets of C003 use a peer
 * that grants each connection and sends no other packet. The wire targets of C032 use a script for each connection.
 */
import { createServer, type AddressInfo, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { connect, type IClientOptions, type MqttClient } from "mqtt";
import mqttPacket from "mqtt-packet";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { CauseTarget, WireRun, WireTarget } from "./target.ts";

/** The package and the version of the targets. The version is the version that the workspace installs. */
export const MQTT = { package: "mqtt", version: "5.16.1" } as const;

/** The time limit in ms of one run. */
const limitMs = 5_000;

/** The time in ms that a wire run waits for the packets after its last event. */
const settleMs = 300;

/** One connection of the scripted peer, with the functions that answer the client on it. */
interface PeerConnection {
  /** The index of the connection, from 0. */
  readonly index: number;
  /** This function sends `packet` to the client, in the protocol version of the connection. */
  send(packet: mqttPacket.Packet): void;
  /** This function closes the connection. */
  close(): void;
}

/** The script of a peer: the function that answers each packet of the client. */
type PeerScript = (connection: PeerConnection, packet: mqttPacket.Packet) => void;

/** This function starts a peer with `script`, gives the URL of the peer to `use`, and gives the result of `use`. */
async function withScriptedPeer<T>(script: PeerScript, use: (url: string) => Promise<T>): Promise<T> {
  const sockets = new Set<Socket>();
  let count = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    const parser = mqttPacket.parser();
    let protocolVersion = 4;
    const connection: PeerConnection = {
      index: count++,
      send: (packet) => {
        if (!socket.destroyed) socket.write(mqttPacket.generate(packet, { protocolVersion }));
      },
      close: () => socket.destroy(),
    };
    parser.on("packet", (packet) => {
      if (packet.cmd === "connect") protocolVersion = packet.protocolVersion ?? 4;
      script(connection, packet);
    });
    socket.on("data", (data: Buffer) => parser.parse(data));
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await use(`mqtt://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

/** The CONNACK that grants a connection, in the field of the protocol version `version`. */
const connack = (version: number | undefined): mqttPacket.Packet =>
  version === 5
    ? { cmd: "connack", reasonCode: 0, sessionPresent: false }
    : { cmd: "connack", returnCode: 0, sessionPresent: false };

/** This function starts a peer that grants each connection, and gives the outcome of `use`. */
const withPeer = (use: (url: string) => Promise<Outcome>): Promise<Outcome> =>
  withScriptedPeer((connection, packet) => {
    if (packet.cmd === "connect") connection.send(connack(packet.protocolVersion));
  }, use);

/** This function connects a client with `options` and waits for the CONNACK. */
async function connected(url: string, options: IClientOptions): Promise<MqttClient> {
  const client = connect(url, options);
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("error", reject);
  });
  return client;
}

/** This function waits for the next event `name` of `client`. */
const next = (client: MqttClient, name: "connect" | "close"): Promise<void> =>
  new Promise((resolve) => client.once(name, () => resolve()));

/**
 * The target of F0117: `publish()` with QoS 1 after `end()`. With the default `reconnectPeriod`, the callback gets
 * the error "client disconnecting". With `reconnectPeriod` 0, `publish()` throws a `TypeError`.
 */
export const mqttPublishAfterEndTarget: CauseTarget = {
  id: "mqtt/publish-after-end",
  ...MQTT,
  state: "after end",
  step: "internal TypeError in a wrong state",
  reference: "publish() with QoS 1 after end(), reconnectPeriod 1000",
  trigger: "publish() with QoS 1 after end(), reconnectPeriod 0",
  run: (input) =>
    withPeer((url) =>
      outcomeOf(async () => {
        const client = await connected(url, { reconnectPeriod: input === "reference" ? 1_000 : 0 });
        await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
        await new Promise<void>((resolve, reject) => {
          client.publish("t", "x", { qos: 1 }, (error) => (error === undefined ? resolve() : reject(error)));
        });
        return ["published"];
      }, limitMs),
    ),
};

/**
 * The target of F0122: `end()` before `connect()`. A client with no `manualConnect` ends with no error. A client with
 * `manualConnect` has no stream yet, and `end()` throws a `TypeError`.
 */
export const mqttEndBeforeConnectTarget: CauseTarget = {
  id: "mqtt/end-before-connect",
  ...MQTT,
  state: "before connect",
  step: "internal TypeError in a wrong state",
  reference: "end() of a new client with no manualConnect",
  trigger: "end() of a new client with manualConnect",
  run: (input) =>
    withPeer((url) =>
      outcomeOf(async () => {
        const client = connect(url, { manualConnect: input === "trigger", reconnectPeriod: 0 });
        await new Promise<void>((resolve) => client.end(true, {}, () => resolve()));
        return ["ended"];
      }, limitMs),
    ),
};

/** The cause targets of `mqtt`. */
export const mqttCauseTargets: readonly CauseTarget[] = [mqttPublishAfterEndTarget, mqttEndBeforeConnectTarget];

/** This function gives the callback of an mqtt call as a promise of its error. */
const settled = (start: (callback: (error?: Error) => void) => void): Promise<Error | undefined> =>
  new Promise((resolve) => start((error) => resolve(error ?? undefined)));

/** This function gives the outcome of a call whose callback gave `error`. */
const resultOf = (error: Error | undefined, value: string): readonly string[] => {
  if (error !== undefined) throw error;
  return [value];
};

/** This function gives each topic of a SUBSCRIBE or an UNSUBSCRIBE, with the name of the packet. */
const topicsOf = (packet: mqttPacket.Packet): string[] => {
  if (packet.cmd === "subscribe") return packet.subscriptions.map((one) => `subscribe ${one.topic}`);
  if (packet.cmd === "unsubscribe") return packet.unsubscriptions.map((topic) => `unsubscribe ${topic}`);
  return [];
};

/**
 * The target of F0115: a SUBACK with one failure code among grants. After a reconnect with a new session, the client
 * subscribes again to each topic that the peer granted. The client of the trigger subscribes again to none.
 */
export const mqttSubackPartialTarget: WireTarget = {
  id: "mqtt/suback-partial",
  ...MQTT,
  call: "subscribe",
  reply: "one failure code among grants",
  reference: "SUBACK [0, 0] for the topics a and b, then a reconnect with a new session",
  trigger: "SUBACK [0, 0x80] for the topics a and b, then a reconnect with a new session",
  rule: (input) =>
    input === "reference" ? { kind: "value", wire: ["subscribe a", "subscribe b"] } : { kind: "error", wire: ["subscribe a"] },
  run: async (input): Promise<WireRun> => {
    const wire: string[] = [];
    const granted = input === "reference" ? [0, 0] : [0, 0x80];
    const outcome = await withScriptedPeer(
      (connection, packet) => {
        if (packet.cmd === "connect") connection.send(connack(packet.protocolVersion));
        if (packet.cmd !== "subscribe") return;
        if (connection.index === 0) {
          connection.send({ cmd: "suback", messageId: packet.messageId, granted });
          connection.close();
          return;
        }
        // Only the packets of the reconnect are the record.
        wire.push(...topicsOf(packet));
        connection.send({ cmd: "suback", messageId: packet.messageId, granted: packet.subscriptions.map(() => 0) });
      },
      (url) =>
        outcomeOf(async () => {
          const client = await connected(url, { reconnectPeriod: 100 });
          const reconnect = next(client, "connect");
          const error = await settled((callback) => client.subscribe(["a", "b"], { qos: 0 }, callback));
          await reconnect;
          await delay(settleMs);
          client.end(true);
          return resultOf(error, "subscribed");
        }, limitMs),
    );
    return { outcome, wire };
  },
};

/**
 * The target of F0120: `subscribe()` while the client is offline. When the next connection attempt fails, the
 * callback gets "Connection closed". The client of the trigger still subscribes on the connection after it.
 */
export const mqttOfflineSubscribeTarget: WireTarget = {
  id: "mqtt/offline-subscribe",
  ...MQTT,
  call: "subscribe",
  reply: "failed reconnect attempt",
  reference: "subscribe() while offline, and the next connection attempt succeeds",
  trigger: "subscribe() while offline, the next connection attempt fails, and the attempt after it succeeds",
  rule: (input) => (input === "reference" ? { kind: "value", wire: ["subscribe a"] } : { kind: "error", wire: [] }),
  run: async (input): Promise<WireRun> => {
    const wire = new Set<string>();
    const outcome = await withScriptedPeer(
      (connection, packet) => {
        if (packet.cmd === "connect") {
          // The trigger refuses the second connection: the peer closes it with no CONNACK.
          if (connection.index === 1 && input === "trigger") return connection.close();
          connection.send(connack(packet.protocolVersion));
          if (connection.index === 0) setTimeout(() => connection.close(), 50).unref();
        }
        if (packet.cmd === "subscribe") {
          for (const one of topicsOf(packet)) wire.add(one);
          connection.send({ cmd: "suback", messageId: packet.messageId, granted: packet.subscriptions.map(() => 0) });
        }
      },
      (url) =>
        outcomeOf(async () => {
          const client = await connected(url, { reconnectPeriod: 100 });
          await next(client, "close");
          const error = await settled((callback) => client.subscribe("a", { qos: 0 }, callback));
          // After a failed attempt, the trigger waits for the connection that succeeds.
          if (input === "trigger") await next(client, "connect");
          await delay(settleMs);
          client.end(true);
          return resultOf(error, "subscribed");
        }, limitMs),
    );
    return { outcome, wire: [...wire] };
  },
};

/**
 * The target of F0121: `unsubscribe()` with MQTT 5.0. An UNSUBACK reason code of 0x80 or more is a failure, as for a
 * SUBACK. The client of the trigger reports success.
 */
export const mqttUnsubackFailureTarget: WireTarget = {
  id: "mqtt/unsuback-failure",
  ...MQTT,
  call: "unsubscribe",
  reply: "failure code >= 0x80",
  reference: "UNSUBACK with the reason code 0x00",
  trigger: "UNSUBACK with the reason code 0x87 (not authorized)",
  rule: (input) => ({ kind: input === "reference" ? "value" : "error", wire: ["unsubscribe a"] }),
  run: async (input): Promise<WireRun> => {
    const wire: string[] = [];
    const outcome = await withScriptedPeer(
      (connection, packet) => {
        if (packet.cmd === "connect") connection.send(connack(packet.protocolVersion));
        if (packet.cmd === "subscribe") connection.send({ cmd: "suback", messageId: packet.messageId, granted: [0] });
        if (packet.cmd === "unsubscribe") {
          wire.push(...topicsOf(packet));
          connection.send({ cmd: "unsuback", messageId: packet.messageId, granted: [input === "reference" ? 0x00 : 0x87] });
        }
      },
      (url) =>
        outcomeOf(async () => {
          const client = await connected(url, { protocolVersion: 5, reconnectPeriod: 0 });
          const subscribeError = await settled((callback) => client.subscribe("a", { qos: 0 }, callback));
          if (subscribeError !== undefined) throw new Error(`The rig: the SUBSCRIBE failed (${subscribeError.message}).`);
          const error = await settled((callback) => client.unsubscribe("a", callback));
          client.end(true);
          return resultOf(error, "unsubscribed");
        }, limitMs),
    );
    return { outcome, wire };
  },
};

/** The wire targets of `mqtt`. */
export const mqttWireTargets: readonly WireTarget[] = [mqttSubackPartialTarget, mqttOfflineSubscribeTarget, mqttUnsubackFailureTarget];
