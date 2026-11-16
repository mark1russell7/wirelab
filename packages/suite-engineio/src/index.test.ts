// The rules and the checks are data. These tests need no server: they check that the data and the test files agree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checks, rules, type CheckFile } from "./index.ts";

function textOf(file: CheckFile): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
}

const ruleIds = new Set(rules.map((rule) => rule.id));

describe("the rules and the checks", () => {
  it("has a unique id for each rule and each check", () => {
    expect(ruleIds.size).toBe(rules.length);
    expect(new Set(checks.map((check) => check.id)).size).toBe(checks.length);
  });

  it("names each rule in the form EIO4-<group>-<number>", () => {
    for (const rule of rules) expect(rule.id).toMatch(/^EIO4-[A-Z]{2}-\d+$/);
  });

  it("has a check for each rule", () => {
    const examined = new Set(checks.flatMap((check) => check.rules));
    expect([...ruleIds].filter((id) => !examined.has(id))).toEqual([]);
  });

  it("names only known rules, and each check of a finding is in findings.test.ts", () => {
    for (const check of checks) {
      for (const rule of check.rules) expect(ruleIds.has(rule)).toBe(true);
      expect(check.file === "findings.test.ts").toBe(check.finding !== undefined);
      if (check.finding === undefined) expect(check.rules.length).toBeGreaterThan(0);
      else expect(check.finding).toMatch(/^F\d{4}$/);
    }
  });

  it.each(checks.map((check) => [check.id, check] as const))("%s: the test file has the check and each of its rules", (id, check) => {
    const text = textOf(check.file);
    expect(text).toContain(`"${id}:`);
    for (const rule of check.rules) expect(text).toContain(`[${rule}]`);
    if (check.finding !== undefined) expect(text).toContain(`// client bug: ${check.finding}.`);
  });
});
