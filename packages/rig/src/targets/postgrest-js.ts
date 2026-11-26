/**
 * The reply targets of `@supabase/postgrest-js`. A target sends one select to a scripted server: a GET with rows, or a
 * HEAD that counts the rows. The select uses `throwOnError()`, so the outcome is an error only when the client throws.
 */
import { startScriptedServer, type ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { PostgrestClient } from "@supabase/postgrest-js";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { ReplyTarget } from "./target.ts";

/** The version of `@supabase/postgrest-js` in the rig. */
const VERSION = "2.119.2";

/** The time limit in ms of one call. */
const limitMs = 5_000;

/** This function sends one select of `orders`, with `head` for a count with HEAD, and gives the outcome. */
async function selectWith(head: boolean, reply: ScriptedReply): Promise<Outcome> {
  const server = await startScriptedServer({ routes: [{ method: head ? "HEAD" : "GET", path: "/orders", replies: [reply] }] });
  try {
    const client = new PostgrestClient(server.url);
    return await outcomeOf(async () => {
      const result = await client
        .from("orders")
        .select("*", head ? { count: "exact", head: true } : {})
        .throwOnError();
      return [JSON.stringify({ status: result.status, data: result.data ?? null, count: result.count ?? null })];
    }, limitMs);
  } finally {
    await server.close();
  }
}

/** The target of a select with GET. */
export const postgrestSelectTarget: ReplyTarget = {
  id: "postgrest-js/select",
  package: "@supabase/postgrest-js",
  version: VERSION,
  protocol: "postgrest",
  call: "unary",
  reply: (reply) => selectWith(false, reply),
};

/** The target of a count with HEAD. */
export const postgrestHeadTarget: ReplyTarget = { ...postgrestSelectTarget, id: "postgrest-js/count-head", reply: (reply) => selectWith(true, reply) };

/** Each reply target of `@supabase/postgrest-js`. */
export const postgrestReplyTargets: readonly ReplyTarget[] = [postgrestSelectTarget, postgrestHeadTarget];
