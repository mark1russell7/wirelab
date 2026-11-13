// F0062: the type of the value of socket.timeout(ms).emitWithAck(). The repro writes a TypeScript file next to the
// node_modules of this folder, and prints the type of each value with the type checker of TypeScript.
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { versions } from "./lib/server.mjs";

console.log(`${await versions("socket.io-client")}, typescript ${ts.version}`);
const file = fileURLToPath(new URL("../emitwithack.generated.ts", import.meta.url));
const source = `import { io, Socket } from "socket.io-client";

interface ClientToServerEvents {
  ackFromClientSingleArg: (a: string, b: number, ack: (c: string) => void) => void;
}

export async function check() {
  const socket: Socket<{}, ClientToServerEvents> = io();
  const value = await socket.emitWithAck("ackFromClientSingleArg", "1", 2);
  const valueWithTimeout = await socket.timeout(1000).emitWithAck("ackFromClientSingleArg", "3", 4);
  return [value, valueWithTimeout];
}
`;
writeFileSync(file, source);
console.log(source);
const program = ts.createProgram([file], {
  strict: true,
  noEmit: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
  types: [],
});
const checker = program.getTypeChecker();
const types = {};
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text.startsWith("value")) {
    types[node.name.text] = checker.typeToString(checker.getTypeAtLocation(node.name));
  }
  ts.forEachChild(node, visit);
};
visit(program.getSourceFile(file));
const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
rmSync(file);
console.log(`type of value (no timeout): ${types.value}`);
console.log(`type of valueWithTimeout (timeout(1000)): ${types.valueWithTimeout}`);
console.log(`diagnostics: ${diagnostics.length === 0 ? "none" : diagnostics.join(" | ")}`);
const fault = types.valueWithTimeout !== "string";
console.log(fault ? "FAULT: the type of the value with timeout() is not string" : "OK: the type is string");
process.exit(fault ? 1 : 0);
