/**
 * The helpers of the tests: a scripted SockJS server for the four transports, a client and the records of the session.
 * One script of frames goes to each transport. Thus each test controls each byte that the
 * client gets, and the same check examines each transport.
 */
import {
  messagesOf,
  startScriptedServer,
  type ScriptedReply,
  type ScriptedRequest,
  type ScriptedRoute,
  type ScriptedServer,
  type WebSocketConnection,
} from "@mark1russell7/rigor-testkit/http";
import SockJS from "sockjs-client";
import { eventSourceEvent, eventSourcePrelude, heartbeatFrame, openFrame, parseSent, streamingPrelude } from "./codec.ts";

/**
 * This value is true when the environment variable `SUITE_SOCKJS` is `1`. The checks of the client start only then.
 * The suite is not a gate, thus the shared CI examines only the data and the codec.
 */
export const suiteEnabled: boolean = process.env["SUITE_SOCKJS"] === "1";

/** The name of a transport of `sockjs-client` that the suite examines. The names are the names of the option `transports`. */
export type TransportName = "websocket" | "xhr-streaming" | "xhr-polling" | "eventsource";

/** The transports of the suite. Each check of the frames examines each transport. */
export const transports: readonly TransportName[] = ["websocket", "xhr-streaming", "xhr-polling", "eventsource"];

/** The transports on HTTP. They receive on their own URL, and they send on `xhr_send`. */
export const httpTransports: readonly TransportName[] = ["xhr-streaming", "xhr-polling", "eventsource"];

/** The path of the base URL of the server. */
export const basePath: string = "/echo";

/** The `server_id` of the client, when the check does not examine the default of the client. */
export const serverId: string = "000";

/** The `session_id` of the client, when the check does not examine the default of the client. */
export const sessionId: string = "wirelab-session";

/** The top session URL: `/<base>/<server_id>/<session_id>`. */
export const sessionPath: string = `${basePath}/${serverId}/${sessionId}`;

/** The fields of the reply of `/info`, from the section "Info test" of the protocol document. */
export interface Info {
  readonly websocket: boolean;
  readonly origins: readonly string[];
  readonly cookie_needed: boolean;
  readonly entropy: number;
}

/** The reply of `/info` when the script does not change it. */
export const defaultInfo: Info = { websocket: true, origins: ["*:*"], cookie_needed: false, entropy: 2_903_102_217 };

/** The receiving URL of each transport on HTTP, after the top session URL, and the method of its requests. */
const receiving: Readonly<Record<Exclude<TransportName, "websocket">, { readonly method: string; readonly suffix: string }>> = {
  "xhr-polling": { method: "POST", suffix: "/xhr" },
  "xhr-streaming": { method: "POST", suffix: "/xhr_streaming" },
  eventsource: { method: "GET", suffix: "/eventsource" },
};

/** The fields of the replies of `xhr` and `xhr_streaming`, from the sections "XhrPolling" and "XhrStreaming". */
const javascriptFields: Readonly<Record<string, string>> = { "content-type": "application/javascript; charset=UTF-8" };

/** The fields of the replies of `eventsource`, from the section "EventSource". */
const eventStreamFields: Readonly<Record<string, string>> = { "content-type": "text/event-stream; charset=UTF-8" };

/** The reply of `xhr_send` that accepts the messages: the status 204 with no body. */
export const sendAccepted: ScriptedReply = { status: 204, fields: { "content-type": "text/plain; charset=UTF-8" } };

/** The time in ms that the server holds a receiving request of HTTP polling after the script. */
const holdMs = 30_000;

