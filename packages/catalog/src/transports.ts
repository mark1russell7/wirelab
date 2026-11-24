/**
 * The transports of each package, from a scan of its published code. The command `facts --files published` of
 * codeatlas gives the global names that each file uses. `transportUses` keeps the names that `transportGlobals` gives
 * to a transport. `addTransportScan` puts the rows of a new scan into the tables. The script `scripts/transports.ts`
 * makes the scan.
 */
import { GLOBAL_USES, type GlobalUse, type PackageTransport, type Source, type TransportGlobal } from "./schema.ts";

/** One package of a scan: the name of its repository in the facts, and its name and version on npm. */
export interface ScannedPackage {
  readonly repo: string;
  readonly package: string;
  readonly version: string;
}

/** The two tables that a new scan changes. */
export interface TransportTables {
  readonly sources: readonly Source[];
  readonly packageTransports: readonly PackageTransport[];
}

interface GlobalFact {
  readonly name: string;
  readonly use: GlobalUse;
  readonly line: number;
  readonly count: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** This function gives the global facts of a blob record of codeatlas, or undefined when the parse of the blob failed. */
function globalsOf(record: Record<string, unknown>): readonly GlobalFact[] | undefined {
  const outer = record["facts"];
  if (!isRecord(outer) || outer["ok"] !== true || !isRecord(outer["facts"])) return undefined;
  const globals = outer["facts"]["globals"];
  if (!Array.isArray(globals)) return undefined;
  return globals.filter(
    (g): g is GlobalFact =>
      isRecord(g) && typeof g["name"] === "string" && (GLOBAL_USES as readonly unknown[]).includes(g["use"]) && Number.isInteger(g["line"]) && Number.isInteger(g["count"]),
  );
}

/**
 * This function gives one row for each use of a transport global in a file of a scanned package. The records are the
 * lines of the output of `codeatlas facts`. A file record names a repository, a path and a blob. A blob record holds
 * the facts of the blob under the key `<blob>:<language>:<facts version>`. The rows come in the order of the key of
 * the table `packageTransports`.
 */
export function transportUses(records: readonly unknown[], scanned: readonly ScannedPackage[], globals: readonly TransportGlobal[], source: string): PackageTransport[] {
  const byRepo = new Map(scanned.map((one) => [one.repo, one]));
  const transportOf = new Map(globals.map((g) => [g.global, g.transport]));
  const factsOfBlob = new Map<string, readonly GlobalFact[]>();
  for (const record of records) {
    if (!isRecord(record) || record["kind"] !== "blob" || typeof record["key"] !== "string") continue;
    const facts = globalsOf(record);
    if (facts !== undefined) factsOfBlob.set(record["key"].split(":")[0] ?? "", facts);
  }
  const rows: PackageTransport[] = [];
  for (const record of records) {
    if (!isRecord(record) || record["kind"] !== "file" || record["test"] === true) continue;
    const pkg = typeof record["repo"] === "string" ? byRepo.get(record["repo"]) : undefined;
    if (pkg === undefined || typeof record["path"] !== "string" || typeof record["blob"] !== "string") continue;
    for (const fact of factsOfBlob.get(record["blob"]) ?? []) {
      const transport = transportOf.get(fact.name);
      if (transport === undefined) continue;
      rows.push({ package: pkg.package, version: pkg.version, transport, global: fact.name, use: fact.use, file: record["path"], line: fact.line, count: fact.count, source });
    }
  }
  const key = (row: PackageTransport): string => [row.package, row.transport, row.file, row.global, row.use].join("\u0000");
  return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/**
 * This function adds the source of a new scan and its rows. The new rows replace all old rows of the scanned packages,
 * because the old rows tell about older versions. The rows of the other packages stay. It throws an error when the
 * tables already have the source id. `parseCatalog` checks the rest.
 */
export function addTransportScan(tables: TransportTables, source: Source, scannedPackages: readonly string[], rows: readonly PackageTransport[]): TransportTables {
  if (tables.sources.some((one) => one.id === source.id)) throw new Error(`The table sources already has the source ${source.id}.`);
  const scanned = new Set(scannedPackages);
  const stray = rows.find((row) => !scanned.has(row.package) || row.source !== source.id);
  if (stray !== undefined) throw new Error(`The row of ${stray.package} ${stray.file} is not a row of the scan ${source.id}.`);
  return { sources: [...tables.sources, source], packageTransports: [...tables.packageTransports.filter((row) => !scanned.has(row.package)), ...rows] };
}
