/**
 * The rules, the clients, the checks and the verdicts of the GraphQL over HTTP suite, as data. A rule is one statement
 * of the spec GraphQL over HTTP for the client. A check is one test of the suite for each client, and it names the
 * rules that it examines. A verdict tells the result of a check for one client: a pass, a known fault, or a skip.
 *
 * @packageDocumentation
 */

/** The force of a rule. `MUST`, `MUST NOT` and `SHOULD` come from the spec. `should` is a normative lower-case word. `RFC 9110` is a rule of HTTP that the spec quotes, and `note` is a non-normative note. */
export type RuleLevel = "MUST" | "MUST NOT" | "SHOULD" | "should" | "RFC 9110" | "note";

/** One rule of the spec for the client. */
export interface Rule {
  /** The identifier of the rule, in the form `G<number>`. */
  readonly id: string;
  /** The section of the spec that has the rule. */
  readonly section: string;
  readonly level: RuleLevel;
  /** The rule in plain words. */
  readonly text: string;
}

/** The version of the spec that the rules come from. */
export const specSource: string = "graphql/graphql-over-http, spec/GraphQLOverHTTP.md at commit 2fe5c32";

/** The rules of the spec that the suite examines. */
export const rules: readonly Rule[] = [
  { id: "G1", section: "Accept", level: "MUST", text: "Each request has an `Accept` field." },
  { id: "G2", section: "Accept", level: "MUST", text: "The `Accept` field has the media type `application/graphql-response+json`." },
  { id: "G3", section: "Accept", level: "SHOULD", text: "With no config about the server, the `Accept` field is `application/graphql-response+json, application/json;q=0.9`." },
  { id: "G4", section: "POST", level: "MUST", text: "A POST request has a `Content-Type` field." },
  { id: "G5", section: "POST", level: "SHOULD", text: "By default, the body of a POST request is JSON with `Content-Type: application/json`. A `charset` parameter is permitted." },
  { id: "G6", section: "JSON Encoding", level: "MUST NOT", text: "The body is a JSON object with no keys other than `query`, `operationName`, `variables` and `extensions`." },
  { id: "G7", section: "JSON Encoding", level: "MUST", text: "`query` is a string. `operationName` is a string, and `variables` and `extensions` are objects, when they are present and not `null`." },
  { id: "G8", section: "GET", level: "MUST", text: "A GET request has the parameters in the URL query, in the encoding of `URLSearchParams`. `variables` and `extensions` are JSON texts." },
  { id: "G9", section: "GET", level: "MUST NOT", text: "The client does not send a mutation with GET. The server refuses it." },
  { id: "G10", section: "Status Codes", level: "should", text: "A reply 400 or 422 of the type `application/graphql-response+json` with `errors` gives those GraphQL errors to the caller." },
  { id: "G11", section: "Partial success", level: "RFC 9110", text: "A reply 294 with `data` and `errors` is a reply of the success class. RFC 9110 makes it equal to 200." },
  { id: "G12", section: "Media Types", level: "MUST", text: "The type `application/graphql-response+json` with no `charset` is UTF-8. The client decodes non-ASCII text of the result as UTF-8." },
  { id: "G13", section: "Body", level: "MUST", text: "The client reads the type `application/graphql-response+json` also with parameters, for example `charset=utf-8`, and in each letter case." },
  { id: "G14", section: "Body", level: "SHOULD", text: "A reply 200 of the type `application/json` with a result gives that result to the caller." },
  { id: "G15", section: "Status Codes", level: "note", text: "A reply 4xx or 5xx of a type that is not GraphQL, for example `text/html`, gives an error that holds the HTTP status." },
];

/** The name of a client of the suite: the name of its npm package. */
export type ClientName = "graphql-http" | "graphql-request" | "@urql/core" | "@apollo/client";

/** One client of the suite. */
export interface ClientInfo {
  readonly name: ClientName;
  /** The version that `package.json` pins. */
  readonly version: string;
  /** The part of the package that the suite uses. */
  readonly entry: string;
}

/** The clients of the suite, in the order of the catalog. */
export const clients: readonly ClientInfo[] = [
  { name: "graphql-http", version: "1.23.1", entry: "createClient, the reference client of the spec" },
  { name: "graphql-request", version: "7.4.0", entry: "GraphQLClient and rawRequest, with errorPolicy all" },
  { name: "@urql/core", version: "6.0.3", entry: "Client with fetchExchange alone" },
  { name: "@apollo/client", version: "4.3.8", entry: "ApolloClient with HttpLink, fetchPolicy no-cache and errorPolicy all" },
];

/** The names of the clients of the suite, in order. */
export const clientNames: readonly ClientName[] = clients.map((client) => client.name);

/** The test file of a check. */
export type CheckFile = "requests.test.ts" | "responses.test.ts";

/** One check of the suite. Each client gets one test of the check. */
export interface Check {
  /** The name of the check. The title of each of its tests starts with this name and a colon. */
  readonly id: string;
  /** The rules that the check examines. */
  readonly rules: readonly string[];
  readonly file: CheckFile;
}

