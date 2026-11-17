/**
 * The helpers of the tests: a scripted Socket.IO server, a manager of `socket.io-client` on it, and the records of the
 * session. The server is the scripted Engine.IO server of the Engine.IO suite, with its HTTP long-polling and WebSocket
 * routes. Each test controls each byte that the client gets.
 */
import {
  messagesOf,
  type ScriptedReply,
  type ScriptedRequest,
  type ScriptedServer,
  type SendStep,
  type WebSocketConnection,
  type WebSocketStep,
} from "@mark1russell7/rigor-testkit/http";
import {
  decodePayload,
  frame,
  message,
  openFrame,
  packetsOf,
  payload,
  queryOf,
  startEngineServer,
  until,
  type Handshake,
  type Packet,
  type SessionScript,
} from "@wirelab/suite-engineio";
import { Fetch, Manager, NodeWebSocket, NodeXHR, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";
import { decodeSioPacket, encodeSioPacket, type SioPacket } from "./codec.ts";

/**
 * This value is true when the environment variable `SUITE_SOCKETIO` is `1`. The checks of the client start only then.
 * The suite is not a gate, thus the shared CI examines only the data and the codec.
 */
export const suiteEnabled: boolean = process.env["SUITE_SOCKETIO"] === "1";

/** A transport of the client that the suite examines. */
export interface PollingTransport {
  readonly name: string;
  readonly implementation: typeof NodeXHR | typeof Fetch | typeof NodeWebSocket;
}

/** The transports of HTTP long-polling for Node.js. Each check examines each transport. */
export const transports: readonly PollingTransport[] = [
  { name: "NodeXHR", implementation: NodeXHR },
  { name: "Fetch", implementation: Fetch },
];

/** The WebSocket transport of the client on the package `ws`. It is the default WebSocket transport in Node.js. */
export const webSocketTransport: PollingTransport = { name: "NodeWebSocket", implementation: NodeWebSocket };

/** A start of a session on HTTP long-polling and an upgrade to WebSocket. */
export interface UpgradeCase {
  readonly name: string;
  /** The transports of the client. With no list, the client has its default transports: `NodeXHR` and `NodeWebSocket`. */
  readonly transports?: readonly PollingTransport["implementation"][];
}

/** The upgrade cases. Each check of an upgrade examines each case. */
export const upgradeCases: readonly UpgradeCase[] = [{ name: "default transports" }, { name: "Fetch to NodeWebSocket", transports: [Fetch, NodeWebSocket] }];

/** The path of the server. It is the default path of the client, with the slash that the client adds at the end. */
export const socketPath: string = "/socket.io/";

/** The time in ms before the scripted server answers a packet of the client. Thus the reply comes after the packet. */
export const answerMs: number = 100;

/** One Socket.IO packet and the bytes of its attachments. */
export interface SioFrame {
  readonly packet: SioPacket;
  readonly attachments: readonly Uint8Array[];
}

/** This function gives the Engine.IO packets of one Socket.IO packet: the text, and then one binary packet for each attachment. */
export function engineMessages(item: SioPacket | SioFrame): Packet[] {
  const frame = "packet" in item ? item : { packet: item, attachments: [] };
  return [message(encodeSioPacket(frame.packet)), ...frame.attachments.map((bytes) => message(bytes))];
}

/** This function gives a reply to a GET request with the given Socket.IO packets. `extra` adds a delay or other parts. */
export function sioReply(items: readonly (SioPacket | SioFrame)[], extra: ScriptedReply = {}): ScriptedReply {
  return payload(items.flatMap(engineMessages), extra);
}

/**
 * This function gives the WebSocket steps that send the given Socket.IO packets: one frame for each Engine.IO packet. The
 * first frame waits `delayMs`, and the attachments of a packet follow it with no delay.
 */
export function sioFrames(items: readonly (SioPacket | SioFrame)[], delayMs: number = 0): SendStep[] {
  return items.flatMap(engineMessages).map((packet, index) => frame(packet, index === 0 ? delayMs : 0));
}

/**
 * This function gives the script of a session on WebSocket alone. The server sends the open packet, waits for the
 * `CONNECT` packet of the client, and connects the main namespace. Then it sends the given steps.
 */
export function webSocketScript(steps: readonly WebSocketStep[] = [], handshake: Partial<Handshake> = {}): SessionScript {
  return { handshake, webSockets: [{ steps: [openFrame(handshake), { receive: 1 }, ...sioFrames([connectReply("sid-main")], answerMs), ...steps] }] };
}

/** This function gives the `CONNECT` packet of the server for a namespace, with the given session ID. */
export function connectReply(sid: string, nsp: string = "/"): SioPacket {
  return { type: "CONNECT", nsp, data: { sid } };
}

/** This function gives the reply that connects the main namespace with the given session ID, after the answer time. */
export function connectMain(sid: string = "sid-main"): ScriptedReply {
  return sioReply([connectReply(sid)], { delayMs: answerMs });
}

/** The packets that the client posted. */
export interface Posted {
  /** The Socket.IO packets with their attachments, in order. A part that is not a packet is `undefined`. */
  readonly frames: readonly (SioFrame | undefined)[];
  /** The Engine.IO packets that are not `message` packets, for example a `close` packet. */
  readonly engine: readonly Packet[];
}

/**
 * This function joins the attachments of each binary packet to the packet. The parts of one packet can be in different
 * POST bodies, thus the function examines the packets of all bodies in order.
 */
export function joinFrames(packets: readonly (Packet | undefined)[]): Posted {
  const frames: (SioFrame | undefined)[] = [];
  const engine: Packet[] = [];
  let open: { packet: SioPacket; attachments: Uint8Array[] } | undefined;
  for (const item of packets) {
    if (item === undefined) {
      frames.push(undefined);
    } else if (item.type !== "message") {
      engine.push(item);
    } else if (typeof item.data !== "string") {
      if (open === undefined) {
        frames.push(undefined);
        continue;
      }
      open.attachments.push(item.data);
      if (open.attachments.length >= (open.packet.attachments ?? 0)) {
        frames.push(open);
        open = undefined;
      }
    } else {
      if (open !== undefined) frames.push(open);
      open = undefined;
      const packet = decodeSioPacket(item.data);
      if (packet === undefined) frames.push(undefined);
      else if ((packet.attachments ?? 0) > 0) open = { packet, attachments: [] };
      else frames.push({ packet, attachments: [] });
    }
  }
  if (open !== undefined) frames.push(open);
  return { frames, engine };
}

/** The kind of an event of a socket. */
export type SocketEventKind = "connect" | "connect_error" | "disconnect" | "event";

/** One event of a socket of the session. */
export interface SocketEvent {
  /** The time of the event in ms after the start of the manager. */
  readonly at: number;
  readonly nsp: string;
  readonly kind: SocketEventKind;
  /** The session ID of a connect, the message of an error, the reason of a disconnect, or the name of an event. */
  readonly detail: string;
  /** The data of an error, or the arguments of an event. Binary data is a plain `Uint8Array`. */
  readonly args: readonly unknown[];
}

/** One session: the scripted server, the manager, its sockets and the records. */
export interface SioSession {
  readonly server: ScriptedServer;
  readonly manager: Manager;
  readonly handshake: Handshake;
  /** The events of the sockets, in order. */
  readonly events: readonly SocketEvent[];
  /** The time in ms after the start of the manager. */
  elapsed(): number;
  /** This method gives the socket of a namespace, and records its events. */
  socket(nsp: string, options?: Partial<SocketOptions>): Socket;
  /** This method waits for the next event of the given kind on a namespace. It throws after the limit. */
  next(kind: SocketEventKind, nsp?: string, limitMs?: number): Promise<SocketEvent>;
  /** This method gives the events of a namespace. */
  eventsOf(nsp: string): readonly SocketEvent[];
  /** This method gives the records of the GET requests. */
  gets(): readonly ScriptedRequest[];
  /** This method gives the records of the POST requests. */
  posts(): readonly ScriptedRequest[];
  /** This method gives the packets of all POST bodies. */
  posted(): Posted;
  /** This method gives the records of the WebSocket connections of the client, in order. */
  webSockets(): readonly WebSocketConnection[];
  /** This method gives the packets that the client sent on a WebSocket connection. The default is the first connection. */
  sent(connection?: number): Posted;
  /**
   * This method gives the packets of the client on the two transports of an upgrade: the POST bodies, and then the first
   * WebSocket connection. The client sends no POST request after the upgrade, thus this list has the order of the sends.
   */
  delivered(): Posted;
  /** This method disconnects the sockets, closes the manager, and then closes the server. */
  end(): Promise<void>;
}

/** This function gives a value with each binary part as a plain `Uint8Array`. A Node.js `Buffer` becomes a copy. */
export function normalValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  if (Array.isArray(value)) return value.map(normalValue);
  if (typeof value === "function") return "ack function";
  return value;
}

