// The checks that show known faults of engine.io-client 6.6.8. Each test is `it.fails` with a comment `// client bug:`
// and the identifier of the finding in the catalog. The test passes while the fault stays. When a release of the client
// removes the fault, the test fails. Then change it to `it`, and move the check to `polling.test.ts`.
import { afterEach, describe, expect, it } from "vitest";
import { decodePayload, encodePayload, type Packet } from "./codec.ts";
import {
  accepted,
  bytesOf,
  message,
  pause,
  payload,
  runChild,
  startEngineServer,
  startSession,
  suiteEnabled,
  transports,
  until,
  type ChildReport,
  type Session,
} from "./harness.ts";

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

/** This function gives a short text of the report of a client process, for a line of evidence. */
function summary(report: ChildReport): string {
  const errors = report.uncaught.map((item) => `${item.origin} ${item.name}: ${item.message}`);
  const events = report.events.map((event) => `${event.kind} ${event.detail}`.trim());
  return `the uncaught errors ${JSON.stringify(errors)}, the events ${JSON.stringify(events)} and readyState ${report.readyState}`;
}

/** This function gives true when the client gave an error event or a close event. */
function endsWithEvent(report: ChildReport): boolean {
  return report.events.some((event) => event.kind === "error" || event.kind === "close");
}

/**
 * This function gives the report of a client process, or `undefined` when the process gives no report. A check that
 * gets `undefined` returns with no error. Thus its `it.fails` test fails, and a fault of the harness is not a pass.
 */
async function reportOf(run: Promise<ChildReport>): Promise<ChildReport | undefined> {
  try {
    return await run;
  } catch (error) {
    console.info(`harness fault: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

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

    // client bug: F0029. The client gives the data of the open packet to JSON.parse, and it reads the fields of the
    // result with no check. The error goes out of the callback of the transport, and the client stays "opening".
    // The client starts in a separate process, because an uncaught error stops the worker of the test.
    it.fails("malformed-open: an open packet that is not JSON gives an error or a close, and no uncaught error", async () => {
      const { server } = await startEngineServer({ open: { type: "open", data: "{bad" } });
      try {
        const report = await reportOf(runChild(server.url, transport, { limitMs: 4_000, settleMs: 1_000 }));
        if (report === undefined) return;
        evidence(`F0029 ${transport.name}: the open packet {bad gives ${summary(report)}`);
        expect(report.uncaught).toEqual([]);
        expect(endsWithEvent(report)).toBe(true);
      } finally {
        await server.close();
      }
    });

    // client bug: F0029. An open packet with no fields passes JSON.parse, but the read of its field upgrades throws.
    it.fails("open-no-fields: an open packet {} with no sid gives an error or a close, and no uncaught error", async () => {
      const { server } = await startEngineServer({ open: { type: "open", data: "{}" } });
      try {
        const report = await reportOf(runChild(server.url, transport, { limitMs: 4_000, settleMs: 1_000 }));
        if (report === undefined) return;
        evidence(`F0029 ${transport.name}: the open packet {} gives ${summary(report)}`);
        expect(report.uncaught).toEqual([]);
        expect(endsWithEvent(report)).toBe(true);
      } finally {
        await server.close();
      }
    });
  });

  // client bug: F0026. The Fetch transport reads the body of a poll with res.text(), and that promise has no catch. A cut
  // in the body gives an unhandled rejection, and the polling stops with no error event and no close event.
  it.fails("fetch-body-cut: with Fetch, a cut in the body of a poll gives an error or a close, and no uncaught error", async () => {
    const fetchTransport = transports.find((item) => item.name === "Fetch");
    if (fetchTransport === undefined) return;
    const body = encodePayload([message("first"), message("second")]);
    const half = Math.floor(body.length / 2);
    // The server writes the first half of the body of the first poll, and then it waits. The close of the server cuts it.
    const cutPoll = { fields: { "content-type": "text/plain; charset=UTF-8" }, body: [body.slice(0, half), body.slice(half)], stopAfter: 1 };
    const { server } = await startEngineServer({ polls: [cutPoll] });
    let open = true;
    try {
      const run = reportOf(runChild(server.url, fetchTransport, { limitMs: 6_000, settleMs: 1_000 }));
      const poll = (): number => server.requests.filter((request) => request.method === "GET")[1]?.wire.body ?? 0;
      const sent = await until(() => poll() > 0, 4_000);
      await pause(200);
      open = false;
      await server.close();
      const report = await run;
      // With no first part of the body, the check is not a test of the fault. Then it returns, and the it.fails test fails.
      if (report === undefined || !sent) {
        console.info(`harness fault: F0026 the first part of the poll body went out: ${String(sent)}`);
        return;
      }
      evidence(`F0026 Fetch: a cut after ${String(poll())} bytes of the poll body gives ${summary(report)}`);
      expect(report.uncaught).toEqual([]);
      expect(endsWithEvent(report)).toBe(true);
    } finally {
      if (open) await server.close();
    }
  });
});
