/**
 * The helpers of the tests: a scripted GraphQL server, the four clients behind one call, and the records of the
 * requests. Each test gives a list of replies to the server. Thus each test controls each byte that the client gets,
 * and the same check examines each client.
 */
import { ApolloClient, CombinedGraphQLErrors, HttpLink, InMemoryCache, gql } from "@apollo/client";
import { startScriptedServer, type ScriptedReply, type ScriptedRequest, type ScriptedServer } from "@mark1russell7/rigor-testkit/http";
import { Client as UrqlClient, fetchExchange } from "@urql/core";
import { parse, print } from "graphql";
import { createClient } from "graphql-http";
import { ClientError, GraphQLClient } from "graphql-request";
import { it } from "vitest";
import { verdictOf, type ClientName } from "./index.ts";

/**
 * This value is true when the environment variable `SUITE_GRAPHQL_HTTP` is `1`. The checks of the clients start only
 * then. The suite is not a gate, thus the shared CI examines only the data.
 */
export const suiteEnabled: boolean = process.env["SUITE_GRAPHQL_HTTP"] === "1";

/** The path of the GraphQL endpoint of the scripted server. */
export const graphqlPath: string = "/graphql";

/** The media type of a GraphQL response, from the section "Media Types" of the spec. */
export const responseType: string = "application/graphql-response+json";

/** The time limit in ms of one operation of a client. */
const limitMs = 5_000;

/** The kind of a GraphQL operation that the suite sends. */
export type OperationKind = "query" | "mutation";

/** One GraphQL operation, as the caller gives it to a client. */
export interface Operation {
  readonly kind: OperationKind;
  /** The source text of the document. */
  readonly query: string;
  /** The name of the operation in the document, or `undefined` for an anonymous operation. */
  readonly operationName?: string;
  readonly variables?: Readonly<Record<string, unknown>>;
}

/**
 * A named query with a variable. The value of the variable has the characters `+`, space, `&`, `=`, `/` and `é`. Thus
 * a check of GET sees a wrong encoding of the URL query.
 */
export const greetQuery: Operation = {
  kind: "query",
  query: "query Greet($name: String!) {\n  hello(name: $name)\n}",
  operationName: "Greet",
  variables: { name: "a+b c&d=e/é" },
};

/** An anonymous query with no variables. */
export const anonymousQuery: Operation = { kind: "query", query: "{ hello }" };

/** A named query with a string literal that holds `#`, a comma and two spaces. A comment starts with `#` only outside a string. */
export const literalQuery: Operation = {
  kind: "query",
  query: 'query Tips {\n  search(text: "C# tips, and  more")\n}',
  operationName: "Tips",
};

/** A named mutation with a variable. */
export const renameMutation: Operation = {
  kind: "mutation",
  query: "mutation Rename($name: String!) {\n  rename(name: $name)\n}",
  operationName: "Rename",
  variables: { name: "new name" },
};

/**
 * How a client sends a query. `default` uses the options of the client with no change. `post` and `get` use the
 * documented option of the client that selects the method. A mutation in the mode `get` checks that the client does not
 * use GET for it.
 */
export type Mode = "default" | "post" | "get";

/** The options of one operation of a client. */
export interface RunOptions {
  readonly mode?: Mode;
  /** The option `excludeOperationName` of `graphql-request`. The other clients do not have it. */
  readonly excludeOperationName?: boolean;
}

/** The failure that a client gives to the caller. */
export interface Failure {
  /** The name of the error class, for example `NetworkError`. */
  readonly name: string;
  /** The message of the error, cut to 300 characters. */
  readonly message: string;
  /** The HTTP status that the error gives in a field, or `undefined`. */
  readonly status: number | undefined;
}

/** What the caller gets from one operation of a client. */
export interface Outcome {
  /** The data of the result, or `undefined`. */
  readonly data: unknown;
  /** The messages of the GraphQL errors that the caller gets. */
  readonly errors: readonly string[];
  /** The error of the operation, other than the GraphQL errors, or `undefined`. */
  readonly failure: Failure | undefined;
  /** True when the client gave nothing in the time limit. */
  readonly timedOut: boolean;
}

