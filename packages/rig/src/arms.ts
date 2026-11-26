/**
 * The arms of a probe. An arm builds a package from a commit and puts the build in place of the release that the
 * workspace installs. The arm `fixed` builds the commit of a fix, and the probe expects no fail. The arm `base` builds
 * the parent of the fix with the same steps, and the probe expects the known fails. Thus the base arm shows that the
 * build alone does not change the result. The workflow `rig.yml` starts each arm.
 */
import data from "./arms.json" with { type: "json" };

/** The two kinds of arm. */
export const ARM_KINDS = ["base", "fixed"] as const;
export type ArmKind = (typeof ARM_KINDS)[number];

/** One fix that the rig builds. */
export interface Arm {
  /** The id of the arm: the repository and the number of the fix. */
  readonly id: string;
  /** The class of the probe that the arm proves. */
  readonly class: string;
  /** The id of the target that uses the package. */
  readonly target: string;
  /** The npm name of the package that the build replaces. */
  readonly package: string;
  /** The GitHub repository of the commits, as `owner/name`. */
  readonly repository: string;
  /** The commit before the fix. */
  readonly base: string;
  /** The commit of the fix. */
  readonly fix: string;
  /** The link to the fix upstream. */
  readonly fixLink: string;
  /** The shell command that builds the package in the root of the repository. */
  readonly build: string;
  /** The folder of the package in the repository. */
  readonly folder: string;
  /** The folders of the build that replace the folders of the installed package. */
  readonly copy: readonly string[];
}

/** The arms of the rig. */
export const ARMS: readonly Arm[] = data;

/** This function gives each problem of the arms: a duplicate id, a target that the rig does not have, or a bad commit. */
export function armProblems(arms: readonly Arm[], targets: readonly string[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const commit = /^[0-9a-f]{40}$/;
  for (const arm of arms) {
    if (ids.has(arm.id)) problems.push(`${arm.id}: the id is not unique.`);
    ids.add(arm.id);
    if (!targets.includes(arm.target)) problems.push(`${arm.id}: the rig has no target "${arm.target}".`);
    if (!commit.test(arm.base) || !commit.test(arm.fix)) problems.push(`${arm.id}: each commit is a full SHA of 40 hex digits.`);
    if (arm.base === arm.fix) problems.push(`${arm.id}: the base and the fix are the same commit.`);
    if (arm.copy.length === 0) problems.push(`${arm.id}: the arm copies no folder.`);
  }
  return problems;
}

/** The arm of this run, from the environment variables `RIG_ARM` (the id) and `RIG_ARM_KIND`, or undefined. */
export function currentArm(env: Readonly<Record<string, string | undefined>>): { arm: Arm; kind: ArmKind } | undefined {
  const id = env["RIG_ARM"];
  if (id === undefined || id === "") return undefined;
  const arm = ARMS.find((one) => one.id === id);
  const kind = env["RIG_ARM_KIND"];
  if (arm === undefined) throw new Error(`The rig has no arm "${id}".`);
  if (kind !== "base" && kind !== "fixed") throw new Error(`RIG_ARM_KIND is "${kind ?? ""}". It is base or fixed.`);
  return { arm, kind };
}
