// node repro.ts [commit] [owner/repo] (Node.js 22.18 or later runs TypeScript directly). It needs no packages.
//
// The test files of partysocket start WebSocket servers on fixed ports. The test runner runs the files in
// parallel, so two files that bind the same port can fail with EADDRINUSE. This script reads each test file
// at one commit of cloudflare/partykit (or of a fork), finds each port that a server binds, and lists the
// ports that more than one file binds.
const commit = process.argv[2] ?? "f0a2e97d233f24545b2648aec2ed6a191e11074e";
const repo = process.argv[3] ?? "cloudflare/partykit";
const folder = "/packages/partysocket/src/tests/";
const cdn = `https://cdn.jsdelivr.net/gh/${repo}@${commit}`;

const listing = (await (await fetch(`https://data.jsdelivr.com/v1/packages/gh/${repo}@${commit}?structure=flat`)).json()) as {
  files: { name: string }[];
};
const files = listing.files.map((f) => f.name).filter((name) => name.startsWith(folder) && /\.test\.tsx?$/.test(name));

// The value of a port expression: a number, a constant, or a constant plus a number.
function value(expression: string, constants: Map<string, number>): number | undefined {
  const m = /^(?:(\d+)|([A-Za-z_]\w*)(?:\s*\+\s*(\d+))?)$/.exec(expression.trim());
  if (m === null) return undefined;
  if (m[1] !== undefined) return Number(m[1]);
  const base = constants.get(m[2] ?? "");
  return base === undefined ? undefined : base + Number(m[3] ?? 0);
}

const binders = new Map<number, string[]>();
for (const name of files) {
  const text = await (await fetch(`${cdn}${name}`)).text();
  const constants = new Map<string, number>();
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_]\w*)\s*=\s*(\d{2,5})\s*;/g)) constants.set(m[1] ?? "", Number(m[2]));
  // A server binds its port in new WebSocketServer({ port: ... }) or in .listen(...).
  for (const m of text.matchAll(/\bport:\s*([^,}\n]+)|\.listen\(\s*([^,)\n]+)/g)) {
    const expression = (m[1] ?? m[2] ?? "").trim();
    const port = value(expression, constants);
    // Port 0 asks the system for a free port, so it does not clash.
    if (port === undefined || port === 0) continue;
    const short = `${name.slice(folder.length)} (${expression})`;
    const list = binders.get(port) ?? [];
    if (!list.some((entry) => entry.startsWith(name.slice(folder.length)))) list.push(short);
    binders.set(port, list);
  }
}

console.log(`${repo}@${commit.slice(0, 7)}: ${files.length} test files`);
for (const [port, list] of [...binders].sort((a, b) => a[0] - b[0])) console.log(`port ${port}: ${list.join(", ")}`);
const clashes = [...binders].filter(([, list]) => list.length > 1);
console.log(clashes.length === 0 ? "no port is bound by two files" : `ports bound by two or more files: ${clashes.map(([port]) => port).join(", ")}`);
process.exit(clashes.length === 0 ? 0 : 1);
