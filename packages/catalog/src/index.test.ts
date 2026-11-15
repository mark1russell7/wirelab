import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Catalog, TABLE_FILES, catalog, catalogProblems, priorityOrder, rawTables, tableText } from "./index.ts";

const dataDir = join(import.meta.dirname, "data");

describe("the tables of the catalog", () => {
  it("have no problem", () => {
    expect(catalogProblems(rawTables)).toEqual([]);
  });

  it("are each in the canonical form of their file", () => {
    for (const [table, file] of Object.entries(TABLE_FILES) as [keyof Catalog, string][]) {
      const text = readFileSync(join(dataDir, file), "utf8").replace(/\r\n/g, "\n");
      expect(text, file).toBe(tableText(table, catalog[table]));
    }
  });

  it("give each package a protocol, and each library protocol a package", () => {
    const spoken = new Set(catalog.packageProtocols.map((s) => s.package));
    expect(catalog.packages.filter((p) => !spoken.has(p.name))).toEqual([]);
  });
});

describe("the check", () => {
  const base = (): Record<keyof Catalog, unknown[]> => ({
    families: [{ id: "f", order: 1, title: "F", what: "F." }],
    transports: [],
    protocols: [{ id: "p", name: "P", family: "f", kind: "protocol", client: "library" }],
    packages: [{ name: "a", family: "f" }],
    packageProtocols: [{ package: "a", protocol: "p" }],
    packageLinks: [],
    sources: [{ id: "s", at: "2026-11-13T00:00:00Z", what: "S." }],
    registry: [],
    usage: [],
    repositories: [],
    packageRepositories: [],
    policies: [],
    suites: [{ id: "t", name: "T", subject: "client", url: "https://example.org/t" }],
    suiteProtocols: [{ suite: "t", protocol: "p" }],
    runs: [],
    findings: [],
    upstream: [],
  });

  it("accepts a valid catalog", () => {
    expect(catalogProblems(base())).toEqual([]);
  });

  it("finds a broken key", () => {
    const raw = base();
    raw.packageProtocols.push({ package: "a", protocol: "missing" });
    expect(catalogProblems(raw)).toEqual(["packageProtocols a names missing, and that row is not in the catalog."]);
  });

  it("finds an unknown field, a value outside its set and a duplicate key", () => {
    const raw = base();
    raw.packages.push({ name: "a", family: "f", color: "red" });
    raw.protocols[0] = { id: "p", name: "P", family: "f", kind: "protocol", client: "maybe" };
    expect(catalogProblems(raw)).toEqual([
      "protocols[0].client is not one of library, native, none.",
      "packages[1] has the unknown field color.",
      "packages[1] repeats the key a.",
    ]);
  });

  it("finds a policy of a missing repository, a value outside its topic and a package of a missing repository", () => {
    const raw = base();
    raw.repositories.push({ id: "o/r", url: "https://example.org/o/r" });
    raw.packageRepositories.push({ package: "a", repository: "o/missing" });
    raw.policies.push(
      { repository: "o/r", topic: "cla", checked: "2026-11-13", value: "dco", evidence: "https://example.org/o/r/CONTRIBUTING.md" },
      { repository: "o/r", topic: "ai", checked: "2026-11-13", value: "dco", evidence: "https://example.org/o/r/CONTRIBUTING.md" },
      { repository: "o/gone", topic: "security", checked: "2026-11-13", value: "email", evidence: "https://example.org/o/gone/SECURITY.md" },
    );
    expect(catalogProblems(raw)).toEqual([
      "packageRepositories a names o/missing, and that row is not in the catalog.",
      "policies o/r ai: dco is not one of none-stated, allowed, disclosure, refused.",
      "policies o/gone names o/gone, and that row is not in the catalog.",
    ]);
  });

  it("finds a library protocol that no package speaks", () => {
    const raw = base();
    raw.protocols.push({ id: "q", name: "Q", family: "f", kind: "protocol", client: "library" });
    expect(catalogProblems(raw)).toEqual(["protocols q has the client kind library, and no package speaks it."]);
  });
});

