import { describe, expect, it } from "vitest";
import { clients } from "./clients.ts";
import {
  caseBehavior,
  caseUrl,
  fuzzingServerUrl,
  listCases,
  passingBehaviors,
  readCaseReports,
  reportsFolder,
  updateReports,
} from "./fuzzingserver.ts";
import { knownFailures } from "./known.ts";

// The time limit of one case. The slowest cases outside 9.* wait some seconds for the client.
const caseTimeoutMs = 20_000;

const base = fuzzingServerUrl;
const cases = base === undefined ? [] : await listCases(base);

describe.runIf(base !== undefined)("The Autobahn fuzzing server, in the role of the server", () => {
  it("has cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const client of clients) {
    describe(client.agent, () => {
      const known = knownFailures[client.name] ?? { behavior: {}, close: {} };

      for (const testCase of cases) {
        const finding = known.behavior[testCase.id];
        const test = finding === undefined ? it : it.fails;
        const name = `${testCase.id}${finding === undefined ? "" : ` (${finding})`}`;
        test(name, { timeout: caseTimeoutMs + 15_000 }, async () => {
          if (base === undefined) throw new Error("The suite has no fuzzing server.");
          await client.echo(caseUrl(base, testCase.index, client.agent), caseTimeoutMs);
          const behavior = await caseBehavior(base, testCase.index, client.agent);
          expect(passingBehaviors, `${testCase.id}: ${testCase.description}`).toContain(behavior);
        });
      }

      const closeTest = "each close behavior passes, other than the known failures";
      it.runIf(reportsFolder !== undefined)(closeTest, { timeout: 120_000 }, async () => {
        if (base === undefined || reportsFolder === undefined) throw new Error("The suite has no reports.");
        await updateReports(base, client.agent);
        const reports = await readCaseReports(reportsFolder, client.agent);
        const failed = Object.entries(reports)
          .filter(([, report]) => !passingBehaviors.includes(report.behaviorClose))
          .map(([id, report]) => `${id}: ${report.behaviorClose}`)
          .sort();
        const expected = Object.keys(known.close)
          .map((id) => `${id}: ${reports[id]?.behaviorClose ?? "no result"}`)
          .sort();
        expect(failed).toEqual(expected);
      });
    });
  }
});
