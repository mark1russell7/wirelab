/**
 * The four GraphQL clients behind one call, and the replies of a scripted server. The tests of the suite and the
 * reply targets of `@wirelab/rig` use these functions. This module does not import `vitest`.
 */
import { ApolloClient, CombinedGraphQLErrors, HttpLink, InMemoryCache, gql } from "@apollo/client";
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { Client as UrqlClient, fetchExchange } from "@urql/core";
import { createClient } from "graphql-http";
import { ClientError, GraphQLClient } from "graphql-request";
import type { ClientName } from "./index.ts";

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
