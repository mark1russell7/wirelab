import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { apacheArrowTarget } from "../targets/apache-arrow.ts";
import { connectWebTargets } from "../targets/connect-web.ts";
import { adapterProblems, runProbe } from "./c017.ts";

/**
 * The runs of the probes start only when the environment variable `RIG` is `1`, in the workflow `rig.yml`. Each run
 * starts servers and clients, so it is not part of the local checks.
 */
const rigEnabled = process.env["RIG"] === "1";

/** This function writes the results to the file of the environment variable `RIG_REPORT`, with the suffix `name`. */
function writeReport(name: string, results: readonly unknown[]): void {
  const report = process.env["RIG_REPORT"];
  if (report === undefined) return;
  const file = report.replace(/.json$/, `-${name}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(results, null, 2)}
`);
}

/** This function gives each fail as one line: the target, the place and the cut. */
const failLines = (results: Awaited<ReturnType<typeof runProbe>>): string[] =>
  results.filter((one) => one.verdict === "fail").map((one) => `${one.target} | ${one.frame} | ${one.cut}`);

describe("C017: the adapter and the catalog", () => {
  it("has each value of the dimensions frame and cut of the catalog, and no other value", () => {
    expect(adapterProblems()).toEqual([]);
  });
});

describe.runIf(rigEnabled)("C017 on @connectrpc/connect-web", () => {
  it("finds the known instance again: a bare prefix after the end marker ends with no error", async () => {
    const results = await runProbe(connectWebTargets);
    const report = process.env["RIG_REPORT"];
    if (report !== undefined) {
      mkdirSync(dirname(report), { recursive: true });
      writeFileSync(report, `${JSON.stringify(results, null, 2)}\n`);
    }
    const fails = results.filter((one) => one.verdict === "fail").map((one) => `${one.target} | ${one.frame} | ${one.cut}`);
    // The known instance: the candidate c10 of the W16 review of connect-web 2.3.0.
    expect(fails).toEqual(
      expect.arrayContaining([
        "connect-web/connect-stream | after the end marker | after the full prefix with 0 payload bytes",
        "connect-web/grpc-web-unary | after the end marker | after the full prefix with 0 payload bytes",
      ]),
    );
    // Each cut inside the stream gives an error. Only the cuts after the end marker are known to fail.
    expect(results.filter((one) => one.verdict === "fail" && one.frame !== "after the end marker")).toEqual([]);
  }, 120_000);
});

describe.runIf(rigEnabled)("C017 on apache-arrow", () => {
  it("finds the known instance again: a stream cut inside the 8-byte prefix of a message reads with no error", async () => {
    const results = await runProbe([apacheArrowTarget]);
    writeReport("apache-arrow", results);
    // The known instance: F0145, apache/arrow-js#535.
    expect(failLines(results)).toEqual(
      expect.arrayContaining([
        "apache-arrow/table-from-ipc | middle | 1 byte into the prefix",
        "apache-arrow/table-from-ipc | middle | prefix width - 1",
      ]),
    );
  }, 60_000);
});
