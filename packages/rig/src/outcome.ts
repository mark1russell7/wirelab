/**
 * The outcome of one run of a target, and the oracles that judge it. An outcome is data, so a report and a test can
 * compare outcomes across targets and versions.
 */
import { errorMessage } from "@mark1russell7/text";
import type { AfterEndRule } from "./targets/target.ts";

/** The outcome of one run: the values that the caller got, an error, or no end in the time limit. */
export type Outcome =
  | { readonly kind: "value"; readonly values: readonly string[] }
  | { readonly kind: "error"; readonly name: string; readonly code: string; readonly message: string }
  | { readonly kind: "timeout"; readonly limitMs: number };

/** The verdict of an oracle on one outcome. `inconclusive` is a run that the rule cannot judge, for example a timeout. */
export type Verdict = "pass" | "fail" | "inconclusive";

/** This function gives the outcome of a thrown value. The function reads the fields `name`, `code` and `message`. */
export function errorOutcome(error: unknown, codeName: (code: unknown) => string = String): Outcome {
  if (error instanceof Error) {
    const { code } = error as { readonly code?: unknown };
    return { kind: "error", name: error.name, code: code === undefined ? "" : codeName(code), message: error.message };
  }
  return { kind: "error", name: typeof error, code: "", message: errorMessage(error) };
}

/**
 * This function gives the outcome of `work`, or a timeout after `limitMs`. On a timeout it aborts `controller`, so the
 * client can stop its request. The timer does not keep the process alive after the end of `work`.
 */
export async function outcomeOf(
  work: (signal: AbortSignal) => Promise<readonly string[]>,
  limitMs: number,
  codeName?: (code: unknown) => string,
): Promise<Outcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout", limitMs });
    }, limitMs);
  });
  const run = work(controller.signal).then(
    (values): Outcome => ({ kind: "value", values }),
    (error: unknown): Outcome => errorOutcome(error, codeName),
  );
  try {
    return await Promise.race([run, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * This function is the oracle of C017: a cut stream is not complete, so the client raises an error. A value is a
 * fail. A timeout is inconclusive, because a hang is a different class (C007).
 */
export function errorOnCut(outcome: Outcome): Verdict {
  if (outcome.kind === "error") return "pass";
  if (outcome.kind === "value") return "fail";
  return "inconclusive";
}

/**
 * This function is the oracle of C016: a frame after the end marker is not delivered. With the rule `refuse`, only an
 * error is a pass. With the rule `ignore`, an error or the values of `control` (the run of the valid stream) is a
 * pass. A timeout is inconclusive.
 */
export function notDeliveredAfterEnd(outcome: Outcome, rule: AfterEndRule, control: Outcome): Verdict {
  if (outcome.kind === "timeout") return "inconclusive";
  if (outcome.kind === "error") return "pass";
  if (rule === "refuse") return "fail";
  if (control.kind !== "value") return "inconclusive";
  return JSON.stringify(outcome.values) === JSON.stringify(control.values) ? "pass" : "fail";
}

/** This function gives a short text of an outcome for a report. */
export function outcomeText(outcome: Outcome): string {
  if (outcome.kind === "value") return `value ${JSON.stringify(outcome.values)}`;
  if (outcome.kind === "error") return `error ${outcome.code || outcome.name}: ${outcome.message}`;
  return `timeout after ${outcome.limitMs} ms`;
}