/** This function gives the messages of a list of GraphQL errors, or an empty list for a value that is not a list. */
function messagesOf(errors: unknown): readonly string[] {
  if (!Array.isArray(errors)) return [];
  return errors.map((item: unknown) => {
    if (typeof item === "object" && item !== null && "message" in item) return String(item.message);
    return JSON.stringify(item);
  });
}

/** This function gives the record of an error. `status` is the HTTP status that the error holds, if it holds one. */
function failureOf(error: unknown, status: number | undefined): Failure {
  if (error instanceof Error) return { name: error.constructor.name, message: error.message.slice(0, 300), status };
  return { name: typeof error, message: String(error).slice(0, 300), status };
}

/** This function gives a number field of an object, or `undefined`. */
function numberField(value: unknown, ...path: readonly string[]): number | undefined {
  let item: unknown = value;
  for (const key of path) {
    if (typeof item !== "object" || item === null) return undefined;
    item = (item as Record<string, unknown>)[key];
  }
  return typeof item === "number" ? item : undefined;
}

/** The outcome of an operation that gave nothing in the time limit. */
const timedOut: Outcome = { data: undefined, errors: [], failure: undefined, timedOut: true };

/** This function sends an operation of the reference client of `graphql-http`. The client sends each operation with POST. */
async function runGraphqlHttp(url: string, operation: Operation): Promise<Outcome> {
  const client = createClient({ url, shouldRetry: () => Promise.resolve(false) });
  try {
    return await new Promise<Outcome>((resolve) => {
      let result: unknown;
      client.subscribe(
        {
          query: operation.query,
          ...(operation.operationName === undefined ? {} : { operationName: operation.operationName }),
          ...(operation.variables === undefined ? {} : { variables: { ...operation.variables } }),
        },
        {
          next: (value) => {
            result = value;
          },
          error: (error: unknown) => resolve({ data: undefined, errors: [], failure: failureOf(error, numberField(error, "response", "status")), timedOut: false }),
          complete: () => {
            const value = (result ?? {}) as { data?: unknown; errors?: unknown };
            resolve({ data: value.data ?? undefined, errors: messagesOf(value.errors), failure: undefined, timedOut: false });
          },
        },
      );
    });
  } finally {
    client.dispose();
  }
}

/**
 * This function sends an operation of `graphql-request` with `rawRequest`. The option `errorPolicy: "all"` gives the
 * data and the GraphQL errors of a reply together.
 */
async function runGraphqlRequest(url: string, operation: Operation, options: RunOptions): Promise<Outcome> {
  const client = new GraphQLClient(url, {
    method: options.mode === "get" ? "GET" : "POST",
    errorPolicy: "all",
    ...(options.excludeOperationName === true ? { excludeOperationName: true } : {}),
  });
  try {
    const result = await client.rawRequest<unknown>(operation.query, operation.variables === undefined ? undefined : { ...operation.variables });
    return { data: result.data ?? undefined, errors: messagesOf(result.errors), failure: undefined, timedOut: false };
  } catch (error) {
    if (error instanceof ClientError) {
      return { data: error.response.data ?? undefined, errors: messagesOf(error.response.errors), failure: failureOf(error, error.response.status), timedOut: false };
    }
    return { data: undefined, errors: [], failure: failureOf(error, undefined), timedOut: false };
  }
}

/** The option `preferGetMethod` of urql for each mode. With no option, urql sends a query with GET when the URL is short. */
const urqlPreferGet: Readonly<Record<Mode, false | "force" | undefined>> = { default: undefined, post: false, get: "force" };

/** This function sends an operation of `@urql/core` with `fetchExchange` alone, thus with no cache. */
async function runUrql(url: string, operation: Operation, options: RunOptions): Promise<Outcome> {
  const preferGetMethod = urqlPreferGet[options.mode ?? "default"];
  const client = new UrqlClient({ url, exchanges: [fetchExchange], ...(preferGetMethod === undefined ? {} : { preferGetMethod }) });
  const variables = { ...operation.variables };
  const result = operation.kind === "mutation" ? await client.mutation(operation.query, variables).toPromise() : await client.query(operation.query, variables).toPromise();
  const error = result.error;
  return {
    data: result.data ?? undefined,
    errors: messagesOf(error?.graphQLErrors),
    failure: error?.networkError === undefined ? undefined : failureOf(error.networkError, numberField(error.response, "status")),
    timedOut: false,
  };
}

