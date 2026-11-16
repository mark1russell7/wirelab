// The checks that show known faults of engine.io-client 6.6.8. Each test is `it.fails` with a comment `// client bug:`
// and the identifier of the finding in the catalog. The test passes while the fault stays. When a release of the client
// removes the fault, the test fails. Then change it to `it`, and move the check to `polling.test.ts`.
import { afterEach, describe, expect, it } from "vitest";
import { decodePayload, type Packet } from "./codec.ts";
import { accepted, bytesOf, pause, payload, startSession, suiteEnabled, transports, until, type Session } from "./harness.ts";

const sessions: Session[] = [];

async function session(...parts: Parameters<typeof startSession>): Promise<Session> {
  const started = await startSession(...parts);
  sessions.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

/** This function writes a line of evidence to the log. The record of a CI job keeps it. */
function evidence(text: string): void {
  console.info(`client bug evidence: ${text}`);
}

const noop: Packet = { type: "noop", data: "" };

describe.runIf(suiteEnabled)("engine.io-client over HTTP long-polling", () => {
  describe.each(transports)("$name", (transport) => {
    // client bug: F0024. The client counts 1.33 bytes for each byte of binary data. Base64 gives 4 bytes for each 3 bytes,
    // and each packet has the character `b`. Thus a payload of binary messages is larger than maxPayload.
    it.fails("max-payload-binary: [EIO4-MP-1] a payload of two or more binary messages has no more than maxPayload bytes", async () => {
      const s = await session(transport, { handshake: { maxPayload: 100 }, posts: [{ ...accepted, delayMs: 300 }, accepted] });
      await s.opened();
      s.socket.send("x");
      for (let i = 0; i < 30; i += 1) s.socket.send(new Uint8Array([i]));
      expect(await until(() => s.posted().length >= 31, 5_000)).toBe(true);
      const joined = s.posts().filter((post) => decodePayload(post.body).length >= 2);
      evidence(`F0024 ${transport.name}: the sizes of the payloads with two or more packets are ${joined.map((post) => bytesOf(post.body)).join(", ")} bytes, with maxPayload 100`);
      expect(joined.length).toBeGreaterThan(0);
      for (const post of joined) expect(bytesOf(post.body)).toBeLessThanOrEqual(100);
    });

    // client bug: F0028. The client gives pingInterval plus pingTimeout to setTimeout. Node.js changes a delay larger
    // than 2^31-1 ms to 1 ms, thus the client closes with "ping timeout" at once.
    it.fails("long-ping-interval: [EIO4-HB-2] with a pingInterval of 2^31-1 ms, the client stays open", async () => {
      const s = await session(transport, { handshake: { pingInterval: 2 ** 31 - 1, pingTimeout: 20_000 } });
      await s.opened();
      await pause(1_000);
      evidence(`F0028 ${transport.name}: the close event is ${JSON.stringify(s.closed() ?? null)}`);
      expect(s.closed()).toBeUndefined();
    });

    // client bug: F0030. The transports NodeXHR and Fetch do not use the option requestTimeout. A request with no reply
    // stays active, and the client gives no error.
    it.fails("request-timeout: with requestTimeout 500 ms, a handshake reply after 2500 ms gives an error or a close in 1500 ms", async () => {
      const s = await session(transport, { openReply: { delayMs: 2_500 } }, { requestTimeout: 500 });
      await pause(1_500);
      evidence(`F0030 ${transport.name}: the events in 1500 ms are ${JSON.stringify(s.events)}`);
      expect(s.events.some((event) => event.kind === "error" || event.kind === "close")).toBe(true);
    });

    // client bug: F0031. close() does not stop the active GET request. The request stays open until the server answers,
    // thus the server sends the whole reply to a closed client.
    it.fails("close-aborts-poll: close() stops the active GET request", async () => {
      const s = await session(transport, { polls: [payload([noop], { delayMs: 800 })] });
      await s.opened();
      expect(await until(() => s.gets().length >= 2, 2_000)).toBe(true);
      s.socket.close();
      await pause(1_000);
      const held = s.gets()[1];
      evidence(`F0031 ${transport.name}: the held GET has the wire record ${JSON.stringify(held?.wire ?? null)}`);
      expect(held?.wire.whole).toBe(false);
    });
  });
});
