/**
 * The helpers of the tests: a scripted GraphQL server, the four clients behind one call, and the records of the
 * requests. Each test gives a list of replies to the server. Thus each test controls each byte that the client gets,
 * and the same check examines each client.
 */
import { startScriptedServer, type ScriptedReply, type ScriptedRequest, type ScriptedServer } from "@mark1russell7/rigor-testkit/http";
import { parse, print } from "graphql";
import { it } from "vitest";
import { graphqlPath, okReply, runClient, type Operation, type Outcome, type RunOptions } from "./clients.ts";
import { verdictOf, type ClientName } from "./index.ts";

export * from "./clients.ts";

/**
 * This value is true when the environment variable `SUITE_GRAPHQL_HTTP` is `1`. The checks of the clients start only
 * then. The suite is not a gate, thus the shared CI examines only the data.
 */
export const suiteEnabled: boolean = process.env["SUITE_GRAPHQL_HTTP"] === "1";

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
