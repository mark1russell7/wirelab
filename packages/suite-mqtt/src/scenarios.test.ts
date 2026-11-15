// The scenario list is data. These tests need no broker: they check that the list and the test files agree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extras, pahoV311, pahoV5, scenarios } from "./index.ts";
import type { ScenarioSource } from "./index.ts";

const files: Record<ScenarioSource, string> = {
  "client_test5.py": "paho-v5.test.ts",
  "client_test.py": "paho-v311.test.ts",
  extra: "client-limits.test.ts",
};

function textOf(source: ScenarioSource): string {
  return readFileSync(new URL(`./${files[source]}`, import.meta.url), "utf8");
}

describe("the scenario list", () => {
  it("has the 27 scenarios of client_test5.py and the 10 scenarios of client_test.py", () => {
    expect(pahoV5).toHaveLength(27);
    expect(pahoV311).toHaveLength(10);
    expect(extras.length).toBeGreaterThan(0);
  });

  it("has a unique id for each scenario in each source", () => {
    for (const list of [pahoV5, pahoV311, extras]) {
      const ids = list.map((scenario) => scenario.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("names each normative statement in the form MQTT-x.y.z-n", () => {
    for (const scenario of scenarios) {
      for (const statement of [...scenario.client, ...scenario.broker]) {
        expect(statement).toMatch(/^MQTT-\d+\.\d+\.\d+-\d+$/);
      }
    }
  });

  it.each(scenarios.map((scenario) => [scenario.source, scenario.id, scenario] as const))(
    "%s %s: the test file has the scenario and each of its statements",
    (source, id, scenario) => {
      const text = textOf(source);
      expect(text.includes(`"${id}:`) || text.includes(`describe("${id}"`)).toBe(true);
      for (const statement of [...scenario.client, ...scenario.broker]) expect(text).toContain(`[${statement}]`);
    },
  );
});
