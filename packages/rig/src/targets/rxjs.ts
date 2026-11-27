/**
 * The cause target of `rxjs`: the codec of the app in `webSocket`. A peer of `ws` sends one JSON message to each new
 * connection.
 */
import type { AddressInfo } from "node:net";
import { webSocket } from "rxjs/webSocket";
import { WebSocketServer } from "ws";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { CauseTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const RXJS = { package: "rxjs", version: "7.8.2" } as const;

/** This function starts the peer, gives the URL of the peer to `use`, and gives the outcome of `use`. */
async function withPeer(use: (url: string) => Promise<Outcome>): Promise<Outcome> {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  server.on("connection", (socket) => socket.send(JSON.stringify("hello")));
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  try {
    return await use(`ws://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
  } finally {
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * The target of F0002: a codec of the app throws `Error("boom")`. A throw of the deserializer gives the caller that
 * error. A throw of the serializer gives a `TypeError` with a fixed text, and the cause is lost.
 */
export const rxjsWebSocketCodecTarget: CauseTarget = {
  id: "rxjs/websocket-codec",
  ...RXJS,
  state: "open",
  step: "serializer of the app throws",
  reference: "the deserializer throws Error(boom) on the first message",
  trigger: "the serializer throws Error(boom) on next()",
  run: (input) =>
    withPeer((url) =>
      outcomeOf(
        () =>
          new Promise<readonly string[]>((resolve, reject) => {
            const boom = (): never => {
              throw new Error("boom");
            };
            const subject = webSocket<string>({ url, ...(input === "reference" ? { deserializer: boom } : { serializer: boom }) });
            const subscription = subject.subscribe({ error: reject, complete: () => resolve(["complete"]) });
            subject.next("x");
            // A subject that gives no error ends the run with its values.
            setTimeout(() => {
              subscription.unsubscribe();
              resolve(["no error"]);
            }, 1_000).unref();
          }),
        5_000,
      ),
    ),
};
