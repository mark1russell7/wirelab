import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeClock } from "@mark1russell7/algebra/clock";
import { openCrawler } from "polite-crawler";
import { MockAgent } from "undici";
import { afterEach, describe, expect, it } from "vitest";
import { ATTEMPTS, measurePackages } from "./run.ts";

/*
 * The run on mock hosts with the names of the real sources. The mock agent refuses each other request, so no test uses
 * the network. The fake clock of algebra moves at each wait of the crawler, so the pace of a source costs no time.
 */

interface Reply {
  readonly status?: number;
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
}

const JSON_TYPE = { "content-type": "application/json" };
const json = (value: unknown): Reply => ({ body: JSON.stringify(value), headers: JSON_TYPE });

/** The mock hosts: each path gives its replies in order, and the last reply stays. Each request goes into `hits`. */
function hosts(routes: Readonly<Record<string, Readonly<Record<string, readonly Reply[]>>>>): { agent: MockAgent; hits: string[] } {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const hits: string[] = [];
  for (const [origin, paths] of Object.entries(routes)) {
    const sent = new Map<string, number>();
    agent
      .get(origin)
      .intercept({ path: () => true, method: "GET" })
      .reply((request) => {
        hits.push(`${origin}${request.path}`);
        const replies = paths[request.path] ?? [{ status: 599, body: `no route for ${request.path}` }];
        const count = sent.get(request.path) ?? 0;
        sent.set(request.path, count + 1);
        const reply = replies[Math.min(count, replies.length - 1)]!;
        return { statusCode: reply.status ?? 200, data: reply.body, responseOptions: { headers: reply.headers ?? {} } };
      })
      .persist();
  }
  return { agent, hits };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** This function opens a crawler on the mock hosts, with a new store and the fake clock of algebra. */
async function crawlerOn(agent: MockAgent) {
  const dir = await mkdtemp(join(tmpdir(), "wirelab-measure-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const fake = fakeClock(Date.parse("2026-11-20T06:17:00Z"));
  const crawler = openCrawler({ dir, renderer: false, dispatcher: agent, clock: { now: () => fake.now(), sleep: (ms) => fake.advance(ms) } });
  cleanups.push(() => crawler.close());
  return crawler;
}

const NPM = "https://api.npmjs.org";
const DEPS = "https://api.deps.dev";
const CDN = "https://data.jsdelivr.com";
const REGISTRY = "https://registry.npmjs.org";

const WEEK = { start: "2026-11-12", end: "2026-11-18" };

describe("measurePackages", () => {
  it("asks each source for each package, sends a request again while the source is busy, and records each failure", async () => {
    const { agent, hits } = hosts({
      [NPM]: {
        "/downloads/point/last-week/ws-lite": [json({ downloads: 1200, ...WEEK, package: "ws-lite" })],
        "/downloads/point/last-week/@scope/client": [
          { status: 429, body: "slow down", headers: { "retry-after": "1" } },
          json({ downloads: 34, ...WEEK, package: "@scope/client" }),
        ],
      },
      [DEPS]: {
        "/v3/systems/npm/packages/ws-lite": [json({ versions: [{ versionKey: { version: "1.2.0" }, isDefault: true }] })],
        "/v3alpha/systems/npm/packages/ws-lite/versions/1.2.0:dependents": [
          json({ dependentCount: 7, directDependentCount: 3, indirectDependentCount: 4 }),
        ],
        "/v3/systems/npm/packages/%40scope%2Fclient": [{ status: 404, body: "package not found" }],
      },
      [CDN]: {
        "/v1/stats/packages/npm/ws-lite?period=month": [json({ hits: { total: 500, rank: 1000, typeRank: 900, dates: {} } })],
        "/v1/stats/packages/npm/@scope/client?period=month": [{ status: 500, body: "boom" }],
      },
      [REGISTRY]: {
        "/ws-lite": [json({ modified: "2026-11-10T08:00:00.000Z", "dist-tags": { latest: "1.2.0" }, versions: { "1.2.0": {} } })],
        "/@scope%2Fclient": [
          json({
            modified: "2026-09-01T00:00:00.000Z",
            "dist-tags": { latest: "0.3.1" },
            versions: { "0.3.1": { deprecated: "use @scope/next" } },
          }),
        ],
      },
    });
    const measured = await measurePackages(await crawlerOn(agent), ["ws-lite", "@scope/client"]);

    expect(measured.downloads).toEqual([
      { package: "ws-lite", ...WEEK, downloads: 1200 },
      { package: "@scope/client", ...WEEK, downloads: 34 },
    ]);
    expect(hits.filter((hit) => hit.endsWith("/@scope/client"))).toHaveLength(2);
    expect(measured.dependents).toEqual([{ package: "ws-lite", version: "1.2.0", dependents: 7, direct: 3, indirect: 4 }]);
    expect(measured.hits).toEqual([expect.objectContaining({ package: "ws-lite", period: "month", hits: 500 })]);
    expect(measured.documents).toEqual([
      { package: "ws-lite", modified: "2026-11-10T08:00:00.000Z", distTags: { latest: "1.2.0" }, versions: 1, latestDeprecated: null },
      { package: "@scope/client", modified: "2026-09-01T00:00:00.000Z", distTags: { latest: "0.3.1" }, versions: 1, latestDeprecated: "use @scope/next" },
    ]);
    // a package that deps.dev does not know is not a failure. The answer 500 of jsDelivr is, and it gets no second request.
    expect(measured.failures).toEqual([
      expect.objectContaining({ recipe: "jsdelivr-hits", url: `${CDN}/v1/stats/packages/npm/@scope/client?period=month`, outcome: "error", status: 500 }),
    ]);
    expect(hits.filter((hit) => hit.includes("@scope/client?period"))).toHaveLength(1);
    expect(hits.filter((hit) => hit.startsWith(DEPS))).toHaveLength(3);
  });

  it("stops after the last attempt at a busy source, and records a body that the extractor refuses", async () => {
    const busy: Reply = { status: 503, body: "busy", headers: { "retry-after": "1" } };
    const { agent, hits } = hosts({
      [NPM]: { "/downloads/point/last-week/ws-lite": [busy] },
      [DEPS]: { "/v3/systems/npm/packages/ws-lite": [json({ versions: [{ versionKey: { version: "1.2.0" } }] })] },
      [CDN]: { "/v1/stats/packages/npm/ws-lite?period=month": [json({ hits: { total: 0, dates: {} } })] },
      [REGISTRY]: { "/ws-lite": [json({ maintenance: true })] },
    });
    const measured = await measurePackages(await crawlerOn(agent), ["ws-lite"]);

    expect(hits.filter((hit) => hit.startsWith(NPM))).toHaveLength(ATTEMPTS);
    // deps.dev names no default version, so the run does not ask for the dependents
    expect(hits.filter((hit) => hit.startsWith(DEPS))).toHaveLength(1);
    expect(measured.dependents).toEqual([]);
    expect(measured.hits).toEqual([expect.objectContaining({ package: "ws-lite", hits: 0 })]);
    expect(measured.failures).toHaveLength(2);
    expect(measured.failures).toContainEqual(
      expect.objectContaining({ recipe: "npm-downloads", outcome: "unavailable", status: 503 }),
    );
    expect(measured.failures).toContainEqual(
      expect.objectContaining({ recipe: "npm-registry-document", outcome: "ok", status: 200, note: expect.stringContaining("not an abbreviated npm document") }),
    );
  });
});
