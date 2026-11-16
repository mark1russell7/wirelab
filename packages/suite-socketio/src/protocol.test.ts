// The conformance checks of Socket.IO over HTTP long-polling. Each check examines each transport of `transports`. The
// title of each test starts with the id of its check in `src/index.ts`, and names the rules that it examines.
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { pause, queryOf, until } from "@wirelab/suite-engineio";
import { afterEach, describe, expect, it } from "vitest";
import { placeholder, type SioPacket } from "./codec.ts";
import { answerMs, connectMain, connectReply, framesOf, handshakes, sioReply, startSioSession, suiteEnabled, transports, type SioFrame, type SioSession } from "./harness.ts";

const sessions: SioSession[] = [];

async function session(...parts: Parameters<typeof startSioSession>): Promise<SioSession> {
  const started = await startSioSession(...parts);
  sessions.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

/** This function gives the reply that connects the main namespace and `/admin`. */
function connectBoth(): ScriptedReply {
  return sioReply([connectReply("sid-main"), connectReply("sid-admin", "/admin")], { delayMs: answerMs });
}

/** This function gives a reply with one packet of the server, after the answer time. */
function later(packet: SioPacket, delayMs = answerMs): ScriptedReply {
  return sioReply([packet], { delayMs });
}

/** This function gives the Engine.IO packets of all POST bodies as text, in order. */
function postedTexts(s: SioSession): string[] {
  return s
    .posts()
    .map((post) => post.body)
    .join("\x1e")
    .split("\x1e");
}

describe.runIf(suiteEnabled)("socket.io-client over HTTP long-polling", () => {
  describe.each(transports)("$name", (transport) => {
    it("connect-main: [SIO5-CN-1] [SIO5-PE-2] [SIO5-PE-4] the first POST body is the CONNECT packet of the main namespace, 40", async () => {
      const s = await session(transport, { polls: [connectMain()] });
      s.socket("/");
      await s.next("connect");
      expect(s.posts()[0]?.body).toBe("40");
    });

    it("connect-namespace: [SIO5-CN-1] [SIO5-PE-1] the first POST body is the CONNECT packet of /admin, 40/admin,", async () => {
      const s = await session(transport, { polls: [sioReply([connectReply("sid-admin", "/admin")], { delayMs: answerMs })] });
      s.socket("/admin");
      const connect = await s.next("connect", "/admin");
      expect(s.posts()[0]?.body).toBe("40/admin,");
      expect(connect.detail).toBe("sid-admin");
      expect(framesOf(s.posted(), "CONNECT")).toEqual([]);
    });

    it("connect-auth: [SIO5-CN-4] the auth option is the payload of the CONNECT packet", async () => {
      const s = await session(transport, { polls: [connectMain()] });
      s.socket("/", { auth: { token: "123" } });
      await s.next("connect");
      expect(s.posts()[0]?.body).toBe('40{"token":"123"}');
    });

    it("connect-reply: [SIO5-CN-2] a CONNECT packet with a sid connects, and the sid is socket.id", async () => {
      const s = await session(transport, { polls: [connectMain("sid-nsp-1")] });
      const socket = s.socket("/");
      const connect = await s.next("connect");
      expect(connect.detail).toBe("sid-nsp-1");
      expect(socket.id).toBe("sid-nsp-1");
      expect(socket.id).not.toBe(s.handshake.sid);
      expect(socket.connected).toBe(true);
    });

    it("connect-error: [SIO5-CN-3] a CONNECT_ERROR packet gives connect_error with its message and data, and no connect", async () => {
      const refusal: SioPacket = { type: "CONNECT_ERROR", nsp: "/", data: { message: "Not authorized", data: { code: 7 } } };
      const s = await session(transport, { polls: [later(refusal)] });
      const socket = s.socket("/");
      const error = await s.next("connect_error");
      expect(error.detail).toBe("Not authorized");
      expect(error.args).toEqual([{ code: 7 }]);
      expect(socket.connected).toBe(false);
      expect(s.eventsOf("/").filter((event) => event.kind === "connect")).toEqual([]);
    });

    it("connect-first: [SIO5-CN-1] an event emitted before the connection goes out after the CONNECT packet", async () => {
      const s = await session(transport, { polls: [connectMain()] });
      const socket = s.socket("/");
      socket.emit("early", 1);
      await s.next("connect");
      expect(await until(() => framesOf(s.posted(), "EVENT").length > 0, 2_000)).toBe(true);
      const frames = s.posted().frames;
      expect(frames[0]?.packet).toEqual({ type: "CONNECT", nsp: "/" });
      expect(frames.findIndex((frame) => frame?.packet.type === "EVENT")).toBeGreaterThan(0);
      expect(framesOf(s.posted(), "EVENT")[0]?.packet.data).toEqual(["early", 1]);
    });

    it("multiplex: [SIO5-CN-5] [SIO5-PE-4] two namespaces use one handshake and one sid, with one message for each packet", async () => {
      const s = await session(transport, { polls: [connectBoth()] });
      s.socket("/");
      s.socket("/admin");
      await Promise.all([s.next("connect"), s.next("connect", "/admin")]);
      expect(handshakes(s.gets())).toHaveLength(1);
      const sids = new Set([...s.gets(), ...s.posts()].map((request) => queryOf(request.target).get("sid")).filter((sid) => sid !== null));
      expect([...sids]).toEqual([s.handshake.sid]);
      expect(framesOf(s.posted(), "CONNECT")).toHaveLength(1);
      expect(framesOf(s.posted(), "CONNECT", "/admin")).toHaveLength(1);
      expect(s.posted().frames.every((frame) => frame !== undefined)).toBe(true);
    });

    it("receive-event: [SIO5-PE-1] [SIO5-PE-4] the EVENT packet 2[\"hey\",\"Jude\"] gives the event hey with the argument Jude", async () => {
      const s = await session(transport, { polls: [connectMain(), later({ type: "EVENT", nsp: "/", data: ["hey", "Jude"] })] });
      s.socket("/");
      const event = await s.next("event");
      expect(event.detail).toBe("hey");
      expect(event.args).toEqual(["Jude"]);
    });

    it("receive-namespace: [SIO5-CN-5] [SIO5-PE-1] an EVENT packet of /admin goes only to the socket of /admin", async () => {
      const s = await session(transport, { polls: [connectBoth(), later({ type: "EVENT", nsp: "/admin", data: ["bar"] })] });
      s.socket("/");
      s.socket("/admin");
      const event = await s.next("event", "/admin");
      expect(event.detail).toBe("bar");
      expect(event.args).toEqual([]);
      await pause(answerMs);
      expect(s.eventsOf("/").filter((item) => item.kind === "event")).toEqual([]);
    });

    it("send-event: [SIO5-EV-1] [SIO5-PE-2] two events go out as 42[\"hello\"] and 42[\"world\"], in order", async () => {
      const s = await session(transport, { polls: [connectMain()] });
      const socket = s.socket("/");
      await s.next("connect");
      socket.emit("hello");
      socket.emit("world");
      expect(await until(() => framesOf(s.posted(), "EVENT").length >= 2, 2_000)).toBe(true);
      const events = framesOf(s.posted(), "EVENT");
      expect(events.map((frame) => frame.packet.data)).toEqual([["hello"], ["world"]]);
      for (const frame of events) expect(Array.isArray(frame.packet.data) && frame.packet.data.length > 0).toBe(true);
      const texts = postedTexts(s);
      expect(texts.indexOf('42["hello"]')).toBeGreaterThan(-1);
      expect(texts.indexOf('42["world"]')).toBeGreaterThan(texts.indexOf('42["hello"]'));
    });

    it("send-ack: [SIO5-AK-1] an emit with a callback sends an event ID, and the ACK with that ID calls the callback", async () => {
      const s = await session(transport, { polls: [connectMain(), later({ type: "ACK", nsp: "/", id: 0, data: ["bar"] }, 300)] });
      const socket = s.socket("/");
      await s.next("connect");
      const replies: unknown[][] = [];
      socket.emit("foo", (...args: unknown[]) => {
        replies.push(args);
      });
      expect(await until(() => replies.length > 0, 2_000)).toBe(true);
      expect(framesOf(s.posted(), "EVENT")[0]?.packet).toEqual({ type: "EVENT", nsp: "/", id: 0, data: ["foo"] });
      expect(replies).toEqual([["bar"]]);
    });

    it("receive-ack: [SIO5-AK-2] [SIO5-AK-3] the EVENT packet with the event ID 13 gets an ACK packet with the ID 13", async () => {
      const s = await session(transport, { polls: [connectMain(), later({ type: "EVENT", nsp: "/", id: 13, data: ["foo"] })] });
      const socket = s.socket("/");
      socket.on("foo", (ack: (...args: unknown[]) => void) => ack("bar"));
      await s.next("event");
      expect(await until(() => framesOf(s.posted(), "ACK").length > 0, 2_000)).toBe(true);
      expect(framesOf(s.posted(), "ACK")).toEqual([{ packet: { type: "ACK", nsp: "/", id: 13, data: ["bar"] }, attachments: [] }]);
    });

    it("receive-ack-empty: [SIO5-AK-2] [SIO5-AK-3] an acknowledgement with no arguments is the ACK packet 4313[]", async () => {
      const s = await session(transport, { polls: [connectMain(), later({ type: "EVENT", nsp: "/", id: 13, data: ["foo"] })] });
      const socket = s.socket("/");
      socket.on("foo", (ack: () => void) => ack());
      await s.next("event");
      expect(await until(() => framesOf(s.posted(), "ACK").length > 0, 2_000)).toBe(true);
      expect(postedTexts(s)).toContain("4313[]");
    });

    it("send-binary: [SIO5-PE-3] an event with bytes is a BINARY_EVENT packet with a placeholder, and then the bytes", async () => {
      const s = await session(transport, { polls: [connectMain()] });
      const socket = s.socket("/");
      await s.next("connect");
      socket.emit("baz", new Uint8Array([1, 2, 3, 4]));
      expect(await until(() => framesOf(s.posted(), "BINARY_EVENT").length > 0, 2_000)).toBe(true);
      expect(framesOf(s.posted(), "BINARY_EVENT")).toEqual([
        { packet: { type: "BINARY_EVENT", nsp: "/", attachments: 1, data: ["baz", placeholder(0)] }, attachments: [new Uint8Array([1, 2, 3, 4])] },
      ]);
    });

    it("receive-binary: [SIO5-PE-3] a BINARY_EVENT packet and its attachment give an event with the bytes", async () => {
      const frame: SioFrame = { packet: { type: "BINARY_EVENT", nsp: "/", attachments: 1, data: ["baz", placeholder(0)] }, attachments: [new Uint8Array([1, 2, 3])] };
      const s = await session(transport, { polls: [connectMain(), sioReply([frame], { delayMs: answerMs })] });
      s.socket("/");
      const event = await s.next("event");
      expect(event.detail).toBe("baz");
      expect(event.args).toEqual([new Uint8Array([1, 2, 3])]);
    });

    it("receive-binary-namespace: [SIO5-PE-1] [SIO5-PE-3] a BINARY_EVENT packet of /admin with two attachments keeps their order", async () => {
      const frame: SioFrame = {
        packet: { type: "BINARY_EVENT", nsp: "/admin", attachments: 2, data: ["baz", placeholder(0), placeholder(1)] },
        attachments: [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      };
      const s = await session(transport, { polls: [connectBoth(), sioReply([frame], { delayMs: answerMs })] });
      s.socket("/");
      s.socket("/admin");
      const event = await s.next("event", "/admin");
      expect(event.detail).toBe("baz");
      expect(event.args).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    });

    it("binary-ack: [SIO5-AK-2] [SIO5-PE-3] an acknowledgement with bytes is a BINARY_ACK packet with the event ID", async () => {
      const s = await session(transport, { polls: [connectMain(), later({ type: "EVENT", nsp: "/", id: 15, data: ["foo"] })] });
      const socket = s.socket("/");
      socket.on("foo", (ack: (...args: unknown[]) => void) => ack("bar", new Uint8Array([1, 2, 3, 4])));
      await s.next("event");
      expect(await until(() => framesOf(s.posted(), "BINARY_ACK").length > 0, 2_000)).toBe(true);
      expect(framesOf(s.posted(), "BINARY_ACK")).toEqual([
        { packet: { type: "BINARY_ACK", nsp: "/", attachments: 1, id: 15, data: ["bar", placeholder(0)] }, attachments: [new Uint8Array([1, 2, 3, 4])] },
      ]);
    });

    it("send-disconnect: [SIO5-DC-1] disconnect() sends 41/admin, for /admin and 41 for the main namespace", async () => {
      const s = await session(transport, { polls: [connectBoth()] });
      const main = s.socket("/");
      const admin = s.socket("/admin");
      await Promise.all([s.next("connect"), s.next("connect", "/admin")]);
      admin.disconnect();
      expect(await until(() => framesOf(s.posted(), "DISCONNECT", "/admin").length > 0, 2_000)).toBe(true);
      expect(main.connected).toBe(true);
      main.disconnect();
      expect(await until(() => framesOf(s.posted(), "DISCONNECT").length > 0, 2_000)).toBe(true);
      const texts = postedTexts(s);
      expect(texts).toContain("41/admin,");
      expect(texts.indexOf("41")).toBeGreaterThan(texts.indexOf("41/admin,"));
    });

    it("receive-disconnect: [SIO5-DC-1] a DISCONNECT packet gives the reason io server disconnect, and no new CONNECT", async () => {
      const s = await session(transport, { polls: [connectMain(), later({ type: "DISCONNECT", nsp: "/" })] });
      const socket = s.socket("/");
      const disconnect = await s.next("disconnect");
      expect(disconnect.detail).toBe("io server disconnect");
      await pause(500);
      expect(socket.connected).toBe(false);
      expect(framesOf(s.posted(), "CONNECT")).toHaveLength(1);
    });

    it("invalid-event-payload: [SIO5-EV-2] the EVENT packet 2[] closes the connection with the reason parse error", async () => {
      const s = await session(transport, { polls: [connectMain(), later({ type: "EVENT", nsp: "/", data: [] })] });
      s.socket("/");
      const disconnect = await s.next("disconnect");
      expect(disconnect.detail).toBe("parse error");
      expect(await until(() => s.posted().engine.some((packet) => packet.type === "close"), 2_000)).toBe(true);
      expect(s.eventsOf("/").filter((event) => event.kind === "event")).toEqual([]);
    });
  });
});
