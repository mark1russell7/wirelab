/**
 * The reply probes: the probes of the classes whose fault is in the error part of a response. A case is one HTTP
 * response for one target, the values of the dimensions of its class, and a judge. The judge gives the verdict of the
 * outcome. Each class has a file with its cases: `c001.ts`, `c003.ts`, `c032.ts`, `c033.ts` and `c034.ts`.
 */
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { catalog } from "@wirelab/catalog";
import { dimensionsOf } from "../matrix.ts";
import { outcomeText, type Outcome, type Verdict } from "../outcome.ts";
import type { ReplyTarget } from "../targets/target.ts";

/** One case of a reply probe. */
export interface ReplyCase {
  /** The id of the class of the case. */
  readonly class: string;
  /** The id of the target of the case. */
  readonly target: string;
  /** The values of the dimensions of the class. Each value is a value of the catalog. */
  readonly dims: Readonly<Record<string, string>>;
  /** The part of the response that the case changes, in words, for a report. */
  readonly detail: string;
  /** A control case has a valid response. A fail of a control shows a fault of the rig, not of the target. */
  readonly control?: boolean;
  /** The response of the case. */
  readonly reply: ScriptedReply;
  /** The outcome that the judge expects, in words, for a report. */
  readonly expected: string;
  /** This function gives the verdict of the outcome. */
  readonly judge: (outcome: Outcome) => Verdict;
}

/** One result of a reply probe. */
export interface ReplyResult {
  readonly class: string;
  readonly target: string;
  readonly package: string;
  readonly version: string;
  readonly detail: string;
  readonly control: boolean;
  readonly expected: string;
  readonly verdict: Verdict;
  readonly outcome: string;
}

/**
 * This function gives a judge that expects an error with the code `code`. A value or another code is a fail. A
 * timeout is inconclusive.
 */
export function expectCode(code: string): (outcome: Outcome) => Verdict {
  return (outcome) => {
    if (outcome.kind === "timeout") return "inconclusive";
    return outcome.kind === "error" && outcome.code === code ? "pass" : "fail";
  };
}

/** This function gives a judge that expects an error with one of the codes `codes`. */
export function expectOneOf(codes: readonly string[]): (outcome: Outcome) => Verdict {
  return (outcome) => {
    if (outcome.kind === "timeout") return "inconclusive";
    return outcome.kind === "error" && codes.includes(outcome.code) ? "pass" : "fail";
  };
}

/** This function gives a judge that expects an error with any code. */
export function expectError(): (outcome: Outcome) => Verdict {
  return (outcome) => {
    if (outcome.kind === "timeout") return "inconclusive";
    return outcome.kind === "error" ? "pass" : "fail";
  };
}

/** This function gives a judge that expects a value with the trailer `name` set to `value`. */
export function expectTrailer(name: string, value: string): (outcome: Outcome) => Verdict {
  return (outcome) => {
    if (outcome.kind === "timeout") return "inconclusive";
    if (outcome.kind !== "value") return "fail";
    return (outcome.trailers ?? []).some(([key, got]) => key === name && got === value) ? "pass" : "fail";
  };
}

/**
 * This function gives each problem of `cases`. A problem is a dimension or a value that the catalog does not have for
 * the class of the case. A target that `targets` does not have is also a problem.
 */
export function caseProblems(cases: readonly ReplyCase[], targets: readonly string[]): string[] {
  const problems = new Set<string>();
  for (const one of cases) {
    const dimensions = dimensionsOf(catalog.classDimensions, one.class);
    for (const [name, value] of Object.entries(one.dims)) {
      const values = dimensions[name];
      if (values === undefined) problems.add(`${one.class}: the catalog has no dimension "${name}".`);
      else if (!values.includes(value)) problems.add(`${one.class}: the dimension "${name}" has no value "${value}".`);
    }
    if (!targets.includes(one.target)) problems.add(`${one.class}: the rig has no target "${one.target}".`);
  }
  return [...problems];
}

/** This function sends each case to its target, one case at a time, and gives each result. A case with no target is skipped. */
export async function runReplyCases(cases: readonly ReplyCase[], targets: readonly ReplyTarget[]): Promise<ReplyResult[]> {
  const results: ReplyResult[] = [];
  for (const one of cases) {
    const target = targets.find((candidate) => candidate.id === one.target);
    if (target === undefined) continue;
    const outcome = await target.reply(one.reply);
    results.push({
      class: one.class,
      target: target.id,
      package: target.package,
      version: target.version,
      detail: one.detail,
      control: one.control === true,
      expected: one.expected,
      verdict: one.judge(outcome),
      outcome: outcomeText(outcome),
    });
  }
  return results;
}
