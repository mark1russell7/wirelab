// A Socket.IO server on a free port of localhost, for the repros. The caller sets up the namespaces with "setup".
import { createServer } from "node:http";
import { Server } from "socket.io";

export async function startServer(options = {}, setup = () => {}) {
  const httpServer = createServer();
  const server = new Server(httpServer, options);
  setup(server);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The version of each package, from its package.json in the node_modules of the repro folder. The exports of a
// package do not always have "./package.json", so the function reads the file.
export async function versions(...names) {
  const { readFileSync } = await import("node:fs");
  const version = (name) =>
    JSON.parse(readFileSync(new URL(`../../node_modules/${name}/package.json`, import.meta.url), "utf8")).version;
  return names.map((name) => `${name} ${version(name)}`).join(", ");
}
