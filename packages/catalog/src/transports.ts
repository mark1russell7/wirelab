/**
 * A new read of the transports of each package. `filesOfFacts` reads the output of the `facts` command of `codeatlas`.
 * `transportUsesOf` finds the markers of the transports in the published files. `replaceUses` gives the tables
 * `sources` and `transportUses` with the new read. The script `scripts/transports.ts` makes the read.
 */
import type { MarkerKind, Source, TransportMarker, TransportUse } from "./schema.ts";

/** One name of the global scope that a file uses, at the line of its first use. */
export interface GlobalName {
  readonly name: string;
  readonly line: number;
}

/** One call in a file: the text of its callee, as `socket.send`, and its line. */
export interface Call {
  readonly callee: string;
  readonly line: number;
}

/** One published file of a package, and the names that it uses. */
export interface PublishedFile {
  readonly path: string;
  readonly globals: readonly GlobalName[];
  readonly calls: readonly Call[];
}

/** The format of the facts that `filesOfFacts` reads: the `facts` command of `codeatlas` writes it. */
export const FACTS_FORMAT = "facts/5";

/**
 * This function reads the JSON Lines of the `facts` command of `codeatlas`. It gives the files of each repository
 * name, with the global names and the calls of each file. A test file, a file with a parse error and a file of another
 * format of the facts stay out. It throws an error at a line that is not JSON.
 */
export function filesOfFacts(lines: Iterable<string>): Map<string, PublishedFile[]> {
  const blobs = new Map<string, { readonly globals: readonly GlobalName[]; readonly calls: readonly Call[] }>();
  const files: { readonly repo: string; readonly path: string; readonly blob: string }[] = [];
  let index = 0;
  for (const text of lines) {
    index += 1;
    if (text.trim() === "") continue;
    let line: FactsLine;
    try {
      line = JSON.parse(text) as FactsLine;
    } catch {
      throw new Error(`The line ${String(index)} of the facts is not JSON.`);
    }
    if (line.kind === "file" && !line.test) files.push({ repo: line.repo, path: line.path, blob: line.blob });
    if (line.kind === "blob" && line.facts.ok && line.key.endsWith(`:${FACTS_FORMAT}`)) {
      const { globals, callSites } = line.facts.facts;
      blobs.set(line.key.slice(0, line.key.indexOf(":")), {
        globals: globals.map((g) => ({ name: g.name, line: g.line })),
        calls: callSites.map((c) => ({ callee: c.callee, line: c.line })),
      });
    }
  }
  const byRepo = new Map<string, PublishedFile[]>();
  for (const file of files) {
    const facts = blobs.get(file.blob);
    if (facts === undefined) continue;
    const list = byRepo.get(file.repo) ?? [];
    list.push({ path: file.path, ...facts });
    byRepo.set(file.repo, list);
  }
  return byRepo;
}

/** The fields of the lines of the facts that `filesOfFacts` reads. The lines have more fields. */
type FactsLine =
  | { readonly kind: "file"; readonly repo: string; readonly path: string; readonly blob: string; readonly test: boolean }
  | {
      readonly kind: "blob";
      readonly key: string;
      readonly facts:
        | {
            readonly ok: true;
            readonly facts: {
              readonly globals: readonly { readonly name: string; readonly line: number }[];
              readonly callSites: readonly { readonly callee: string; readonly line: number }[];
            };
          }
        | { readonly ok: false };
    }
  | { readonly kind: "repo" };

/** A minified file has its code on few lines, so its line is weak evidence. The evidence prefers another file. */
const MINIFIED = /\.min\.[cm]?js$/;

/** The method name of the text of a callee: `send` for `socket.send` and for `socket?.send`. */
const METHOD = /(?:\?\.|\.)([A-Za-z_$][\w$]*)$/;

/** The files of one package at one version. */
export interface PackageFiles {
  readonly package: string;
  readonly version: string;
  readonly files: readonly PublishedFile[];
}

interface Evidence {
  readonly minified: boolean;
  readonly file: string;
  readonly line: number;
}

/** This function tells if the evidence `a` comes before `b`: a file that is not minified, then the path, then the line. */
function before(a: Evidence, b: Evidence): boolean {
  if (a.minified !== b.minified) return !a.minified;
  if (a.file !== b.file) return a.file < b.file;
  return a.line < b.line;
}

/**
 * This function gives one use for each package and each marker that its files have. The evidence of a use is the
 * first place of the marker, in a file that is not minified when one has it. `files` counts the files with the marker.
 */
export function transportUsesOf(packages: readonly PackageFiles[], markers: readonly TransportMarker[], source: string): TransportUse[] {
  const known = new Set(markers.map((m) => `${m.kind} ${m.name}`));
  const uses: TransportUse[] = [];
  for (const one of packages) {
    const found = new Map<string, { readonly kind: MarkerKind; readonly name: string; readonly files: Set<string>; best: Evidence }>();
    const add = (kind: MarkerKind, name: string, file: string, line: number): void => {
      const key = `${kind} ${name}`;
      if (!known.has(key)) return;
      const evidence: Evidence = { minified: MINIFIED.test(file), file, line };
      const entry = found.get(key);
      if (entry === undefined) found.set(key, { kind, name, files: new Set([file]), best: evidence });
      else {
        entry.files.add(file);
        if (before(evidence, entry.best)) entry.best = evidence;
      }
    };
    for (const file of one.files) {
      for (const g of file.globals) add("global", g.name, file.path, g.line);
      for (const c of file.calls) {
        const method = METHOD.exec(c.callee)?.[1];
        if (method !== undefined) add("method", method, file.path, c.line);
      }
    }
    for (const entry of found.values()) {
      const { file, line } = entry.best;
      uses.push({ package: one.package, source, version: one.version, kind: entry.kind, name: entry.name, file, line, files: entry.files.size });
    }
  }
  return uses;
}

/** The two tables that a new read of the transports changes. */
export interface TransportTables {
  readonly sources: readonly Source[];
  readonly transportUses: readonly TransportUse[];
}

/**
 * This function adds the source of a new read, and replaces the uses of each package that the read examined. The
 * uses of another package stay, with their old source. It throws an error when the tables already have the source id.
 */
export function replaceUses(tables: TransportTables, source: Source, read: readonly string[], uses: readonly TransportUse[]): TransportTables {
  if (tables.sources.some((s) => s.id === source.id)) throw new Error(`The sources already have ${source.id}.`);
  const examined = new Set(read);
  const other = uses.find((u) => !examined.has(u.package) || u.source !== source.id);
  if (other !== undefined) throw new Error(`The use of ${other.package} is not of the read ${source.id}.`);
  return {
    sources: [...tables.sources, source],
    transportUses: [...tables.transportUses.filter((u) => !examined.has(u.package)), ...uses],
  };
}
