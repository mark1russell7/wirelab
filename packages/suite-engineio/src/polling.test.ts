// The conformance checks of HTTP long-polling. Each check examines each transport of `transports`. The title of each
// test starts with the id of its check in `src/index.ts`, and names the rules that it examines.
import { afterEach, describe, expect, it } from "vitest";
import { decodePayload, encodePayload, type Packet } from "./codec.ts";
import { accepted, active, bytesOf, largest, message, pause, payload, queryOf, startSession, suiteEnabled, transports, until, type Session } from "./harness.ts";

const sessions: Session[] = [];

async function session(...parts: Parameters<typeof startSession>): Promise<Session> {
  const started = await startSession(...parts);
  sessions.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

const ping: Packet = { type: "ping", data: "" };
const noop: Packet = { type: "noop", data: "" };
const close: Packet = { type: "close", data: "" };
const unicode = "héllo wörld ✓ 😀";

describe.runIf(suiteEnabled)("engine.io-client over HTTP long-polling", () => {
  describe.each(transports)("$name", (transport) => {
    it("handshake: [EIO4-HS-1] the first request has EIO=4 and transport=polling, and no sid", async () => {
      const s = await session(transport);
      await s.opened();
      const query = queryOf(s.gets()[0]?.target ?? "");
      expect(query.get("EIO")).toBe("4");
      expect(query.get("transport")).toBe("polling");
      expect(query.has("sid")).toBe(false);
      expect(s.socket.id).toBe(s.handshake.sid);
    });

    it("sid: [EIO4-HS-2] each request after the handshake has the sid of the open packet", async () => {
      const s = await session(transport, { polls: [payload([message("one")])] });
      await s.opened();
      s.socket.send("hello");
      expect(await until(() => s.gets().length >= 3 && s.posts().length >= 1, 3_000)).toBe(true);
      const later = s.server.requests.slice(1);
      expect(later.length).toBeGreaterThanOrEqual(3);
      for (const request of later) expect(queryOf(request.target).get("sid")).toBe(s.handshake.sid);
    });

    it("receive: [EIO4-PE-1] [EIO4-PT-3] the client gives each message of one payload, in order", async () => {
      const s = await session(transport, { polls: [payload([message("one"), message("two"), message("three")])] });
      await s.opened();
      expect(await until(() => s.messages.length >= 3, 3_000)).toBe(true);
      expect(s.messages).toEqual(["one", "two", "three"]);
    });

    it("receive-binary: [EIO4-PE-2] the client decodes a b-packet as bytes", async () => {
      const packet = message(new Uint8Array([1, 2, 3]));
      expect(encodePayload([packet])).toBe("bAQID");
      const s = await session(transport, { polls: [payload([packet])] });
      await s.opened();
      expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
      expect(s.messages).toEqual([new Uint8Array([1, 2, 3])]);
    });

    it("receive-utf8: [EIO4-PE-3] the client decodes the text of a message as UTF-8", async () => {
      const s = await session(transport, { polls: [payload([message(unicode)])] });
      await s.opened();
      expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
      expect(s.messages).toEqual([unicode]);
    });

    it("send: [EIO4-LP-3] the client sends a message in the body of a POST request", async () => {
      const s = await session(transport);
      await s.opened();
      s.socket.send("one");
      expect(await until(() => s.posts().length >= 1, 3_000)).toBe(true);
      const post = s.posts()[0];
      expect(post?.body).toBe("4one");
      expect(post?.fields["content-type"]).toMatch(/^text\/plain/i);
    });

    it("send-batch: [EIO4-LP-2] [EIO4-PE-1] the client waits for the active POST, then sends the next packets in one payload", async () => {
      const s = await session(transport, { posts: [{ ...accepted, delayMs: 400 }, accepted] });
      await s.opened();
      const most = largest(() => active(s.posts()), 1_000);
      s.socket.send("a");
      s.socket.send("b");
      s.socket.send("c");
      expect(await until(() => s.posts().length >= 2, 3_000)).toBe(true);
      expect(await most).toBeLessThanOrEqual(1);
      expect(s.posts().map((post) => post.body)).toEqual(["4a", "4b\x1e4c"]);
    });

    it("send-binary: [EIO4-PE-2] the client sends bytes as a b-packet", async () => {
      const s = await session(transport);
      await s.opened();
      s.socket.send(new Uint8Array([1, 2, 3]));
      expect(await until(() => s.posts().length >= 1, 3_000)).toBe(true);
      expect(s.posts()[0]?.body).toBe("bAQID");
    });

    it("send-utf8: [EIO4-PE-3] the client sends the text of a message as UTF-8", async () => {
      const s = await session(transport);
      await s.opened();
      s.socket.send(unicode);
      expect(await until(() => s.posts().length >= 1, 3_000)).toBe(true);
      expect(s.posts()[0]?.body).toBe(`4${unicode}`);
    });

    it("one-get: [EIO4-LP-1] while the server holds a GET request, the client starts no other GET request", async () => {
      const s = await session(transport, { polls: [payload([noop], { delayMs: 1_500 })] });
      await s.opened();
      expect(await until(() => s.gets().length >= 2, 2_000)).toBe(true);
      const most = largest(() => active(s.gets()), 1_000);
      s.socket.send("while the GET is held");
      expect(await most).toBe(1);
      expect(s.gets()).toHaveLength(2);
    });

    it("ping: [EIO4-HB-1] the client answers a ping packet with a pong packet", async () => {
      const s = await session(transport, { handshake: { pingInterval: 300, pingTimeout: 1_000 }, polls: [payload([ping], { delayMs: 300 })] });
      await s.opened();
      expect(await until(() => s.posted().some((packet) => packet?.type === "pong"), 3_000)).toBe(true);
      expect(s.posts().map((post) => post.body)).toContain("3");
      expect(s.closed()).toBeUndefined();
    });

    it("ping-timeout: [EIO4-HB-2] with no ping in pingInterval plus pingTimeout, the client closes", async () => {
      const s = await session(transport, { handshake: { pingInterval: 200, pingTimeout: 200 } });
      const openAt = await s.opened();
      expect(await until(() => s.closed() !== undefined, 3_000)).toBe(true);
      const after = (s.closed()?.at ?? 0) - openAt;
      expect(after).toBeGreaterThanOrEqual(350);
      expect(after).toBeLessThan(2_000);
    });

    it("ping-reset: [EIO4-HB-2] each ping of the server keeps the client open", async () => {
      const pings = Array.from({ length: 6 }, () => payload([ping], { delayMs: 250 }));
      const s = await session(transport, { handshake: { pingInterval: 250, pingTimeout: 400 }, polls: pings });
      const openAt = await s.opened();
      await until(() => s.elapsed() - openAt >= 1_200, 2_000);
      expect(s.closed()).toBeUndefined();
      expect(s.posts().filter((post) => post.body === "3").length).toBeGreaterThanOrEqual(3);
    });

    it("max-payload: [EIO4-MP-1] a payload of two or more text messages has no more than maxPayload bytes", async () => {
      const s = await session(transport, { handshake: { maxPayload: 60 }, posts: [{ ...accepted, delayMs: 300 }, accepted] });
      await s.opened();
      // Each message has 20 UTF-8 bytes. The first message holds the transport, thus the client joins the others.
      const sent = Array.from({ length: 6 }, (_, i) => `m${i}${"ü".repeat(9)}`);
      s.socket.send("first");
      for (const text of sent) s.socket.send(text);
      expect(await until(() => s.posted().length >= 7, 5_000)).toBe(true);
      expect(s.posted().map((packet) => packet?.data)).toEqual(["first", ...sent]);
      expect(s.posts().some((post) => decodePayload(post.body).length >= 2)).toBe(true);
      for (const post of s.posts()) {
        if (decodePayload(post.body).length >= 2) expect(bytesOf(post.body)).toBeLessThanOrEqual(60);
      }
    });

    it("close-packet: [EIO4-PT-1] a close packet of the server closes the client, and the client sends no more requests", async () => {
      const s = await session(transport, { polls: [payload([close], { delayMs: 100 })] });
      await s.opened();
      expect(await until(() => s.closed() !== undefined, 3_000)).toBe(true);
      expect(s.socket.readyState).toBe("closed");
      const count = s.server.requests.length;
      await pause(300);
      expect(s.server.requests).toHaveLength(count);
    });

    it("noop: [EIO4-PT-2] a noop packet gives no message", async () => {
      const s = await session(transport, { polls: [payload([noop]), payload([message("after")])] });
      await s.opened();
      expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
      await pause(100);
      expect(s.messages).toEqual(["after"]);
    });

    it("client-close: [EIO4-PT-1] close() of the client sends a close packet", async () => {
      const s = await session(transport);
      await s.opened();
      s.socket.close();
      expect(await until(() => s.posted().some((packet) => packet?.type === "close"), 3_000)).toBe(true);
      expect(s.closed()).toBeDefined();
    });
  });
});
