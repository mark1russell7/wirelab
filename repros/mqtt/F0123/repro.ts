// node repro.ts [commit] [owner/repo] (Node.js 22.18 or later runs TypeScript directly). It needs no packages.
//
// Some test files of MQTT.js call process.exit(0) in the after hook of their top describe. The script
// unit-test:node runs the files with node --test, so each file is a child process of the runner. This script:
// 1. reads each file of test/node at one commit of mqttjs/MQTT.js (or of a fork), and lists the files
//    with an after hook that calls process.exit;
// 2. runs a small test file with the same after hook, whose last test fails, with node --test, and the same
//    file without the call as a control. The runner does not report the last test of the file with the hook,
//    and it exits 0.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const commit = process.argv[2] ?? "0ceae419ff0542105fa258b3ae9760798db7b44d";
const repo = process.argv[3] ?? "mqttjs/MQTT.js";
const folder = "/test/node/";
const cdn = `https://cdn.jsdelivr.net/gh/${repo}@${commit}`;

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 60000).unref();

// Part 1: the after hooks that call process.exit.
const listing = (await (await fetch(`https://data.jsdelivr.com/v1/packages/gh/${repo}@${commit}?structure=flat`)).json()) as {
  files: { name: string }[];
};
const files = listing.files
  .map((f) => f.name)
  .filter((name) => name.startsWith(folder) && !name.slice(folder.length).includes("/") && name.endsWith(".ts"));

// The text of the function that starts after the opening parenthesis at `from`: up to its matching parenthesis.
function callText(text: string, from: number): string {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")" && --depth === 0) return text.slice(from, i + 1);
  }
  return text.slice(from);
}

const withExit: string[] = [];
for (const name of files) {
  const text = await (await fetch(`${cdn}${name}`)).text();
  for (const m of text.matchAll(/\bafter\s*\(/g)) {
    if (/process\.exit\s*\(/.test(callText(text, m.index + m[0].length - 1))) {
      withExit.push(name.slice(folder.length));
      break;
    }
  }
}
console.log(`${repo}@${commit.slice(0, 7)}: ${files.length} test files in test/node`);
console.log(`files with an after hook that calls process.exit: ${withExit.length === 0 ? "none" : withExit.join(", ")}`);

// Part 2: the effect on node --test.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f0123-"));
const testFile = (exit: boolean): string => `import { describe, it, after } from "node:test";
describe("MqttClient", () => {
  after(() => {${exit ? " process.exit(0); " : ""}});
  it("first test", (t, done) => { setTimeout(done, 10); });
  it("last test", (t, done) => { setTimeout(() => done(new Error("the last test fails")), 10); });
});
`;
function run(exit: boolean): { code: number | null; reported: boolean } {
  const file = path.join(dir, exit ? "with-exit.test.mjs" : "without-exit.test.mjs");
  fs.writeFileSync(file, testFile(exit));
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=spec", file], { encoding: "utf8", timeout: 30000 });
  return { code: result.status, reported: /last test/.test(result.stdout) };
}
const control = run(false);
const hook = run(true);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`node ${process.version}, node --test, the last test fails:`);
console.log(`  without process.exit: exit code ${control.code}, the last test reported: ${control.reported}`);
console.log(`  with process.exit(0) in after: exit code ${hook.code}, the last test reported: ${hook.reported}`);

const lost = control.code === 1 && control.reported && hook.code === 0 && !hook.reported;
if (withExit.length > 0 && lost) {
  console.log(
    `BUG PRESENT: ${withExit.length} test files call process.exit in an after hook, and with that hook node --test does not report a failure of the last test of a file and exits 0.`,
  );
  process.exit(1);
}
console.log(
  withExit.length === 0
    ? "OK: no test file calls process.exit in an after hook."
    : "OK: with process.exit(0) in an after hook, node --test still reported the failure of the last test.",
);
process.exit(0);
