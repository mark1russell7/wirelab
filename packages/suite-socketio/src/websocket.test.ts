// The conformance checks of Socket.IO over the WebSocket transport `NodeWebSocket`, alone and in an upgrade from HTTP
// long-polling. The title of each test starts with the id of its check in `src/index.ts`, and names the rules that it examines.
import { messagesOf, type WebSocketStep } from "@mark1russell7/rigor-testkit/http";
import { frame, openFrame, pause, payload, until, type Packet, type SessionScript } from "@wirelab/suite-engineio";
import { afterEach, describe, expect, it } from "vitest";
import { placeholder, type SioPacket } from "./codec.ts";
import {
  answerMs,
  connectMain,
  connectReply,
  framesOf,
  sioFrames,
  startSioSession,
  startSioUpgrade,
  suiteEnabled,
  upgradeCases,
  webSocketScript,
  webSocketTransport,
  type SioFrame,
  type SioSession,
  type UpgradeCase,
} from "./harness.ts";

const sessions: SioSession[] = [];

async function keep(started: Promise<SioSession>): Promise<SioSession> {
  const s = await started;
  sessions.push(s);
  return s;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

const noop: Packet = { type: "noop", data: "" };

/** This function starts a session on WebSocket alone with the given script. */
function webSocketSession(script: SessionScript = webSocketScript()): Promise<SioSession> {
  return keep(startSioSession(webSocketTransport, script));
}

/** This function gives the text and binary messages that the client sent on the first WebSocket connection. */
function messages(s: SioSession): readonly (string | Uint8Array)[] {
  return messagesOf(s.webSockets()[0]?.frames ?? []);
}

/**
 * This function gives the script of an upgrade. The open packet offers `websocket`, and the first poll connects the
 * main namespace. The server answers the probe after `probeMs`, and it answers each later GET request with a `noop`
 * packet after 200 ms. Thus the client can pause HTTP long-polling. After the upgrade packet, the server sends the steps.
 */
function upgradeScript(afterUpgrade: readonly WebSocketStep[] = [], probeMs = 0): SessionScript {
  return {
    handshake: { upgrades: ["websocket"] },
    polls: [connectMain()],
    hold: payload([noop], { delayMs: 200 }),
    webSockets: [{ steps: [{ receive: 1 }, frame({ type: "pong", data: "probe" }, probeMs), { receive: 2 }, ...afterUpgrade] }],
  };
}

/** This function waits until the engine of the manager uses WebSocket, or throws after the limit. */
async function upgraded(s: SioSession, limitMs = 5_000): Promise<void> {
  if (!(await until(() => s.manager.engine?.transport?.name === "websocket", limitMs))) {
    throw new Error(`The client did not upgrade in ${limitMs} ms. Transport: ${String(s.manager.engine?.transport?.name)}`);
  }
}

/** This function gives the indexes 0 to `count` - 1 to `emit`, in order, with `everyMs` between two indexes. */
async function emitEvery(count: number, everyMs: number, emit: (index: number) => void): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    emit(index);
    await pause(everyMs);
  }
}

