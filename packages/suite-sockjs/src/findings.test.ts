// The checks that show known faults of sockjs-client 1.6.1. Each test is `it.fails` with a comment `// client bug:`
// and the identifier of the finding in the catalog. The test passes while the fault stays. When a release of the client
// removes the fault, the test fails. Then change it to `it`, and move the check to the file of its rule.
import { afterEach, describe, expect, it } from "vitest";
import { arrayFrame, clientEscapeUnits, escapableByClient, openFrame, rawUnits, unitRanges } from "./codec.ts";
import {
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

/** This function writes a line of evidence to the log. The record of a CI job keeps it. */
function evidence(text: string): void {
  console.info(`client bug evidence: ${text}`);
}

/**
 * This function waits for a condition of the harness. When the condition stays false, it writes a line to the log and
 * gives false. The check then stops with no error. Thus its `it.fails` test fails, and a fault of the harness is not a pass.
 */
async function ready(check: () => boolean, what: string, limitMs = 5_000): Promise<boolean> {
  if (await until(check, limitMs)) return true;
  console.info(`harness fault: ${what} did not occur in ${limitMs} ms`);
  return false;
}

/** This function gives the events of a session as short texts, for example `close 1000 Normal closure clean=true`. */
function eventTexts(s: Session): readonly string[] {
  return s.events.filter((event) => event.kind !== "heartbeat").map((event) => `${event.kind} ${event.detail}`.trim());
}

/** The events that the WebSocket API of WHATWG gives for close() before the connection opens. */
const failedConnection: readonly string[] = ["error", "close 1006 clean=false"];

/** This function gives the error and close events of a session, with the code and `wasClean` of each close event. */
function endEvents(s: Session): readonly string[] {
  return s.events
    .filter((event) => event.kind === "error" || event.kind === "close")
    .map((event) => {
      if (event.kind === "error") return "error";
      const close = s.closes[0];
      return `close ${String(close?.code)} clean=${String(close?.wasClean)}`;
    });
}

describe.runIf(suiteEnabled)("sockjs-client, the known faults", () => {
  describe.each(transports)("%s", (name) => {
    // client bug: F0069. The client gives each message of an array frame in a loop. The loop does not examine readyState.
    // Thus close() in a listener does not stop the rest of the frame. WHATWG gives no message event after close().
    it.fails("close-in-listener: after close() in a message listener, the rest of the array frame gives no message event", async () => {
      const s = await session({ frames: [openFrame, arrayFrame(["1", "2", "3"])] }, { transports: [name] });
      let closedAt = -1;
      const states: number[] = [];
      s.socket.addEventListener("message", (event) => {
        if (closedAt >= 0) states.push(s.socket.readyState);
        if (event.data === "1") {
          s.socket.close();
          closedAt = s.messages.length;
        }
      });
      if (!(await ready(() => s.closed() !== undefined, "the close event"))) return;
      const after = s.messages.slice(closedAt);
      if (after.length > 0) evidence(`${name}: after close() in the listener of "1", the client gave the messages ${JSON.stringify(after)}, with readyState ${JSON.stringify(states)}`);
      expect(after).toEqual([]);
    });

    // client bug: F0149. The quote function of the client misses 288 code units of escapable_by_client. They are
    // U+007F-U+009F, U+00AD, U+0600-U+0604, U+070F, U+17B4-U+17B5, U+FEFF and most of U+2000-U+20FF.
    it.fails("client-escapes: [SJ-JU-2] the client escapes each code unit of escapable_by_client as \\uXXXX", async () => {
      const units = clientEscapeUnits();
      const s = await session({}, { transports: [name] });
      if (!(await ready(() => s.socket.readyState === 1, "the open event"))) return;
      s.socket.send(String.fromCharCode(...units));
      if (!(await ready(() => s.bodies().length >= 1, "the body of the message"))) return;
      const raw = s.bodies().flatMap((body) => rawUnits(body)).filter(escapableByClient);
      if (raw.length > 0) evidence(`${name}: of ${units.length} code units of escapable_by_client, the client sent ${raw.length} raw: ${unitRanges(raw)}`);
      expect(raw).toEqual([]);
    });
  });

  // client bug: F0092. The client throws InvalidAccessError only for a code that is not 0. Thus close(0) and close(NaN)
  // close the socket with the code 1000. WHATWG throws InvalidAccessError for each code other than 1000 and 3000 to 4999.
  it.fails("close-code-zero: close(0) and close(NaN) throw InvalidAccessError", async () => {
    const results: string[] = [];
    for (const code of [0, Number.NaN]) {
      const s = await session({}, { transports: ["websocket"] });
      if (!(await ready(() => s.socket.readyState === 1, "the open event"))) return;
      try {
        s.socket.close(code);
        await until(() => s.closed() !== undefined, 1_000);
        results.push(`close(${String(code)}) did not throw, then close ${String(s.closed()?.code)}`);
      } catch (error) {
        results.push(`close(${String(code)}) threw ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (results.some((item) => item.includes("did not throw"))) evidence(results.join(", "));
    expect(results.every((item) => item.includes("InvalidAccessError"))).toBe(true);
  });

  // client bug: F0094. close() while /info is pending gives an error event, then close 1000 with wasClean true. WHATWG
  // gives an error event, then close 1006 with wasClean false.
  it.fails("close-connecting-info: close() while /info is pending gives an error event and close 1006 with wasClean false", async () => {
    // The server holds /info for 3 s. The check calls close() after the server gets the request. Thus the request of
    // /info is in progress, and the check does not show F0068.
    const s = await session({ infoReply: { delayMs: 3_000 } }, { transports: ["xhr-polling"] });
    if (!(await ready(() => s.infos().length >= 1, "the request of /info"))) return;
    s.socket.close();
    if (!(await ready(() => s.closed() !== undefined, "the close event"))) return;
    const seen = endEvents(s);
    evidence(`close() while /info is pending gave ${JSON.stringify(eventTexts(s))}, readyState ${s.socket.readyState}`);
    expect(seen).toEqual(failedConnection);
  });

  // client bug: F0094. close() while the transport is connecting gives close 1000 with wasClean true and no error event.
  it.fails("close-connecting-transport: close() before the open frame gives an error event and close 1006 with wasClean false", async () => {
    // The server sends the prelude of xhr_streaming and no open frame. Thus the client stays in CONNECTING.
    const s = await session({ info: { websocket: false }, frames: [] }, { transports: ["xhr-streaming"] });
    if (!(await ready(() => s.receives().length >= 1, "the streaming request"))) return;
    if (!(await ready(() => s.socket.readyState === 0 && s.events.some((event) => event.kind === "heartbeat"), "the prelude"))) return;
    s.socket.close();
    if (!(await ready(() => s.closed() !== undefined, "the close event"))) return;
    const seen = endEvents(s);
    evidence(`close() before the open frame gave ${JSON.stringify(eventTexts(s))}`);
    expect(seen).toEqual(failedConnection);
  });

  // client bug: F0099. The client splits the base URL at each `?`, and it keeps only the first two parts. Thus a query
  // with a second `?` loses its end on each request. RFC 3986 permits `?` in a query.
  it.fails("query-question-mark: each request keeps the query of the base URL, also with a second ? in it", async () => {
    const query = "?next=/home?tab=2&token=abc";
    const s = await session({ frames: [openFrame, arrayFrame(["one"])] }, { transports: ["xhr-polling"], query });
    if (!(await ready(() => s.messages.length >= 1, "the first message"))) return;
    const targets = s.server.requests.map((request) => request.target);
    const changed = targets.filter((target) => !target.endsWith(query));
    if (changed.length > 0) evidence(`the base URL has the query ${query}, and the requests went to ${JSON.stringify([...new Set(targets)])}`);
    expect(changed).toEqual([]);
  });
});
