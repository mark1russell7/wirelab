/**
 * The helpers of the tests: a scripted Engine.IO server for HTTP long-polling, a client on that server, and the records
 * of the session. The server is a fixed list of replies, thus each test controls each byte that the client gets.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startScriptedServer, type ScriptedReply, type ScriptedRequest, type ScriptedServer } from "@mark1russell7/rigor-testkit/http";
import { Fetch, NodeXHR, Socket, type SocketOptions, type TransportCtor } from "engine.io-client";
import { decodePayload, encodePayload, openPacket, type Handshake, type Packet } from "./codec.ts";

/**
 * This value is true when the environment variable `SUITE_ENGINEIO` is `1`. The checks of the client run only then.
 * The suite is not a gate, thus the shared CI examines only the data and the codec.
 */
export const suiteEnabled: boolean = process.env["SUITE_ENGINEIO"] === "1";

/** A transport of HTTP long-polling that the suite examines. */
export interface PollingTransport {
  readonly name: string;
  readonly implementation: TransportCtor;
}

/** The transports of HTTP long-polling for Node.js. Each check examines each transport. */
export const transports: readonly PollingTransport[] = [
  { name: "NodeXHR", implementation: NodeXHR },
  { name: "Fetch", implementation: Fetch },
];

/** The path of the Engine.IO server. It is the default path of the client. */
export const enginePath: string = "/engine.io/";

/** The handshake of a session when the script does not change it. */
export const defaultHandshake: Handshake = { sid: "wirelab-sid-1", upgrades: [], pingInterval: 25_000, pingTimeout: 20_000, maxPayload: 1_000_000 };

/** This function gives the reply that holds a list of packets. `extra` adds a delay or other parts of the reply. */
export function payload(packets: readonly Packet[], extra: ScriptedReply = {}): ScriptedReply {
  return { ...extra, fields: { "content-type": "text/plain; charset=UTF-8", ...extra.fields }, body: encodePayload(packets) };
}

/** The reply of the server to a POST request that it accepts. */
export const accepted: ScriptedReply = { fields: { "content-type": "text/html" }, body: "ok" };

/** This function gives a message packet with the given data. */
export function message(data: string | Uint8Array): Packet {
  return { type: "message", data };
}

/** The replies of the scripted server for one session. */
export interface SessionScript {
  /** The fields of the open packet that change the default handshake. */
  readonly handshake?: Partial<Handshake>;
  /** The packet of the open reply. The default is the open packet of the handshake. A check of a malformed open packet changes it. */
  readonly open?: Packet;
  /** The parts of the open reply other than its body, for example a delay. */
  readonly openReply?: ScriptedReply;
  /** The replies to the GET requests after the handshake, in order. */
  readonly polls?: readonly ScriptedReply[];
  /** The reply to each GET request after the polls. The default is a `noop` packet after 30 s. */
  readonly hold?: ScriptedReply;
  /** The replies to the POST requests, in order. The server gives the last reply again. The default is `ok`. */
  readonly posts?: readonly ScriptedReply[];
}

/** The kind of an event of the client. */
export type EventKind = "open" | "message" | "close" | "error";

/** One event of the client. */
export interface SessionEvent {
  /** The time of the event in ms after the start of the client. */
  readonly at: number;
  readonly kind: EventKind;
  /** The reason of a close, the text of an error, or the text of a message. */
  readonly detail: string;
}

/** One session: the scripted server, the client and the records. */
export interface Session {
  readonly server: ScriptedServer;
  readonly socket: Socket;
  readonly handshake: Handshake;
  /** The events of the client, in order. */
  readonly events: readonly SessionEvent[];
  /** The data of each message event. Binary data is a plain `Uint8Array`. */
  readonly messages: readonly (string | Uint8Array)[];
  /** The time in ms after the start of the client. */
  elapsed(): number;
  /** This method waits for the open event. It gives the time of the event, or throws after the limit. */
  opened(limitMs?: number): Promise<number>;
  /** This method gives the first close event, or `undefined`. */
  closed(): SessionEvent | undefined;
  /** This method gives the records of the GET requests. */
  gets(): readonly ScriptedRequest[];
  /** This method gives the records of the POST requests. */
  posts(): readonly ScriptedRequest[];
  /** This method gives the packets of all POST bodies, in order. A part that is not a packet is `undefined`. */
  posted(): readonly (Packet | undefined)[];
  /** This method closes the client and then the server. */
  end(): Promise<void>;
}

/** This function gives data of a message as a string or as a plain `Uint8Array`. A Node.js `Buffer` becomes a copy. */
export function normalData(data: unknown): string | Uint8Array {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return Uint8Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return String(data);
}

/** A scripted Engine.IO server and the handshake that its open reply gives. */
export interface EngineServer {
  readonly server: ScriptedServer;
  readonly handshake: Handshake;
}

/**
 * This function starts a scripted Engine.IO server for HTTP long-polling at the given path. The first GET request gets
 * the open packet. The suites of protocols on Engine.IO, for example Socket.IO, use it with their own client.
 */
