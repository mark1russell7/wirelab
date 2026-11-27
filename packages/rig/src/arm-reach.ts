/**
 * The reach of a change: the arms whose result the change can alter. The workflow `rig-arms.yml` starts only these arms.
 * The plan job of the workflow has no install, so this file imports only `node:` modules.
 *
 * An arm job examines the arm block of a test file. Each arm block takes only the targets of its arm. So the result of an
 * arm depends on the closure of its roots. The roots are the probe module of its class and the files that define its
 * targets. The test files that import that probe module are also roots.
 *
 * A test file or a target list (`*-targets.ts`) only picks targets by id. So the
 * closure does not go from them into the files of other targets, or into the probe modules of other classes. The suite of
 * the main CI imports each file, so it finds a fault that occurs when a module loads.
 *
 * The closure leaves out the files of other targets only when each target of the arm has a home (`targetHomes`). The test
 * of this file shows that each module that gives an arm target is its home or imports its home.
 *
 * A file with only types emits no JavaScript, and an arm job does not examine the types. So a change to such a file
 * reaches no arm, when the file has only types before and after the change (`typesOnly`).
 */
import { posix } from "node:path";
import type { Arm } from "./arms.ts";

/** The folder of the rig in the repository. */
export const RIG = "packages/rig";

/** The file of the arms. A change to it reaches only the arms whose entries change. */
export const ARMS_FILE: string = `${RIG}/src/arms.json`;

/** The folder of the targets in the repository. */
const TARGETS = `${RIG}/src/targets/`;

/** A probe module of a class, for example `src/probes/c001.ts`. */
const PROBE_MODULE = /^packages\/rig\/src\/probes\/c\d{3}\.ts$/;

/** This function gives the relative imports of the source `text` of `path`, as paths of the repository. */
export function importsOf(path: string, text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\b(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g)) {
    const spec = match[1];
    if (spec !== undefined) found.push(posix.normalize(posix.join(posix.dirname(path), spec)));
  }
  return found;
}

/**
 * This function gives the homes of the targets of `arms`. The homes of a target id are the files of `src/targets` that
 * have the id as a quoted string. A target whose id the code computes has no home.
 */
export function targetHomes(texts: ReadonlyMap<string, string>, arms: readonly Arm[]): Map<string, string[]> {
  const homes = new Map<string, string[]>();
  for (const id of new Set(arms.flatMap((arm) => arm.targets))) {
    homes.set(
      id,
      [...texts].filter(([path, text]) => path.startsWith(TARGETS) && text.includes(`"${id}"`)).map(([path]) => path),
    );
  }
  return homes;
}

/** A token of a source text: its text, the depth of brackets before it, and if a line break comes before it. */
interface Token {
  readonly text: string;
  readonly depth: number;
  readonly newline: boolean;
}

/**
 * This function gives the tokens of `text` without the comments. It gives undefined for a template literal, a line break
 * in a string, a comment that does not end and brackets that do not match. The check of types then fails.
 */
function tokensOf(text: string): Token[] | undefined {
  const tokens: Token[] = [];
  let depth = 0;
  let newline = false;
  for (let at = 0; at < text.length; ) {
    const char = text.charAt(at);
    if (char === "\n") {
      newline = true;
      at += 1;
    } else if (/\s/.test(char)) {
      at += 1;
    } else if (text.startsWith("//", at)) {
      const end = text.indexOf("\n", at);
      at = end === -1 ? text.length : end;
    } else if (text.startsWith("/*", at)) {
      const end = text.indexOf("*/", at + 2);
      if (end === -1) return undefined;
      if (text.slice(at, end).includes("\n")) newline = true;
      at = end + 2;
    } else {
      if (char === "`") return undefined;
      let end = at + 1;
      if (char === '"' || char === "'") {
        while (end < text.length && text.charAt(end) !== char) {
          if (text.charAt(end) === "\n") return undefined;
          end += text.charAt(end) === "\\" ? 2 : 1;
        }
        if (end >= text.length) return undefined;
        end += 1;
      } else if (/[\w$]/.test(char)) {
        while (end < text.length && /[\w$]/.test(text.charAt(end))) end += 1;
      } else if (text.startsWith("=>", at)) {
        end = at + 2;
      }
      tokens.push({ text: text.slice(at, end), depth, newline });
      newline = false;
      if ("([{".includes(char)) depth += 1;
      if (")]}".includes(char)) depth -= 1;
      if (depth < 0) return undefined;
      at = end;
    }
  }
  return depth === 0 ? tokens : undefined;
}

/** This function tells if `text` is a name, for example `Outcome`. */
const isName = (text: string | undefined): boolean => text !== undefined && /^[A-Za-z_$][\w$]*$/.test(text);

