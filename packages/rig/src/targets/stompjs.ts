/**
 * The key targets of `@stomp/stompjs`: the ids of the frames of the server. A fake STOMP 1.2 server on a WebSocket
 * sends one frame with the key after `CONNECTED`. The client has no subscription and no receipt with that id, so
 * the frame goes to `onUnhandledMessage` or `onUnhandledReceipt`. The client catches and logs each throw of a frame handler.
 */
import { Client } from "@stomp/stompjs";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { KeyTarget } from "./target.ts";

/** The package and the version of the targets. The version is the version that the workspace installs. */
export const STOMPJS = { package: "@stomp/stompjs", version: "7.5.0" } as const;

/** This function starts a session in which the server sends `frame` after `CONNECTED`, and gives the unhandled frames. */
function session(frame: string): Promise<Outcome> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  server.on("connection", (socket) => {
    socket.on("message", (raw: Buffer) => {
      if (!raw.toString().startsWith("CONNECT")) return;
      socket.send("CONNECTED\nversion:1.2\n\n\0");
      socket.send(frame);
    });
  });
  return outcomeOf(async () => {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `ws://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    const unhandled: string[] = [];
    const client = new Client({
      webSocketFactory: () => new WebSocket(url, ["v12.stomp"]),
      reconnectDelay: 0,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      onUnhandledMessage: (message) => unhandled.push(`message ${message.body}`),
      onUnhandledReceipt: () => unhandled.push("receipt"),
    });
    try {
      client.activate();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return [`unhandled ${JSON.stringify(unhandled)}`];
    } finally {
      // The fake server does not answer DISCONNECT, so it closes each socket, and then the client stops at once.
      for (const socket of server.clients) socket.terminate();
      await client.deactivate({ force: true });
      server.close();
    }
  }, 5_000);
}

/** The key target of the `subscription` header of a `MESSAGE` frame. */
export const stompMessageTarget: KeyTarget = {
  id: "stompjs/message",
  ...STOMPJS,
  table: "subscription or channel id",
  phase: "stream",
  run: (key) => session(`MESSAGE\nsubscription:${key}\nmessage-id:1\ndestination:/q\n\nm1\0`),
};

/** The key target of the `receipt-id` header of a `RECEIPT` frame. */
export const stompReceiptTarget: KeyTarget = {
  id: "stompjs/receipt",
  ...STOMPJS,
  table: "receipt or request id",
  phase: "stream",
  run: (key) => session(`RECEIPT\nreceipt-id:${key}\n\n\0`),
};

/** Each key target of `@stomp/stompjs`. */
export const stompKeyTargets: readonly KeyTarget[] = [stompMessageTarget, stompReceiptTarget];
