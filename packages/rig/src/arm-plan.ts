/**
 * The plan job of the workflow `rig-arms.yml` starts this file with `node`, in the root of the repository. The argument
 * is the commit before the change. The file writes the line `matrix=<rows>` of the arms that the change reaches, and it
 * writes each reached arm with its paths to stderr. The job has no install, so the file uses `node:` modules and `git`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ARMS_FILE, RIG, armReach, armRows } from "./arm-reach.ts";
import type { Arm } from "./arms.ts";

const base = process.argv[2];
if (base === undefined || base === "") throw new Error("Give the commit before the change as the argument.");

/** This function starts `git` with `args`, with no shell, and gives its output. */
const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** This function gives the lines of `text` that are not empty. */
const lines = (text: string): string[] => text.split("\n").filter((line) => line !== "");

const arms = JSON.parse(readFileSync(ARMS_FILE, "utf8")) as Arm[];
let baseArms: Arm[] | undefined;
try {
  baseArms = JSON.parse(git("show", `${base}:${ARMS_FILE}`)) as Arm[];
} catch {
  baseArms = undefined;
}
const changed = lines(git("diff", "--name-only", base, "HEAD"));
const texts = new Map(
  lines(git("ls-files", `${RIG}/src`))
    .filter((path) => path.endsWith(".ts"))
    .map((path) => [path, readFileSync(path, "utf8")] as const),
);
const reach = armReach({ arms, baseArms, changed, texts });
for (const [id, paths] of reach) process.stderr.write(`${id}: ${paths.join(", ")}\n`);
process.stderr.write(`The change reaches ${String(reach.size)} of ${String(arms.length)} arms.\n`);
process.stdout.write(`matrix=${JSON.stringify(armRows(arms.filter((arm) => reach.has(arm.id))))}\n`);