/**
 * This function gives the number of tokens of the head of a type statement at `at`, or 0 when no type statement starts
 * there. The heads are `import type`, `export type`, `type`, `interface` and `export interface`. The function also
 * examines the tokens after the head, because `type = 1` and `import type from "./a.ts"` are code.
 */
function headAt(tokens: readonly Token[], at: number): number {
  const text = (offset: number): string | undefined => tokens[at + offset]?.text;
  const exported = text(0) === "export" ? 1 : 0;
  if (text(exported) === "interface" && isName(text(exported + 1))) return exported + 1;
  if (text(0) === "import" && text(1) === "type") {
    return text(2) === "{" || text(2) === "*" || (isName(text(2)) && text(2) !== "from") ? 2 : 0;
  }
  if (exported === 1 && text(1) === "type") return text(2) === "{" || text(2) === "*" || isName(text(2)) ? 2 : 0;
  if (text(0) === "type" && isName(text(1)) && (text(2) === "=" || text(2) === "<")) return 1;
  return 0;
}

/** A token before a line break that continues a type, for example the `|` of a union. */
const CONTINUES_BEFORE = new Set(["=", "|", "&", "?", ":", "=>", ",", "extends"]);

/** A token after a line break that continues a type, for example the `|` of a union. */
const CONTINUES_AFTER = new Set(["|", "&", "?", ":", "=>", "extends"]);

/**
 * This function tells if the source `text` has only type statements, so it emits no JavaScript. A doubtful text gives
 * false. The reach of a change to the file is then the reach of a change to code.
 */
export function typesOnly(text: string): boolean {
  const tokens = tokensOf(text);
  if (tokens === undefined || tokens.length === 0) return false;
  let at = 0;
  while (at < tokens.length) {
    const head = headAt(tokens, at);
    if (head === 0) return false;
    const isInterface = tokens[at + head - 1]?.text === "interface";
    at += head;
    for (; at < tokens.length; at += 1) {
      const token = tokens[at];
      if (token === undefined || token.depth > 1) continue;
      // A semicolon or the closing brace of an interface ends the statement.
      if ((token.depth === 0 && token.text === ";") || (isInterface && token.depth === 1 && token.text === "}")) {
        at += 1;
        while (tokens[at]?.text === ";") at += 1;
        break;
      }
      if (token.depth === 1 || !token.newline) continue;
      // After a line break at the depth 0, the type continues, or a new type statement starts.
      if (CONTINUES_AFTER.has(token.text) || CONTINUES_BEFORE.has(tokens[at - 1]?.text ?? "")) continue;
      if (!isInterface && headAt(tokens, at) > 0) break;
      return false;
    }
  }
  return true;
}

/** The import graph of the sources of the rig, and the homes of the arm targets. */
interface Graph {
  readonly imports: ReadonlyMap<string, readonly string[]>;
  readonly homes: ReadonlyMap<string, readonly string[]>;
  /** The arm targets that each file is a home of. */
  readonly housed: ReadonlyMap<string, readonly string[]>;
}

/** This function gives the graph of `texts`: each source file of the rig, with its path in the repository. */
function graphOf(texts: ReadonlyMap<string, string>, arms: readonly Arm[]): Graph {
  const imports = new Map([...texts].map(([path, text]) => [path, importsOf(path, text)] as const));
  const homes = targetHomes(texts, arms);
  const housed = new Map<string, string[]>();
  for (const [id, paths] of homes) for (const path of paths) housed.set(path, [...(housed.get(path) ?? []), id]);
  return { imports, homes, housed };
}

/** This function tells if `path` only picks targets by id: a test file or a target list. */
const picksTargets = (path: string): boolean => path.endsWith(".test.ts") || path.endsWith("-targets.ts");

/** This function gives the probe module of the class of `arm`. */
const probeOf = (arm: Arm): string => `${RIG}/src/probes/${arm.class.toLowerCase()}.ts`;

/** This function tells if each target of `arm` has a home. Only then can its closure leave out the files of other targets. */
export function cutsTargets(arm: Arm, homes: ReadonlyMap<string, readonly string[]>): boolean {
  return arm.targets.every((id) => (homes.get(id) ?? []).length > 0);
}

