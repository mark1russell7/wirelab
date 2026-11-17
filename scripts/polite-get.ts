/**
 * The polite reads of the scripts. Each read goes through `send` of `polite-crawler/api`, at the pace of its host. A
 * read tries again after a refusal for the rate, a host that is not available or a network error. The scheduler waits
 * for the time that a refusal asks for before the next try.
 *
 * Shortcut: the tries of a send belong in `polite-crawler/api`, the home of the action for each outcome. It has no
 * send with tries in 0.7.7, so this module keeps the one copy of the scripts. It ends when `polite-crawler/api` gives a
 * send with tries: then the scripts use it, and this module goes.
 */
import { errorMessage } from "@mark1russell7/text";
import { fetchTransport, send, type Reply } from "polite-crawler/api";
import { HostScheduler, realClock } from "polite-crawler/politeness";

/** One read: a URL, its `Accept` header, and how the transport reads the body. The default is `text`. */
export interface Read {
  readonly url: string;
  readonly accept: string;
  readonly read?: "text" | "bytes";
}

/** The reply of a read with the outcome `ok` or `not-found`, or the reason of the last failure. */
export type Got = { readonly reply: Reply } | { readonly reason: string };

/** The options of `politeGet`. */
export interface PoliteGetOptions {
  /** The User-Agent of each request. It names no person and no project. */
  readonly userAgent: string;
  /** The shortest time between two requests to each host. A host that is not in the record gets 1000 ms. */
  readonly intervalMs?: Readonly<Record<string, number>>;
  /** The count of tries of one read. The default is 3. */
  readonly tries?: number;
  readonly log: (text: string) => void;
}

/** The outcomes after which a read tries again. */
const AGAIN = new Set(["rate-limited", "unavailable", "error"]);

/** This function gives a read function with one scheduler, so all reads of a script share the pace of each host. */
export function politeGet(options: PoliteGetOptions): (read: Read, what: string) => Promise<Got> {
  const pace = { scheduler: new HostScheduler(realClock, 3), now: realClock.now };
  const transport = fetchTransport({ userAgent: options.userAgent });
  const tries = options.tries ?? 3;
  return async (read, what) => {
    const { host } = new URL(read.url);
    let reason = "no try";
    for (let attempt = 1; attempt <= tries; attempt += 1) {
      try {
        const exchange = { method: "GET", url: read.url, headers: { accept: read.accept }, body: null, read: read.read ?? "text" };
        const answer = await send(pace, transport, { source: host, host, minIntervalMs: options.intervalMs?.[host] ?? 1000, what, exchange });
        const { outcome } = answer.classified;
        if (outcome === "ok" || outcome === "not-found") return { reply: answer.reply };
        reason = `${outcome} (HTTP ${String(answer.reply.status)})`;
        if (!AGAIN.has(outcome)) break;
      } catch (error) {
        reason = errorMessage(error);
      }
      options.log(`${what}: try ${String(attempt)} failed: ${reason}`);
    }
    return { reason };
  };
}