describe.runIf(suiteEnabled)("socket.io-client over WebSocket", () => {
  describe("NodeWebSocket", () => {
    it("ws-connect: [SIO5-CN-1] [SIO5-CN-2] [SIO5-PE-4] the first message of the client is the CONNECT packet 40, and the CONNECT reply connects", async () => {
      const s = await webSocketSession();
      const socket = s.socket("/");
      const connect = await s.next("connect");
      expect(s.gets()).toHaveLength(0);
      expect(messages(s)[0]).toBe("40");
      expect(connect.detail).toBe("sid-main");
      expect(socket.id).toBe("sid-main");
    });

    it("ws-receive-event: [SIO5-PE-1] [SIO5-PE-4] the frame 2[\"hey\",\"Jude\"] gives the event hey with the argument Jude", async () => {
      const s = await webSocketSession(webSocketScript(sioFrames([{ type: "EVENT", nsp: "/", data: ["hey", "Jude"] }], answerMs)));
      s.socket("/");
      const event = await s.next("event");
      expect(event.detail).toBe("hey");
      expect(event.args).toEqual(["Jude"]);
    });

    it("ws-multiplex: [SIO5-CN-5] [SIO5-PE-4] two namespaces use one WebSocket connection, with one message for each CONNECT packet", async () => {
      const both = sioFrames([connectReply("sid-main"), connectReply("sid-admin", "/admin")], answerMs);
      const s = await webSocketSession({ webSockets: [{ steps: [openFrame(), { receive: 2 }, ...both] }] });
      s.socket("/");
      s.socket("/admin");
      await Promise.all([s.next("connect"), s.next("connect", "/admin")]);
      expect(s.webSockets()).toHaveLength(1);
      expect(framesOf(s.sent(), "CONNECT")).toHaveLength(1);
      expect(framesOf(s.sent(), "CONNECT", "/admin")).toHaveLength(1);
      expect(messages(s).slice(0, 2).sort()).toEqual(["40", "40/admin,"]);
    });

    it("ws-send-event: [SIO5-EV-1] [SIO5-PE-4] two events go out as the text frames 42[\"hello\"] and 42[\"world\"], in order", async () => {
      const s = await webSocketSession();
      const socket = s.socket("/");
      await s.next("connect");
      socket.emit("hello");
      socket.emit("world");
      expect(await until(() => messages(s).length >= 3, 2_000)).toBe(true);
      expect(messages(s)).toEqual(["40", '42["hello"]', '42["world"]']);
      expect(s.webSockets()[0]?.frames.map((item) => item.opcode)).toEqual([1, 1, 1]);
    });

    it("ws-send-binary: [SIO5-PE-3] [SIO5-PE-4] an event with bytes is a text frame with a placeholder, and then a binary frame with the bytes", async () => {
      const s = await webSocketSession();
      const socket = s.socket("/");
      await s.next("connect");
      socket.emit("baz", new Uint8Array([1, 2, 3, 4]));
      expect(await until(() => framesOf(s.sent(), "BINARY_EVENT").length > 0, 2_000)).toBe(true);
      expect(framesOf(s.sent(), "BINARY_EVENT")).toEqual([
        { packet: { type: "BINARY_EVENT", nsp: "/", attachments: 1, data: ["baz", placeholder(0)] }, attachments: [new Uint8Array([1, 2, 3, 4])] },
      ]);
      expect(s.webSockets()[0]?.frames.map((item) => item.opcode)).toEqual([1, 1, 2]);
    });

    it("ws-receive-binary: [SIO5-PE-3] a BINARY_EVENT frame and two binary frames give an event with the bytes in order", async () => {
      const binary: SioFrame = {
        packet: { type: "BINARY_EVENT", nsp: "/", attachments: 2, data: ["baz", placeholder(0), placeholder(1)] },
        attachments: [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      };
      const s = await webSocketSession(webSocketScript(sioFrames([binary], answerMs)));
      s.socket("/");
      const event = await s.next("event");
      expect(event.detail).toBe("baz");
      expect(event.args).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    });

    it("ws-binary-ack: [SIO5-AK-2] [SIO5-PE-3] an acknowledgement with bytes is a BINARY_ACK frame with the event ID, and then a binary frame", async () => {
      const s = await webSocketSession(webSocketScript(sioFrames([{ type: "EVENT", nsp: "/", id: 15, data: ["foo"] }], answerMs)));
      const socket = s.socket("/");
      socket.on("foo", (ack: (...args: unknown[]) => void) => ack("bar", new Uint8Array([1, 2, 3, 4])));
      await s.next("event");
      expect(await until(() => framesOf(s.sent(), "BINARY_ACK").length > 0, 2_000)).toBe(true);
      expect(framesOf(s.sent(), "BINARY_ACK")).toEqual([
        { packet: { type: "BINARY_ACK", nsp: "/", attachments: 1, id: 15, data: ["bar", placeholder(0)] }, attachments: [new Uint8Array([1, 2, 3, 4])] },
      ]);
    });

    it("ws-receive-disconnect: [SIO5-DC-1] a DISCONNECT frame gives the reason io server disconnect, and no new CONNECT", async () => {
      const s = await webSocketSession(webSocketScript(sioFrames([{ type: "DISCONNECT", nsp: "/" }], answerMs)));
      const socket = s.socket("/");
      const disconnect = await s.next("disconnect");
      expect(disconnect.detail).toBe("io server disconnect");
      await pause(500);
      expect(socket.connected).toBe(false);
      expect(framesOf(s.sent(), "CONNECT")).toHaveLength(1);
    });

    it("ws-invalid-event-payload: [SIO5-EV-2] the EVENT frame 2[] closes the WebSocket connection with the reason parse error", async () => {
      const s = await webSocketSession(webSocketScript(sioFrames([{ type: "EVENT", nsp: "/", data: [] }], answerMs)));
      s.socket("/");
      const disconnect = await s.next("disconnect");
      expect(disconnect.detail).toBe("parse error");
      expect(await until(() => s.webSockets()[0]?.closedAt !== undefined, 2_000)).toBe(true);
      expect(s.eventsOf("/").filter((event) => event.kind === "event")).toEqual([]);
    });
  });

  describe.each(upgradeCases)("upgrade, $name", (upgradeCase: UpgradeCase) => {
    it("upgrade-connect: [SIO5-CN-1] [SIO5-PE-4] the upgrade keeps the connection of the namespace, with no second CONNECT packet", async () => {
      const s = await keep(startSioUpgrade(upgradeCase, upgradeScript()));
      const socket = s.socket("/");
      await s.next("connect");
      await upgraded(s);
      await pause(300);
      expect(framesOf(s.delivered(), "CONNECT")).toHaveLength(1);
      expect(socket.id).toBe("sid-main");
      expect(socket.connected).toBe(true);
      expect(s.eventsOf("/").map((event) => event.kind)).toEqual(["connect"]);
    });

    it("upgrade-events: [SIO5-PE-4] the server gets each event of the client one time, in order, across the upgrade", async () => {
      // The server answers the probe after 150 ms. Thus the client sends events before, while and after it probes.
      const s = await keep(startSioUpgrade(upgradeCase, upgradeScript([], 150)));
      const socket = s.socket("/");
      await s.next("connect");
      await emitEvery(12, 50, (index) => socket.emit("tick", index));
      await upgraded(s);
      const ticks = (): readonly unknown[] => framesOf(s.delivered(), "EVENT").map((item) => item.packet.data);
      expect(await until(() => ticks().length >= 12, 3_000)).toBe(true);
      await pause(200);
      expect(ticks()).toEqual(Array.from({ length: 12 }, (_, index) => ["tick", index]));
      expect(framesOf(s.posted(), "EVENT").length).toBeGreaterThan(0);
      expect(framesOf(s.sent(), "EVENT").length).toBeGreaterThan(0);
    });

    it("upgrade-binary: [SIO5-PE-3] [SIO5-PE-4] each binary event of the client keeps its attachment, in order, across the upgrade", async () => {
      const s = await keep(startSioUpgrade(upgradeCase, upgradeScript([], 150)));
      const socket = s.socket("/");
      await s.next("connect");
      await emitEvery(12, 50, (index) => socket.emit("bin", index, new Uint8Array([index, 255 - index])));
      await upgraded(s);
      const sent = (): readonly (SioFrame | undefined)[] => s.delivered().frames.filter((item) => item?.packet.type !== "CONNECT");
      expect(await until(() => sent().length >= 12, 3_000)).toBe(true);
      await pause(200);
      expect(sent()).toEqual(
        Array.from({ length: 12 }, (_, index) => ({
          packet: { type: "BINARY_EVENT", nsp: "/", attachments: 1, data: ["bin", index, placeholder(0)] },
          attachments: [new Uint8Array([index, 255 - index])],
        })),
      );
    });

    it("upgrade-ack: [SIO5-AK-1] [SIO5-AK-2] an ACK over WebSocket after the upgrade calls the callback of an event sent over HTTP long-polling", async () => {
      const ack: SioPacket = { type: "ACK", nsp: "/", id: 0, data: ["bar"] };
      // The server answers the probe after 300 ms. Thus the event goes out over HTTP long-polling, before the upgrade.
      const s = await keep(startSioUpgrade(upgradeCase, upgradeScript(sioFrames([ack], answerMs), 300)));
      const socket = s.socket("/");
      await s.next("connect");
      const replies: unknown[][] = [];
      socket.emit("foo", (...args: unknown[]) => {
        replies.push(args);
      });
      await upgraded(s);
      expect(await until(() => replies.length > 0, 3_000)).toBe(true);
      expect(framesOf(s.posted(), "EVENT")).toEqual([{ packet: { type: "EVENT", nsp: "/", id: 0, data: ["foo"] }, attachments: [] }]);
      expect(replies).toEqual([["bar"]]);
    });
  });
});
