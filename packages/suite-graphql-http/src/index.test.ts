// The rules, the checks and the verdicts are data. These tests need no server: they check that the data, the test
// files and the installed clients agree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checks, clientNames, clients, rules, verdicts, type CheckFile } from "./index.ts";

function textOf(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
}

const ruleIds = new Set(rules.map((rule) => rule.id));
const checkIds = new Set(checks.map((check) => check.id));

/** This function gives the version of an installed package from its `package.json` in the folder `node_modules` of this package. */
function installedVersion(name: string): string {
  const manifest = JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8")) as { version: string };
  return manifest.version;
}

describe("the rules, the checks and the verdicts", () => {
  it("has a unique id for each rule, each check and each client", () => {
    expect(ruleIds.size).toBe(rules.length);
    expect(checkIds.size).toBe(checks.length);
    expect(new Set(clientNames).size).toBe(clients.length);
  });

  it("names each rule in the form G<number>", () => {
    for (const rule of rules) expect(rule.id).toMatch(/^G\d+$/);
  });

  it("has a check for each rule, and each check names only known rules", () => {
    const examined = new Set(checks.flatMap((check) => check.rules));
    expect([...ruleIds].filter((id) => !examined.has(id))).toEqual([]);
    for (const check of checks) {
      expect(check.rules.length).toBeGreaterThan(0);
      for (const rule of check.rules) expect(ruleIds.has(rule)).toBe(true);
    }
  });

  it("gives verdicts only for known checks and clients, and each known fault has its comment", () => {
    const source = textOf("index.ts");
    for (const [check, byClient] of Object.entries(verdicts)) {
      expect(checkIds.has(check)).toBe(true);
      for (const [client, verdict] of Object.entries(byClient)) {
        expect(clientNames).toContain(client);
        if (verdict.kind === "fails") {
          expect(verdict.finding).toMatch(/^F\d{4}$/);
          expect(source).toContain(`// client bug: ${verdict.finding}.`);
        }
        if (verdict.kind === "skip") expect(verdict.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it.each(checks.map((check) => [check.id, check.file, check.rules] as const))("%s: the test file has the check and each of its rules", (id, file: CheckFile, ids) => {
    const text = textOf(file);
    expect(text).toContain(`check("${id}", client, `);
    for (const rule of ids) expect(text).toContain(`[${rule}]`);
  });

  it.each(clients.map((client) => [client.name, client.version] as const))("%s: the installed version is %s", (name, version) => {
    expect(installedVersion(name)).toBe(version);
  });
});