/**
 * This function sends an operation of `@apollo/client` through `HttpLink`, with `fetchPolicy: "no-cache"` and
 * `errorPolicy: "all"`. Thus the cache does not answer, and the caller gets the data and the errors together.
 */
async function runApollo(url: string, operation: Operation, options: RunOptions): Promise<Outcome> {
  const client = new ApolloClient({ link: new HttpLink({ uri: url, useGETForQueries: options.mode === "get" }), cache: new InMemoryCache() });
  const document = gql(operation.query);
  const variables = { ...operation.variables };
  try {
    const result: { data?: unknown; error?: unknown } =
      operation.kind === "mutation"
        ? await client.mutate({ mutation: document, variables, errorPolicy: "all", fetchPolicy: "no-cache" })
        : await client.query({ query: document, variables, errorPolicy: "all", fetchPolicy: "no-cache" });
    const error = result.error;
    if (error === undefined) return { data: result.data ?? undefined, errors: [], failure: undefined, timedOut: false };
    if (CombinedGraphQLErrors.is(error)) return { data: result.data ?? undefined, errors: messagesOf(error.errors), failure: undefined, timedOut: false };
    return { data: result.data ?? undefined, errors: [], failure: failureOf(error, numberField(error, "statusCode")), timedOut: false };
  } catch (error) {
    return { data: undefined, errors: [], failure: failureOf(error, numberField(error, "statusCode")), timedOut: false };
  } finally {
    client.stop();
  }
}

