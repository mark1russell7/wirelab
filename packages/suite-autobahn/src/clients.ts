import { createRequire } from "node:module";
import faye from "faye-websocket";
import websocket from "websocket";
import Ws from "ws";

/** The end of one echo session. */
export interface EchoResult {
  /** This is `true` when the connection closed. It is `false` when the time limit stopped the session. */
  readonly closed: boolean;
  /** The close code that the client reported, when it reported one. */
  readonly code?: number;
  /** The text of the first error that the client reported, when it reported one. */
  readonly error?: string;
}

/** One WebSocket client under test. */
export interface EchoClient {
  /** The name of the client without its version, for example `ws`. */
  readonly name: string;
  /** The name of the client in the reports of the fuzzing server: the name and the version. */
  readonly agent: string;
  /**
   * This function connects to `url` and sends back each message with its type. It resolves when the connection
   * closes, or when `timeoutMs` ends. Then it stops the connection.
   */
  echo(url: string, timeoutMs: number): Promise<EchoResult>;
}

const require = createRequire(import.meta.url);

function versionOf(name: string): string {
  return (require(`${name}/package.json`) as { version: string }).version;
}

/** The outcome that a session reports when it ends. */
interface Ending {
  readonly code?: number;
  readonly error?: string;
}

/**
 * This function does one echo session. The function `open` starts the connection, calls `end` when it closes, and
 * gives a function that stops the connection.
 */
function session(timeoutMs: number, open: (end: (ending: Ending) => void) => () => void): Promise<EchoResult> {
  return new Promise((resolve) => {
    let done = false;
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      stop?.();
      resolve({ closed: false, error: `The connection did not close in ${timeoutMs} ms.` });
    }, timeoutMs);
    stop = open((ending) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ closed: true, ...ending });
    });
  });
}

function ending(code: number | undefined, error: string | undefined): Ending {
  return { ...(code === undefined ? {} : { code }), ...(error === undefined ? {} : { error }) };
}

/** The client of the package `ws`, with its default options. */
export const wsClient: EchoClient = {
  name: "ws",
  agent: `ws-${versionOf("ws")}`,
  echo: (url, timeoutMs) =>
    session(timeoutMs, (end) => {
      const socket = new Ws(url);
      let error: string | undefined;
      socket.on("message", (data, isBinary) => socket.send(data, { binary: isBinary }));
      socket.on("error", (failure) => {
        error ??= failure.message;
      });
      socket.on("close", (code) => end(ending(code, error)));
      return () => socket.terminate();
    }),
};

/** The client of the package `websocket`, with its default options. */
export const websocketClient: EchoClient = {
  name: "websocket",
  agent: `websocket-${versionOf("websocket")}`,
  echo: (url, timeoutMs) =>
    session(timeoutMs, (end) => {
      const client = new websocket.client();
      let connection: websocket.connection | undefined;
      let error: string | undefined;
      client.on("connectFailed", (failure) => end(ending(undefined, failure.message)));
      client.on("connect", (opened) => {
        connection = opened;
        opened.on("message", (message) => {
          if (message.type === "utf8") opened.sendUTF(message.utf8Data);
          else opened.sendBytes(message.binaryData);
        });
        opened.on("error", (failure) => {
          error ??= failure.message;
        });
        opened.on("close", (code) => end(ending(code, error)));
      });
      client.connect(url);
      return () => {
        if (connection === undefined) client.abort();
        else connection.drop();
      };
    }),
};

/** The client of the package `faye-websocket`, with its default options. */
export const fayeClient: EchoClient = {
  name: "faye-websocket",
  agent: `faye-websocket-${versionOf("faye-websocket")}`,
  echo: (url, timeoutMs) =>
    session(timeoutMs, (end) => {
      const socket = new faye.Client(url);
      let error: string | undefined;
      socket.on("message", (event) => socket.send(event.data));
      socket.on("error", (event) => {
        error ??= event.message;
      });
      socket.on("close", (event) => end(ending(event.code, error)));
      return () => socket.close();
    }),
};

/** The `WebSocket` of Node.js, from its copy of `undici`. */
export const nodeClient: EchoClient = {
  name: "node",
  agent: `node-${process.version}-undici-${process.versions["undici"] ?? "unknown"}`,
  echo: (url, timeoutMs) =>
    session(timeoutMs, (end) => {
      const socket = new globalThis.WebSocket(url);
      socket.binaryType = "arraybuffer";
      let error: string | undefined;
      // The type of the message is `string` for text, and `ArrayBuffer` for binary, by the `binaryType` above.
      socket.addEventListener("message", (event) => socket.send(event.data as string | ArrayBuffer));
      socket.addEventListener("error", (event) => {
        error ??= "message" in event && typeof event.message === "string" ? event.message : event.type;
      });
      socket.addEventListener("close", (event) => end(ending(event.code, error)));
      return () => socket.close();
    }),
};

/** The clients of the suite, in the order of the runs. */
export const clients: readonly EchoClient[] = [wsClient, websocketClient, fayeClient, nodeClient];
