// The checks of the requests of each client: the fields Accept and Content-Type, the JSON body of POST, and the URL
// query of GET. The scripted server records each request, and the check examines the record.
import { isRecord } from "@mark1russell7/optional/read";
import { describe, expect } from "vitest";
import {
  anonymousQuery,
  check,
  evidence,
  greetQuery,
  literalQuery,
  parseAccept,
  parseContentType,
  parseJson,
  printed,
  queryOf,
  renameMutation,
  responseType,
  suiteEnabled,
  type CheckContext,
  type Mode,
  type Operation,
} from "./harness.test-kit.ts";
import { clientNames } from "./index.ts";
import type { ScriptedRequest } from "@mark1russell7/rigor-testkit/http";

/** The keys of the JSON body of a request, from the section "JSON Encoding" of the spec. */
const requestKeys: ReadonlySet<string> = new Set(["query", "operationName", "variables", "extensions"]);

/** This function sends the operations one after the other to one server, and gives the records of the requests. */
async function requestsOf(context: CheckContext, operations: readonly Operation[], mode: Mode): Promise<readonly ScriptedRequest[] | undefined> {
  const server = await context.server();
  for (const operation of operations) {
    const outcome = await context.run(server, operation, { mode });
    if (!context.need(!outcome.timedOut, `the operation ${operation.operationName ?? "anonymous"} ended in the time limit`)) return undefined;
  }
  if (!context.need(server.requests.length === operations.length, `the server got ${operations.length} requests, not ${server.requests.length}`)) return undefined;
  return server.requests;
}

/** This function gives the one request of a list when it has the method, or `undefined` after a line of the harness. */
function single(context: CheckContext, requests: readonly ScriptedRequest[] | undefined, method: string): ScriptedRequest | undefined {
  if (requests === undefined) return undefined;
  const [request] = requests;
  if (!context.need(request?.method === method, `the client sent ${request?.method ?? "nothing"}, not ${method}`)) return undefined;
  return request;
}

/** This function gives a short text of a request: the method, the target and the fields Accept and Content-Type. */
function describeRequest(request: ScriptedRequest): string {
  return `${request.method} ${request.target} accept=${JSON.stringify(request.fields["accept"])} content-type=${JSON.stringify(request.fields["content-type"])}`;
}

