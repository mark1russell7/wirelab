/**
 * Each reply target of the rig. A reply probe gets this list, and it starts each case on the target of its id.
 */
import { connectWebReplyTargets } from "./connect-web.ts";
import { graphqlReplyTargets } from "./graphql-over-http.ts";
import { postgrestReplyTargets } from "./postgrest-js.ts";
import type { ReplyTarget } from "./target.ts";
import { viemReplyTargets } from "./viem.ts";

/** Each reply target of the rig: `@connectrpc/connect-web`, the GraphQL clients, `viem` and `@supabase/postgrest-js`. */
export const replyTargets: readonly ReplyTarget[] = [...connectWebReplyTargets, ...graphqlReplyTargets, ...viemReplyTargets, ...postgrestReplyTargets];
