import { describe, expect, it } from "vitest";
import { clients } from "./clients.ts";
import {
  type CaseReport,
  caseBehavior,
  caseTimeLimitMs,
  caseUrl,
  expectationTimeLimitSeconds,
  fuzzingServerUrl,
  listCases,
  passingBehaviors,
  readCaseExpectation,
  readCaseReports,
  reportsFolder,
  serverTimeLimitSeconds,
  updateReports,
} from "./fuzzingserver.ts";
import { knownFailures } from "./known.ts";

// The time that Vitest gives to one test after the time limit of its echo session.
const testMarginMs = 15_000;

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
        const limitMs = caseTimeLimitMs(testCase.id);
        test(name, { timeout: limitMs + testMarginMs }, async () => {
          if (base === undefined) throw new Error("The suite has no fuzzing server.");
          await client.echo(caseUrl(base, testCase.index, client.agent), limitMs);
          const behavior = await caseBehavior(base, testCase.index, client.agent);
          expect(passingBehaviors, `${testCase.id}: ${testCase.description}`).toContain(behavior);
        });
      }

      // The two tests of the reports share one write of the reports of the client.
      let reports: Promise<Record<string, CaseReport>> | undefined;
      const reportsOfClient = (): Promise<Record<string, CaseReport>> => {
        if (base === undefined || reportsFolder === undefined) throw new Error("The suite has no reports.");
        const folder = reportsFolder;
        reports ??= updateReports(base, client.agent).then(() => readCaseReports(folder, client.agent));
        return reports;
      };

      const closeTest = "each close behavior passes, other than the known failures";
      it.runIf(reportsFolder !== undefined)(closeTest, { timeout: 120_000 }, async () => {
        const byCase = await reportsOfClient();
        const failed = Object.entries(byCase)
          .filter(([, report]) => !passingBehaviors.includes(report.behaviorClose))
          .map(([id, report]) => `${id}: ${report.behaviorClose}`)
          .sort();
        const expected = Object.keys(known.close)
          .map((id) => `${id}: ${byCase[id]?.behaviorClose ?? "no result"}`)
          .sort();
        expect(failed).toEqual(expected);
      });

      const limitTest = "the time limit of each case agrees with the expectation in its report";
      it.runIf(reportsFolder !== undefined)(limitTest, { timeout: 120_000 }, async () => {
        if (reportsFolder === undefined) throw new Error("The suite has no reports.");
        const byCase = await reportsOfClient();
        const different: string[] = [];
        for (const [id, report] of Object.entries(byCase)) {
          const fromReport = expectationTimeLimitSeconds(await readCaseExpectation(reportsFolder, report.reportfile));
          const fromTable = serverTimeLimitSeconds(id);
          if (fromReport !== fromTable) different.push(`${id}: the report ${fromReport}, the table ${fromTable}`);
        }
        expect(Object.keys(byCase).length).toBeGreaterThan(0);
        expect(different).toEqual([]);
      });
    });
  }
});
