/**
 * The read of the transports of each package of the catalog, for the workflow `transports.yml`:
 *
 * 1. For each package, `npm pack` fetches the tarball of its newest version in the registry table. `tar` unpacks it
 *    into its own folder of `--work`.
 * 2. One git repository keeps all the folders: the `facts` command of `codeatlas` reads only the files that git keeps.
 * 3. `codeatlas facts` reads the files of all packages. The script finds the markers of the transports in its facts.
 * 4. The script adds one source to `sources.json` and replaces the uses of each package that it read in
 *    `transport-uses.json`, in their canonical form.
 *
 * Shortcut: `npm pack` fetches the tarballs, because polite-crawler 0.7.6 gives only text bodies. It ends when
 * polite-crawler gives bytes: then the script fetches each tarball through it and checks its integrity.
 *
 * The script writes a summary in Markdown to `--summary`, or to the standard output. When it reads no package, it
 * writes no file and gives the exit code 1.
 *
 * Start: `node scripts/transports.ts --codeatlas=<folder> --work=<folder> [--summary=<file>] [--only=<count>]`
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { errorMessage } from "@mark1russell7/text";
import { TABLE_FILES, catalog, filesOfFacts, newestRegistry, parseCatalog, rawTables, replaceUses, tableText, transportUsesOf, type PackageFiles, type Source } from "../packages/catalog/src/index.ts";

const DATA = join(import.meta.dirname, "..", "packages", "catalog", "src", "data");

const option = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const codeatlas = option("codeatlas");
const work = option("work");
const only = option("only");
const summaryFile = option("summary");
if (codeatlas === undefined || work === undefined) throw new Error("Give --codeatlas=<folder> and --work=<folder>.");
if (only !== undefined && !/^[1-9][0-9]*$/.test(only)) throw new Error(`--only=${only} is not a count of 1 or more.`);

const log = (text: string): void => console.log(`${new Date().toISOString()} ${text}`);
const run = (command: string, args: readonly string[], cwd: string): string => execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const started = new Date();
const versions = newestRegistry(catalog);
const wanted = catalog.packages
  .map((p) => p.name)
  .filter((name) => versions.has(name))
  .slice(0, only === undefined ? undefined : Number(only));

const root = resolve(work);
const tarballs = join(root, "tarballs");
const packages = join(root, "packages");
mkdirSync(tarballs, { recursive: true });
mkdirSync(packages, { recursive: true });

/** The folder of each package that the script unpacked. A folder name is the place of the package in the list. */
const folders = new Map<string, { readonly name: string; readonly version: string }>();
const failures: string[] = [];
wanted.forEach((name, index) => {
  const version = versions.get(name)?.version ?? "";
  const folder = `p${String(index + 1).padStart(4, "0")}`;
  try {
    const packed = JSON.parse(run("npm", ["pack", `${name}@${version}`, "--json", "--ignore-scripts", "--pack-destination", tarballs], root)) as { readonly filename: string }[];
    const filename = packed[0]?.filename;
    if (filename === undefined) throw new Error("npm pack gave no file.");
    const target = join(packages, folder);
    mkdirSync(target);
    run("tar", ["-xzf", join(tarballs, filename.replace(/^@/, "").replace("/", "-")), "-C", target, "--strip-components=1", "--no-same-owner", "--no-same-permissions"], root);
    folders.set(folder, { name, version });
  } catch (error) {
    failures.push(`${name}@${version}: ${errorMessage(error).split("\n")[0] ?? ""}`);
  }
});
log(`unpacked ${String(folders.size)} of ${String(wanted.length)} packages`);
if (folders.size === 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

run("git", ["init", "-q"], packages);
run("git", ["add", "-A", "-f", "."], packages);
run("git", ["-c", "user.name=read", "-c", "user.email=read@localhost", "commit", "-q", "-m", "The published files"], packages);

const factsFile = join(root, "facts.jsonl");
const repos = readdirSync(packages).filter((folder) => folders.has(folder)).map((folder) => `${folder}=${join(packages, folder)}`);
run("node", [join(resolve(codeatlas), "packages", "atlas", "src", "cli.ts"), "facts", "--out", factsFile, ...repos], root);

const byFolder = filesOfFacts(readFileSync(factsFile, "utf8").split("\n"));
const read: PackageFiles[] = [...folders].map(([folder, p]) => ({ package: p.name, version: p.version, files: byFolder.get(folder) ?? [] }));
const commit = run("git", ["rev-parse", "HEAD"], resolve(codeatlas)).trim();
const at = `${started.toISOString().slice(0, 19)}Z`;
const source: Source = {
  id: `transports-${at.slice(0, 10)}`,
  at,
  what: `The published files of the newest version of each package, from npm pack, with the facts of codeatlas at ${commit.slice(0, 12)}.`,
  note: `${String(read.length)} packages. Packs that failed: ${String(failures.length)}.`,
};
const uses = transportUsesOf(read, catalog.transportMarkers, source.id);
const tables = replaceUses(catalog, source, read.map((p) => p.package), uses);
parseCatalog({ ...rawTables, ...tables });
writeFileSync(join(DATA, TABLE_FILES.sources), tableText("sources", tables.sources));
writeFileSync(join(DATA, TABLE_FILES.transportUses), tableText("transportUses", tables.transportUses));

const marker = new Map(catalog.transportMarkers.map((m) => [`${m.kind} ${m.name}`, m.transport]));
const transportsOf = new Map<string, Set<string>>();
for (const u of uses) transportsOf.set(u.package, (transportsOf.get(u.package) ?? new Set()).add(marker.get(`${u.kind} ${u.name}`) ?? "?"));
const counts = new Map<string, number>();
for (const set of transportsOf.values()) for (const t of set) counts.set(t, (counts.get(t) ?? 0) + 1);
const summary = [
  `## The transports of ${String(read.length)} packages`,
  "",
  `Source \`${source.id}\`. Uses: ${String(uses.length)}. Packages with no marker: ${String(read.length - transportsOf.size)}.`,
  "",
  "| Transport | Packages |",
  "| --- | --- |",
  ...[...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([t, n]) => `| ${t} | ${String(n)} |`),
  "",
  failures.length === 0 ? "Each pack passed." : `Packs that failed:\n\n${failures.map((f) => `- ${f}`).join("\n")}`,
  "",
].join("\n");
if (summaryFile === undefined) console.log(summary);
else appendFileSync(summaryFile, summary);