describe("the check of the ledger", () => {
  const RUN = { id: "r1", suite: "t", package: "a", version: "1.0.0", at: "2026-11-14T10:00:00Z", url: "https://example.org/run/1", passed: 9, failed: 1 };
  const FINDING = { id: "F0001", package: "a", version: "1.0.0", kind: "conformance", method: "suite", found: "2026-11-14", title: "T.", run: "r1" };
  const ledger = (): Record<keyof Catalog, unknown[]> => ({
    families: [{ id: "f", order: 1, title: "F", what: "F." }],
    transports: [],
    protocols: [
      { id: "p", name: "P", family: "f", kind: "protocol", client: "library" },
      { id: "q", name: "Q", family: "f", kind: "protocol", client: "library" },
    ],
    packages: [
      { name: "a", family: "f" },
      { name: "b", family: "f" },
    ],
    packageProtocols: [
      { package: "a", protocol: "p" },
      { package: "b", protocol: "q" },
    ],
    packageLinks: [],
    sources: [],
    registry: [],
    usage: [],
    repositories: [],
    packageRepositories: [],
    policies: [],
    suites: [{ id: "t", name: "T", subject: "client", url: "https://example.org/t" }],
    suiteProtocols: [{ suite: "t", protocol: "p" }],
    runs: [RUN],
    findings: [FINDING],
    upstream: [
      { finding: "F0001", at: "2026-11-14T11:00:00Z", state: "issue-open", url: "https://example.org/issues/1" },
      { finding: "F0001", at: "2026-11-15T09:00:00Z", state: "pr-open", url: "https://example.org/pull/2" },
    ],
  });

  it("accepts a valid ledger", () => {
    expect(catalogProblems(ledger())).toEqual([]);
  });

  it("finds a suite with no protocol, and a run of a package that speaks no protocol of its suite", () => {
    const raw = ledger();
    raw.suites.push({ id: "u", name: "U", subject: "server", url: "https://example.org/u" });
    raw.runs.push({ ...RUN, id: "r2", package: "b" });
    expect(catalogProblems(raw)).toEqual(["suites u tests no protocol.", "runs r2: the package b speaks no protocol of the suite t."]);
  });

  it("finds a finding with a bad id, a suite finding with no run, and a run of another package", () => {
    const raw = ledger();
    raw.findings.push({ ...FINDING, id: "bug-1", run: undefined }, { ...FINDING, id: "F0002", package: "b" });
    raw.findings = raw.findings.map((f) => JSON.parse(JSON.stringify(f)) as unknown);
    expect(catalogProblems(raw)).toEqual([
      "findings bug-1 is not an id of the form F0001.",
      "findings bug-1: a finding of a suite names its run, and only such a finding.",
      "findings F0002: the run r1 tested a, not b.",
    ]);
  });

  it("keeps a security finding out until its advisory is public, and out of public issues", () => {
    const raw = ledger();
    raw.findings[0] = { ...FINDING, kind: "security" };
    expect(catalogProblems(raw)).toEqual([
      "findings F0001: a security finding has its public advisory, and only a security finding.",
      "upstream F0001: a security finding never has a public issue.",
    ]);
  });

  it("finds an upstream state before the finding, a public state with no URL and a private state with a URL", () => {
    const raw = ledger();
    raw.upstream = [
      { finding: "F0001", at: "2026-11-13T23:00:00Z", state: "pr-open", url: "https://example.org/pull/2" },
      { finding: "F0001", at: "2026-11-14T12:00:00Z", state: "merged" },
      { finding: "F0001", at: "2026-11-14T13:00:00Z", state: "held-cla", url: "https://example.org/held" },
      { finding: "F0001", at: "2026-11-14T14:00:00Z", state: "reported-privately" },
      { finding: "F0009", at: "2026-11-14T14:00:00Z", state: "closed" },
    ];
    expect(catalogProblems(raw)).toEqual([
      "upstream F0001: the state pr-open at 2026-11-13T23:00:00Z is before the day of the finding.",
      "upstream F0001: the state merged needs its URL.",
      "upstream F0001: the state held-cla is private, so it has no URL.",
      "upstream F0001: only a security finding goes through the private channel.",
      "upstream F0009 names F0009, and that row is not in the catalog.",
    ]);
  });
});

