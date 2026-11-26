import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { matrixRows, random } from "@mark1russell7/rigor-generators";
import { catalog } from "@wirelab/catalog";
import { describe, expect, it } from "vitest";
import { CUTS, PLACES } from "../cuts.ts";
import { dimensionsOf } from "../matrix.ts";
import { apacheArrowTarget } from "../targets/apache-arrow.ts";
import { awsSdkS3Target } from "../targets/aws-sdk-s3.ts";
import { connectWebTargets } from "../targets/connect-web.ts";
import { CLASS_ID, adapterProblems, runProbe } from "./c017.ts";

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

  it("examines each combination of frame and cut, because the matrix is small", () => {
    const dimensions = dimensionsOf(catalog.classDimensions, CLASS_ID, ["frame", "cut"]);
    const rows = matrixRows(dimensions, random(CLASS_ID));
    const keys = new Set(rows.map((row) => `${row["frame"]} | ${row["cut"]}`));
    expect(keys.size).toBe(PLACES.length * CUTS.length);
    expect(rows).toHaveLength(keys.size);
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

describe.runIf(rigEnabled)("C017 on @aws-sdk/client-s3", () => {
  it("finds the known instance again: an event stream cut inside the 4-byte total length ends with no error", async () => {
    const results = await runProbe([awsSdkS3Target]);
    writeReport("aws-sdk-s3", results);
    // The known instance: F0140, smithy-lang/smithy-typescript#2367.
    expect(failLines(results)).toEqual(
      expect.arrayContaining([
        "aws-sdk/s3-select-object-content | middle | 1 byte into the prefix",
        "aws-sdk/s3-select-object-content | middle | prefix width - 1",
      ]),
    );
  }, 60_000);
});
