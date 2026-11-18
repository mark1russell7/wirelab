// The conformance checks of the info request and of the top session URL. The title of each test starts with the id of
// its check in `src/index.ts`, and names the rules that it examines.
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { afterEach, describe, expect, it } from "vitest";
import { arrayFrame, heartbeatFrame, openFrame } from "./codec.ts";
import {
  pause,
  serverId,
  sessionId,
  sessionPartsOf,
  startSession,
  suiteEnabled,
  transports,
  until,
  type ClientOptions,
  type Session,
  type SessionScript,
} from "./harness.ts";

const sessions: Session[] = [];

async function session(script: SessionScript, client: ClientOptions): Promise<Session> {
  const started = await startSession(script, client);
  sessions.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

/** The reply to a request that no route matches: the server holds the request. Thus the client stays in its first request. */
const held: ScriptedReply = { fields: { "content-type": "application/javascript; charset=UTF-8" }, body: `${heartbeatFrame}\n`, delayMs: 30_000 };

describe.runIf(suiteEnabled)("sockjs-client, the info request and the top session URL", () => {
  it.each(transports)("info-first: [SJ-IN-1] the client requests /info, and it waits for the reply before the session starts, %s", async (name) => {
    const s = await session({ infoReply: { delayMs: 500 } }, { transports: [name] });
    expect(await until(() => s.infos().length >= 1, 3_000)).toBe(true);
    // The server holds the reply of /info for 500 ms. A client that does not wait starts the session in this time.
    await pause(300);
    expect(s.targets()).toEqual([]);
    await s.opened();
    expect(s.infos()).toHaveLength(1);
    expect(s.targets().length).toBeGreaterThan(0);
  });

  it("info-websocket-off: [SJ-IN-2] with websocket false in the info, the client uses the next transport", async () => {
    const off = await session({ info: { websocket: false } }, { transports: ["websocket", "xhr-polling"] });
    await off.opened();
    expect(off.socket.transport).toBe("xhr-polling");
    expect(off.webSockets()).toHaveLength(0);
    // With websocket true, the same client uses WebSocket. Thus the check can fail.
    const on = await session({}, { transports: ["websocket", "xhr-polling"] });
    await on.opened();
    expect(on.socket.transport).toBe("websocket");
    expect(on.webSockets()).toHaveLength(1);
  });

  it("default-ids: [SJ-SU-1] [SJ-SU-2] with its defaults, the client chooses a server_id of three digits and a different session_id for each session", async () => {
    const started = await Promise.all([0, 1, 2, 3].map(() => session({ unmatched: held }, { transports: ["xhr-polling"], defaultIds: true })));
    expect(await until(() => started.every((s) => s.receives().length >= 1), 5_000)).toBe(true);
    const parts = started.map((s) => sessionPartsOf(s.receives()[0]?.target ?? ""));
    for (const part of parts) {
      expect(part?.serverId).toMatch(/^\d{3}$/);
      expect(part?.sessionId.length ?? 0).toBeGreaterThan(0);
      expect(part?.transport).toBe("xhr");
    }
    expect(new Set(parts.map((part) => part?.sessionId)).size).toBe(parts.length);
  });

  it.each(transports)("session-id: [SJ-SU-3] each request of the session has the same session_id, %s", async (name) => {
    const s = await session({ frames: [openFrame, arrayFrame(["one"])], next: [arrayFrame(["two"])] }, { transports: [name] });
    await s.opened();
    s.socket.send("x");
    expect(await until(() => s.messages.length >= 2 && s.sent().length >= 1, 5_000)).toBe(true);
    const parts = s.targets().map(sessionPartsOf);
    // An HTTP transport has two receiving requests or more, and one request of xhr_send.
    expect(parts.length).toBeGreaterThanOrEqual(name === "websocket" ? 1 : 3);
    for (const part of parts) expect(part).toMatchObject({ serverId, sessionId });
    expect(s.sessionIdCalls()).toBe(1);
  });

  it.each(transports)("session-hidden: [SJ-SU-4] no public field and no event of the client gives the session_id, %s", async (name) => {
    const s = await session({ frames: [openFrame, arrayFrame(["one"])] }, { transports: [name] });
    await s.opened();
    expect(await until(() => s.messages.length >= 1, 3_000)).toBe(true);
    // The client uses the session_id on the wire. Thus the check can fail.
    expect(s.targets().some((target) => target.includes(sessionId))).toBe(true);
    const visible = Object.entries(s.socket).filter(([key]) => !key.startsWith("_"));
    const text = JSON.stringify([visible, s.socket.url, s.socket.protocol, s.socket.extensions, s.socket.transport, s.events]);
    expect(text).not.toContain(sessionId);
  });
});
