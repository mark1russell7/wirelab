// The conformance checks of one transport, or of the transports on HTTP. The title of each test starts with the id of
// its check in `src/index.ts`, and names the rules that it examines.
import { afterEach, describe, expect, it } from "vitest";
import { arrayFrame, openFrame } from "./codec.ts";
import {
  active,
  httpTransports,
  largest,
  pathOf,
  pause,
  sessionPath,
  startSession,
  suiteEnabled,
  until,
  type Session,
  type SessionScript,
  type TransportName,
} from "./harness.ts";

const sessions: Session[] = [];

async function session(name: TransportName, script: SessionScript): Promise<Session> {
  const started = await startSession(script, { transports: [name] });
  sessions.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

/** This function gives the messages of one WebSocket message of the client: a JSON string, or a JSON array of strings. */
function messagesOfJson(body: string): readonly string[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value as string[];
  return undefined;
}

describe.runIf(suiteEnabled)("sockjs-client, the transports", () => {
  describe.each(httpTransports)("%s", (name) => {
    it("xhr-send: [SJ-XP-1] the client sends its messages in POST requests to xhr_send, as JSON arrays of strings", async () => {
      const s = await session(name, {});
      await s.opened();
      s.socket.send("one");
      s.socket.send("two");
      s.socket.send("three");
      expect(await until(() => s.sent().length >= 3, 3_000)).toBe(true);
      expect(s.sends().length).toBeGreaterThanOrEqual(1);
      for (const request of s.sends()) expect(pathOf(request.target)).toBe(`${sessionPath}/xhr_send`);
      expect(s.bodies().every((body) => Array.isArray(JSON.parse(body)))).toBe(true);
      expect(s.sent()).toEqual(["one", "two", "three"]);
    });

    it("one-receiver: [SJ-PF-6] the client has no more than one receiving request at a time", async () => {
      const frames = [openFrame, ...Array.from({ length: 6 }, (_, index) => arrayFrame([`m${index}`]))];
      const s = await session(name, { frames, next: [arrayFrame(["last"])], gapMs: 80 });
      await s.opened();
      const most = await largest(() => active(s.receives()), 1_200);
      expect(await until(() => s.messages.length >= 7, 3_000)).toBe(true);
      // A streaming transport opens its second receiving request after the end of the first.
      expect(s.receives().length).toBeGreaterThanOrEqual(2);
      expect(most).toBe(1);
    });
  });

  it("streaming-prelude: [SJ-XS-1] the prelude of xhr_streaming gives no message, and the open frame after it opens the client", async () => {
    const s = await session("xhr-streaming", { frames: [openFrame, arrayFrame(["after"])], gapMs: 50 });
    await s.opened();
    expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
    await pause(100);
    expect(s.messages).toEqual(["after"]);
    expect(s.closed()).toBeUndefined();
  });

  it("streaming-limit: [SJ-XS-2] after the server ends a streaming request, the client opens a new one on the same session", async () => {
    const s = await session("xhr-streaming", { frames: [openFrame, arrayFrame(["one"])], next: [arrayFrame(["two"])] });
    await s.opened();
    expect(await until(() => s.messages.length >= 2, 3_000)).toBe(true);
    expect(s.messages).toEqual(["one", "two"]);
    expect(s.receives().map((request) => pathOf(request.target))).toEqual([`${sessionPath}/xhr_streaming`, `${sessionPath}/xhr_streaming`]);
    expect(s.events.filter((event) => event.kind === "open")).toHaveLength(1);
    expect(s.socket.readyState).toBe(1);
  });

  it("eventsource-prelude: [SJ-ES-1] the prelude of eventsource gives no message, and the open frame after it opens the client", async () => {
    const s = await session("eventsource", { frames: [openFrame, arrayFrame(["after"])], gapMs: 50 });
    await s.opened();
    expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
    await pause(100);
    expect(s.messages).toEqual(["after"]);
    expect(s.closed()).toBeUndefined();
  });

  it("eventsource-limit: [SJ-ES-2] after the server ends an eventsource request, the client opens a new one on the same session", async () => {
    const s = await session("eventsource", { frames: [openFrame, arrayFrame(["one"])], next: [arrayFrame(["two"])] });
    await s.opened();
    expect(await until(() => s.messages.length >= 2, 3_000)).toBe(true);
    expect(s.messages).toEqual(["one", "two"]);
    expect(s.receives().map((request) => pathOf(request.target))).toEqual([`${sessionPath}/eventsource`, `${sessionPath}/eventsource`]);
    expect(s.events.filter((event) => event.kind === "open")).toHaveLength(1);
    expect(s.socket.readyState).toBe(1);
  });

  it("ws-send: [SJ-WS-1] each WebSocket message of the client is JSON: one message, or an array of messages", async () => {
    const s = await session("websocket", {});
    await s.opened();
    s.socket.send("one");
    s.socket.send('two "2"');
    expect(await until(() => s.bodies().length >= 2, 3_000)).toBe(true);
    const parsed = s.bodies().map(messagesOfJson);
    expect(parsed.every((item) => item !== undefined)).toBe(true);
    expect(parsed.flatMap((item) => item ?? [])).toEqual(["one", 'two "2"']);
    expect(s.sends()).toHaveLength(0);
  });
});