/** This function gives each source file whose change can alter the result of `arm`. */
function closureOf(arm: Arm, graph: Graph): Set<string> {
  const probe = probeOf(arm);
  const cuts = cutsTargets(arm, graph.homes);
  const own = (path: string): boolean => (graph.housed.get(path) ?? []).some((id) => arm.targets.includes(id));
  const other = (path: string): boolean => cuts && (graph.housed.get(path) ?? []).length > 0 && !own(path);
  const roots = [...graph.imports.keys()].filter(
    (path) => path === probe || own(path) || (path.endsWith(".test.ts") && (graph.imports.get(path) ?? []).includes(probe)),
  );
  const seen = new Set<string>();
  const next = [...roots];
  for (let path = next.pop(); path !== undefined; path = next.pop()) {
    if (seen.has(path) || !graph.imports.has(path)) continue;
    seen.add(path);
    for (const one of graph.imports.get(path) ?? []) {
      if (picksTargets(path) && (other(one) || (PROBE_MODULE.test(one) && one !== probe))) continue;
      next.push(one);
    }
  }
  return seen;
}

/** The input of `armReach`. */
export interface ReachInput {
  /** The arms after the change. */
  readonly arms: readonly Arm[];
  /** The arms before the change, or undefined when the file of the arms is new. */
  readonly baseArms: readonly Arm[] | undefined;
  /** The paths of the repository that the change adds, changes or removes. */
  readonly changed: readonly string[];
  /** Each `.ts` file of `packages/rig/src` after the change: its path in the repository and its text. */
  readonly texts: ReadonlyMap<string, string>;
  /**
   * Each changed `.ts` file of `packages/rig/src` before the change, with its text. A file that is not in it is new.
   * Without this map, no file counts as a file with only types.
   */
  readonly baseTexts?: ReadonlyMap<string, string>;
}

/**
 * This function gives each arm that the change reaches, with the changed paths that reach it, in the order of the arms.
 * Each other path reaches each arm. Examples are a path outside the rig, the lockfile and a configuration file of the rig.
 */
export function armReach(input: ReachInput): Map<string, string[]> {
  const { arms, baseArms, changed, texts, baseTexts } = input;
  const onlyTypes = (path: string): boolean => {
    const after = texts.get(path);
    const before = baseTexts?.get(path);
    return baseTexts !== undefined && after !== undefined && typesOnly(after) && (before === undefined || typesOnly(before));
  };
  const graph = graphOf(texts, arms);
  const closures = new Map(arms.map((arm) => [arm.id, closureOf(arm, graph)]));
  const reach = new Map<string, string[]>(arms.map((arm) => [arm.id, []]));
  const add = (arm: Arm, path: string): void => {
    reach.get(arm.id)?.push(path);
  };
  for (const path of changed) {
    if (path === ARMS_FILE) {
      // A different order of the keys also counts as a change. That gives one more arm, never one less.
      for (const arm of arms) {
        const before = baseArms?.find((one) => one.id === arm.id);
        if (before === undefined || JSON.stringify(before) !== JSON.stringify(arm)) add(arm, path);
      }
    } else if (path.endsWith(".md")) {
      // No code of the rig or of its workspace packages reads Markdown.
      continue;
    } else if (path.startsWith(`${RIG}/arms/`)) {
      for (const arm of arms) if (arm.patch !== undefined && `${RIG}/${arm.patch}` === path) add(arm, path);
    } else if (path.startsWith(`${RIG}/src/`) && path.endsWith(".ts")) {
      // A file with only types before and after the change emits no JavaScript, so it alters no arm.
      if (onlyTypes(path)) continue;
      for (const arm of arms) if (closures.get(arm.id)?.has(path) === true) add(arm, path);
    } else {
      for (const arm of arms) add(arm, path);
    }
  }
  return new Map([...reach].filter(([, paths]) => paths.length > 0));
}

/** One row of the matrix of the workflow: one arm and one kind. */
export interface ArmRow {
  readonly id: string;
  readonly kind: "base" | "fixed";
  readonly repository: string;
  readonly commit: string;
  readonly patch: string;
  readonly build: string;
  readonly folder: string;
  readonly copy: string;
  readonly package: string;
  /** The folders of the sparse checkout, one on each line. An empty text checks out all files. */
  readonly sparse: string;
}

/** This function gives the rows of the matrix of `arms`: the kind `base` and the kind `fixed` of each arm. */
export function armRows(arms: readonly Arm[]): ArmRow[] {
  return arms.flatMap((arm) =>
    (["base", "fixed"] as const).map((kind) => ({
      id: arm.id,
      kind,
      repository: arm.repository,
      commit: kind === "base" ? arm.base : (arm.fix ?? arm.base),
      patch: kind === "fixed" ? (arm.patch ?? "") : "",
      build: arm.build,
      folder: arm.folder,
      copy: arm.copy.join(" "),
      package: arm.package,
      sparse: (arm.sparse ?? []).join("\n"),
    })),
  );
}
