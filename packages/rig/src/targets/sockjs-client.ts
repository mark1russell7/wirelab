/**
 * The targets of `sockjs-client`: one target for each transport of the client. The scripted SockJS server of
 * `@wirelab/suite-sockjs` sends the frames of each case. The WebSocket API of WHATWG gives no message event and no
 * second close event after the start of a close. So the target records each event when `readyState` is not `OPEN`.
 */
import { arrayFrame, closeFrame, openFrame, startSession, transports, until, type TransportName } from "@wirelab/suite-sockjs";
import type { SessionCase, SessionRun, SessionTarget } from "./target.ts";

/** The package and the version of the targets. The version is the version that the workspace installs. */
export const SOCKJS_CLIENT = { package: "sockjs-client", version: "1.6.1" } as const;

/** The value of `readyState` of an open client. */
const OPEN = 1;

/** The time in ms that the target waits for late events after the close event. */
const settleMs = 150;

/** The cases of each transport. The variant is the transport. */
function casesOf(transport: TransportName): SessionCase[] {
  const at = (after: SessionCase["after"], frame: SessionCase["frame"]): SessionCase => ({ after, frame, direction: "inbound", variant: transport });
  return [
    at("local close()", "message batch"),
    at("local close()", "data"),
    at("end-of-stream frame", "data"),
    at("end-of-stream frame", "trailer"),
    at("second end-of-stream", "data"),
  ];
}

/**
 * This function gives the frames of the server for a case. The first message is `1`. Each item after the end has
 * the text `late`. A local close is a call of close() in the listener of the message `1`.
 */
export function framesOf(one: SessionCase): readonly string[] {
  const end = closeFrame(3000, "end");
  if (one.after === "local close()") return one.frame === "message batch" ? [openFrame, arrayFrame(["1", "late", "late"])] : [openFrame, arrayFrame(["1"]), arrayFrame(["late"])];
  if (one.after === "end-of-stream frame") return [openFrame, arrayFrame(["1"]), end, one.frame === "trailer" ? closeFrame(3001, "late") : arrayFrame(["late"])];
  return [openFrame, arrayFrame(["1"]), end, end, arrayFrame(["late"])];
}

/** This function starts one case on one transport and records its items. */
async function runCase(transport: TransportName, one: SessionCase): Promise<SessionRun> {
  const s = await startSession({ frames: framesOf(one) }, { transports: [transport] });
  try {
    if (one.after === "local close()") {
      s.socket.addEventListener("message", (event) => {
        if (event.data === "1") s.socket.close();
      });
    }
    await until(() => s.closed() !== undefined, 5_000);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const messages = s.events.filter((event) => event.kind === "message");
    const closes = s.events.filter((event) => event.kind === "close");
    return {
      before: messages.filter((event) => event.readyState === OPEN).map((event) => `message ${event.detail}`),
      after: [...messages.filter((event) => event.readyState !== OPEN).map((event) => `message ${event.detail}`), ...closes.slice(1).map((event) => `close ${event.detail}`)],
    };
  } finally {
    await s.end();
  }
}

/** The targets of `sockjs-client`, one for each transport. */
export const sockjsClientTargets: readonly SessionTarget[] = transports.map((transport) => ({
  id: `sockjs-client/${transport}`,
  ...SOCKJS_CLIENT,
  format: "text-frame-headers",
  cases: casesOf(transport),
  run: (one) => runCase(transport, one),
}));