describe("the priority order", () => {
  const fixture = (): Catalog => ({
    families: [{ id: "f", order: 1, title: "F", what: "F." }],
    transports: [],
    protocols: [{ id: "p", name: "P", family: "f", kind: "protocol", client: "library" }],
    packages: ["a", "b", "c", "d"].map((name) => ({ name, family: "f" })),
    packageProtocols: ["a", "b", "c", "d"].map((name) => ({ package: name, protocol: "p" })),
    packageLinks: [],
    sources: [
      { id: "old", at: "2026-11-01T00:00:00Z", what: "Old." },
      { id: "new", at: "2026-11-13T00:00:00Z", what: "New." },
    ],
    registry: [{ package: "a", source: "new", version: "1.0.0", packumentModified: "2026-11-01", deprecated: "Use b." }],
    usage: [
      { package: "a", source: "new", metric: "npm-downloads-week", value: 1000 },
      { package: "b", source: "new", metric: "npm-downloads-week", value: 100 },
      { package: "c", source: "old", metric: "npm-downloads-week", value: 5000 },
      { package: "c", source: "new", metric: "npm-downloads-week", value: 10 },
    ],
    repositories: [{ id: "o/r", url: "https://example.org/o/r" }],
    packageRepositories: [],
    policies: [],
    suites: [],
    suiteProtocols: [],
    runs: [],
    findings: [],
    upstream: [],
  });

  it("puts the most used package first, and a package with no measure last", () => {
    const order = priorityOrder(fixture());
    expect(order.map((r) => r.package)).toEqual(["b", "c", "a", "d"]);
    expect(order.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    expect(order[3]?.score).toBeNull();
    expect(order[3]?.reasons).toEqual(["no measure of use yet"]);
  });

  it("reads the newest source of each measure", () => {
    const c = priorityOrder(fixture()).find((r) => r.package === "c");
    expect(c?.shares).toEqual([{ metric: "npm-downloads-week", value: 10, source: "new", share: 0.5 / 3 }]);
  });

  it("multiplies the reach of a deprecated package by the landing factor", () => {
    const a = priorityOrder(fixture()).find((r) => r.package === "a");
    expect(a?.reach).toBeCloseTo(2.5 / 3);
    expect(a?.landing).toBe(0.1);
    expect(a?.score).toBeCloseTo(0.25 / 3);
    expect(a?.reasons).toEqual(["deprecated on npm: Use b."]);
  });

  it("multiplies the reach by the factors of the latest AI and CLA policies of the repository", () => {
    const f = fixture();
    const evidence = "https://example.org/o/r/CONTRIBUTING.md";
    const policies = [
      { repository: "o/r", topic: "ai" as const, checked: "2026-11-01", value: "none-stated", evidence },
      { repository: "o/r", topic: "ai" as const, checked: "2026-11-13", value: "refused", evidence },
      { repository: "o/r", topic: "cla" as const, checked: "2026-11-01", value: "cla", evidence },
      { repository: "o/r", topic: "cla" as const, checked: "2026-11-13", value: "none", evidence },
    ];
    const order = priorityOrder({ ...f, packageRepositories: [{ package: "b", repository: "o/r" }], policies });
    const b = order.find((r) => r.package === "b");
    expect(b?.landing).toBe(0.2);
    expect(b?.reasons).toEqual(["the repository o/r refuses contributions that an AI made (checked 2026-11-13)"]);
    const withCla = priorityOrder({ ...f, packageRepositories: [{ package: "b", repository: "o/r" }], policies: policies.slice(2, 3) });
    expect(withCla.find((r) => r.package === "b")?.landing).toBe(0.5);
    expect(order.find((r) => r.package === "c")?.landing).toBe(1);
  });

  it("gives a package of an archived repository the factor once, also when npm deprecates it", () => {
    const f = fixture();
    const evidence = "https://example.org/o/r";
    const policies = [{ repository: "o/r", topic: "contributions" as const, checked: "2026-11-13", value: "archived", evidence }];
    const packageRepositories = [
      { package: "a", repository: "o/r" },
      { package: "b", repository: "o/r" },
    ];
    const order = priorityOrder({ ...f, packageRepositories, policies });
    expect(order.find((r) => r.package === "b")?.landing).toBe(0.1);
    expect(order.find((r) => r.package === "b")?.reasons).toEqual(["the repository o/r is archived (checked 2026-11-13)"]);
    expect(order.find((r) => r.package === "a")?.landing).toBe(0.1);
    expect(order.find((r) => r.package === "a")?.reasons).toEqual(["deprecated on npm: Use b.", "the repository o/r is archived (checked 2026-11-13)"]);
  });

  it("gives a package of a repository that takes pull requests only from collaborators its factor", () => {
    const f = fixture();
    const evidence = "https://example.org/o/r";
    const policies = [
      { repository: "o/r", topic: "contributions" as const, checked: "2026-11-13", value: "open", evidence },
      { repository: "o/r", topic: "contributions" as const, checked: "2026-11-14", value: "collaborators-only", evidence },
    ];
    const order = priorityOrder({ ...f, packageRepositories: [{ package: "b", repository: "o/r" }], policies });
    expect(order.find((r) => r.package === "b")?.landing).toBe(0.3);
    expect(order.find((r) => r.package === "b")?.reasons).toEqual([
      "the repository o/r takes pull requests only from its collaborators (checked 2026-11-14)",
    ]);
    const reopened = priorityOrder({ ...f, packageRepositories: [{ package: "b", repository: "o/r" }], policies: policies.slice(0, 1) });
    expect(reopened.find((r) => r.package === "b")?.landing).toBe(1);
  });

  it("gives equal values the mean rank", () => {
    const f = fixture();
    const usage = f.usage.map((u) => (u.package === "b" ? { ...u, value: 1000 } : u));
    const order = priorityOrder({ ...f, registry: [], usage });
    expect(order.find((r) => r.package === "a")?.reach).toBe(order.find((r) => r.package === "b")?.reach);
  });
});