/** This function starts a scripted server and a manager of one transport on it. The manager does not reconnect by default. */
export function startSioSession(transport: PollingTransport, script: SessionScript = {}, client: Partial<ManagerOptions> = {}): Promise<SioSession> {
  return openSioSession(script, { reconnection: false, ...client, transports: [transport.implementation], upgrade: false });
}

/**
 * This function starts a scripted server and a manager with the transports of an upgrade case on it. The manager can
 * upgrade, and it does not reconnect by default.
 */
export function startSioUpgrade(upgradeCase: UpgradeCase, script: SessionScript = {}, client: Partial<ManagerOptions> = {}): Promise<SioSession> {
  return openSioSession(script, { reconnection: false, ...client, ...(upgradeCase.transports === undefined ? {} : { transports: [...upgradeCase.transports] }) });
}

/** This function starts a scripted server and a manager with the given options on it. */
async function openSioSession(script: SessionScript, options: Partial<ManagerOptions>): Promise<SioSession> {
  const { server, handshake } = await startEngineServer(script, socketPath);
  const start = performance.now();
  const elapsed = (): number => performance.now() - start;
  const events: SocketEvent[] = [];
  const sockets: Socket[] = [];
  const record = (nsp: string, kind: SocketEventKind, detail: string, args: readonly unknown[] = []): void => {
    events.push({ at: elapsed(), nsp, kind, detail, args: args.map(normalValue) });
  };
  const manager = new Manager(server.url, options);
  const requestsOf = (method: string): readonly ScriptedRequest[] => server.requests.filter((request) => request.method === method);
  const eventsOf = (nsp: string): readonly SocketEvent[] => events.filter((event) => event.nsp === nsp);
  return {
    server,
    manager,
    handshake,
    events,
    elapsed,
    socket: (nsp, options) => {
      const socket = manager.socket(nsp, options);
      sockets.push(socket);
      socket.on("connect", () => record(nsp, "connect", socket.id ?? ""));
      socket.on("connect_error", (error) => record(nsp, "connect_error", error.message, [error.data]));
      socket.on("disconnect", (reason) => record(nsp, "disconnect", reason));
      socket.onAny((event: string, ...args: unknown[]) => record(nsp, "event", event, args));
      return socket;
    },
    next: async (kind, nsp = "/", limitMs = 5_000) => {
      const seen = eventsOf(nsp).filter((event) => event.kind === kind).length;
      const found = await until(() => eventsOf(nsp).filter((event) => event.kind === kind).length > seen, limitMs);
      const event = eventsOf(nsp).filter((item) => item.kind === kind)[seen];
      if (!found || event === undefined) throw new Error(`No ${kind} event on ${nsp} in ${limitMs} ms. Events: ${JSON.stringify(events)}`);
      return event;
    },
    eventsOf,
    gets: () => requestsOf("GET"),
    posts: () => requestsOf("POST"),
    posted: () => joinFrames(requestsOf("POST").flatMap((request) => decodePayload(request.body))),
    webSockets: () => server.webSockets,
    sent: (connection = 0) => joinFrames(webSocketPackets(server, connection)),
    delivered: () => joinFrames([...requestsOf("POST").flatMap((request) => decodePayload(request.body)), ...webSocketPackets(server, 0)]),
    end: async () => {
      manager.reconnection(false);
      for (const socket of sockets) socket.disconnect();
      manager._close();
      await server.close();
    },
  };
}

/** This function gives the Engine.IO packets that the client sent on a WebSocket connection of the server. */
function webSocketPackets(server: ScriptedServer, connection: number): readonly (Packet | undefined)[] {
  return packetsOf(messagesOf(server.webSockets[connection]?.frames ?? []));
}

/** This function gives the frames of the given type and namespace. */
export function framesOf(posted: Posted, type: SioPacket["type"], nsp: string = "/"): readonly SioFrame[] {
  return posted.frames.filter((frame): frame is SioFrame => frame !== undefined && frame.packet.type === type && frame.packet.nsp === nsp);
}

/** This function gives the GET requests of a handshake: the GET requests with no `sid` in the query. */
export function handshakes(requests: readonly ScriptedRequest[]): readonly ScriptedRequest[] {
  return requests.filter((request) => !queryOf(request.target).has("sid"));
}
