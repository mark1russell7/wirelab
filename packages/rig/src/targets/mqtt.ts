/**
 * The cause targets of `mqtt`. A scripted peer on TCP answers each CONNECT with a CONNACK that grants the connection.
 * The peer sends no other packet.
 */
import { createServer, type AddressInfo, type Socket } from "node:net";
import { connect, type IClientOptions, type MqttClient } from "mqtt";
import mqttPacket from "mqtt-packet";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { CauseTarget } from "./target.ts";

/** The package and the version of the targets. The version is the version that the workspace installs. */
export const MQTT = { package: "mqtt", version: "5.16.1" } as const;

/** The time limit in ms of one run. */
const limitMs = 5_000;

/** This function starts the scripted peer, gives the URL of the peer to `use`, and gives the outcome of `use`. */
async function withPeer(use: (url: string) => Promise<Outcome>): Promise<Outcome> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const parser = mqttPacket.parser();
    parser.on("packet", (packet) => {
      if (packet.cmd === "connect") socket.write(mqttPacket.generate({ cmd: "connack", returnCode: 0, sessionPresent: false }));
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

/** This function connects a client with `options` and waits for the CONNACK. */
async function connected(url: string, options: IClientOptions): Promise<MqttClient> {
  const client = connect(url, options);
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("error", reject);
  });
  return client;
}

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
