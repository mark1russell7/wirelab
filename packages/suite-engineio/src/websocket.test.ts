// The conformance checks of the WebSocket transport `NodeWebSocket`, alone and in an upgrade from HTTP long-polling. The
// title of each test starts with the id of its check in `src/index.ts`, and names the rules that it examines.
import type { WebSocketStep } from "@mark1russell7/rigor-testkit/http";
import { afterEach, describe, expect, it } from "vitest";
import { SEPARATOR, type Handshake, type Packet } from "./codec.ts";
import {
  frame,
  message,
  openFrame,
  pause,
  payload,
  queryOf,
  startSession,
  startUpgrade,
  suiteEnabled,
  until,
  upgradeCases,
  webSocketTransport,
  type Session,
  type SessionScript,
  type UpgradeCase,
} from "./harness.ts";

const sessions: Session[] = [];

async function keep(started: Promise<Session>): Promise<Session> {
  const s = await started;
  sessions.push(s);
  return s;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

const ping: Packet = { type: "ping", data: "" };
const pong: Packet = { type: "pong", data: "" };
const noop: Packet = { type: "noop", data: "" };
const unicode = "héllo wörld ✓ 😀";

/** This function starts a session on WebSocket alone. The server sends the open packet and then the given frames. */
function webSocketSession(steps: readonly WebSocketStep[], open: Partial<Handshake> = {}): Promise<Session> {
  return keep(startSession(webSocketTransport, { handshake: open, webSockets: [{ steps: [openFrame(open), ...steps] }] }));
}

/**
 * This function gives the script of an upgrade. The open packet offers `websocket`. The server answers the probe, and it
 * answers each GET request with a `noop` packet after 200 ms. Thus the client can pause HTTP long-polling.
 */
function upgradeScript(): SessionScript {
  return {
    handshake: { upgrades: ["websocket"] },
    hold: payload([noop], { delayMs: 200 }),
    webSockets: [{ steps: [{ receive: 1 }, frame({ type: "pong", data: "probe" })] }],
  };
}

/** This function waits for the upgrade event of the client, or throws after the limit. */
async function upgraded(s: Session, limitMs = 5_000): Promise<void> {
  if (!(await until(() => s.events.some((event) => event.kind === "upgrade"), limitMs))) {
    throw new Error(`The client did not upgrade in ${limitMs} ms. Events: ${JSON.stringify(s.events)}`);
  }
}

describe.runIf(suiteEnabled)("engine.io-client over WebSocket", () => {
  describe("NodeWebSocket", () => {
    it("ws-handshake: [EIO4-HS-1] the first request has EIO=4 and transport=websocket, and no sid", async () => {
      const s = await webSocketSession([]);
      await s.opened();
      expect(s.gets()).toHaveLength(0);
      const query = queryOf(s.webSockets()[0]?.target ?? "");
      expect(query.get("EIO")).toBe("4");
      expect(query.get("transport")).toBe("websocket");
      expect(query.has("sid")).toBe(false);
      expect(s.socket.id).toBe(s.handshake.sid);
    });

    it("ws-receive: [EIO4-WS-1] [EIO4-PT-3] each frame is one message, in order, with a record separator kept in its data", async () => {
      const s = await webSocketSession([frame(message("one")), frame(message("two")), frame(message(`three${SEPARATOR}4four`))]);
      await s.opened();
      expect(await until(() => s.messages.length >= 3, 3_000)).toBe(true);
      await pause(100);
      expect(s.messages).toEqual(["one", "two", `three${SEPARATOR}4four`]);
    });

    it("ws-receive-binary: [EIO4-WS-2] a binary frame gives its bytes as they are", async () => {
      const s = await webSocketSession([frame(message(new Uint8Array([1, 2, 3, 0x34])))]);
      await s.opened();
      expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
      expect(s.messages).toEqual([new Uint8Array([1, 2, 3, 0x34])]);
    });

    it("ws-receive-utf8: [EIO4-PE-3] the client decodes the text of a message as UTF-8", async () => {
      const s = await webSocketSession([frame(message(unicode))]);
      await s.opened();
      expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
      expect(s.messages).toEqual([unicode]);
    });

    it("ws-send: [EIO4-WS-1] the client sends each message in its own text frame", async () => {
      const s = await webSocketSession([]);
      await s.opened();
      s.socket.send("one");
      s.socket.send("two");
      s.socket.send(unicode);
      expect(await until(() => s.sent().length >= 3, 3_000)).toBe(true);
      expect(s.sent()).toEqual([message("one"), message("two"), message(unicode)]);
      expect(s.webSockets()[0]?.frames.map((item) => item.opcode)).toEqual([1, 1, 1]);
    });

    it("ws-send-binary: [EIO4-WS-2] the client sends bytes in a binary frame, as they are", async () => {
      const s = await webSocketSession([]);
      await s.opened();
      s.socket.send(new Uint8Array([1, 2, 3]));
      expect(await until(() => s.sent().length >= 1, 3_000)).toBe(true);
      expect(s.sent()).toEqual([message(new Uint8Array([1, 2, 3]))]);
      expect(s.webSockets()[0]?.frames[0]?.opcode).toBe(2);
    });

    it("ws-ping: [EIO4-HB-1] the client answers a ping packet with a pong packet", async () => {
      const s = await webSocketSession([frame(ping, 100)], { pingInterval: 300, pingTimeout: 1_000 });
      await s.opened();
      expect(await until(() => s.sent().length >= 1, 3_000)).toBe(true);
      expect(s.sent()).toEqual([pong]);
      expect(s.closed()).toBeUndefined();
    });

    it("ws-ping-timeout: [EIO4-HB-2] with no ping in pingInterval plus pingTimeout, the client closes", async () => {
      const s = await webSocketSession([], { pingInterval: 200, pingTimeout: 200 });
      const openAt = await s.opened();
      expect(await until(() => s.closed() !== undefined, 3_000)).toBe(true);
      expect(s.closed()?.detail).toBe("ping timeout");
      const after = (s.closed()?.at ?? 0) - openAt;
      expect(after).toBeGreaterThanOrEqual(350);
      expect(after).toBeLessThan(2_000);
    });

    it("ws-noop: [EIO4-PT-2] a noop packet gives no message", async () => {
      const s = await webSocketSession([frame(noop), frame(message("after"))]);
      await s.opened();
      expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
      await pause(100);
      expect(s.messages).toEqual(["after"]);
    });
  });

  describe.each(upgradeCases)("upgrade, $name", (upgradeCase: UpgradeCase) => {
    it("upgrade: [EIO4-UP-1] [EIO4-UP-2] [EIO4-UP-3] the client probes a WebSocket of the session, then sends an upgrade packet", async () => {
      const s = await keep(startUpgrade(upgradeCase, upgradeScript()));
      await s.opened();
      await upgraded(s);
      const query = queryOf(s.webSockets()[0]?.target ?? "");
      expect(query.get("EIO")).toBe("4");
      expect(query.get("transport")).toBe("websocket");
      expect(query.get("sid")).toBe(s.handshake.sid);
      expect(await until(() => s.sent().length >= 2, 3_000)).toBe(true);
      expect(s.sent().slice(0, 2)).toEqual([
        { type: "ping", data: "probe" },
        { type: "upgrade", data: "" },
      ]);
      expect(s.events.find((event) => event.kind === "upgrade")?.detail).toBe("websocket");
    });

    it("upgrade-pause: [EIO4-UP-4] after the upgrade packet, the client sends no HTTP request, and it sends over WebSocket", async () => {
      const s = await keep(startUpgrade(upgradeCase, upgradeScript()));
      let atUpgrade = -1;
      s.socket.on("upgrade", () => {
        atUpgrade = s.server.requests.length;
      });
      await s.opened();
      await upgraded(s);
      s.socket.send("after");
      expect(await until(() => s.sent().length >= 3, 3_000)).toBe(true);
      // The server answers each GET request in 200 ms. A client that still polls sends a request in this time.
      await pause(600);
      expect(s.server.requests).toHaveLength(atUpgrade);
      expect(s.sent()[2]).toEqual(message("after"));
    });

    it("upgrade-no-loss: [EIO4-UP-5] the server gets each message of the client one time, in order, across the upgrade", async () => {
      const script = upgradeScript();
      // The server answers the probe after 150 ms. Thus the client sends messages before, while and after it probes.
      const s = await keep(startUpgrade(upgradeCase, { ...script, webSockets: [{ steps: [{ receive: 1 }, frame({ type: "pong", data: "probe" }, 150)] }] }));
      const sent = Array.from({ length: 12 }, (_, index) => `m${index}`);
      await s.opened();
      let index = 0;
      const timer = setInterval(() => {
        const next = sent[index];
        if (next !== undefined) s.socket.send(next);
        index += 1;
      }, 50);
      try {
        await upgraded(s);
        expect(await until(() => index >= sent.length, 3_000)).toBe(true);
      } finally {
        clearInterval(timer);
      }
      const all = (): readonly unknown[] => [
        ...s.posted().filter((packet) => packet?.type === "message").map((packet) => packet?.data),
        ...s.sent().filter((packet) => packet?.type === "message").map((packet) => packet?.data),
      ];
      expect(await until(() => all().length >= sent.length, 3_000)).toBe(true);
      await pause(200);
      expect(all()).toEqual(sent);
      expect(s.posted().some((packet) => packet?.type === "message")).toBe(true);
      expect(s.sent().some((packet) => packet?.type === "message")).toBe(true);
    });

    it("upgrade-one-socket: [EIO4-WS-3] the client opens one WebSocket connection for the session", async () => {
      const s = await keep(startUpgrade(upgradeCase, upgradeScript()));
      await s.opened();
      await upgraded(s);
      await pause(500);
      expect(s.webSockets()).toHaveLength(1);
      expect(s.webSockets()[0]?.closedAt).toBeUndefined();
    });
  });

  it("upgrade-default: [EIO4-UP-6] with its default options, the client starts on HTTP long-polling and changes to WebSocket", async () => {
    const s = await keep(startUpgrade({ name: "default options", client: {} }, upgradeScript()));
    await s.opened();
    expect(queryOf(s.gets()[0]?.target ?? "").get("transport")).toBe("polling");
    await upgraded(s);
    expect(s.socket.transport.name).toBe("websocket");
  });
});
