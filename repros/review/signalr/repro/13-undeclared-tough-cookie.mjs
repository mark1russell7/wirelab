// R13: on Node, FetchHttpClient's constructor does requireFunc("tough-cookie"), but package.json
// of @microsoft/signalr does not declare tough-cookie (it is only in "overrides", and it reaches
// node_modules as a dependency of fetch-cookie). It works with npm's flat hoisting only. In a
// strict layout (each package sees only its declared dependencies, as with Yarn PnP or pnpm
// without hoisting), HubConnectionBuilder.build() throws "Cannot find module 'tough-cookie'",
// because HttpConnection's constructor creates the DefaultHttpClient.
//
// The script builds a strict (fully nested) copy of @microsoft/signalr and its declared
// dependency tree from ../node_modules into ../strict-layout, then loads it. No network.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const strictRoot = path.join(root, "strict-layout");
fs.rmSync(strictRoot, { recursive: true, force: true });
fs.mkdirSync(strictRoot, { recursive: true });
fs.writeFileSync(path.join(strictRoot, "package.json"), JSON.stringify({ name: "strict", private: true }));

// Copy a package (as npm resolved it from `fromDir`) into `intoNodeModules`, then its own
// dependencies into its own node_modules. Nothing is hoisted.
function place(name, fromDir, intoNodeModules, chain) {
    if (chain.includes(name)) { return; }
    // Node's lookup: <dir>/node_modules/<name>, walking up from the requiring package.
    let pkgJson;
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
        const candidate = path.join(dir, "node_modules", name, "package.json");
        if (fs.existsSync(candidate)) { pkgJson = candidate; break; }
        if (path.dirname(dir) === dir) { throw new Error(`cannot find ${name} from ${fromDir}`); }
    }
    const srcDir = path.dirname(pkgJson);
    const dstDir = path.join(intoNodeModules, name);
    fs.cpSync(srcDir, dstDir, { recursive: true, filter: (p) => !p.slice(srcDir.length).includes(`${path.sep}node_modules`) });
    const deps = Object.keys(JSON.parse(fs.readFileSync(pkgJson, "utf8")).dependencies || {});
    for (const d of deps) { place(d, srcDir, path.join(dstDir, "node_modules"), [...chain, name]); }
}
place("@microsoft/signalr", root, path.join(strictRoot, "node_modules"), []);

const declared = Object.keys(JSON.parse(fs.readFileSync(path.join(strictRoot, "node_modules/@microsoft/signalr/package.json"), "utf8")).dependencies);
console.log(`declared dependencies of @microsoft/signalr: ${declared.join(", ")}`);

// strict-layout/ sits inside review-signalr/, whose own flat node_modules Node would find by
// walking up the folders. A standalone project has no such parent, so refuse any resolution
// that leaves strict-layout/ (built-in modules are allowed).
const Module = createRequire(import.meta.url)("node:module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    const resolved = originalResolve.call(this, request, parent, ...rest);
    if (path.isAbsolute(resolved) && !resolved.startsWith(strictRoot + path.sep)) {
        const err = new Error(`Cannot find module '${request}' (only reachable outside the strict layout, from ${parent && parent.filename})`);
        err.code = "MODULE_NOT_FOUND";
        throw err;
    }
    return resolved;
};

const requireStrict = createRequire(path.join(strictRoot, "index.js"));
let outcome;
try {
    const signalR = requireStrict("@microsoft/signalr");
    new signalR.HubConnectionBuilder().withUrl("http://127.0.0.1:1/hub").configureLogging(signalR.LogLevel.None).build();
    outcome = "build() succeeded";
} catch (e) {
    outcome = `build() threw: ${String(e.message).split("\n")[0]}`;
}
console.log(outcome);
console.log("expected: build() succeeds with only the declared dependencies installed");
if (outcome !== "build() succeeded") {
    console.log("BUG PRESENT: @microsoft/signalr requires 'tough-cookie' at run time but does not declare it.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
