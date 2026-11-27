/**
 * The wire target of `socket.io-client`. A scripted peer of `ws` speaks Engine.IO 4 on the WebSocket transport. It
 * opens the session, accepts the main namespace and acknowledges each event.
 */
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";
import { WebSocketServer } from "ws";
import { outcomeOf } from "../outcome.ts";
import type { WireRun, WireTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const SOCKET_IO = { package: "socket.io-client", version: "4.8.4" } as const;

/** The OPEN packet of Engine.IO: the id of the session, no upgrade and long ping times. */
const OPEN = `0${JSON.stringify({ sid: "rig", upgrades: [], pingInterval: 25_000, pingTimeout: 20_000, maxPayload: 1_000_000 })}`;

/** An EVENT packet of Socket.IO with an ack id: the type 2, the id and the arguments. */
const EVENT = /^2(\d+)(\[.*)$/s;

/**
 * This function starts the peer, gives the URL of the peer to `use`, and gives the run. The peer acknowledges each event
 * with the one argument `ok`, as a server callback `callback("ok")` does.
 */
async function withPeer(use: (url: string, wire: string[]) => Promise<WireRun>): Promise<WireRun> {
  const wire: string[] = [];
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  server.on("connection", (socket) => {
    socket.send(OPEN);
    socket.on("message", (data) => {
      const text = String(data);
      // The Engine.IO type 4 is a message. Its first character after the type is the Socket.IO type.
      if (text === "2") return socket.send("3");
      if (!text.startsWith("4")) return;
      const packet = text.slice(1);
      if (packet.startsWith("0")) return socket.send(`40${JSON.stringify({ sid: "rig-main" })}`);
      const event = EVENT.exec(packet);
      if (event === null) return;
      const [, id, args] = event;
      wire.push(`emit ${String((JSON.parse(args ?? "[]") as unknown[])[0])}`);
      socket.send(`43${id ?? ""}${JSON.stringify(["ok"])}`);
    });
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  try {
    return await use(`ws://127.0.0.1:${String((server.address() as AddressInfo).port)}`, wire);
  } finally {
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * The target of F0064: `emit()` with an ack callback on a client with `retries`. The peer gives a positive ack at once.
 * With `ackTimeout`, the callback gets the value. Without it, the client takes the value as an error and sends the event
 * again until the tries end.
 */
export const socketIoRetriesTarget: WireTarget = {
  id: "socket.io-client/retries-ack",
  ...SOCKET_IO,
  call: "emit with retries",
  reply: "positive ack",
  reference: "retries 2 and ackTimeout 1000, and the peer acknowledges with ok",
  trigger: "retries 2 and no ackTimeout, and the peer acknowledges with ok",
  rule: () => ({ kind: "value", wire: ["emit ev"] }),
  run: (input) =>
    withPeer(async (url, wire) => {
      const socket = io(url, {
        transports: ["websocket"],
        reconnection: false,
        retries: 2,
        ...(input === "reference" ? { ackTimeout: 1_000 } : {}),
      });
      try {
        const outcome = await outcomeOf(
          () =>
            new Promise<readonly string[]>((resolve, reject) => {
              socket.emit("ev", "x", (error: unknown, value: unknown) => {
                if (error !== null && error !== undefined) reject(error);
                else resolve([String(value)]);
              });
            }),
          5_000,
        );
        await delay(300);
        return { outcome, wire: [...wire] };
      } finally {
        socket.close();
      }
    }),
};
