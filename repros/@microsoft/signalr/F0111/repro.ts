// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// FetchHttpClient (the default HttpClient on Node.js 18 and later) calls requireFunc("tough-cookie")
// at run time. @microsoft/signalr does not declare tough-cookie as a dependency: it is only in the
// "overrides" of its package.json, and overrides have no effect on a consumer. npm hoists the
// tough-cookie of fetch-cookie to the top of node_modules, so a flat install works. A strict layout
// (pnpm with no hoist, Yarn Plug'n'Play, or a bundler that resolves from the package folder) cannot
// find it, and HubConnectionBuilder.build() throws "Cannot find module 'tough-cookie'".
//
// The repro copies @microsoft/signalr and its declared dependencies (and theirs, each in its own
// nested node_modules) into a temporary strict layout. A resolution that leaves that layout fails.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

interface PackageJson {
  readonly dependencies?: Record<string, string>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const strictRoot = fs.mkdtempSync(path.join(os.tmpdir(), "signalr-strict-"));
fs.writeFileSync(path.join(strictRoot, "package.json"), JSON.stringify({ name: "strict", private: true }));

function place(name: string, fromDir: string, intoNodeModules: string, chain: readonly string[]): void {
  if (chain.includes(name)) return;
  // The lookup of Node.js: <dir>/node_modules/<name>, up from the package that requires it.
  let pkgJson: string | undefined;
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name, "package.json");
    if (fs.existsSync(candidate)) {
      pkgJson = candidate;
      break;
    }
    if (path.dirname(dir) === dir) throw new Error(`cannot find ${name} from ${fromDir}`);
  }
  const srcDir = path.dirname(pkgJson);
  const dstDir = path.join(intoNodeModules, name);
  fs.cpSync(srcDir, dstDir, { recursive: true, filter: (p) => !p.slice(srcDir.length).includes(`${path.sep}node_modules`) });
  const deps = Object.keys((JSON.parse(fs.readFileSync(pkgJson, "utf8")) as PackageJson).dependencies ?? {});
  for (const d of deps) place(d, srcDir, path.join(dstDir, "node_modules"), [...chain, name]);
}
place("@microsoft/signalr", here, path.join(strictRoot, "node_modules"), []);

const signalrPkg = path.join(strictRoot, "node_modules", "@microsoft", "signalr", "package.json");
const declared = Object.keys((JSON.parse(fs.readFileSync(signalrPkg, "utf8")) as PackageJson).dependencies ?? {});
console.log(`declared dependencies of @microsoft/signalr: ${declared.join(", ")}`);

interface ModuleInternals {
  _resolveFilename: (this: unknown, request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) => string;
}
const Module = createRequire(import.meta.url)("node:module") as ModuleInternals;
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  const resolved = originalResolve.call(this, request, parent, ...rest);
  if (path.isAbsolute(resolved) && !resolved.startsWith(strictRoot + path.sep)) {
    const err = new Error(`Cannot find module '${request}' (only outside the strict layout, from ${parent?.filename})`) as Error & { code: string };
    err.code = "MODULE_NOT_FOUND";
    throw err;
  }
  return resolved;
};

interface SignalR {
  readonly HubConnectionBuilder: new () => { withUrl(url: string): { configureLogging(level: number): { build(): unknown } } };
  readonly LogLevel: { readonly None: number };
}
const requireStrict = createRequire(path.join(strictRoot, "index.js"));
let outcome: string;
try {
  const signalR = requireStrict("@microsoft/signalr") as SignalR;
  new signalR.HubConnectionBuilder().withUrl("http://127.0.0.1:1/hub").configureLogging(signalR.LogLevel.None).build();
  outcome = "build() succeeded";
} catch (e) {
  outcome = `build() threw: ${String((e as Error).message).split("\n")[0]}`;
}
Module._resolveFilename = originalResolve;
fs.rmSync(strictRoot, { recursive: true, force: true });

console.log(outcome);
console.log("expected: build() succeeds when only the declared dependencies are installed");
if (outcome !== "build() succeeded") {
  console.log("BUG PRESENT: @microsoft/signalr requires 'tough-cookie' at run time but does not declare it.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
