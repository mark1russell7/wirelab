/**
 * This script is the client of one check in a separate process. An uncaught error of the client stops the worker of a
 * test, thus the checks of such faults start the client here. Node.js starts this file with no build step.
 *
 * The arguments are the URL of the scripted server, the name of the transport, the limit in ms and the settle time in
 * ms. The script records each event of the client and each uncaught error of the process. It stops at the limit, or at
 * the settle time after the first error, close or uncaught error. Then it writes one line of JSON to the output.
 */
import { writeSync } from "node:fs";
import { Fetch, NodeXHR, Socket, type TransportCtor } from "engine.io-client";

const [url, name, limitText, settleText] = process.argv.slice(2);
const implementations: Readonly<Record<string, TransportCtor>> = { NodeXHR, Fetch };
const implementation = name === undefined ? undefined : implementations[name];
if (url === undefined || implementation === undefined) {
  writeSync(2, `The arguments are <url> <NodeXHR|Fetch> <limit ms> <settle ms>, not ${JSON.stringify(process.argv.slice(2))}.\n`);
  process.exit(2);
}
const limitMs = Number(limitText ?? "5000");
const settleMs = Number(settleText ?? "1000");

const start = performance.now();
const at = (): number => Math.round(performance.now() - start);
const events: { at: number; kind: string; detail: string }[] = [];
const uncaught: { at: number; origin: string; name: string; message: string }[] = [];

let socket: Socket | undefined;
let settling = false;

/** This function writes the report and stops the process. The write is synchronous, thus the line is whole. */
function report(): void {
  writeSync(1, `${JSON.stringify({ events, uncaught, readyState: socket?.readyState ?? "none" })}\n`);
  process.exit(0);
}

/** This function starts the settle time once, after the first error, close or uncaught error. */
function settle(): void {
  if (settling) return;
  settling = true;
  setTimeout(report, settleMs);
}

function recordUncaught(origin: string, error: unknown): void {
  const known = error instanceof Error ? error : new Error(String(error));
  uncaught.push({ at: at(), origin, name: known.name, message: known.message });
  settle();
}

process.on("uncaughtException", (error) => recordUncaught("uncaughtException", error));
process.on("unhandledRejection", (reason) => recordUncaught("unhandledRejection", reason));
setTimeout(report, limitMs);

socket = new Socket(url, { transports: [implementation], upgrade: false });
socket.on("open", () => events.push({ at: at(), kind: "open", detail: "" }));
socket.on("message", (data: unknown) => events.push({ at: at(), kind: "message", detail: typeof data === "string" ? data : "binary" }));
socket.on("error", (error: string | Error) => {
  events.push({ at: at(), kind: "error", detail: typeof error === "string" ? error : error.message });
  settle();
});
socket.on("close", (reason: string) => {
  events.push({ at: at(), kind: "close", detail: reason });
  settle();
});