/** This function sends one operation of a client against a URL. It gives the outcome, and it does not throw. */
export async function runClient(client: ClientName, url: string, operation: Operation, options: RunOptions = {}): Promise<Outcome> {
  const run = async (): Promise<Outcome> => {
    switch (client) {
      case "graphql-http":
        return runGraphqlHttp(url, operation);
      case "graphql-request":
        return runGraphqlRequest(url, operation, options);
      case "@urql/core":
        return runUrql(url, operation, options);
      case "@apollo/client":
        return runApollo(url, operation, options);
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => resolve(timedOut), limitMs);
  });
  try {
    return await Promise.race([run().catch((error: unknown) => ({ data: undefined, errors: [], failure: failureOf(error, undefined), timedOut: false })), limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** This function gives a reply with a JSON body. The default status is 200, and the default media type is `responseType` with `charset=utf-8`. */
export function jsonReply(body: unknown, status = 200, contentType = `${responseType}; charset=utf-8`): ScriptedReply {
  return { status, fields: { "content-type": contentType }, body: JSON.stringify(body) };
}

/** The reply of a query of the suite: the status 200 and a result with data. */
export const okReply: ScriptedReply = jsonReply({ data: { hello: "world", search: "found", rename: "done" } });

/**
 * This function starts a scripted server with the endpoint `graphqlPath` for GET and POST. Each method gets the list of
 * replies in its order. Thus the first GET request and the first POST request get the first reply.
 */
export async function startGraphqlServer(replies: readonly ScriptedReply[] = [okReply]): Promise<GraphqlServer> {
  const queue = [...replies];
  const server = await startScriptedServer({
    routes: [
      { method: "GET", path: graphqlPath, replies: queue },
      { method: "POST", path: graphqlPath, replies: queue },
    ],
  });
  return new GraphqlServer(server);
}

/** A scripted GraphQL server and its records. */
export class GraphqlServer {
  readonly #server: ScriptedServer;

  constructor(server: ScriptedServer) {
    this.#server = server;
  }

  /** The URL of the GraphQL endpoint. */
  get url(): string {
    return `${this.#server.url}${graphqlPath}`;
  }

  /** The records of the requests, in order. */
  get requests(): readonly ScriptedRequest[] {
    return this.#server.requests;
  }

  /** This method stops the server. */
  close(): Promise<void> {
    return this.#server.close();
  }
}

/** One media range of an `Accept` field: the type in lower case, the weight `q` and the other parameters. */
export interface MediaRange {
  readonly type: string;
  readonly q: number;
  readonly parameters: Readonly<Record<string, string>>;
}

/** This function parses an `Accept` field into its media ranges, as RFC 9110 section 12.5.1 tells. A missing weight is 1. */
export function parseAccept(field: string | undefined): readonly MediaRange[] {
  if (field === undefined || field.trim() === "") return [];
  return field
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => {
      const [type = "", ...rest] = item.split(";").map((part) => part.trim());
      const parameters: Record<string, string> = {};
      for (const part of rest) {
        const equals = part.indexOf("=");
        if (equals > 0) parameters[part.slice(0, equals).trim().toLowerCase()] = part.slice(equals + 1).trim().replace(/^"|"$/g, "");
      }
      const { q, ...others } = parameters;
      return { type: type.toLowerCase(), q: q === undefined ? 1 : Number(q), parameters: others };
    });
}

/** The media type of a `Content-Type` field in lower case, and its parameters with lower-case names. */
export interface MediaType {
  readonly type: string;
  readonly parameters: Readonly<Record<string, string>>;
}

/** This function parses a `Content-Type` field, or gives `undefined` for a missing field. */
export function parseContentType(field: string | undefined): MediaType | undefined {
  if (field === undefined) return undefined;
  const [range] = parseAccept(field);
  if (range === undefined) return undefined;
  return { type: range.type, parameters: range.parameters };
}

/** This function parses a JSON text. It gives `{ ok: false }` for a text that is not JSON. */
export function parseJson(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * This function gives the printed form of a GraphQL document. Two texts of the same document give the same printed
 * form. A text that does not parse gives `parse error:` and the message.
 */
export function printed(text: string): string {
  try {
    return print(parse(text));
  } catch (error) {
    return `parse error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** This function gives the parameters of the URL query of a target, decoded as `URLSearchParams` decodes them. */
export function queryOf(target: string): URLSearchParams {
  return new URL(target, "http://localhost").searchParams;
}

/** This function writes a line of evidence to the log. The record of a CI job keeps it. */
export function evidence(client: ClientName, check: string, text: string): void {
  console.info(`evidence: ${client} ${check}: ${text}`);
}

/** The context of the body of one check. */
export interface CheckContext {
  readonly client: ClientName;
  /** True when the check shows a known fault of the client, thus when its test is `it.fails`. */
  readonly fault: boolean;
  /**
   * This method examines a condition of the harness, for example that the server got one request. When the condition
   * is false, a check of a known fault writes a line to the log and gives false. Then the check stops with no error,
   * thus its `it.fails` test fails, and a fault of the harness is not a pass. Another check throws.
   */
  need(condition: boolean, what: string): boolean;
  /** This method starts a scripted server. The test closes it at its end. */
  server(replies?: readonly ScriptedReply[]): Promise<GraphqlServer>;
  /** This method sends one operation of the client of the check. */
  run(server: GraphqlServer, operation: Operation, options?: RunOptions): Promise<Outcome>;
}

/**
 * This function declares the test of one check for one client. The verdict in `verdicts` of `index.ts` selects the
 * test. A pass gives `it`, and a known fault gives `it.fails`. A rule that does not apply gives `it.skip` with its reason.
 */
export function check(id: string, client: ClientName, title: string, body: (context: CheckContext) => Promise<void>): void {
  const verdict = verdictOf(id, client);
  const name = `${id}: ${title}`;
  if (verdict.kind === "skip") {
    it.skip(`${name} (skipped: ${verdict.reason})`, () => undefined);
    return;
  }
  const fault = verdict.kind === "fails";
  const test = async (): Promise<void> => {
    const servers: GraphqlServer[] = [];
    const context: CheckContext = {
      client,
      fault,
      need: (condition, what) => {
        if (condition) return true;
        if (!fault) throw new Error(`harness fault: ${what}`);
        console.info(`harness fault: ${client} ${id}: ${what}`);
        return false;
      },
      server: async (replies) => {
        const started = await startGraphqlServer(replies);
        servers.push(started);
        return started;
      },
      run: (server, operation, options) => runClient(client, server.url, operation, options),
    };
    try {
      await body(context);
    } finally {
      await Promise.all(servers.map((item) => item.close()));
    }
  };
  if (fault) it.fails(`${name} (known fault ${verdict.finding})`, test);
  else it(name, test);
}
