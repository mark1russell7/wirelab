/**
 * The probe of the class C016: a frame after the end-of-stream marker is delivered. The probe has two parts.
 *
 * - An envelope target takes one whole response. The probe adds frames after the end marker of the valid stream of
 *   each target with a rule `afterEnd`. The oracle `notDeliveredAfterEnd` judges each outcome against the run of the
 *   valid stream.
 * - A session target stays open, and the rig scripts its peer. Each case makes one end (an end frame, a completion of
 *   the peer or a local close) and then one item. The oracle `notCrossedAfterEnd` judges the record of the run.
 */
import { errorMessage } from "@mark1russell7/text";
import { catalog } from "@wirelab/catalog";
import { concatBytes, type FramedStream } from "../cuts.ts";
import { dimensionsOf } from "../matrix.ts";
import { notDeliveredAfterEnd, outcomeText, type Verdict } from "../outcome.ts";
import type { EnvelopeTarget, SessionCase, SessionRun, SessionTarget } from "../targets/target.ts";

/** The id of the class of this probe. */
export const CLASS_ID = "C016";

/** The values of the dimension `after` that the probe examines. The other values need a peer that stays open. */
export const AFTERS = ["end-of-stream frame", "second end-of-stream"] as const;
export type After = (typeof AFTERS)[number];

/** The values of the dimension `frame` that the probe examines. A message batch is a frame of other formats. */
export const EXTRA_FRAMES = ["data", "trailer"] as const;
export type ExtraFrame = (typeof EXTRA_FRAMES)[number];

/** The value of the dimension `direction` that the probe examines: the target is a client that reads a response. */
export const DIRECTION = "inbound";

/** One stream of the probe: the valid stream and the frames after its end marker. */
export interface ExtraCase {
  readonly after: After;
  readonly frame: ExtraFrame;
  readonly bytes: Uint8Array;
}

/**
 * This function gives each stream of the probe for `stream`. The last frame of `stream` is its end marker, and the
 * first frame is a data frame. A `data` frame is a copy of the first frame, and a `trailer` frame is a copy of the end
 * marker. The place `second end-of-stream` adds a copy of the end marker before the extra frame. The list is empty
 * when the stream has fewer than 2 frames.
 */
export function extraCases(stream: FramedStream): ExtraCase[] {
  const first = stream.frames[0];
  const end = stream.frames.at(-1);
  if (first === undefined || end === undefined || stream.frames.length < 2) return [];
  const whole = stream.frames.map((one) => one.bytes);
  const out: ExtraCase[] = [];
  for (const after of AFTERS) {
    for (const frame of EXTRA_FRAMES) {
      // A trailer after a second end marker is a third end marker. That case adds nothing new.
      if (after === "second end-of-stream" && frame === "trailer") continue;
      const before = after === "second end-of-stream" ? [...whole, end.bytes] : whole;
      out.push({ after, frame, bytes: concatBytes([...before, frame === "data" ? first.bytes : end.bytes]) });
    }
  }
  return out;
}

/** One result of the probe: one stream on one target. */
export interface ProbeResult {
  readonly target: string;
  readonly package: string;
  readonly version: string;
  readonly after: After | "none";
  readonly frame: ExtraFrame | "none";
  readonly verdict: Verdict;
  readonly outcome: string;
}

/**
 * This function compares the adapter with the catalog. It gives each value of the probe that the catalog does not have
 * for C016. The catalog has more values, for other formats, so it is not a problem that the probe does not use them.
 */
export function adapterProblems(): string[] {
  const dimensions = dimensionsOf(catalog.classDimensions, CLASS_ID);
  const problems: string[] = [];
  const compare = (name: string, known: readonly string[]): void => {
    const listed = dimensions[name] ?? [];
    for (const value of known) if (!listed.includes(value)) problems.push(`${name}: the catalog has no value "${value}".`);
  };
  compare("after", AFTERS);
  compare("frame", EXTRA_FRAMES);
  compare("direction", [DIRECTION]);
  return problems;
}

/**
 * This function starts the probe on each target with a rule `afterEnd`, one stream at a time, and gives each result.
 * The probe first sends the valid stream to each target: the control. A control that does not give a value is a fail.
 */
export async function runProbe(targets: readonly EnvelopeTarget[]): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const target of targets) {
    const rule = target.afterEnd;
    if (rule === undefined) continue;
    const base = { target: target.id, package: target.package, version: target.version };
    const stream = target.stream();
    const control = await target.run(concatBytes(stream.frames.map((one) => one.bytes)));
    results.push({ ...base, after: "none", frame: "none", verdict: control.kind === "value" ? "pass" : "fail", outcome: outcomeText(control) });
    if (control.kind !== "value") continue;
    for (const one of extraCases(stream)) {
      const outcome = await target.run(one.bytes);
      results.push({ ...base, after: one.after, frame: one.frame, verdict: notDeliveredAfterEnd(outcome, rule, control), outcome: outcomeText(outcome) });
    }
  }
  return results;
}

/** One result of the probe on a session target: one case. */
export interface SessionResult extends SessionCase {
  readonly target: string;
  readonly package: string;
  readonly version: string;
  readonly verdict: Verdict;
  /** The items of the valid session that crossed. */
  readonly before: readonly string[];
  /** The items after the end that crossed. */
  readonly late: readonly string[];
  /** The text of the error of a run that threw. A run that throws is inconclusive. */
  readonly error?: string;
}

/**
 * This function judges the record of a session run. No item can cross after the end, so an item after the end is a
 * fail. A run with no item of the valid session is inconclusive, because then the run does not show that the session
 * worked.
 */
export function notCrossedAfterEnd(run: SessionRun): Verdict {
  if (run.before.length === 0) return "inconclusive";
  return run.after.length === 0 ? "pass" : "fail";
}

/**
 * This function compares the cases of the session targets with the catalog. It gives each value of a case that the
 * catalog does not have for C016. It also gives each pair of cases of one target with the same values and variant.
 */
export function sessionCaseProblems(targets: readonly SessionTarget[]): string[] {
  const dimensions = dimensionsOf(catalog.classDimensions, CLASS_ID);
  const problems: string[] = [];
  for (const target of targets) {
    const keys = new Set<string>();
    for (const one of target.cases) {
      for (const [name, value] of [["after", one.after], ["frame", one.frame], ["direction", one.direction]] as const) {
        if (!(dimensions[name] ?? []).includes(value)) problems.push(`${target.id}: ${name}: the catalog has no value "${value}".`);
      }
      const key = sessionKey(one);
      if (keys.has(key)) problems.push(`${target.id}: the case "${key}" is not unique.`);
      keys.add(key);
    }
  }
  return problems;
}

/** This function gives the values of a case as one line: the place of the end, the item, the direction and the variant. */
export function sessionKey(one: SessionCase): string {
  return `${one.after} | ${one.frame} | ${one.direction} | ${one.variant}`;
}

/** This function starts each case of each session target, one case at a time, and gives each result. */
export async function runSessionProbe(targets: readonly SessionTarget[]): Promise<SessionResult[]> {
  const results: SessionResult[] = [];
  for (const target of targets) {
    for (const one of target.cases) {
      const base = { target: target.id, package: target.package, version: target.version, ...one };
      try {
        const run = await target.run(one);
        results.push({ ...base, verdict: notCrossedAfterEnd(run), before: run.before, late: run.after });
      } catch (error) {
        results.push({ ...base, verdict: "inconclusive", before: [], late: [], error: errorMessage(error) });
      }
    }
  }
  return results;
}
