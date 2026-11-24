/**
 * The scan of the transports of each package of the catalog, for the workflow `transports.yml`. For each package, the
 * script gets the tarball of its latest version with `npm pack`, without its scripts. It makes each tarball a git
 * repository with one commit, because codeatlas reads git repositories. Then the command `facts --files published` of
 * codeatlas gives the global names that each published file uses.
 *
 * The script keeps the names that the table `transportGlobals` gives to a transport. It adds one source and its rows to
 * the files `sources.json` and `package-transports.json` of the catalog, in their canonical form. The new rows replace
 * the old rows of each scanned package. It writes a summary in Markdown to `--summary`, or to the standard output.
 *
 * The commands start with argv and no shell. Without a scanned package, the script writes no file and gives the exit
 * code 1.
 *
 * Start: `node scripts/transports.ts --atlas=<codeatlas folder> --work=<empty folder> [--summary=<file>] [--only=<count>]`
 */
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { errorMessage } from "@mark1russell7/text";
import { TABLE_FILES, addTransportScan, catalog, parseCatalog, rawTables, tableText, transportUses, type ScannedPackage, type Source } from "../packages/catalog/src/index.ts";

const DATA = join(import.meta.dirname, "..", "packages", "catalog", "src", "data");
/** The author of the one commit of each package repository. It names no person. */
const GIT_AUTHOR = ["-c", "user.name=transport-scan", "-c", "user.email=transport-scan@example.invalid", "-c", "commit.gpgsign=false"];

const option = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const atlas = option("atlas");
const work = option("work");
const only = option("only");
const summaryFile = option("summary");
if (atlas === undefined || work === undefined) throw new Error("The script needs --atlas=<codeatlas folder> and --work=<empty folder>.");
if (only !== undefined && !/^[1-9][0-9]*$/.test(only)) throw new Error(`--only=${only} is not a count of 1 or more.`);
const names = catalog.packages.map((one) => one.name).slice(0, only === undefined ? undefined : Number(only));

const log = (text: string): void => console.log(`${new Date().toISOString()} ${text}`);
const run = (command: string, args: readonly string[], cwd: string): string => execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });

const root = resolve(work);
const tarballs = join(root, "tarballs");
await mkdir(tarballs, { recursive: true });

/** The packages that the scan read, and the reason of each package that it did not read. */
const scanned: ScannedPackage[] = [];
const failures: string[] = [];

for (const [index, name] of names.entries()) {
  try {
    const packed = JSON.parse(run("npm", ["pack", `${name}@latest`, "--ignore-scripts", "--json", "--pack-destination", tarballs], root)) as readonly { readonly filename: string; readonly version: string }[];
    const first = packed[0];
    if (first === undefined) throw new Error("npm pack gave no tarball.");
    const repo = `p${String(index).padStart(4, "0")}`;
    const folder = join(root, "packages", repo);
    await mkdir(folder, { recursive: true });
    run("tar", ["-xzf", join(tarballs, first.filename), "-C", folder, "--strip-components=1"], root);
    run("git", ["init", "-q"], folder);
    run("git", ["add", "-A", "-f"], folder);
    run("git", [...GIT_AUTHOR, "commit", "-q", "--allow-empty", "-m", `${name}@${first.version}`], folder);
    scanned.push({ repo, package: name, version: first.version });
    log(`${name}@${first.version}: unpacked`);
  } catch (error) {
    failures.push(`${name}: ${errorMessage(error).split("\n")[0] ?? ""}`);
  }
}

if (scanned.length === 0) {
  console.error("The scan read no package, so the script writes no file.");
  process.exit(1);
}

const factsFile = join(root, "facts.jsonl");
run("node", [join(resolve(atlas), "packages", "atlas", "src", "cli.ts"), "facts", "--files", "published", "--out", factsFile, "--repos-dir", join(root, "packages")], resolve(atlas));
const records = (await readFile(factsFile, "utf8"))
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line): unknown => JSON.parse(line));
const atlasCommit = run("git", ["rev-parse", "HEAD"], resolve(atlas)).trim();

const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const source: Source = {
  id: `transports-${at.slice(0, 10)}-${String(process.env["GITHUB_RUN_ID"] ?? "local")}`,
  at,
  what: "The global names of the published files of the latest version of each package, from codeatlas facts --files published.",
  note: `${String(scanned.length)} of ${String(names.length)} packages. codeatlas ${atlasCommit.slice(0, 12)}. Failed packages: ${String(failures.length)}.`,
};
const rows = transportUses(records, scanned, catalog.transportGlobals, source.id);
const tables = addTransportScan({ sources: catalog.sources, packageTransports: catalog.packageTransports }, source, scanned.map((one) => one.package), rows);
parseCatalog({ ...rawTables, ...tables });

const packagesOf = new Map<string, Set<string>>();
for (const row of rows) packagesOf.set(row.transport, (packagesOf.get(row.transport) ?? new Set()).add(row.package));
const withTransport = new Set(rows.map((row) => row.package));
const without = scanned.filter((one) => !withTransport.has(one.package)).map((one) => one.package);
const lines = [
  `## The transports of the packages, ${at}`,
  "",
  source.note ?? "",
  "",
  "| Transport | Packages |",
  "| --- | --- |",
  ...[...packagesOf.entries()].sort((a, b) => b[1].size - a[1].size).map(([transport, set]) => `| \`${transport}\` | ${String(set.size)} |`),
  "",
];
if (without.length > 0) lines.push("### The packages with no transport global", "", without.map((one) => `\`${one}\``).join(", "), "");
if (failures.length > 0) lines.push("### Failed packages", "", ...failures.map((one) => `- ${one}`), "");
const summary = `${lines.join("\n")}\n`;
if (summaryFile === undefined) console.log(summary);
else await appendFile(summaryFile, summary);

await writeFile(join(DATA, TABLE_FILES.sources), tableText("sources", tables.sources));
await writeFile(join(DATA, TABLE_FILES.packageTransports), tableText("packageTransports", tables.packageTransports));
log(`wrote ${String(rows.length)} rows of the source ${source.id} (${String((await readdir(join(root, "packages"))).length)} package folders)`);
