/**
 * The probe of the class C017: a stream cut inside a length prefix or a header ends with no error. The probe cuts the
 * valid stream of each target at each point of the matrix of C017, and the oracle `errorOnCut` judges each outcome.
 */
import { matrixRows, random } from "@mark1russell7/rigor-generators";
import { catalog } from "@wirelab/catalog";
import { CUTS, PLACES, cutCase, type Cut, type Place } from "../cuts.ts";
import { dimensionsOf } from "../matrix.ts";
import { errorOnCut, outcomeText, type Verdict } from "../outcome.ts";
import type { EnvelopeTarget } from "../targets/target.ts";

/** The id of the class of this probe. */
export const CLASS_ID = "C017";

/** One result of the probe: one cut stream on one target. */
export interface ProbeResult {
  readonly target: string;
  readonly package: string;
  readonly version: string;
  readonly frame: Place;
  readonly cut: Cut;
  /** The width of the prefix of the cut frame. */
  readonly prefixWidth: number;
  readonly verdict: Verdict;
  readonly outcome: string;
}

/**
 * This function compares the adapter with the catalog. It gives each value of the dimensions `frame` and `cut` of C017
 * that the adapter does not know. It also gives each value of the adapter that the catalog does not have.
 */
export function adapterProblems(): string[] {
  const dimensions = dimensionsOf(catalog.classDimensions, CLASS_ID, ["frame", "cut"]);
  const problems: string[] = [];
  const compare = (name: string, known: readonly string[]): void => {
    const listed = dimensionsOf(catalog.classDimensions, CLASS_ID)[name] ?? [];
    for (const value of listed) if (!known.includes(value)) problems.push(`${name}: the adapter has no value "${value}".`);
    for (const value of known) if (!listed.includes(value)) problems.push(`${name}: the catalog has no value "${value}".`);
  };
  compare("frame", PLACES);
  compare("cut", CUTS);
  if (Object.keys(dimensions).length !== 2) problems.push("C017 needs the dimensions frame and cut.");
  return problems;
}

/** This function starts the probe on each target, one cut stream at a time, and gives each result. */
export async function runProbe(targets: readonly EnvelopeTarget[]): Promise<ProbeResult[]> {
  // The matrix of C017 is small, so `matrixRows` gives each combination.
  const rows = matrixRows(dimensionsOf(catalog.classDimensions, CLASS_ID, ["frame", "cut"]), random(CLASS_ID));
  const results: ProbeResult[] = [];
  for (const target of targets) {
    const stream = target.stream();
    for (const row of rows) {
      const frame = row["frame"] as Place;
      const cut = row["cut"] as Cut;
      const one = cutCase(stream, frame, cut);
      if (one === undefined) continue;
      const outcome = await target.run(one.bytes);
      const cutFrame = frame === "after the end marker" ? stream.frames[0] : stream.frames[one.frame];
      results.push({
        target: target.id,
        package: target.package,
        version: target.version,
        frame,
        cut,
        prefixWidth: cutFrame?.prefix ?? 0,
        verdict: errorOnCut(outcome),
        outcome: outcomeText(outcome),
      });
    }
  }
  return results;
}