describe.runIf(suiteEnabled)("the requests of the clients", () => {
  describe.each(clientNames)("%s", (client) => {
    check("accept-present", client, "[G1] each request of a query and of a mutation has an Accept field", async (context) => {
      const requests = await requestsOf(context, [greetQuery, renameMutation], "default");
      if (requests === undefined) return;
      evidence(client, "accept-present", requests.map(describeRequest).join(" | "));
      for (const request of requests) expect(request.fields["accept"]?.trim() ?? "").not.toBe("");
    });

    check("accept-graphql-response", client, `[G2] the Accept field of each request has ${responseType}`, async (context) => {
      const requests = await requestsOf(context, [greetQuery, renameMutation], "default");
      if (requests === undefined) return;
      for (const request of requests) {
        expect(parseAccept(request.fields["accept"]).map((range) => range.type)).toContain(responseType);
      }
    });

    check("accept-default", client, `[G3] the Accept field is ${responseType}, application/json;q=0.9`, async (context) => {
      const requests = await requestsOf(context, [greetQuery, renameMutation], "default");
      if (requests === undefined) return;
      const seen = requests.map((request) => parseAccept(request.fields["accept"]).map((range) => `${range.type};q=${range.q}`));
      const expected = [`${responseType};q=1`, "application/json;q=0.9"];
      evidence(client, "accept-default", requests.map((request) => JSON.stringify(request.fields["accept"])).join(" | "));
      for (const ranges of seen) expect([...ranges].sort()).toEqual([...expected].sort());
    });

    check("post-content-type", client, "[G4] a POST request has a Content-Type field", async (context) => {
      const request = single(context, await requestsOf(context, [greetQuery], "post"), "POST");
      if (request === undefined) return;
      expect(request.fields["content-type"]?.trim() ?? "").not.toBe("");
    });

    check("post-json", client, "[G5] the body of a POST request is JSON with Content-Type application/json", async (context) => {
      const request = single(context, await requestsOf(context, [greetQuery], "post"), "POST");
      if (request === undefined) return;
      evidence(client, "post-json", `${describeRequest(request)} body=${request.body}`);
      const type = parseContentType(request.fields["content-type"]);
      expect(type?.type).toBe("application/json");
      const charset = type?.parameters["charset"];
      if (charset !== undefined) expect(charset.toLowerCase()).toBe("utf-8");
      expect(parseJson(request.body).ok).toBe(true);
    });

    check("post-keys", client, "[G6] the JSON body has no keys other than query, operationName, variables and extensions", async (context) => {
      const requests = await requestsOf(context, [greetQuery, anonymousQuery], "post");
      if (requests === undefined) return;
      for (const request of requests) {
        const body = parseJson(request.body);
        if (!context.need(body.ok && isRecord(body.value), `the body ${request.body} is a JSON object`)) return;
        const keys = body.ok && isRecord(body.value) ? Object.keys(body.value) : [];
        expect(keys.filter((key) => !requestKeys.has(key))).toEqual([]);
      }
    });

    check("post-types", client, "[G7] query is a string, operationName a string, variables and extensions objects", async (context) => {
      const requests = await requestsOf(context, [greetQuery, anonymousQuery], "post");
      if (requests === undefined) return;
      evidence(client, "post-types", requests.map((request) => request.body).join(" | "));
      for (const request of requests) {
        const body = parseJson(request.body);
        if (!context.need(body.ok && isRecord(body.value), `the body ${request.body} is a JSON object`)) return;
        const value = body.ok && isRecord(body.value) ? body.value : {};
        expect(typeof value["query"]).toBe("string");
        // The section "JSON Encoding" tells that null for an optional parameter is equal to no parameter.
        if (value["operationName"] != null) expect(typeof value["operationName"]).toBe("string");
        if (value["variables"] != null) expect(isRecord(value["variables"])).toBe(true);
        if (value["extensions"] != null) expect(isRecord(value["extensions"])).toBe(true);
      }
      const named = parseJson(requests[0]?.body ?? "");
      const first = named.ok && isRecord(named.value) ? named.value : {};
      expect(first["variables"]).toEqual(greetQuery.variables);
    });

    check("get-params", client, "[G8] a GET request has query, operationName and variables in the URL query, with variables as JSON", async (context) => {
      const request = single(context, await requestsOf(context, [greetQuery], "get"), "GET");
      if (request === undefined) return;
      evidence(client, "get-params", describeRequest(request));
      const params = queryOf(request.target);
      expect(printed(params.get("query") ?? "")).toBe(printed(greetQuery.query));
      const operationName = params.get("operationName");
      if (operationName !== null && operationName !== "") expect(operationName).toBe(greetQuery.operationName);
      const variables = parseJson(params.get("variables") ?? "");
      expect(variables.ok ? variables.value : "not JSON").toEqual(greetQuery.variables);
      const extensions = params.get("extensions");
      if (extensions !== null && extensions !== "") {
        const parsed = parseJson(extensions);
        expect(parsed.ok && isRecord(parsed.value)).toBe(true);
      }
    });

    check("get-query-text", client, "[G8] the query parameter of GET is the document, also with # and a comma in a string literal", async (context) => {
      const request = single(context, await requestsOf(context, [literalQuery], "get"), "GET");
      if (request === undefined) return;
      const query = queryOf(request.target).get("query") ?? "";
      evidence(client, "get-query-text", `the source ${JSON.stringify(literalQuery.query)} went as query=${JSON.stringify(query)}`);
      expect(printed(query)).toBe(printed(literalQuery.query));
    });

    check("get-no-mutation", client, "[G9] with the option for GET, the client sends a mutation with POST", async (context) => {
      const requests = await requestsOf(context, [renameMutation], "get");
      if (requests === undefined) return;
      evidence(client, "get-no-mutation", requests.map(describeRequest).join(" | "));
      expect(requests.map((request) => request.method)).toEqual(["POST"]);
    });

    check("get-no-mutation-options", client, "[G9] with GET and excludeOperationName, the client sends a mutation with POST", async (context) => {
      const server = await context.server();
      const outcome = await context.run(server, renameMutation, { mode: "get", excludeOperationName: true });
      if (!context.need(!outcome.timedOut, "the operation ended in the time limit")) return;
      if (!context.need(server.requests.length === 1, `the server got 1 request, not ${server.requests.length}`)) return;
      evidence(client, "get-no-mutation-options", server.requests.map(describeRequest).join(" | "));
      expect(server.requests.map((request) => request.method)).toEqual(["POST"]);
    });
  });
});