/** The replies of the scripted server for one session. */
export interface SessionScript {
  /** The fields of the reply of `/info` that change the default. */
  readonly info?: Partial<Info>;
  /** The parts of the reply of `/info` other than its body, for example a delay. */
  readonly infoReply?: ScriptedReply;
  /** The frames of the server, in order. The default is the open frame alone. */
  readonly frames?: readonly string[];
  /** The time in ms before the reply or the step of the first frame. The default is 0. */
  readonly openDelayMs?: number;
  /** The time in ms between two frames. The default is 0. */
  readonly gapMs?: number;
  /**
   * The frames of a second receiving request. With this list, a streaming transport ends its first receiving request
   * after `frames`. Then the client opens a new receiving request, and the server sends these frames on it. HTTP
   * polling and WebSocket get these frames after `frames`.
   */
  readonly next?: readonly string[];
  /** The replies of `xhr_send`, in order. The server gives the last reply again. The default is `sendAccepted`. */
  readonly sendReplies?: readonly ScriptedReply[];
  /** The reply to a request that no route matches. The default is the status 404 with no body. */
  readonly unmatched?: ScriptedReply;
}

/**
 * This function gives the reply of a streaming transport with a prelude and frames. With `end`, the reply ends after
 * them. Without `end`, the server holds the reply open. The scripted server of `rigor-testkit` 0.1.19 ends a reply
 * when `stopAfter` is equal to its number of parts. Thus a held reply has one more part, an empty part that the server
 * does not write. Remove the empty part when the fix of mark1russell7/rigor#282 is in a release.
 */
function streamReply(fields: Readonly<Record<string, string>>, parts: readonly string[], script: SessionScript, end: boolean): ScriptedReply {
  return {
    fields,
    framing: "chunked",
    body: end ? parts : [...parts, ""],
    delayMs: script.openDelayMs ?? 0,
    gapMs: script.gapMs ?? 0,
    ...(end ? {} : { stopAfter: parts.length }),
  };
}

/** This function gives the routes of the scripted server for a script. The routes serve each transport of the suite. */
export function routesOf(script: SessionScript): readonly ScriptedRoute[] {
  const frames = script.frames ?? [openFrame];
  const next = script.next;
  const delayOf = (index: number): number => (index === 0 ? (script.openDelayMs ?? 0) : (script.gapMs ?? 0));
  const polls = [...frames, ...(next ?? [])].map((frame, index): ScriptedReply => ({ fields: javascriptFields, body: `${frame}\n`, delayMs: delayOf(index) }));
  const streaming = (fields: Readonly<Record<string, string>>, prelude: string, line: (frame: string) => string): ScriptedReply[] => [
    streamReply(fields, [prelude, ...frames.map(line)], script, next !== undefined),
    ...(next === undefined ? [] : [streamReply(fields, [prelude, ...next.map(line)], { ...script, openDelayMs: 0 }, false)]),
  ];
  return [
    {
      method: "GET",
      path: `${basePath}/info`,
      replies: [{ ...script.infoReply, fields: { "content-type": "application/json; charset=UTF-8", ...script.infoReply?.fields }, body: JSON.stringify({ ...defaultInfo, ...script.info }) }],
    },
    { method: "POST", path: `${sessionPath}/xhr`, replies: [...polls, { fields: javascriptFields, body: `${heartbeatFrame}\n`, delayMs: holdMs }] },
    { method: "POST", path: `${sessionPath}/xhr_streaming`, replies: streaming(javascriptFields, streamingPrelude, (frame) => `${frame}\n`) },
    { method: "GET", path: `${sessionPath}/eventsource`, replies: streaming(eventStreamFields, eventSourcePrelude, eventSourceEvent) },
    { method: "POST", path: `${sessionPath}/xhr_send`, replies: script.sendReplies ?? [sendAccepted] },
  ];
}

/** This function starts a scripted SockJS server for a script, with the HTTP routes and the WebSocket route of the session. */
export function startSockServer(script: SessionScript = {}): Promise<ScriptedServer> {
  const frames = [...(script.frames ?? [openFrame]), ...(script.next ?? [])];
  const steps = frames.map((frame, index) => ({ send: frame, delayMs: index === 0 ? (script.openDelayMs ?? 0) : (script.gapMs ?? 0) }));
  return startScriptedServer({
    routes: routesOf(script),
    webSockets: [{ path: `${sessionPath}/websocket`, sessions: [{ steps }] }],
    ...(script.unmatched === undefined ? {} : { unmatched: script.unmatched }),
  });
}

