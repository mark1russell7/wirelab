// The checks of the replies that each client reads: the status codes, the media types and the charset of a result.
// The scripted server gives one reply, and the check examines what the caller gets from the client.
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { describe, expect } from "vitest";
import { check, evidence, greetQuery, jsonReply, responseType, suiteEnabled, type CheckContext, type Outcome } from "./harness.ts";
import { clientNames } from "./index.ts";

/** A result with data and no errors. */
const dataResult = { data: { hello: "world" } };

/** The message of the GraphQL error of a request error result. */
const requestError = 'Variable "$name" of required type "String!" was not provided.';

/** A request error result: errors and no data. */
const errorResult = { errors: [{ message: requestError }] };

/** This function runs `greetQuery` against a server with one reply, and gives the outcome, or `undefined` after the time limit. */
async function outcomeOf(context: CheckContext, reply: ScriptedReply): Promise<Outcome | undefined> {
  const server = await context.server([reply]);
  const outcome = await context.run(server, greetQuery);
  if (!context.need(!outcome.timedOut, `the client ended the operation for the status ${reply.status ?? 200} in the time limit`)) return undefined;
  if (!context.need(server.requests.length === 1, `the server got 1 request, not ${server.requests.length}`)) return undefined;
  return outcome;
}

/** This function gives the parts of an outcome that the caller uses: the data, the GraphQL errors and the class of the failure. */
function seen(outcome: Outcome): { readonly data: unknown; readonly errors: readonly string[]; readonly failure: string | undefined } {
  return { data: outcome.data, errors: outcome.errors, failure: outcome.failure?.name };
}

/** This function gives a short text of an outcome for the log. */
function text(outcome: Outcome): string {
  const failure = outcome.failure === undefined ? "none" : `${outcome.failure.name} status=${String(outcome.failure.status)} "${outcome.failure.message.slice(0, 120)}"`;
  return `data=${JSON.stringify(outcome.data)} errors=${JSON.stringify(outcome.errors)} failure=${failure}`;
}

describe.runIf(suiteEnabled)("the replies that the clients read", () => {
  describe.each(clientNames)("%s", (client) => {
    check("errors-4xx", client, `[G10] a reply 400 or 422 of ${responseType} gives its GraphQL errors to the caller`, async (context) => {
      for (const status of [400, 422]) {
        const outcome = await outcomeOf(context, jsonReply(errorResult, status));
        if (outcome === undefined) return;
        evidence(client, "errors-4xx", `status ${status}: ${text(outcome)}`);
        expect(outcome.errors).toContain(requestError);
      }
    });

    check("partial-294", client, "[G11] a reply 294 with data and errors gives the data and the errors, as a reply 200 does", async (context) => {
      const body = { data: { hello: "world" }, errors: [{ message: "partial", path: ["other"] }] };
      const partial = await outcomeOf(context, jsonReply(body, 294));
      const ok = await outcomeOf(context, jsonReply(body, 200));
      if (partial === undefined || ok === undefined) return;
      evidence(client, "partial-294", `294: ${text(partial)} | 200: ${text(ok)}`);
      expect(partial.data).toEqual(body.data);
      expect(partial.errors).toContain("partial");
      expect(seen(partial)).toEqual(seen(ok));
    });

    check("utf8-default", client, `[G12] ${responseType} with no charset gives non-ASCII text as UTF-8`, async (context) => {
      const hello = "héllo wörld ✓ 你好 😀";
      const outcome = await outcomeOf(context, jsonReply({ data: { hello } }, 200, responseType));
      if (outcome === undefined) return;
      expect(outcome.data).toEqual({ hello });
    });

    check("media-type-parameters", client, `[G13] ${responseType}; charset=utf-8 gives the same outcome as ${responseType}`, async (context) => {
      for (const [status, body] of [
        [200, dataResult],
        [422, errorResult],
      ] as const) {
        const withParameter = await outcomeOf(context, jsonReply(body, status, `${responseType}; charset=utf-8`));
        const plain = await outcomeOf(context, jsonReply(body, status, responseType));
        if (withParameter === undefined || plain === undefined) return;
        if (status === 200) expect(withParameter.data).toEqual(dataResult.data);
        expect(seen(withParameter)).toEqual(seen(plain));
      }
    });

    check("media-type-case", client, "[G13] Application/GraphQL-Response+JSON gives the same outcome as the lower-case type", async (context) => {
      // RFC 9110, section 8.3.1: the type and the subtype of a media type are case-insensitive.
      const upper = "Application/GraphQL-Response+JSON";
      for (const [status, body] of [
        [200, dataResult],
        [422, errorResult],
      ] as const) {
        const changed = await outcomeOf(context, jsonReply(body, status, upper));
        const plain = await outcomeOf(context, jsonReply(body, status, responseType));
        if (changed === undefined || plain === undefined) return;
        evidence(client, "media-type-case", `status ${status}: ${upper}: ${text(changed)} | ${responseType}: ${text(plain)}`);
        expect(seen(changed)).toEqual(seen(plain));
      }
    });

    check("legacy-json", client, "[G14] a reply 200 of application/json with a result gives the result", async (context) => {
      const outcome = await outcomeOf(context, jsonReply(dataResult, 200, "application/json"));
      if (outcome === undefined) return;
      expect(outcome.data).toEqual(dataResult.data);
      expect(outcome.failure).toBeUndefined();
    });

    check("proxy-error", client, "[G15] a reply 502 of text/html gives an error that holds the status 502", async (context) => {
      // The body has no digits. Thus a message that holds 502 got it from the status, not from the body.
      const reply: ScriptedReply = { status: 502, fields: { "content-type": "text/html; charset=utf-8" }, body: "<html><body>Bad gateway</body></html>" };
      const outcome = await outcomeOf(context, reply);
      if (outcome === undefined) return;
      evidence(client, "proxy-error", text(outcome));
      expect(outcome.failure).toBeDefined();
      const failure = outcome.failure;
      expect(failure?.status === 502 || /\b502\b/.test(failure?.message ?? "")).toBe(true);
    });
  });
});