/** The checks of the suite. */
export const checks: readonly Check[] = [
  // The checks of the requests of the client.
  { id: "accept-present", rules: ["G1"], file: "requests.test.ts" },
  { id: "accept-graphql-response", rules: ["G2"], file: "requests.test.ts" },
  { id: "accept-default", rules: ["G3"], file: "requests.test.ts" },
  { id: "post-content-type", rules: ["G4"], file: "requests.test.ts" },
  { id: "post-json", rules: ["G5"], file: "requests.test.ts" },
  { id: "post-keys", rules: ["G6"], file: "requests.test.ts" },
  { id: "post-types", rules: ["G7"], file: "requests.test.ts" },
  { id: "get-params", rules: ["G8"], file: "requests.test.ts" },
  { id: "get-query-text", rules: ["G8"], file: "requests.test.ts" },
  { id: "get-no-mutation", rules: ["G9"], file: "requests.test.ts" },
  { id: "get-no-mutation-options", rules: ["G9"], file: "requests.test.ts" },
  // The checks of the replies that the client reads.
  { id: "errors-4xx", rules: ["G10"], file: "responses.test.ts" },
  { id: "partial-294", rules: ["G11"], file: "responses.test.ts" },
  { id: "utf8-default", rules: ["G12"], file: "responses.test.ts" },
  { id: "media-type-parameters", rules: ["G13"], file: "responses.test.ts" },
  { id: "media-type-case", rules: ["G13"], file: "responses.test.ts" },
  { id: "legacy-json", rules: ["G14"], file: "responses.test.ts" },
  { id: "proxy-error", rules: ["G15"], file: "responses.test.ts" },
];

/** The result of a check for one client. */
export type Verdict =
  | { readonly kind: "pass" }
  | { readonly kind: "fails"; readonly finding: string }
  | { readonly kind: "skip"; readonly reason: string };

/** The reason of a skip for the checks of GET of the client of `graphql-http`. */
const postOnly = "the client sends each operation with POST and has no option for GET";

/** The reason of a skip for the check `get-no-mutation-options`. */
const noParseOption = "the client has no option that stops the parse of the operation";

/**
 * The verdicts that are not a pass. A check for a client that is not in this table must pass. A known fault has a
 * comment `// client bug:` with the identifier of the finding in the catalog. Its test is `it.fails`: it passes while
 * the fault stays. When a release removes the fault, the test fails. Then remove the verdict.
 */
export const verdicts: Readonly<Record<string, Readonly<Partial<Record<ClientName, Verdict>>>>> = {
  "accept-default": {
    // client bug: F0208. The client sends `application/graphql-response+json, application/json`, with no weight 0.9.
    "graphql-http": { kind: "fails", finding: "F0208" },
    // client bug: F0211. The client sends `application/graphql-response+json, application/json`, with no weight 0.9.
    "graphql-request": { kind: "fails", finding: "F0211" },
    // client bug: F0212. The client also sends `application/graphql+json`, `text/event-stream` and `multipart/mixed`, each with the weight 1.
    "@urql/core": { kind: "fails", finding: "F0212" },
  },
  "get-params": { "graphql-http": { kind: "skip", reason: postOnly } },
  "get-query-text": {
    "graphql-http": { kind: "skip", reason: postOnly },
    // client bug: F0179. The query cleaner of GET does not skip strings. A `#` in a string cuts the rest of the line.
    "graphql-request": { kind: "fails", finding: "F0179" },
  },
  "get-no-mutation": { "graphql-http": { kind: "skip", reason: postOnly } },
  "get-no-mutation-options": {
    "graphql-http": { kind: "skip", reason: postOnly },
    // client bug: F0176. With `excludeOperationName`, the client does not parse the document, thus it sends a mutation with GET.
    "graphql-request": { kind: "fails", finding: "F0176" },
    "@urql/core": { kind: "skip", reason: noParseOption },
    "@apollo/client": { kind: "skip", reason: noParseOption },
  },
  "errors-4xx": {
    // client bug: F0209. Each reply that is not 2xx gives a NetworkError. The client does not read the GraphQL errors of the body.
    "graphql-http": { kind: "fails", finding: "F0209" },
  },
  "media-type-case": {
    // client bug: F0210. The client compares the media type with a case-sensitive `includes`. A 200 reply gives the error "Unsupported response content-type".
    "graphql-http": { kind: "fails", finding: "F0210" },
    // client bug: F0213. The client compares the media type with a case-sensitive `includes`. A 422 reply gives a ServerError with no GraphQL errors.
    "@apollo/client": { kind: "fails", finding: "F0213" },
  },
};

/** The verdict of a pass. */
const pass: Verdict = { kind: "pass" };

/** This function gives the verdict of a check for a client. The default is a pass. */
export function verdictOf(check: string, client: ClientName): Verdict {
  return verdicts[check]?.[client] ?? pass;
}

export { graphqlPath, jsonReply, okReply, responseType, runClient, type Failure, type Mode, type Operation, type OperationKind, type Outcome, type RunOptions } from "./clients.ts";
export { anonymousQuery, greetQuery, literalQuery, renameMutation } from "./clients.ts";
