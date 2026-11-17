import { describe, expect, it } from "vitest";
import {
  caseTimeLimitMs,
  defaultCaseTimeLimitMs,
  expectationTimeLimitSeconds,
  serverTimeLimitSeconds,
} from "./fuzzingserver.ts";

describe("the time limits of the cases", () => {
  it("gives the limit of the server for the cases 12.* and 13.*", () => {
    expect(serverTimeLimitSeconds("12.1.1")).toBe(60);
    expect(serverTimeLimitSeconds("13.7.2")).toBe(60);
    expect(serverTimeLimitSeconds("12.4.3")).toBe(120);
    expect(serverTimeLimitSeconds("13.1.4")).toBe(240);
    expect(serverTimeLimitSeconds("12.2.15")).toBe(480);
    expect(serverTimeLimitSeconds("13.3.18")).toBe(480);
  });

  it("gives no limit of the server for the other cases", () => {
    for (const id of ["1.1.1", "6.4.1", "7.1.6", "10.1.1", "12.1", "112.1.1", "2.12.1.1"]) {
      expect(serverTimeLimitSeconds(id), id).toBeUndefined();
    }
  });

  it("waits for the server, and 20 seconds for a case with no limit of the server", () => {
    expect(caseTimeLimitMs("6.4.1")).toBe(defaultCaseTimeLimitMs);
    expect(caseTimeLimitMs("12.2.15")).toBeGreaterThan(480_000);
    expect(caseTimeLimitMs("12.1.1")).toBeGreaterThan(60_000);
  });

  it("reads the limit from the expectation of a report", () => {
    const expectation = "Receive echo'ed messages (with payload as sent). Timeout case after 480 secs.";
    expect(expectationTimeLimitSeconds(expectation)).toBe(480);
    expect(expectationTimeLimitSeconds("Echo for Text and Binary messages.")).toBeUndefined();
  });
});
