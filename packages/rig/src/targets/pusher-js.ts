/**
 * The reply target of the handshake of `pusher-js`. The body of the reply is the first frame of the fake server. The
 * outcome is the state of the client and the number of connections at the end of the window. A second connection
 * shows that the client connects again after the first frame.
 */
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { errorMessage } from "@mark1russell7/text";
import { Worker } from "node:worker_threads";
import type { Outcome } from "../outcome.ts";
import type { SessionInput, SessionReport } from "./pusher-session.ts";
import type { ReplyTarget } from "./target.ts";

/** The version of `pusher-js` in the rig. */
const VERSION = "8.6.0";

/** The time in ms that the worker watches the client. The action `backoff` connects again after 1000 ms. */
const windowMs = 3_000;

/** The time in ms after the window at which the run is a timeout. */
const graceMs = 5_000;

/** This function gives the text of the body of `reply`. */
function frameOf(reply: ScriptedReply): string {
  const { body } = reply;
  if (body === undefined) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  throw new Error("The target of pusher-js takes one frame, not the parts of a body.");
}

/** This function starts one session in a worker and gives its outcome. */
function session(reply: ScriptedReply): Promise<Outcome> {
  const input: SessionInput = { frame: frameOf(reply), windowMs };
  const worker = new Worker(new URL("./pusher-session.ts", import.meta.url), { workerData: input });
  return new Promise<Outcome>((resolve) => {
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve({ kind: "timeout", limitMs: windowMs + graceMs });
    }, windowMs + graceMs);
    worker.once("message", (report: SessionReport) => {
      clearTimeout(timer);
      void worker.terminate();
      const values = [`state=${report.state}`, `connections=${String(report.connections)}`];
      resolve({ kind: "value", values: report.uncaught === undefined ? values : [...values, `uncaught=${report.uncaught}`] });
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      resolve({ kind: "error", name: "WorkerError", code: "worker", message: errorMessage(error) });
    });
  });
}

/** The target of the handshake of `pusher-js`. */
export const pusherHandshakeTarget: ReplyTarget = {
  id: "pusher-js/handshake",
  package: "pusher-js",
  version: VERSION,
  protocol: "pusher",
  call: "stream",
  reply: session,
};

/** Each reply target of `pusher-js`. */
export const pusherReplyTargets: readonly ReplyTarget[] = [pusherHandshakeTarget];