/** The options of the client of a session. */
export interface ClientOptions {
  /** The transports of the client, in order of preference. */
  readonly transports: readonly TransportName[];
  /** The query of the base URL, with its `?`. The default is no query. */
  readonly query?: string;
  /** With `true`, the client chooses its own `server_id` and `session_id`. The routes of the script then do not match. */
  readonly defaultIds?: boolean;
  /** The option `timeout` of the client in ms. The default is 5000 ms, so that a slow computer does not stop a transport. */
  readonly timeout?: number;
}

/** The part of a SockJS client that the tests use. `transport` is the name of the transport in use. */
export interface SockClient {
  readonly readyState: number;
  readonly url: string;
  readonly protocol: string;
  readonly extensions: string;
  readonly transport: string | null | undefined;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: SockEvent) => void): void;
}

/** The fields of an event of the client that the tests read. */
export interface SockEvent {
  readonly type: string;
  readonly data?: unknown;
  readonly code?: number;
  readonly reason?: string;
  readonly wasClean?: boolean;
}

/** The kind of an event of the client. */
export type EventKind = "open" | "message" | "heartbeat" | "close" | "error";

/** One event of the client. */
export interface SessionEvent {
  /** The time of the event in ms after the start of the client. */
  readonly at: number;
  readonly kind: EventKind;
  /** The data of a message, the code and the reason of a close, or an empty string. */
  readonly detail: string;
  /** The value of `readyState` of the client at the event. */
  readonly readyState: number;
}

/** One close event of the client. */
export interface CloseRecord {
  readonly at: number;
  readonly code: number | undefined;
  readonly reason: string | undefined;
  readonly wasClean: boolean | undefined;
}

/** One session: the scripted server, the client and the records. */
export interface Session {
  readonly server: ScriptedServer;
  readonly socket: SockClient;
  /** The events of the client, in order. */
  readonly events: readonly SessionEvent[];
  /** The data of each message event, in order. */
  readonly messages: readonly string[];
  /** The close events of the client, in order. */
  readonly closes: readonly CloseRecord[];
  /** The time in ms after the start of the client. */
  elapsed(): number;
  /** This method gives the number of calls of the function `sessionId` of the client. */
  sessionIdCalls(): number;
  /** This method waits for the open event. It gives the time of the event, or throws after the limit. */
  opened(limitMs?: number): Promise<number>;
  /** This method gives the first close event, or `undefined`. */
  closed(): CloseRecord | undefined;
  /** This method gives the records of the requests of `/info`. */
  infos(): readonly ScriptedRequest[];
  /** This method gives the records of the receiving requests of the transports on HTTP. */
  receives(): readonly ScriptedRequest[];
  /** This method gives the records of the requests of `xhr_send`. */
  sends(): readonly ScriptedRequest[];
  /** This method gives the records of the WebSocket connections of the client, in order. */
  webSockets(): readonly WebSocketConnection[];
  /** This method gives the targets of the requests of the session: each request after `/info`, and each WebSocket connection. */
  targets(): readonly string[];
  /**
   * This method gives each body of `xhr_send` and each WebSocket message of the client, as the client sent them. A
   * body is a JSON array of strings.
   */
  bodies(): readonly string[];
  /** This method gives the messages of the client that the server got, in order. A body that is not a JSON array of strings gives `undefined`. */
  sent(): readonly (string | undefined)[];
  /** This method closes the client and then the server. */
  end(): Promise<void>;
}

/** This function gives the path of a target, with no query. */
export function pathOf(target: string): string {
  return new URL(target, "http://localhost").pathname;
}

/** This function gives true when a request goes to the receiving URL of a transport on HTTP. */
function isReceive(request: ScriptedRequest): boolean {
  const path = pathOf(request.target);
  return Object.values(receiving).some((item) => item.method === request.method && path.endsWith(item.suffix));
}

