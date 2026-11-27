/**
 * The reply targets of the GraphQL clients over HTTP. The drivers of `@wirelab/suite-graphql-http` send one query of
 * each client to a scripted server. The server answers with the reply of the case. A target of the batch call of
 * `graphql-request` sends two queries in one request.
 *
 * The outcome of a call gives the GraphQL errors first. When the caller gets at least one GraphQL error, the code is
 * `graphql-errors`. When the caller gets only a failure, the code is the HTTP status of the failure, or `failure`.
 */
import { startScriptedServer, type ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { anonymousQuery, clients, graphqlPath, runClient, type ClientName, type Outcome as SuiteOutcome } from "@wirelab/suite-graphql-http";
import { ClientError, GraphQLClient } from "graphql-request";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { CauseTarget, ReplyTarget } from "./target.ts";

/** The code of an outcome in which the caller gets the GraphQL errors of the reply. */
export const GRAPHQL_ERRORS = "graphql-errors";

/** The time limit in ms of one call. The drivers of the suite have a limit of 5000 ms. */
const limitMs = 6_000;

/** This function gives the outcome of the rig for the outcome of a driver of the suite. */
export function outcomeOfSuite(got: SuiteOutcome): Outcome {
  if (got.timedOut) return { kind: "timeout", limitMs };
  if (got.errors.length > 0) return { kind: "error", name: got.failure?.name ?? "GraphQLErrors", code: GRAPHQL_ERRORS, message: got.errors.join("; ") };
  if (got.failure !== undefined) {
    const code = got.failure.status === undefined ? "failure" : `HTTP ${String(got.failure.status)}`;
    return { kind: "error", name: got.failure.name, code, message: got.failure.message };
  }
  return { kind: "value", values: [JSON.stringify(got.data ?? null)] };
}

/** This function starts a scripted server that answers `reply` at `graphqlPath`, and gives the outcome of `use`. */
async function withServer(reply: ScriptedReply, use: (url: string) => Promise<Outcome>): Promise<Outcome> {
  const server = await startScriptedServer({
    routes: [
      { method: "POST", path: graphqlPath, replies: [reply] },
      { method: "GET", path: graphqlPath, replies: [reply] },
    ],
  });
  try {
    return await use(`${server.url}${graphqlPath}`);
  } finally {
    await server.close();
  }
}

/** This function makes the target of one client of the suite. The call is the query `{ hello }` with POST. */
function clientTarget(name: ClientName, version: string): ReplyTarget {
  return {
    id: `${name}/query`,
    package: name,
    version,
    protocol: "graphql-over-http",
    call: "unary",
    reply: (reply) => withServer(reply, async (url) => outcomeOfSuite(await runClient(name, url, anonymousQuery, { mode: "post" }))),
  };
}

/** The number of the GraphQL errors in a value, or 0 for a value that is not a list. */
const errorCount = (errors: unknown): number => (Array.isArray(errors) ? errors.length : 0);

/** The target of the batch call of `graphql-request`: `batchRequests` with two queries. */
export const graphqlRequestBatchTarget: ReplyTarget = {
  id: "graphql-request/batch",
  package: "graphql-request",
  version: "7.4.0",
  protocol: "graphql-over-http",
  call: "unary",
  reply: (reply) =>
    withServer(reply, (url) =>
      outcomeOf(async () => {
        const client = new GraphQLClient(url);
        try {
          const results = await client.batchRequests([{ document: "{ a }" }, { document: "{ b }" }]);
          return results.map((one) => JSON.stringify(one));
        } catch (error) {
          if (!(error instanceof ClientError)) throw error;
          // The errors of a batch reply are in `response.errors`, or in the items of a list.
          const { response } = error as { readonly response: unknown };
          const items: readonly unknown[] = Array.isArray(response) ? response : [response];
          const count = items.reduce<number>((sum, item) => sum + errorCount((item as { readonly errors?: unknown } | null)?.errors), 0);
          if (count > 0) throw Object.assign(new Error(error.message.slice(0, 200)), { name: "ClientError", code: GRAPHQL_ERRORS });
          throw Object.assign(new Error(error.message.slice(0, 200)), { name: "ClientError", code: "failure" });
        }
      }, limitMs),
    ),
};

/** The JSON serializer of the cause target: it sends a BigInt as its decimal text. */
const bigIntSerializer = {
  stringify: (value: unknown): string => JSON.stringify(value, (_, one: unknown) => (typeof one === "bigint" ? one.toString() : one)),
  parse: (text: string): unknown => JSON.parse(text),
};

/**
 * The cause target of F0182: a GraphQL error in the reply of `request`. With a number variable, the caller gets
 * `ClientError`. With a BigInt variable, the constructor of `ClientError` throws a `TypeError` from `JSON.stringify`.
 */
export const graphqlRequestBigIntTarget: CauseTarget = {
  id: "graphql-request/bigint-variable",
  package: "graphql-request",
  version: "7.4.0",
  state: "open",
  step: "JSON.stringify of the request (BigInt, cycle)",
  reference: "a GraphQL error in the reply, with the variable n: 1",
  trigger: "a GraphQL error in the reply, with the variable n: 1n",
  run: (input) =>
    withServer({ status: 200, fields: { "content-type": "application/json" }, body: JSON.stringify({ data: null, errors: [{ message: "nope" }] }) }, (url) =>
      outcomeOf(async () => {
        const client = new GraphQLClient(url, { jsonSerializer: bigIntSerializer });
        await client.request("query ($n: Int) { a(n: $n) }", { n: input === "reference" ? 1 : 1n });
        return ["data"];
      }, limitMs),
    ),
};

/** The ids of the query targets of the GraphQL clients, in the order of the suite. */
export const graphqlQueryTargetIds: readonly string[] = clients.map((client) => `${client.name}/query`);

/** The reply targets of the GraphQL clients: one query target for each client of the suite, and the batch target. */
export const graphqlReplyTargets: readonly ReplyTarget[] = [...clients.map((client) => clientTarget(client.name, client.version)), graphqlRequestBatchTarget];
