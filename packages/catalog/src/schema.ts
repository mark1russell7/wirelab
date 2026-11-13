/**
 * The tables of the catalog and their check. Each table is one JSON file in `src/data`. A row refers to a row of
 * another table by its key, as a foreign key does in SQL. `checkCatalog` finds each broken key, each duplicate key,
 * each unknown field and each value outside its set.
 */

/** A family groups the protocols as the catalog shows them. */
export interface Family {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly what: string;
}

/** A transport is a browser API that carries bytes. Each protocol of the catalog uses one or more of them. */
export interface Transport {
  readonly id: string;
  readonly name: string;
  readonly spec?: string;
  readonly note?: string;
}

/** The kinds of a protocol row. A codec is a wire format that a protocol carries, not a protocol. */
export const PROTOCOL_KINDS = ["protocol", "codec"] as const;
export type ProtocolKind = (typeof PROTOCOL_KINDS)[number];

/**
 * How a page speaks a protocol: with a library, with the native API of the browser and no library, or not at all.
 * A protocol with no browser client often has a gateway, which the field `gateway` names.
 */
export const CLIENT_KINDS = ["library", "native", "none"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** A protocol or a codec. */
export interface Protocol {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly kind: ProtocolKind;
  readonly client: ClientKind;
  readonly spec?: string;
  readonly gateway?: string;
  readonly note?: string;
}

/** A package of the npm registry. `entry` is the module of the browser client when it is not the package root. */
export interface Package {
  readonly name: string;
  readonly family: string;
  readonly entry?: string;
  readonly note?: string;
}

/** A package speaks a protocol. A package can speak more than one. */
export interface PackageProtocol {
  readonly package: string;
  readonly protocol: string;
}

/** The relations between two packages that the dependency data does not give. */
export const LINK_RELATIONS = ["fork-of", "renamed-to", "replaced-by"] as const;
export type LinkRelation = (typeof LINK_RELATIONS)[number];

/** A relation from one package to another. */
export interface PackageLink {
  readonly from: string;
  readonly relation: LinkRelation;
  readonly to: string;
}

/** A source is one read of outside data at one time. Each observed row names its source. */
export interface Source {
  readonly id: string;
  readonly at: string;
  readonly what: string;
  readonly note?: string;
}

/**
 * What the npm registry said about a package at the time of a source. `packumentModified` is the day of the last
 * change of the package document. A deprecation or a tag also changes it, so it is not the day of the last release.
 */
export interface RegistryRow {
  readonly package: string;
  readonly source: string;
  readonly version: string;
  readonly packumentModified: string;
  readonly deprecated?: string;
}

/** The measures of use. Each comes from a free public source. */
export const METRICS = [
  "npm-downloads-week",
  "deps-dev-dependents-direct",
  "deps-dev-dependents-indirect",
  "jsdelivr-hits-month",
] as const;
export type Metric = (typeof METRICS)[number];

/** One measure of the use of a package, from one source. */
export interface UsageRow {
  readonly package: string;
  readonly source: string;
  readonly metric: Metric;
  readonly value: number;
}

/** A source repository. `id` is `owner/name` on GitHub, or the host and the path for another host. */
export interface Repository {
  readonly id: string;
  readonly url: string;
  readonly note?: string;
}

/** The repository of a package. `directory` is the folder of the package in a repository with more than one package. */
export interface PackageRepository {
  readonly package: string;
  readonly repository: string;
  readonly directory?: string;
}

/** The topics of the policy of a repository that change how a fix goes upstream. */
export const POLICY_TOPICS = ["ai", "cla", "security"] as const;
export type PolicyTopic = (typeof POLICY_TOPICS)[number];

/**
 * The values of each policy topic.
 *
 * - `ai`: the rule for contributions that an AI made. `none-stated` means that the repository has no rule.
 * - `cla`: the agreement that a contributor signs. `dco` is a sign-off line in each commit.
 * - `security`: the private channel for a security fault. `platform` is a bounty platform, for example HackerOne.
 */
export const POLICY_VALUES: Readonly<Record<PolicyTopic, readonly string[]>> = {
  ai: ["none-stated", "allowed", "disclosure", "refused"],
  cla: ["none", "dco", "cla"],
  security: ["github-advisory", "email", "platform", "none-stated"],
};

/**
 * One fact of the policy of a repository on one topic, as read on the day `checked`. `evidence` is the page that
 * shows the fact. For the value `none-stated`, it is the page that has no rule. The latest row of a topic gives the
 * current policy.
 */
export interface Policy {
  readonly repository: string;
  readonly topic: PolicyTopic;
  readonly checked: string;
  readonly value: string;
  readonly evidence: string;
  readonly note?: string;
}

/** What a suite tests: the clients of its protocols, the servers, or both. */
export const SUITE_SUBJECTS = ["client", "server", "both"] as const;
export type SuiteSubject = (typeof SUITE_SUBJECTS)[number];

/** A suite of tests for one or more protocols. `url` is the repository of the suite. */
export interface Suite {
  readonly id: string;
  readonly name: string;
  readonly subject: SuiteSubject;
  readonly url: string;
  readonly note?: string;
}

/** A suite tests a protocol. A suite can test more than one. */
export interface SuiteProtocol {
  readonly suite: string;
  readonly protocol: string;
}

/** One run of a suite on one version of a package, in CI. `url` is the page of the CI run. */
export interface Run {
  readonly id: string;
  readonly suite: string;
  readonly package: string;
  readonly version: string;
  readonly at: string;
  readonly url: string;
  readonly passed: number;
  readonly failed: number;
  readonly skipped?: number;
  readonly browser?: string;
  readonly note?: string;
}

/** The kinds of a finding. A security finding is in the public tables only after its advisory is public. */
export const FINDING_KINDS = ["conformance", "correctness", "types", "resource", "performance", "security"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

/** How the campaign found a fault. */
export const FINDING_METHODS = ["suite", "static", "fuzz", "chaos", "review"] as const;
export type FindingMethod = (typeof FINDING_METHODS)[number];

/**
 * One fault of one package. `version` is the version that has the fault. `run` names the run that found it, when a
 * run found it. `advisory` is the public advisory of a security finding.
 */
export interface Finding {
  readonly id: string;
  readonly package: string;
  readonly version: string;
  readonly kind: FindingKind;
  readonly method: FindingMethod;
  readonly found: string;
  readonly title: string;
  readonly run?: string;
  readonly advisory?: string;
  readonly note?: string;
}

/**
 * The states of a finding upstream. A held fix is in a private repository: the project needs a CLA, or it refuses
 * contributions that an AI made. A security fault goes only through the private channel of the project.
 */
export const UPSTREAM_STATES = [
  "issue-open",
  "pr-open",
  "merged",
  "released",
  "held-cla",
  "held-ai-policy",
  "reported-privately",
  "fixed-by-others",
  "declined",
  "closed",
] as const;
export type UpstreamState = (typeof UPSTREAM_STATES)[number];

/** One change of the state of a finding upstream, at a UTC time. The latest row gives the current state. */
export interface UpstreamRow {
  readonly finding: string;
  readonly at: string;
  readonly state: UpstreamState;
  readonly url?: string;
  readonly note?: string;
}

/** All tables of the catalog. */
export interface Catalog {
  readonly families: readonly Family[];
  readonly transports: readonly Transport[];
  readonly protocols: readonly Protocol[];
  readonly packages: readonly Package[];
  readonly packageProtocols: readonly PackageProtocol[];
  readonly packageLinks: readonly PackageLink[];
  readonly sources: readonly Source[];
  readonly registry: readonly RegistryRow[];
  readonly usage: readonly UsageRow[];
  readonly repositories: readonly Repository[];
  readonly packageRepositories: readonly PackageRepository[];
  readonly policies: readonly Policy[];
  readonly suites: readonly Suite[];
  readonly suiteProtocols: readonly SuiteProtocol[];
  readonly runs: readonly Run[];
  readonly findings: readonly Finding[];
  readonly upstream: readonly UpstreamRow[];
}

/** The name of each table, and the file that holds it. */
export const TABLE_FILES: Readonly<Record<keyof Catalog, string>> = {
  families: "families.json",
  transports: "transports.json",
  protocols: "protocols.json",
  packages: "packages.json",
  packageProtocols: "package-protocols.json",
  packageLinks: "package-links.json",
  sources: "sources.json",
  registry: "registry.json",
  usage: "usage.json",
  repositories: "repositories.json",
  packageRepositories: "package-repositories.json",
  policies: "policies.json",
  suites: "suites.json",
  suiteProtocols: "suite-protocols.json",
  runs: "runs.json",
  findings: "findings.json",
  upstream: "upstream.json",
};

type FieldKind = "text" | "url" | "day" | "time" | "count" | "order" | readonly string[];

interface TableSpec {
  readonly key: readonly string[];
  readonly required: Readonly<Record<string, FieldKind>>;
  readonly optional?: Readonly<Record<string, FieldKind>>;
}

/** The fields of each table, and the fields of its key. The order of the rows in a file is the order of the key. */
export const TABLE_SPECS: Readonly<Record<keyof Catalog, TableSpec>> = {
  families: { key: ["order"], required: { id: "text", order: "order", title: "text", what: "text" } },
  transports: { key: ["id"], required: { id: "text", name: "text" }, optional: { spec: "url", note: "text" } },
  protocols: {
    key: ["id"],
    required: { id: "text", name: "text", family: "text", kind: PROTOCOL_KINDS, client: CLIENT_KINDS },
    optional: { spec: "url", gateway: "text", note: "text" },
  },
  packages: { key: ["name"], required: { name: "text", family: "text" }, optional: { entry: "text", note: "text" } },
  packageProtocols: { key: ["package", "protocol"], required: { package: "text", protocol: "text" } },
  packageLinks: { key: ["from", "relation", "to"], required: { from: "text", relation: LINK_RELATIONS, to: "text" } },
  sources: { key: ["at", "id"], required: { id: "text", at: "time", what: "text" }, optional: { note: "text" } },
  registry: {
    key: ["package", "source"],
    required: { package: "text", source: "text", version: "text", packumentModified: "day" },
    optional: { deprecated: "text" },
  },
  usage: {
    key: ["package", "source", "metric"],
    required: { package: "text", source: "text", metric: METRICS, value: "count" },
  },
  repositories: { key: ["id"], required: { id: "text", url: "url" }, optional: { note: "text" } },
  packageRepositories: { key: ["package"], required: { package: "text", repository: "text" }, optional: { directory: "text" } },
  policies: {
    key: ["repository", "topic", "checked"],
    required: { repository: "text", topic: POLICY_TOPICS, checked: "day", value: "text", evidence: "url" },
    optional: { note: "text" },
  },
  suites: { key: ["id"], required: { id: "text", name: "text", subject: SUITE_SUBJECTS, url: "url" }, optional: { note: "text" } },
  suiteProtocols: { key: ["suite", "protocol"], required: { suite: "text", protocol: "text" } },
  runs: {
    key: ["at", "id"],
    required: { id: "text", suite: "text", package: "text", version: "text", at: "time", url: "url", passed: "count", failed: "count" },
    optional: { skipped: "count", browser: "text", note: "text" },
  },
  findings: {
    key: ["id"],
    required: { id: "text", package: "text", version: "text", kind: FINDING_KINDS, method: FINDING_METHODS, found: "day", title: "text" },
    optional: { run: "text", advisory: "url", note: "text" },
  },
  upstream: { key: ["finding", "at", "state"], required: { finding: "text", at: "time", state: UPSTREAM_STATES }, optional: { url: "url", note: "text" } },
};

/** The upstream states that need the URL of a public issue, pull request or release. */
const PUBLIC_STATES: ReadonlySet<UpstreamState> = new Set(["issue-open", "pr-open", "merged", "released"]);

/** The upstream states that must not have a URL: the place is private. */
const PRIVATE_STATES: ReadonlySet<UpstreamState> = new Set(["held-cla", "held-ai-policy", "reported-privately"]);

const FINDING_ID = /^F\d{4,}$/;

const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function fieldProblem(value: unknown, kind: FieldKind): string | null {
  if (Array.isArray(kind)) return kind.includes(value as string) ? null : `is not one of ${kind.join(", ")}`;
  switch (kind) {
    case "text":
      return typeof value === "string" && value.trim() !== "" ? null : "is not a text";
    case "url":
      return typeof value === "string" && value.startsWith("https://") ? null : "is not an https URL";
    case "day":
      return typeof value === "string" && DAY.test(value) ? null : "is not a day YYYY-MM-DD";
    case "time":
      return typeof value === "string" && TIME.test(value) ? null : "is not a UTC time";
    case "count":
      return Number.isInteger(value) && (value as number) >= 0 ? null : "is not a count";
    case "order":
      return Number.isInteger(value) && (value as number) >= 1 ? null : "is not an order from 1";
    default:
      return "has an unknown kind";
  }
}

/** The key of a row, as one text. */
export function rowKey(table: keyof Catalog, row: object): string {
  const fields = TABLE_SPECS[table].key;
  return fields.map((field) => String((row as Record<string, unknown>)[field])).join(" | ");
}

/** The tables as they come from the files, before the check. */
export type RawTables = Readonly<Record<keyof Catalog, readonly unknown[]>>;

/**
 * This function checks each table and the keys between the tables. It gives one text for each problem. An empty
 * list means that the tables are a valid catalog.
 */
export function catalogProblems(raw: RawTables): string[] {
  const problems: string[] = [];
  for (const table of Object.keys(TABLE_SPECS) as (keyof Catalog)[]) {
    const spec = TABLE_SPECS[table];
    const seen = new Set<string>();
    raw[table].forEach((row, index) => {
      const where = `${table}[${index}]`;
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        problems.push(`${where} is not an object.`);
        return;
      }
      const record = row as Record<string, unknown>;
      for (const [field, kind] of Object.entries(spec.required)) {
        if (!(field in record)) problems.push(`${where} has no ${field}.`);
        else {
          const problem = fieldProblem(record[field], kind);
          if (problem) problems.push(`${where}.${field} ${problem}.`);
        }
      }
      for (const [field, value] of Object.entries(record)) {
        if (field in spec.required) continue;
        const kind = spec.optional?.[field];
        if (kind === undefined) problems.push(`${where} has the unknown field ${field}.`);
        else {
          const problem = fieldProblem(value, kind);
          if (problem) problems.push(`${where}.${field} ${problem}.`);
        }
      }
      const key = rowKey(table, record);
      if (seen.has(key)) problems.push(`${where} repeats the key ${key}.`);
      seen.add(key);
    });
  }
  if (problems.length > 0) return problems;
  return problems.concat(keyProblems(raw as unknown as Catalog));
}

function keyProblems(c: Catalog): string[] {
  const problems: string[] = [];
  const ids = (rows: readonly { readonly id: string }[]): Set<string> => new Set(rows.map((r) => r.id));
  const families = ids(c.families);
  const protocols = ids(c.protocols);
  const sources = ids(c.sources);
  const packages = new Set(c.packages.map((p) => p.name));
  const need = (set: Set<string>, value: string, what: string): void => {
    if (!set.has(value)) problems.push(`${what} names ${value}, and that row is not in the catalog.`);
  };
  if (families.size !== c.families.length) problems.push("families repeats an id.");
  if (protocols.size !== c.protocols.length) problems.push("protocols repeats an id.");
  if (sources.size !== c.sources.length) problems.push("sources repeats an id.");
  for (const p of c.protocols) {
    need(families, p.family, `protocols ${p.id}`);
    if ((p.kind === "codec") !== (p.family === "codecs")) problems.push(`protocols ${p.id}: a codec is in the family codecs, and only a codec.`);
  }
  for (const p of c.packages) {
    need(families, p.family, `packages ${p.name}`);
    if (!NPM_NAME.test(p.name)) problems.push(`packages ${p.name} is not a valid npm name.`);
    if (p.entry !== undefined && p.entry !== p.name && !p.entry.startsWith(`${p.name}/`)) problems.push(`packages ${p.name}: the entry ${p.entry} is not a module of the package.`);
  }
  const spoken = new Map<string, number>();
  const speakers = new Map<string, number>();
  for (const s of c.packageProtocols) {
    need(packages, s.package, `packageProtocols ${s.package}`);
    need(protocols, s.protocol, `packageProtocols ${s.package}`);
    spoken.set(s.package, (spoken.get(s.package) ?? 0) + 1);
    speakers.set(s.protocol, (speakers.get(s.protocol) ?? 0) + 1);
  }
  for (const p of c.packages) if (!spoken.has(p.name)) problems.push(`packages ${p.name} speaks no protocol.`);
  for (const p of c.protocols) {
    const count = speakers.get(p.id) ?? 0;
    if (p.client === "library" && count === 0) problems.push(`protocols ${p.id} has the client kind library, and no package speaks it.`);
    if (p.client !== "library" && count > 0) problems.push(`protocols ${p.id} has the client kind ${p.client}, and ${count} packages speak it.`);
  }
  for (const l of c.packageLinks) {
    need(packages, l.from, `packageLinks ${l.from}`);
    need(packages, l.to, `packageLinks ${l.from}`);
    if (l.from === l.to) problems.push(`packageLinks ${l.from} links the package to itself.`);
  }
  for (const r of c.registry) {
    need(packages, r.package, `registry ${r.package}`);
    need(sources, r.source, `registry ${r.package}`);
  }
  for (const u of c.usage) {
    need(packages, u.package, `usage ${u.package}`);
    need(sources, u.source, `usage ${u.package}`);
  }
  const repositories = ids(c.repositories);
  if (repositories.size !== c.repositories.length) problems.push("repositories repeats an id.");
  for (const r of c.packageRepositories) {
    need(packages, r.package, `packageRepositories ${r.package}`);
    need(repositories, r.repository, `packageRepositories ${r.package}`);
  }
  for (const p of c.policies) {
    need(repositories, p.repository, `policies ${p.repository}`);
    const values = POLICY_VALUES[p.topic];
    if (!values.includes(p.value)) problems.push(`policies ${p.repository} ${p.topic}: ${p.value} is not one of ${values.join(", ")}.`);
  }
  return problems.concat(ledgerProblems(c, { packages, protocols }));
}

/** This function checks the ledger: the suites, the runs, the findings and their states upstream. */
function ledgerProblems(c: Catalog, known: { readonly packages: Set<string>; readonly protocols: Set<string> }): string[] {
  const problems: string[] = [];
  const need = (set: ReadonlySet<string>, value: string, what: string): void => {
    if (!set.has(value)) problems.push(`${what} names ${value}, and that row is not in the catalog.`);
  };
  const suites = new Set(c.suites.map((s) => s.id));
  const runs = new Map(c.runs.map((r) => [r.id, r]));
  const findings = new Map(c.findings.map((f) => [f.id, f]));
  if (runs.size !== c.runs.length) problems.push("runs repeats an id.");
  const tested = new Map<string, Set<string>>();
  for (const t of c.suiteProtocols) {
    need(suites, t.suite, `suiteProtocols ${t.suite}`);
    need(known.protocols, t.protocol, `suiteProtocols ${t.suite}`);
    tested.set(t.suite, (tested.get(t.suite) ?? new Set()).add(t.protocol));
  }
  for (const s of c.suites) if (!tested.has(s.id)) problems.push(`suites ${s.id} tests no protocol.`);
  const speaks = new Map<string, Set<string>>();
  for (const s of c.packageProtocols) speaks.set(s.package, (speaks.get(s.package) ?? new Set()).add(s.protocol));
  for (const r of c.runs) {
    need(suites, r.suite, `runs ${r.id}`);
    need(known.packages, r.package, `runs ${r.id}`);
    const shared = [...(tested.get(r.suite) ?? [])].some((protocol) => speaks.get(r.package)?.has(protocol) === true);
    if (suites.has(r.suite) && known.packages.has(r.package) && !shared) problems.push(`runs ${r.id}: the package ${r.package} speaks no protocol of the suite ${r.suite}.`);
  }
  for (const f of c.findings) {
    if (!FINDING_ID.test(f.id)) problems.push(`findings ${f.id} is not an id of the form F0001.`);
    need(known.packages, f.package, `findings ${f.id}`);
    if ((f.method === "suite") !== (f.run !== undefined)) problems.push(`findings ${f.id}: a finding of a suite names its run, and only such a finding.`);
    const run = f.run === undefined ? undefined : runs.get(f.run);
    if (f.run !== undefined) need(new Set(runs.keys()), f.run, `findings ${f.id}`);
    if (run !== undefined && run.package !== f.package) problems.push(`findings ${f.id}: the run ${run.id} tested ${run.package}, not ${f.package}.`);
    if ((f.kind === "security") !== (f.advisory !== undefined)) problems.push(`findings ${f.id}: a security finding has its public advisory, and only a security finding.`);
  }
  for (const u of c.upstream) {
    const f = findings.get(u.finding);
    if (f === undefined) {
      problems.push(`upstream ${u.finding} names ${u.finding}, and that row is not in the catalog.`);
      continue;
    }
    if (u.at.slice(0, 10) < f.found) problems.push(`upstream ${u.finding}: the state ${u.state} at ${u.at} is before the day of the finding.`);
    if (PUBLIC_STATES.has(u.state) && u.url === undefined) problems.push(`upstream ${u.finding}: the state ${u.state} needs its URL.`);
    if (PRIVATE_STATES.has(u.state) && u.url !== undefined) problems.push(`upstream ${u.finding}: the state ${u.state} is private, so it has no URL.`);
    if (f.kind === "security" && u.state === "issue-open") problems.push(`upstream ${u.finding}: a security finding never has a public issue.`);
    if (f.kind !== "security" && u.state === "reported-privately") problems.push(`upstream ${u.finding}: only a security finding goes through the private channel.`);
  }
  return problems;
}

/** This function checks the tables and gives the catalog. It throws an error that lists each problem. */
export function parseCatalog(raw: RawTables): Catalog {
  const problems = catalogProblems(raw);
  if (problems.length > 0) throw new Error(`The catalog has ${problems.length} problems:\n${problems.join("\n")}`);
  return raw as unknown as Catalog;
}

function compareKeys(table: keyof Catalog, a: object, b: object): number {
  for (const field of TABLE_SPECS[table].key) {
    const x = (a as Record<string, unknown>)[field];
    const y = (b as Record<string, unknown>)[field];
    if (typeof x === "number" && typeof y === "number" && x !== y) return x - y;
    const sx = String(x);
    const sy = String(y);
    if (sx !== sy) return sx < sy ? -1 : 1;
  }
  return 0;
}

/**
 * This function gives the canonical text of a table file. The rows are in the order of the key. The indent is two
 * spaces, and a newline ends the text. A file in this form gives small diffs.
 */
export function tableText(table: keyof Catalog, rows: readonly object[]): string {
  const sorted = [...rows].sort((a, b) => compareKeys(table, a, b));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