export async function startEngineServer(script: SessionScript = {}, path: string = enginePath): Promise<EngineServer> {
  const handshake: Handshake = { ...defaultHandshake, ...script.handshake };
  const hold = script.hold ?? payload([{ type: "noop", data: "" }], { delayMs: 30_000 });
  const server = await startScriptedServer({
    routes: [
      { method: "GET", path, replies: [payload([script.open ?? openPacket(handshake)], script.openReply), ...(script.polls ?? []), hold] },
      { method: "POST", path, replies: script.posts ?? [accepted] },
    ],
  });
  return { server, handshake };
}

/** This function starts a scripted server and a client of one transport on it. */
export async function startSession(transport: PollingTransport, script: SessionScript = {}, client: SocketOptions = {}): Promise<Session> {
  const { server, handshake } = await startEngineServer(script);
  const start = performance.now();
  const elapsed = (): number => performance.now() - start;
  const events: SessionEvent[] = [];
  const messages: (string | Uint8Array)[] = [];
  const record = (kind: EventKind, detail: string): void => {
    events.push({ at: elapsed(), kind, detail });
  };
  const socket = new Socket(server.url, { ...client, transports: [transport.implementation], upgrade: false });
  socket.on("open", () => record("open", ""));
  socket.on("message", (data: unknown) => {
    const normal = normalData(data);
    messages.push(normal);
    record("message", typeof normal === "string" ? normal : `${normal.byteLength} bytes`);
  });
  socket.on("close", (reason: string) => record("close", reason));
  socket.on("error", (error: string | Error) => record("error", typeof error === "string" ? error : error.message));
  const requestsOf = (method: string): readonly ScriptedRequest[] => server.requests.filter((request) => request.method === method);
  return {
    server,
    socket,
    handshake,
    events,
    messages,
    elapsed,
    opened: async (limitMs = 5_000) => {
      const seen = await until(() => events.some((event) => event.kind === "open"), limitMs);
      const event = events.find((item) => item.kind === "open");
      if (!seen || event === undefined) throw new Error(`The client did not open in ${limitMs} ms. Events: ${JSON.stringify(events)}`);
      return event.at;
    },
    closed: () => events.find((event) => event.kind === "close"),
    gets: () => requestsOf("GET"),
    posts: () => requestsOf("POST"),
    posted: () => requestsOf("POST").flatMap((request) => decodePayload(request.body)),
    end: async () => {
      socket.close();
      await server.close();
    },
  };
}

/** This function waits until `check` gives true, or until the limit. It gives true when `check` gave true. */
export async function until(check: () => boolean, limitMs: number): Promise<boolean> {
  const end = performance.now() + limitMs;
  while (!check()) {
    if (performance.now() >= end) return false;
    await pause(10);
  }
  return true;
}

/** This function gives the largest value of `measure` in samples 10 ms apart, for the given time. */
export async function largest(measure: () => number, durationMs: number): Promise<number> {
  const end = performance.now() + durationMs;
  let most = measure();
  while (performance.now() < end) {
    await pause(10);
    most = Math.max(most, measure());
  }
  return most;
}

/** This function waits for the given time. */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** This function gives the number of requests that the server has not answered whole. */
export function active(requests: readonly ScriptedRequest[]): number {
  return requests.filter((request) => !request.wire.whole).length;
}

/** This function gives the query fields of the target of a request. */
export function queryOf(target: string): URLSearchParams {
  return new URL(target, "http://localhost").searchParams;
}

/** This function gives the number of UTF-8 bytes of a text. */
export function bytesOf(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** One uncaught error of the process of a client. */
export interface UncaughtError {
  /** The time of the error in ms after the start of the client. */
  readonly at: number;
  /** The event of the process: `uncaughtException` or `unhandledRejection`. */
  readonly origin: string;
  readonly name: string;
  readonly message: string;
}

/** The report of a client in a separate process. */
export interface ChildReport {
  /** The events of the client, in order. */
  readonly events: readonly SessionEvent[];
  /** The uncaught errors of the process, in order. */
  readonly uncaught: readonly UncaughtError[];
  /** The value of `readyState` of the client at the end. */
  readonly readyState: string;
  /** The exit code of the process. */
  readonly code: number | null;
  /** The text of the error output of the process. */
  readonly stderr: string;
}

/** The times of a client in a separate process. */
export interface ChildTimes {
  /** The time in ms from the start of the client to the report. The default is 5000 ms. */
  readonly limitMs?: number;
  /** The time in ms from the first error, close or uncaught error to the report. The default is 1000 ms. */
  readonly settleMs?: number;
}

/**
 * This function starts a client of one transport in a separate process, on the server at `url`. It gives the report
 * of the process. An uncaught error of the client stops only that process, not the worker of the test.
 */
export function runChild(url: string, transport: PollingTransport, times: ChildTimes = {}): Promise<ChildReport> {
  const script = fileURLToPath(new URL("./child.ts", import.meta.url));
  const args = [script, url, transport.name, String(times.limitMs ?? 5_000), String(times.settleMs ?? 1_000)];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      const line = out.trim().split("\n").at(-1) ?? "";
      try {
        const parsed = JSON.parse(line) as Pick<ChildReport, "events" | "uncaught" | "readyState">;
        resolve({ events: parsed.events, uncaught: parsed.uncaught, readyState: parsed.readyState, code, stderr });
      } catch {
        reject(new Error(`The client process gave no report. The exit code is ${String(code)}. The error output is: ${stderr}`));
      }
    });
  });
}