/** This function starts a scripted server and a client on it. */
export async function startSession(script: SessionScript, client: ClientOptions): Promise<Session> {
  const server = await startSockServer(script);
  return startClient(server, client);
}

/** This function starts a client on a scripted server. The session closes the server at its end. */
export function startClient(server: ScriptedServer, client: ClientOptions): Session {
  let calls = 0;
  const options: SockJS.Options = {
    transports: [...client.transports],
    timeout: client.timeout ?? 5_000,
    ...(client.defaultIds === true
      ? {}
      : {
          server: serverId,
          sessionId: (): string => {
            calls += 1;
            return sessionId;
          },
        }),
  };
  const start = performance.now();
  const elapsed = (): number => performance.now() - start;
  const events: SessionEvent[] = [];
  const messages: string[] = [];
  const closes: CloseRecord[] = [];
  const socket = new SockJS(`${server.url}${basePath}${client.query ?? ""}`, null, options) as unknown as SockClient;
  const record = (kind: EventKind, detail: string): void => {
    events.push({ at: elapsed(), kind, detail, readyState: socket.readyState });
  };
  socket.addEventListener("open", () => record("open", ""));
  socket.addEventListener("heartbeat", () => record("heartbeat", ""));
  socket.addEventListener("error", () => record("error", ""));
  socket.addEventListener("message", (event) => {
    const data = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    messages.push(data);
    record("message", data);
  });
  socket.addEventListener("close", (event) => {
    closes.push({ at: elapsed(), code: event.code, reason: event.reason, wasClean: event.wasClean });
    record("close", `${String(event.code)} ${String(event.reason)} clean=${String(event.wasClean)}`);
  });
  const httpRequests = (): readonly ScriptedRequest[] => server.requests;
  const bodies = (): readonly string[] => [
    ...httpRequests().filter((request) => request.method === "POST" && pathOf(request.target).endsWith("/xhr_send")).map((request) => request.body),
    ...server.webSockets.flatMap((connection) => messagesOf(connection.frames).map((item) => (typeof item === "string" ? item : "binary"))),
  ];
  return {
    server,
    socket,
    events,
    messages,
    closes,
    elapsed,
    sessionIdCalls: () => calls,
    opened: async (limitMs = 5_000) => {
      const seen = await until(() => events.some((event) => event.kind === "open"), limitMs);
      const event = events.find((item) => item.kind === "open");
      if (!seen || event === undefined) throw new Error(`The client did not open in ${limitMs} ms. Events: ${JSON.stringify(events)}`);
      return event.at;
    },
    closed: () => closes[0],
    infos: () => httpRequests().filter((request) => pathOf(request.target) === `${basePath}/info`),
    receives: () => httpRequests().filter(isReceive),
    sends: () => httpRequests().filter((request) => request.method === "POST" && pathOf(request.target).endsWith("/xhr_send")),
    webSockets: () => server.webSockets,
    targets: () => [
      ...httpRequests().filter((request) => pathOf(request.target) !== `${basePath}/info`).map((request) => request.target),
      ...server.webSockets.map((connection) => connection.target),
    ],
    bodies,
    sent: () => bodies().flatMap((body): readonly (string | undefined)[] => parseSent(body) ?? [undefined]),
    end: async () => {
      try {
        socket.close();
      } finally {
        await server.close();
      }
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

/** The parts of a top session URL: `/<base>/<server_id>/<session_id>/<transport>`. */
export interface SessionParts {
  readonly serverId: string;
  readonly sessionId: string;
  readonly transport: string;
}

/** This function gives the parts of the top session URL of a target, or `undefined` for another target. */
export function sessionPartsOf(target: string): SessionParts | undefined {
  const parts = pathOf(target).slice(basePath.length).split("/");
  if (parts.length !== 4 || parts[0] !== "") return undefined;
  const [, server, session, transport] = parts;
  if (server === undefined || session === undefined || transport === undefined) return undefined;
  return { serverId: server, sessionId: session, transport };
}
