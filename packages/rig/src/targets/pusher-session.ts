/**
 * The worker of the session target of `pusher-js`. A fake Pusher server (protocol 7) sends the frame of the case as the
 * first frame of the first connection. Each later connection gets a valid handshake. The worker gives the state of the
 * client and the number of connections at the end of the window.
 *
 * The client operates in a worker thread, because a fault of the handshake can throw out of a socket event. The worker
 * keeps that error in its report, and the error does not stop the test process.
 */
import type { AddressInfo } from "node:net";
import { parentPort, workerData } from "node:worker_threads";
import pusherModule from "pusher-js";
import { WebSocketServer } from "ws";

/** The input of one session. */
export interface SessionInput {
  /** The text of the first frame of the first connection. */
  readonly frame: string;
  /** The time in ms that the worker watches the client. */
  readonly windowMs: number;
}

/** The report of one session. */
export interface SessionReport {
  /** The state of the connection of the client at the end. */
  readonly state: string;
  /** The number of connections that the server got. */
  readonly connections: number;
  /** The message of the first error that a socket event threw, or undefined. */
  readonly uncaught: string | undefined;
}

/** A valid handshake for the connection `n`. */
const handshake = (n: number): string =>
  JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify({ socket_id: `${String(n)}.1`, activity_timeout: 120 }) });

// The bundle for Node sets `module.exports` to the class, so the default import is the class. The types of the package
// give a module with the field `default`, so this cast corrects them.
const Pusher = pusherModule as unknown as typeof pusherModule.default;

const input = workerData as SessionInput;
let uncaught: string | undefined;
process.on("uncaughtException", (error) => {
  uncaught ??= error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

let connections = 0;
const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
server.on("connection", (socket) => {
  connections += 1;
  socket.send(connections === 1 ? input.frame : handshake(connections));
});
server.on("listening", () => {
  const client = new Pusher("app-key", {
    cluster: "mt1",
    wsHost: "127.0.0.1",
    wsPort: (server.address() as AddressInfo).port,
    forceTLS: false,
    enabledTransports: ["ws"],
    enableStats: false,
    unavailableTimeout: 2_000,
  });
  const end = (): void => {
    clearInterval(watch);
    clearTimeout(timer);
    const report: SessionReport = { state: client.connection.state, connections, uncaught };
    client.disconnect();
    server.close();
    parentPort?.postMessage(report);
  };
  // A connection after the first one shows the action of the client. The worker stops when that connection is ready.
  const watch = setInterval(() => {
    if (connections > 1 && client.connection.state === "connected") end();
  }, 25);
  const timer = setTimeout(end, input.windowMs);
});
