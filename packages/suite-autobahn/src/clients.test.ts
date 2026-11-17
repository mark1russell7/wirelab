import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { clients } from "./clients.ts";

// The server sends one text message and one binary message to each client. It closes with 1000 when both come back
// with the same type and the same bytes. The path /silent keeps the connection open and sends nothing.
const binary = Buffer.from([0, 1, 2, 254, 255]);
const echoes: { type: string; same: boolean }[][] = [];
let server: WebSocketServer;
let url: string;

beforeAll(async () => {
  server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  server.on("connection", (socket, request) => {
    if (request.url === "/silent") return;
    const received: { type: string; same: boolean }[] = [];
    echoes.push(received);
    socket.on("message", (data, isBinary) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.concat(data as Buffer[]);
      received.push({
        type: isBinary ? "binary" : "text",
        same: isBinary ? bytes.equals(binary) : bytes.toString("utf8") === "héllo",
      });
      if (received.length === 2) socket.close(1000);
    });
    socket.send("héllo");
    socket.send(binary);
  });
});

afterAll(async () => {
  for (const socket of server.clients) socket.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe.each(clients.map((client) => [client.name, client] as const))("the client %s", (_name, client) => {
  it("sends back each message with its type, and ends at the close", async () => {
    const before = echoes.length;
    const result = await client.echo(`${url}/echo`, 5_000);
    expect(result).toMatchObject({ closed: true, code: 1000 });
    expect(echoes[before]).toEqual([
      { type: "text", same: true },
      { type: "binary", same: true },
    ]);
  });

  it("stops the connection at the time limit", async () => {
    const result = await client.echo(`${url}/silent`, 300);
    expect(result.closed).toBe(false);
  });
});

describe("the clients", () => {
  it("have different names, and each agent starts with its name", () => {
    expect(new Set(clients.map((client) => client.name)).size).toBe(clients.length);
    for (const client of clients) expect(client.agent.startsWith(`${client.name}-`)).toBe(true);
  });
});
