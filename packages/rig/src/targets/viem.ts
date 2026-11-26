/**
 * The reply targets of the HTTP transport of `viem`. Each target sends one JSON-RPC call, `eth_sendRawTransaction`, to
 * a scripted server. The release 2.58.0 has F0159. The release 2.58.1 is the first with the fix of `viem` #5578, so it is
 * the fixed side of the same probe.
 */
import { startScriptedServer, type ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import * as base from "viem";
import * as fixed from "viem-2.58.1";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { ReplyTarget } from "./target.ts";

/** The time limit in ms of one call. */
const limitMs = 5_000;

/** The functions of one release of `viem` that a target uses. */
interface Viem {
  readonly createPublicClient: typeof base.createPublicClient;
  readonly http: typeof base.http;
}

/** This function sends one raw transaction with `release` to a server that answers `reply`, and gives the outcome. */
async function sendWith(release: Viem, reply: ScriptedReply): Promise<Outcome> {
  const server = await startScriptedServer({ routes: [{ method: "POST", path: "/", replies: [reply] }] });
  try {
    const client = release.createPublicClient({ transport: release.http(`${server.url}/`, { retryCount: 0 }) });
    // The error of viem has the field `code` only for an RPC error. The name tells the other errors apart.
    return await outcomeOf(async () => [String(await client.sendRawTransaction({ serializedTransaction: "0x02c0" }))], limitMs);
  } finally {
    await server.close();
  }
}

/** This function makes the target of one release of `viem`. */
function target(version: string, release: Viem): ReplyTarget {
  return { id: `viem@${version}/send-raw`, package: "viem", version, protocol: "json-rpc", call: "unary", reply: (reply) => sendWith(release, reply) };
}

/** The target of `viem` 2.58.0, the release with F0159. */
export const viemBaseTarget: ReplyTarget = target("2.58.0", base);

/** The target of `viem` 2.58.1, a release with the fix of F0159. */
export const viemFixedTarget: ReplyTarget = target("2.58.1", fixed as unknown as Viem);

/** Each reply target of `viem`. */
export const viemReplyTargets: readonly ReplyTarget[] = [viemBaseTarget, viemFixedTarget];
