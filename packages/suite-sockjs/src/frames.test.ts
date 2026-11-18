// The conformance checks of the frames of the server. Each check examines each transport of the suite with the same
// script of frames. The title of each test starts with the id of its check in `src/index.ts`, and names its rules.
import { afterEach, describe, expect, it } from "vitest";
import { arrayFrame, closeFrame, heartbeatFrame, openFrame } from "./codec.ts";
import { pause, startSession, suiteEnabled, transports, until, type Session, type SessionScript, type TransportName } from "./harness.ts";

const sessions: Session[] = [];

async function session(name: TransportName, script: SessionScript): Promise<Session> {
  const started = await startSession(script, { transports: [name] });
  sessions.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

/** This function gives the text of a list of code units. */
function text(...codes: readonly number[]): string {
  return String.fromCodePoint(...codes);
}

/**
 * The strings of the Unicode checks. The first has letters from other scripts and a character outside the BMP. The
 * second has the characters of `escapable_by_server`, a quote, a backslash and a new line. The first also has `%`
 * sequences, because the EventSource receiver of the client gives each data to `decodeURI`.
 */
const unicode: readonly string[] = [
  `h${text(0xe9)}llo w${text(0xf6)}rld ${text(0x2713)} ${text(0x1f600)} ${text(0x4e2d, 0x6587)} ${text(0x0627, 0x0644)} 100% %41 %zz %25`,
  `a${text(0x00)}b${text(0x1f)}c${text(0x200c)}d${text(0x2028)}e${text(0x2029)}f${text(0x2060)}g${text(0xfff0)}h${text(0xffff)} "q" \\ \n end`,
];

describe.runIf(suiteEnabled)("sockjs-client, the frames of the server", () => {
  describe.each(transports)("%s", (name) => {
    it("open: [SJ-PF-1] the client opens on the open frame, and not before", async () => {
      const s = await session(name, { openDelayMs: 400 });
      expect(await until(() => s.receives().length + s.webSockets().length >= 1, 3_000)).toBe(true);
      // The server sends the open frame 400 ms after the start of the request.
      await pause(200);
      expect(s.socket.readyState).toBe(0);
      expect(s.events.filter((event) => event.kind === "open")).toEqual([]);
      await s.opened();
      expect(s.socket.readyState).toBe(1);
      expect(s.socket.transport).toBe(name);
    });

    it("heartbeat: [SJ-PF-2] a heartbeat frame gives no message, and the session stays open", async () => {
      const s = await session(name, { frames: [openFrame, heartbeatFrame, arrayFrame(["after"])], gapMs: 50 });
      await s.opened();
      expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
      await pause(100);
      expect(s.messages).toEqual(["after"]);
      expect(s.events.filter((event) => event.kind === "heartbeat").length).toBeGreaterThanOrEqual(1);
      expect(s.socket.readyState).toBe(1);
    });

    it("messages: [SJ-PF-3] each message of each array frame gives one message event, in order", async () => {
      const s = await session(name, { frames: [openFrame, arrayFrame(["one", 'two "2"']), arrayFrame(["three", "[4]"])], gapMs: 50 });
      await s.opened();
      expect(await until(() => s.messages.length >= 4, 3_000)).toBe(true);
      await pause(100);
      expect(s.messages).toEqual(["one", 'two "2"', "three", "[4]"]);
    });

    it("close-frame: [SJ-PF-4] a close frame closes the client with its code and its reason", async () => {
      const s = await session(name, { frames: [openFrame, closeFrame(3000, "Go away!")], gapMs: 50 });
      await s.opened();
      expect(await until(() => s.closed() !== undefined, 3_000)).toBe(true);
      expect(s.closed()).toMatchObject({ code: 3000, reason: "Go away!", wasClean: true });
      expect(s.socket.readyState).toBe(3);
    });

    it("close-once: [SJ-PF-5] a second close frame gives no second close event", async () => {
      const s = await session(name, { frames: [openFrame, closeFrame(3000, "Go away!"), closeFrame(3000, "Go away!")], gapMs: 50 });
      await s.opened();
      expect(await until(() => s.closed() !== undefined, 3_000)).toBe(true);
      await pause(300);
      expect(s.closes).toHaveLength(1);
      expect(s.events.filter((event) => event.kind === "error")).toEqual([]);
    });

    it("unicode-receive: [SJ-JU-1] each message from the server arrives with no change, and the escapes of the server are decoded", async () => {
      const s = await session(name, { frames: [openFrame, arrayFrame(unicode)] });
      await s.opened();
      expect(await until(() => s.messages.length >= unicode.length, 3_000)).toBe(true);
      expect(s.messages).toEqual(unicode);
    });

    it("unicode-send: [SJ-JU-1] each message of the client arrives at the server with no change", async () => {
      const s = await session(name, {});
      await s.opened();
      for (const item of unicode) s.socket.send(item);
      expect(await until(() => s.sent().length >= unicode.length, 3_000)).toBe(true);
      expect(s.sent()).toEqual(unicode);
    });
  });
});
