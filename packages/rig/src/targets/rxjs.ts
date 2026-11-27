/**
 * The targets of `rxjs`: the codec of the app and `multiplex` in `webSocket`. A peer of `ws` sends the frames of a
 * script to the client and records each frame of the client.
 */
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { take } from "rxjs";
import { webSocket } from "rxjs/webSocket";
import { WebSocketServer, type WebSocket } from "ws";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { CauseTarget, WireRun, WireTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const RXJS = { package: "rxjs", version: "7.8.2" } as const;

/** The script of a peer: the function at each new connection, and the function at each frame of the client. */
interface PeerScript {
  readonly open?: (socket: WebSocket) => void;
  readonly frame?: (socket: WebSocket, text: string) => void;
}

/** This function starts the peer with `script`, gives the URL of the peer to `use`, and gives the result of `use`. */
async function withPeer<T>(script: PeerScript, use: (url: string) => Promise<T>): Promise<T> {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  server.on("connection", (socket) => {
    script.open?.(socket);
    socket.on("message", (data) => script.frame?.(socket, String(data)));
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  try {
    return await use(`ws://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
  } finally {
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
}

/** This function throws `Error("boom")`, as a codec or a message function of the app. */
const boom = (): never => {
  throw new Error("boom");
};

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
  run: (input): Promise<Outcome> =>
    withPeer({ open: (socket) => socket.send(JSON.stringify("hello")) }, (url) =>
      outcomeOf(
        () =>
          new Promise<readonly string[]>((resolve, reject) => {
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

/**
 * The target of F0004: `multiplex` on an open subject. When `subMsg` throws, the caller gets the error, so the peer
 * must get no frame of the operation. The client of the trigger still subscribes and sends `unsubMsg`.
 */
export const rxjsMultiplexSubMsgTarget: WireTarget = {
  id: "rxjs/multiplex-submsg",
  ...RXJS,
  call: "multiplex subMsg",
  reply: "subMsg of the app throws",
  reference: "subMsg gives sub, and the caller takes the first message",
  trigger: "subMsg throws Error(boom)",
  rule: (input) => (input === "reference" ? { kind: "value", wire: ["sub", "unsub"] } : { kind: "error", wire: [] }),
  run: (input): Promise<WireRun> => {
    const wire: string[] = [];
    return withPeer(
      {
        frame: (socket, text) => {
          const message = JSON.parse(text) as unknown;
          wire.push(String(message));
          if (message === "sub") socket.send(JSON.stringify("data"));
        },
      },
      async (url) => {
        let opened = (): void => undefined;
        const open = new Promise<void>((resolve) => (opened = resolve));
        const subject = webSocket<string>({ url, openObserver: { next: () => opened() } });
        // A main subscription keeps the socket open, as in an app that multiplexes one socket.
        const main = subject.subscribe({ error: () => undefined });
        await open;
        const outcome = await outcomeOf(
          () =>
            new Promise<readonly string[]>((resolve, reject) => {
              subject
                .multiplex(input === "reference" ? () => "sub" : boom, () => "unsub", () => true)
                .pipe(take(1))
                .subscribe({ next: (value) => resolve([value]), error: reject });
            }),
          5_000,
        );
        await delay(300);
        main.unsubscribe();
        return { outcome, wire };
      },
    );
  },
};
